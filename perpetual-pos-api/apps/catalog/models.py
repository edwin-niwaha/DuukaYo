from django.db import models

from apps.businesses.models import Business


class Category(models.Model):
    business = models.ForeignKey(Business, on_delete=models.PROTECT)
    name = models.CharField(max_length=80)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["business", "name"], name="unique_category")
        ]


class Product(models.Model):
    business = models.ForeignKey(Business, on_delete=models.PROTECT)
    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.PROTECT
    )
    name = models.CharField(max_length=120)
    sku = models.CharField(max_length=60)
    barcode = models.CharField(max_length=100, blank=True)
    price = models.PositiveBigIntegerField()
    cost = models.PositiveBigIntegerField()
    image = models.URLField(blank=True)
    published = models.BooleanField(default=False)
    active = models.BooleanField(default=True)
    low_stock_threshold = models.PositiveIntegerField(default=5)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["business", "sku"], name="unique_sku")
        ]
