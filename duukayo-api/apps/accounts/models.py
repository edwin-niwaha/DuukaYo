from django.conf import settings
from django.db import models

from apps.common.validation import ValidatedModel


class UserProfile(ValidatedModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="profile")
    photo = models.URLField(blank=True, max_length=500)
    phone = models.CharField(blank=True, max_length=40)
    job_title = models.CharField(blank=True, max_length=100)
    location = models.CharField(blank=True, max_length=150)
    deleted_at = models.DateTimeField(null=True, blank=True, editable=False)


class GoogleIdentity(ValidatedModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    subject = models.CharField(max_length=255, unique=True)
