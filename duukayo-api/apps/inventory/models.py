from typing import ClassVar

from django.db import models

from apps.businesses.models import Branch, Business
from apps.catalog.models import Product
from apps.common.validation import ValidatedModel


class Stock(ValidatedModel):
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.IntegerField(default=0)
    reserved = models.PositiveIntegerField(default=0)

    class Meta:
        constraints: ClassVar[list] = [
            models.UniqueConstraint(fields=["branch", "product"], name="unique_stock")
        ]


class Movement(ValidatedModel):
    business = models.ForeignKey(Business, on_delete=models.PROTECT)
    stock = models.ForeignKey(Stock, on_delete=models.PROTECT)
    delta = models.IntegerField()
    reason = models.CharField(max_length=250)
    reference = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)


class Transfer(ValidatedModel):
    business = models.ForeignKey("businesses.Business", on_delete=models.PROTECT)
    source = models.ForeignKey("businesses.Branch", related_name="outbound_transfers", on_delete=models.PROTECT)
    destination = models.ForeignKey("businesses.Branch", related_name="inbound_transfers", on_delete=models.PROTECT)
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    status = models.CharField(max_length=12, default="dispatched", choices=[("dispatched", "Dispatched"), ("received", "Received")])
    actor = models.ForeignKey("auth.User", on_delete=models.PROTECT)
    reference = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    received_at = models.DateTimeField(null=True)
