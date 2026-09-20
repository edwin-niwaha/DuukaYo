from django.conf import settings
from django.db import models

from apps.businesses.models import Business


class Audit(models.Model):
    business = models.ForeignKey(Business, on_delete=models.PROTECT)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT
    )
    action = models.CharField(max_length=60)
    reference = models.CharField(max_length=100)
    detail = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
