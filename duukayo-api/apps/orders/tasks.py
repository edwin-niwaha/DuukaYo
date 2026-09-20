from celery import shared_task
from django.db import transaction

from apps.businesses.models import Business
from apps.common.services import expire_for_business


@shared_task
def expire_reservations():
    for business_id in Business.objects.values_list("id", flat=True):
        with transaction.atomic():
            business = Business.objects.select_for_update().get(pk=business_id)
            expire_for_business(business)
