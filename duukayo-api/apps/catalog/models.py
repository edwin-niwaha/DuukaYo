from typing import ClassVar

from django.db import models

from apps.businesses.models import Business
from apps.common.validation import ValidatedModel


class Category(ValidatedModel):
    business = models.ForeignKey(Business, on_delete=models.PROTECT)
    name = models.CharField(max_length=80)

    class Meta:
        constraints: ClassVar[list] = [
            models.UniqueConstraint(fields=["business", "name"], name="unique_category")
        ]


class Product(ValidatedModel):
    business = models.ForeignKey(Business, on_delete=models.PROTECT)
    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.PROTECT
    )
    name = models.CharField(max_length=120)
    sku = models.CharField(max_length=60)
    barcode = models.CharField(max_length=100, blank=True)
    price = models.PositiveBigIntegerField()
    cost = models.PositiveBigIntegerField(null=True, blank=True)
    image = models.URLField(blank=True)
    description = models.TextField(blank=True, max_length=5000)
    gallery = models.JSONField(default=list, blank=True)
    variant_group = models.CharField(max_length=100, blank=True, db_index=True)
    attributes = models.JSONField(default=dict, blank=True)
    published = models.BooleanField(default=False)
    showcase = models.BooleanField(default=False, help_text="Display a non-purchasable preview while stock and pricing setup is completed.")
    active = models.BooleanField(default=True)
    low_stock_threshold = models.PositiveIntegerField(default=5)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def order_name(self):
        if not self.variant_group or not self.attributes:
            return self.name
        label = ", ".join(f"{key}: {value}" for key, value in sorted(self.attributes.items()))
        return f"{self.name} — {label}"

    class Meta:
        constraints: ClassVar[list] = [
            models.UniqueConstraint(fields=["business", "sku"], name="unique_sku"),
            models.CheckConstraint(condition=models.Q(cost__isnull=False) | models.Q(active=False, published=False), name="unknown_cost_draft_only")
        ]
