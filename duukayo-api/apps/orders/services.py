import uuid
from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.catalog.models import Product
from apps.catalog.services import resolve_lines
from apps.common.domain import audit, fingerprint, lock_business
from apps.inventory.models import Stock
from apps.inventory.services import movement, stock_for
from apps.orders.models import Order, OrderLine, Reservation
from apps.payments.models import Payment
from apps.payments.services import METHODS, record_allocations, validate_payment
from apps.sales.models import Sale, SaleLine


@transaction.atomic
def place_order(business, data):
    business = lock_business(business)
    expire_for_business(business)
    digest = fingerprint(data)
    existing = Order.objects.filter(
        business=business, client_id=data["client_id"]
    ).first()
    if existing:
        if existing.payload_hash != digest:
            raise ValidationError("Order key already used.")
        return existing
    from apps.common.models import PlatformSettings
    if not PlatformSettings.current().orders_enabled:
        raise ValidationError("New orders are temporarily paused. Please try again later.")
    if not business.published or business.suspended:
        raise ValidationError("This shop is not open for new orders.")
    branch = business.online_branch()
    if not branch:
        raise ValidationError("Shop is not yet open.")
    delivery = data.get("delivery", False)
    if delivery and (not business.delivery_enabled or not data.get("address")):
        raise ValidationError("Delivery is unavailable or address is missing.")
    lines, _ = resolve_lines(business, branch, data["lines"], public=True)
    # Never disclose private cost snapshots via public responses.
    fee = business.delivery_fee if delivery else 0
    total = sum(x["price"] * x["quantity"] for x in lines) + fee
    if total > 1000000000000000:
        raise ValidationError("Order total exceeds the supported monetary range.")
    order = Order.objects.create(
        business=business,
        branch=branch,
        client_id=data["client_id"],
        payload_hash=digest,
        name=data["name"],
        phone=data["phone"],
        delivery=delivery,
        address=data.get("address", ""),
        delivery_fee=fee,
        currency=business.currency,
        total=total,
        lines=lines,
        expires_at=timezone.now() + timedelta(minutes=30),
    )
    for line in lines:
        item = OrderLine.objects.create(
            order=order,
            product_id=line["product"],
            **{k: v for k, v in line.items() if k != "product"},
        )
        stock = stock_for(branch, Product.objects.get(pk=line["product"]))
        Reservation.objects.create(line=item, stock=stock, quantity=line["quantity"])
        stock.reserved += line["quantity"]
        stock.save(update_fields=["reserved"])
    audit(business, None, "order.placed", order.pk)
    from apps.notifications.models import NotificationEvent

    NotificationEvent.objects.create(order=order)
    from apps.notifications.tasks import enqueue_order_notification

    transaction.on_commit(lambda: enqueue_order_notification(order.pk))
    return order


def release(order, consumed=False):
    for reservation in Reservation.objects.filter(
        line__order=order, state="active"
    ).select_related("stock"):
        stock = reservation.stock
        if stock.reserved < reservation.quantity:
            raise ValidationError("Reservation ledger needs reconciliation.")
        stock.reserved -= reservation.quantity
        stock.save(update_fields=["reserved"])
        reservation.state = "consumed" if consumed else "released"
        reservation.save(update_fields=["state", "updated_at"])


def expire_for_business(business):
    for order in Order.objects.filter(
        business=business, status="pending", expires_at__lte=timezone.now()
    ):
        release(order)
        order.status = "cancelled"
        order.save(update_fields=["status"])
        audit(business, None, "order.expired", order.pk)


@transaction.atomic
def transition_order(m, order_id, data):
    lock_business(m.business)
    expire_for_business(m.business)
    order = get_object_or_404(Order, pk=order_id, business=m.business, branch=m.branch)
    target = data["status"]
    if order.status == target:
        if target == "completed":
            payment = order.sale.payment
            if (
                data.get("method") != payment.method
                or data.get("reference", "") != payment.reference
            ):
                raise ValidationError(
                    "Completion was already recorded with different payment details."
                )
        return order
    allowed = {
        "pending": ["accepted", "cancelled"],
        "accepted": ["preparing", "cancelled"],
        "preparing": ["ready", "cancelled"],
        "ready": ["completed", "cancelled"],
    }
    if target not in allowed.get(order.status, []):
        raise ValidationError("Invalid order transition.")
    if target == "cancelled":
        release(order)
    if target == "completed":
        method = data.get("method")
        if method not in METHODS:
            raise ValidationError(
                "Record the received payment method to complete the order."
            )
        validate_payment(method, data.get("reference", ""))
        for line in order.lines:
            stock = Stock.objects.get(branch=order.branch, product_id=line["product"])
            if stock.quantity < stock.reserved:
                raise ValidationError(
                    {
                        "stock": "Resolve the stock conflict before completing this order."
                    }
                )
        release(order, consumed=True)
        from apps.sales.operations import current_shift

        sale = Sale.objects.create(
            shift=current_shift(m),
            business=m.business,
            branch=order.branch,
            cashier=m.user,
            client_id=uuid.uuid4(),
            payload_hash=f"order:{order.pk}",
            total=order.total,
            delivery_fee=order.delivery_fee,
            currency=order.currency,
            occurred_at=timezone.now(),
        )
        for item in order.lines:
            line = dict(item)
            product_id = line.pop("product")
            SaleLine.objects.create(sale=sale, product_id=product_id, **line)
            movement(
                stock_for(order.branch, Product.objects.get(pk=product_id)),
                -line["quantity"],
                "Order completed",
                order.pk,
            )
        Payment.objects.create(
            sale=sale,
            method=method,
            amount=order.total,
            tendered=order.total,
            change=0,
            reference=data.get("reference", ""),
        )
        record_allocations(
            sale,
            [
                {
                    "method": method,
                    "amount": order.total,
                    "tendered": order.total,
                    "reference": data.get("reference", ""),
                }
            ],
        )
        order.sale = sale
        order.payment_state = "paid_manual" if method != "cash" else "paid_cash"
    order.status = target
    order.save()
    audit(m.business, m.user, "order." + target, order.pk)
    return order
