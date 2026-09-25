from django.db import models
from django.utils import timezone

from apps.businesses.models import Membership
from apps.common.validation import ValidatedModel


class Device(ValidatedModel):
    membership = models.ForeignKey(Membership, on_delete=models.CASCADE)
    token = models.CharField(max_length=512, unique=True)
    updated_at = models.DateTimeField(auto_now=True)
    pending_sales = models.PositiveIntegerField(default=0)


class NotificationEvent(ValidatedModel):
    order = models.OneToOneField("orders.Order", on_delete=models.PROTECT)
    attempts = models.PositiveIntegerField(default=0)
    delivered_at = models.DateTimeField(null=True)
    available_at = models.DateTimeField(default=timezone.now, db_index=True)
    lease_until = models.DateTimeField(null=True)
    last_error = models.CharField(max_length=100, blank=True)
    delivered_devices = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
