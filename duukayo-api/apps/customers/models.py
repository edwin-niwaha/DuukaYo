from django.db import models

from apps.businesses.models import Business
from apps.common.validation import ValidatedModel


class Customer(ValidatedModel):
    business = models.ForeignKey(Business, on_delete=models.PROTECT)
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=30)


class Address(ValidatedModel):
    user = models.ForeignKey("auth.User", on_delete=models.CASCADE)
    label = models.CharField(max_length=60)
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=30)
    address = models.CharField(max_length=250)
    updated_at = models.DateTimeField(auto_now=True)
