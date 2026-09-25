from celery import shared_task
from django.db import transaction
from django.utils import timezone

from apps.businesses.models import Business
from apps.common.services import expire_for_business
from apps.orders.models import Order


@shared_task
def expire_reservations():
    for business_id in Order.objects.filter(status="pending", expires_at__lte=timezone.now()).order_by("business_id").values_list("business_id", flat=True).distinct()[:100]:
        with transaction.atomic():
            business = Business.objects.select_for_update().get(pk=business_id)
            expire_for_business(business)
