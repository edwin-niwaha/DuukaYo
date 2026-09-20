import logging

from celery import shared_task
from django.conf import settings

from apps.notifications.models import Device
from apps.orders.models import Order

logger = logging.getLogger(__name__)


def enqueue_order_notification(order_id):
    if settings.PUSH_BACKEND == "log":
        logger.info(
            "Development push: new order %s; clients refresh authoritative details",
            order_id,
        )
        return
    try:
        notify_order.delay(order_id)
    except Exception:
        logger.warning("Push enqueue unavailable; clients must refresh orders")


@shared_task
def notify_order(order_id):
    order = Order.objects.get(pk=order_id)
    if settings.PUSH_BACKEND != "fcm":
        logger.info(
            "Development push: new order %s for business %s",
            order.pk,
            order.business_id,
        )
        return
    import firebase_admin
    from firebase_admin import messaging

    if not firebase_admin._apps:
        firebase_admin.initialize_app()
    for device in Device.objects.filter(
        membership__business=order.business, membership__active=True
    ):
        if device.token.startswith("local:"):
            continue
        messaging.send(
            messaging.Message(
                token=device.token,
                data={"order_id": str(order.pk), "business_id": str(order.business_id)},
                notification=messaging.Notification(
                    title="New shop order", body="Open Perpetual POS to review it."
                ),
            )
        )
