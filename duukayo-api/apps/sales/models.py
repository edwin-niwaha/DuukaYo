from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.businesses.models import Branch, Business
from apps.catalog.models import Product
from apps.common.validation import ValidatedModel
from apps.customers.models import Customer


class Sale(ValidatedModel):
    business = models.ForeignKey(Business, on_delete=models.PROTECT)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    customer = models.ForeignKey(Customer, null=True, on_delete=models.PROTECT)
    shift = models.ForeignKey("Shift", null=True, blank=True, on_delete=models.PROTECT)
    client_id = models.UUIDField()
    payload_hash = models.CharField(max_length=64)
    total = models.PositiveBigIntegerField()
    delivery_fee = models.PositiveBigIntegerField(default=0)
    currency = models.CharField(max_length=3)
    offline = models.BooleanField(default=False)
    review_reasons = models.JSONField(default=list)
    occurred_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["business", "client_id"], name="unique_sale_upload"
            )
        ]


class SaleLine(ValidatedModel):
    sale = models.ForeignKey(Sale, related_name="lines", on_delete=models.PROTECT)
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    name = models.CharField(max_length=4000)
    quantity = models.PositiveIntegerField()
    price = models.PositiveBigIntegerField()
    cost = models.PositiveBigIntegerField()
    discount = models.PositiveBigIntegerField(default=0)
    currency = models.CharField(max_length=3)


class Register(ValidatedModel):
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    name = models.CharField(max_length=100)
    active = models.BooleanField(default=True)

    class Meta:
        constraints: ClassVar[list] = [models.UniqueConstraint(fields=["branch", "name"], name="unique_branch_register")]


class Shift(ValidatedModel):
    register = models.ForeignKey(Register, on_delete=models.PROTECT)
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    opening_float = models.PositiveBigIntegerField()
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True)
    expected_cash = models.BigIntegerField(null=True)
    counted_cash = models.PositiveBigIntegerField(null=True)
    discrepancy_reason = models.CharField(max_length=250, blank=True)

    class Meta:
        constraints: ClassVar[list] = [
            models.UniqueConstraint(fields=["register"], condition=models.Q(closed_at__isnull=True), name="one_open_register_shift"),
            models.UniqueConstraint(fields=["cashier"], condition=models.Q(closed_at__isnull=True), name="one_open_cashier_shift"),
        ]


class CashMovement(ValidatedModel):
    shift = models.ForeignKey(Shift, related_name="cash_movements", on_delete=models.PROTECT)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    amount = models.BigIntegerField()
    reason = models.CharField(max_length=250)
    created_at = models.DateTimeField(auto_now_add=True)


class SaleReturn(ValidatedModel):
    sale = models.ForeignKey(Sale, related_name="returns", on_delete=models.PROTECT)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    reason = models.CharField(max_length=250)
    amount = models.PositiveBigIntegerField()
    method = models.CharField(max_length=20)
    reference = models.CharField(max_length=100, blank=True)
    shift = models.ForeignKey(Shift, null=True, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)


class ReturnLine(ValidatedModel):
    sale_return = models.ForeignKey(SaleReturn, related_name="lines", on_delete=models.PROTECT)
    line = models.ForeignKey(SaleLine, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    restock = models.BooleanField(default=True)
    amount = models.PositiveBigIntegerField()

    class Meta:
        constraints: ClassVar[list] = [models.UniqueConstraint(fields=["sale_return", "line"], name="unique_return_line")]
