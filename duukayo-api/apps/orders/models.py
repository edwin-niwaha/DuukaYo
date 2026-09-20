import secrets

from django.db import models

from apps.businesses.models import Branch, Business


def capability():
    return secrets.token_urlsafe(32)


class Order(models.Model):
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
        constraints = [
            models.UniqueConstraint(
                fields=["business", "client_id"], name="unique_guest_order"
            )
        ]
