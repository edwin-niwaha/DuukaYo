from django.db import models

from apps.sales.models import Sale


class Payment(models.Model):
    sale = models.OneToOneField(Sale, related_name="payment", on_delete=models.PROTECT)
    method = models.CharField(max_length=20)
    amount = models.PositiveBigIntegerField()
    tendered = models.PositiveBigIntegerField()
    change = models.PositiveBigIntegerField(default=0)
    provider_verified = models.BooleanField(default=False)
    reference = models.CharField(max_length=100, blank=True)
