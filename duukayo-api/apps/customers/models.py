from django.db import models

from apps.businesses.models import Business


class Customer(models.Model):
    business = models.ForeignKey(Business, on_delete=models.PROTECT)
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=30)
