from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.common.validation import ValidatedModel


class Business(ValidatedModel):
    name = models.CharField(max_length=120)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True, max_length=2000)
    website = models.URLField(blank=True)
    published = models.BooleanField(default=False)
    suspended = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True, editable=False)
    logo = models.URLField(blank=True)
    currency = models.CharField(max_length=3, default="UGX")
    timezone = models.CharField(max_length=60, default="Africa/Kampala")
    contact = models.CharField(max_length=80, blank=True)
    delivery_enabled = models.BooleanField(default=False)
    delivery_fee = models.PositiveBigIntegerField(default=0)
    safety_buffer = models.PositiveIntegerField(default=2)
    storefront_branch = models.ForeignKey(
        "Branch", null=True, blank=True, on_delete=models.PROTECT,
        related_name="storefront_businesses",
    )

    class Meta:
        constraints: ClassVar[list] = [models.CheckConstraint(
            condition=models.Q(deleted_at__isnull=True) | models.Q(published=False, suspended=True),
            name="deleted_shop_disabled",
        )]

    def online_branch(self):
        return self.storefront_branch or self.branch_set.order_by("pk").first()


class Branch(ValidatedModel):
    business = models.ForeignKey(Business, on_delete=models.PROTECT)
    name = models.CharField(max_length=100, default="Main branch")


class Membership(ValidatedModel):
    ROLES: ClassVar[list] = [("owner", "Owner"), ("manager", "Manager"), ("cashier", "Cashier")]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    business = models.ForeignKey(Business, on_delete=models.PROTECT)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    role = models.CharField(max_length=10, choices=ROLES)
    active = models.BooleanField(default=True)

    class Meta:
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["user", "business"], name="unique_membership"
            )
        ]
