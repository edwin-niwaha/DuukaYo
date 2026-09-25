import hashlib
import secrets
import uuid
from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from apps.businesses.models import Business
from apps.common.domain import fingerprint
from apps.inventory.models import Stock
from apps.orders.models import Cart, MarketplaceCheckout, Quote
from apps.orders.services import expire_for_business, place_order


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def authorized_cart(request, cart_id, lock=False):
    qs = Cart.objects.select_for_update() if lock else Cart.objects
    cart = get_object_or_404(qs, pk=cart_id)
    if cart.user_id:
        if not request.user.is_authenticated or cart.user_id != request.user.pk:
            raise NotFound()
    elif not secrets.compare_digest(
        cart.token_hash, token_hash(request.headers.get("X-Cart-Token", ""))
    ):
        raise NotFound()
    return cart


def cart_lines(cart):
    return list(cart.items.order_by("product_id").values("product_id", "quantity"))


def snapshot(cart, details):
    lines = list(
        cart.items.select_related("product__business", "product__category").order_by(
            "product__business_id", "product_id"
        )
    )
    if not lines:
        raise ValidationError("Your cart is empty.")
    groups = {}
    currencies = set()
    for line in lines:
        product = line.product
        business = product.business
        branch = business.online_branch()
        if (
            not business.published
            or business.suspended
            or not product.published
            or not product.active
            or not branch
        ):
            raise ValidationError(
                {"cart": "A product or shop is no longer available. Update your cart."}
            )
        if details["delivery"] and (
            not business.delivery_enabled or not details.get("address")
        ):
            raise ValidationError(
                {
                    "delivery": f"Delivery is unavailable for {business.name}, or an address is missing."
                }
            )
        stock = Stock.objects.filter(branch=branch, product=product).first()
        available = (
            max(0, stock.quantity - stock.reserved - business.safety_buffer)
            if stock
            else 0
        )
        if available < line.quantity:
            raise ValidationError({"stock": f"Insufficient stock for {product.name}."})
        currencies.add(business.currency)
        group = groups.setdefault(
            business.pk,
            {
                "business": business.pk,
                "shop": business.name,
                "branch": branch.pk,
                "delivery_fee": business.delivery_fee if details["delivery"] else 0,
                "lines": [],
            },
        )
        group["lines"].append(
            {
                "product": product.pk,
                "name": product.order_name,
                "quantity": line.quantity,
                "price": product.price,
            }
        )
    if len(currencies) != 1:
        raise ValidationError(
            "Checkout requires a single currency; check out other currencies separately."
        )
    for group in groups.values():
        group["total"] = (
            sum(line["quantity"] * line["price"] for line in group["lines"])
            + group["delivery_fee"]
        )
    total = sum(group["total"] for group in groups.values())
    if total > 1_000_000_000_000_000:
        raise ValidationError("Checkout total exceeds the supported monetary range.")
    return {
        "groups": list(groups.values()),
        "total": total,
        "currency": currencies.pop(),
        "details": details,
        "payment": "pay_on_fulfilment",
    }


def lock_cart_businesses(cart):
    ids = cart.items.values_list("product__business_id", flat=True).distinct()
    for business in (
        Business.objects.select_for_update().filter(pk__in=ids).order_by("pk")
    ):
        expire_for_business(business)


@transaction.atomic
def create_quote(request, cart_id, details):
    cart = authorized_cart(request, cart_id, lock=True)
    lock_cart_businesses(cart)
    value = snapshot(cart, details)
    return Quote.objects.create(
        cart=cart,
        snapshot=value,
        cart_hash=fingerprint(cart_lines(cart)),
        expires_at=timezone.now() + timedelta(minutes=5),
    )


def checkout_result(result):
    orders = list(result.orders.select_related("business").order_by("business_id"))
    paid = sum(
        order.payment_state in ("paid_cash", "paid_manual", "paid") for order in orders
    )
    return {
        "id": result.pk,
        "total": result.total,
        "currency": result.currency,
        "payment_state": "paid"
        if paid == len(orders)
        else "partially_paid"
        if paid
        else "unpaid",
        "orders": [
            {
                "id": o.pk,
                "token": o.token,
                "shop": o.business.name,
                "status": o.status,
                "total": o.total,
            }
            for o in orders
        ],
    }


@transaction.atomic
def checkout_cart(request, cart_id, data):
    cart = authorized_cart(request, cart_id, lock=True)
    previous = MarketplaceCheckout.objects.filter(
        cart=cart, client_id=data["client_id"]
    ).first()
    if previous:
        if previous.quote_id != data["quote"]:
            raise ValidationError(
                "Checkout key was already used with a different quote."
            )
        return checkout_result(previous)
    quote = get_object_or_404(Quote, pk=data["quote"], cart=cart)
    if MarketplaceCheckout.objects.filter(quote=quote).exists():
        raise ValidationError("This quote has already been checked out.")
    if quote.expires_at <= timezone.now() or quote.cart_hash != fingerprint(
        cart_lines(cart)
    ):
        raise ValidationError(
            {"quote": "Your cart or quote changed. Review a new quote before checkout."}
        )
    lock_cart_businesses(cart)
    if snapshot(cart, quote.snapshot["details"]) != quote.snapshot:
        raise ValidationError(
            {"quote": "Prices or delivery charges changed. Review a new quote."}
        )
    result = MarketplaceCheckout.objects.create(
        cart=cart,
        quote=quote,
        client_id=data["client_id"],
        total=quote.snapshot["total"],
        currency=quote.snapshot["currency"],
    )
    for group in quote.snapshot["groups"]:
        business = Business.objects.get(pk=group["business"])
        order = place_order(
            business,
            {
                **quote.snapshot["details"],
                "client_id": uuid.uuid5(
                    data["client_id"], f"cart:{cart.pk}:shop:{business.pk}"
                ),
                "lines": [
                    {
                        "product": line["product"],
                        "quantity": line["quantity"],
                        "price": line["price"],
                        "discount": 0,
                    }
                    for line in group["lines"]
                ],
            },
        )
        result.orders.add(order)
    cart.items.all().delete()
    return checkout_result(result)
