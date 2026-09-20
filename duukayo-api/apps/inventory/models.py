from django.db import models

from apps.businesses.models import Branch, Business
from apps.catalog.models import Product


class Stock(models.Model):
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.IntegerField(default=0)
    reserved = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["branch", "product"], name="unique_stock")
        ]


class Movement(models.Model):
    business = models.ForeignKey(Business, on_delete=models.PROTECT)
    stock = models.ForeignKey(Stock, on_delete=models.PROTECT)
    delta = models.IntegerField()
    reason = models.CharField(max_length=250)
    reference = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
