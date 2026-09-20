from django.conf import settings
from django.db import models


class Business(models.Model):
    name = models.CharField(max_length=120)
    slug = models.SlugField(unique=True)
    logo = models.URLField(blank=True)
    currency = models.CharField(max_length=3, default="UGX")
    timezone = models.CharField(max_length=60, default="Africa/Kampala")
    contact = models.CharField(max_length=80, blank=True)
    delivery_enabled = models.BooleanField(default=False)
    delivery_fee = models.PositiveBigIntegerField(default=0)
    safety_buffer = models.PositiveIntegerField(default=2)


class Branch(models.Model):
    business = models.ForeignKey(Business, on_delete=models.PROTECT)
    name = models.CharField(max_length=100, default="Main branch")


class Membership(models.Model):
    ROLES = [("owner", "Owner"), ("manager", "Manager"), ("cashier", "Cashier")]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    business = models.ForeignKey(Business, on_delete=models.PROTECT)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT)
    role = models.CharField(max_length=10, choices=ROLES)
    active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "business"], name="unique_membership"
            )
        ]
