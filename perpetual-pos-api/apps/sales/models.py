from django.conf import settings
from django.db import models

from apps.businesses.models import Branch, Business
from apps.catalog.models import Product
from apps.customers.models import Customer


class Sale(models.Model):
    business = models.ForeignKey(Business, on_delete=models.PROTECT)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    customer = models.ForeignKey(Customer, null=True, on_delete=models.PROTECT)
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
        constraints = [
            models.UniqueConstraint(
                fields=["business", "client_id"], name="unique_sale_upload"
            )
        ]


class SaleLine(models.Model):
    sale = models.ForeignKey(Sale, related_name="lines", on_delete=models.PROTECT)
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    name = models.CharField(max_length=120)
    quantity = models.PositiveIntegerField()
    price = models.PositiveBigIntegerField()
    cost = models.PositiveBigIntegerField()
    discount = models.PositiveBigIntegerField(default=0)
    currency = models.CharField(max_length=3)
