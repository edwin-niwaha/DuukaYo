from django.db import models

from apps.businesses.models import Membership


class Device(models.Model):
    membership = models.ForeignKey(Membership, on_delete=models.CASCADE)
    token = models.CharField(max_length=512, unique=True)
    updated_at = models.DateTimeField(auto_now=True)
    pending_sales = models.PositiveIntegerField(default=0)
