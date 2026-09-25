from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.businesses.models import Business
from apps.common.validation import ValidatedModel


class Audit(ValidatedModel):
    business = models.ForeignKey(Business, null=True, blank=True, on_delete=models.PROTECT)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT
    )
    action = models.CharField(max_length=60)
    reference = models.CharField(max_length=100)
    detail = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)


class PlatformSettings(ValidatedModel):
    name = models.CharField(max_length=120, default="DuukaYo")
    support_email = models.EmailField(blank=True)
    notice = models.CharField(max_length=500, blank=True)
    orders_enabled = models.BooleanField(default=True)
    shop_registration_enabled = models.BooleanField(default=True)

    class Meta:
        permissions: ClassVar[list] = [("manage_platform", "Manage the DuukaYo platform")]
        constraints: ClassVar[list] = [models.CheckConstraint(condition=models.Q(pk=1), name="single_platform_settings")]

    @classmethod
    def current(cls):
        return cls.objects.get_or_create(pk=1)[0]


class Operation(ValidatedModel):
    """Committed command results; created in the same transaction as their effects."""
    business = models.ForeignKey(Business, on_delete=models.PROTECT)
    branch = models.ForeignKey("businesses.Branch", on_delete=models.PROTECT)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    kind = models.CharField(max_length=40)
    client_id = models.UUIDField()
    payload_hash = models.CharField(max_length=64)
    result = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints: ClassVar[list] = [models.UniqueConstraint(fields=["business", "kind", "client_id"], name="unique_business_command")]
