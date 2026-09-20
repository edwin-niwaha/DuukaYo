import hashlib
import json
import uuid
from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.businesses.models import Business, Membership
from apps.catalog.models import Product
from apps.common.models import Audit
from apps.customers.models import Customer
from apps.inventory.models import Movement, Stock
from apps.orders.models import Order
from apps.payments.models import Payment
from apps.sales.models import Sale, SaleLine

METHODS = ("cash", "manual_mtn", "manual_airtel")


def fingerprint(data):
    return hashlib.sha256(
        json.dumps(data, sort_keys=True, default=str, separators=(",", ":")).encode()
    ).hexdigest()


def membership(user, business_id, roles=None):
    m = get_object_or_404(
        Membership.objects.select_related("business", "branch"),
        user=user,
        business_id=business_id,
        active=True,
    )
    if roles and m.role not in roles:
        raise PermissionDenied("Your role cannot perform this operation.")
    return m


def audit(business, actor, action, reference, detail=None):
    Audit.objects.create(
        business=business,
        actor=actor,
        action=action,
        reference=str(reference),
        detail=detail or {},
    )


def lock_business(business):
    return Business.objects.select_for_update().get(pk=business.pk)


def stock_for(branch, product):
    return Stock.objects.get_or_create(branch=branch, product=product)[0]


def movement(stock, delta, reason, reference):
    stock.quantity += delta
    stock.save(update_fields=["quantity"])
    Movement.objects.create(
        business=stock.branch.business,
        stock=stock,
        delta=delta,
        reason=reason,
        reference=str(reference),
    )


def resolve_lines(business, branch, data, offline=False, role="guest", public=False):
    lines, issues = [], []
    for item in data:
        product = get_object_or_404(
            Product,
            pk=item["product"],
            business=business,
            active=True,
            **({"published": True} if public else {}),
        )
        price = item.get("price", product.price)
        discount = item.get("discount", 0)
        cost = item.get("cost", product.cost) if offline else product.cost
        if offline and cost != product.cost:
            issues.append(f"Stale cost: {product.sku}")
        if price != product.price:
            if not offline:
                raise ValidationError(
                    {"price": f"Price changed for {product.name}; refresh the catalog."}
                )
            issues.append(f"Stale price: {product.sku}")
        if discount and (offline or role not in ("owner", "manager")):
            raise PermissionDenied(
                "Only connected managers and owners may discount sales."
            )
        if discount > price * item["quantity"]:
            raise ValidationError("Discount exceeds line value.")
        stock = stock_for(branch, product)
        available = (
            stock.quantity - stock.reserved - (business.safety_buffer if public else 0)
        )
        if available < item["quantity"]:
            if not offline:
                raise ValidationError(
                    {"stock": f"Insufficient available stock for {product.name}."}
                )
            issues.append(f"Stock conflict: {product.sku}")
        lines.append(
            {
                "product": product.pk,
                "name": product.name,
                "quantity": item["quantity"],
                "price": price,
                "cost": cost,
                "discount": discount,
                "currency": business.currency,
            }
        )
    return lines, issues


@transaction.atomic
def checkout(m, data):
    business = lock_business(m.business)
    existing = Sale.objects.filter(
        business=business, client_id=data["client_id"]
    ).first()
    digest = fingerprint(data)
    if existing:
        if existing.payload_hash != digest or existing.cashier_id != m.user_id:
            raise ValidationError(
                "Idempotency key was already used for a different request."
            )
        return existing
    if data.get("branch", m.branch_id) != m.branch_id:
        raise ValidationError("Branch is outside your membership.")
    offline = data.get("offline", False)
    if offline and data["method"] != "cash":
        raise ValidationError("Only cash sales can be recorded offline.")
    customer = (
        get_object_or_404(Customer, pk=data["customer"], business=business)
        if data.get("customer")
        else None
    )
    lines, issues = resolve_lines(business, m.branch, data["lines"], offline, m.role)
    total = sum(x["quantity"] * x["price"] - x["discount"] for x in lines)
    tendered = data["tendered"]
    if tendered < total or (data["method"] != "cash" and tendered != total):
        raise ValidationError(
            "Tendered amount must cover total; manual mobile money must equal total."
        )
    occurred = data.get("occurred_at", timezone.now())
    if occurred > timezone.now() + timedelta(minutes=5):
        raise ValidationError("Sale timestamp is in the future.")
    sale = Sale.objects.create(
        business=business,
        branch=m.branch,
        cashier=m.user,
        customer=customer,
        client_id=data["client_id"],
        payload_hash=digest,
        total=total,
        currency=business.currency,
        offline=offline,
        review_reasons=issues,
        occurred_at=occurred,
    )
    for line in lines:
        product_id = line.pop("product")
        SaleLine.objects.create(sale=sale, product_id=product_id, **line)
        movement(
            stock_for(m.branch, Product.objects.get(pk=product_id)),
            -line["quantity"],
            "Offline sale" if offline else "Sale",
            sale.pk,
        )
    Payment.objects.create(
        sale=sale,
        method=data["method"],
        amount=total,
        tendered=tendered,
        change=tendered - total,
        reference=data.get("reference", ""),
    )
    audit(business, m.user, "sale.completed", sale.pk, {"review_reasons": issues})
    return sale


@transaction.atomic
def change_stock(m, data):
    lock_business(m.business)
    product = get_object_or_404(Product, pk=data["product"], business=m.business)
    stock = stock_for(m.branch, product)
    key = "stock:" + str(data["client_id"])
    previous = Audit.objects.filter(
        business=m.business, action="stock.changed", reference=key
    ).first()
    digest = fingerprint(data)
    if previous:
        if previous.detail["hash"] != digest:
            raise ValidationError("Stock operation key reused with different data.")
        return stock
    if data["kind"] in ("opening", "receipt") and data["delta"] <= 0:
        raise ValidationError("Opening stock and receipts require a positive quantity.")
    if data["kind"] == "opening" and Movement.objects.filter(stock=stock).exists():
        raise ValidationError("Opening stock has already been recorded.")
    if stock.quantity + data["delta"] < stock.reserved:
        raise ValidationError("Adjustment would consume reserved stock.")
    movement(stock, data["delta"], data["kind"] + ": " + data["reason"], key)
    audit(
        m.business,
        m.user,
        "stock.changed",
        key,
        {"hash": digest, "delta": data["delta"]},
    )
    return stock


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
    branch = business.branch_set.first()
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
        stock = stock_for(branch, Product.objects.get(pk=line["product"]))
        stock.reserved += line["quantity"]
        stock.save(update_fields=["reserved"])
    audit(business, None, "order.placed", order.pk)
    from apps.notifications.tasks import enqueue_order_notification

    transaction.on_commit(lambda: enqueue_order_notification(order.pk))
    return order


def release(order):
    for line in order.lines:
        stock = stock_for(order.branch, Product.objects.get(pk=line["product"]))
        stock.reserved -= line["quantity"]
        stock.save(update_fields=["reserved"])


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
        release(order)
        sale = Sale.objects.create(
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
        order.sale = sale
        order.payment_state = "paid_manual" if method != "cash" else "paid_cash"
    order.status = target
    order.save()
    audit(m.business, m.user, "order." + target, order.pk)
    return order
