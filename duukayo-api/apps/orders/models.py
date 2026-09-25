import secrets
from typing import ClassVar

from django.db import models

from apps.businesses.models import Branch, Business
from apps.common.validation import ValidatedModel


def capability():
    return secrets.token_urlsafe(32)


class Order(ValidatedModel):
    business = models.ForeignKey(Business, on_delete=models.PROTECT)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    client_id = models.UUIDField()
    payload_hash = models.CharField(max_length=64)
    token = models.CharField(max_length=64, default=capability, unique=True)
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=30)
    delivery = models.BooleanField(default=False)
    address = models.CharField(max_length=250, blank=True)
    delivery_fee = models.PositiveBigIntegerField(default=0)
    currency = models.CharField(max_length=3)
    total = models.PositiveBigIntegerField()
    lines = models.JSONField()
    status = models.CharField(max_length=15, default="pending")
    payment_state = models.CharField(max_length=20, default="unpaid")
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    sale = models.OneToOneField("sales.Sale", null=True, on_delete=models.PROTECT)

    class Meta:
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["business", "client_id"], name="unique_guest_order"
            )
        ]


class OrderLine(ValidatedModel):
    order = models.ForeignKey(Order, related_name="items", on_delete=models.PROTECT)
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT)
    name = models.CharField(max_length=4000)
    quantity = models.PositiveIntegerField()
    price = models.PositiveBigIntegerField()
    cost = models.PositiveBigIntegerField()
    discount = models.PositiveBigIntegerField(default=0)
    currency = models.CharField(max_length=3)

    class Meta:
        constraints: ClassVar[list] = [models.UniqueConstraint(fields=["order", "product"], name="unique_order_product")]


class Reservation(ValidatedModel):
    line = models.OneToOneField(OrderLine, related_name="reservation", on_delete=models.PROTECT)
    stock = models.ForeignKey("inventory.Stock", on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    state = models.CharField(max_length=12, default="active", choices=[("active", "Active"), ("released", "Released"), ("consumed", "Consumed")])
    updated_at = models.DateTimeField(auto_now=True)


class Cart(ValidatedModel):
    user = models.ForeignKey("auth.User", null=True, on_delete=models.PROTECT)
    token_hash = models.CharField(max_length=64, unique=True)
    updated_at = models.DateTimeField(auto_now=True)


class CartLine(ValidatedModel):
    cart = models.ForeignKey(Cart, related_name="items", on_delete=models.CASCADE)
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()

    class Meta:
        constraints: ClassVar[list] = [models.UniqueConstraint(fields=["cart", "product"], name="unique_cart_product")]


class Quote(ValidatedModel):
    cart = models.ForeignKey(Cart, on_delete=models.PROTECT)
    snapshot = models.JSONField()
    cart_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)


class MarketplaceCheckout(ValidatedModel):
    cart = models.ForeignKey(Cart, on_delete=models.PROTECT)
    quote = models.OneToOneField(Quote, on_delete=models.PROTECT)
    client_id = models.UUIDField()
    orders = models.ManyToManyField(Order)
    total = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints: ClassVar[list] = [models.UniqueConstraint(fields=["cart", "client_id"], name="unique_cart_checkout")]
