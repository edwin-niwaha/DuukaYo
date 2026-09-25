"""Durable, at-least-once notification delivery. Payloads contain identifiers only."""

import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.notifications.models import Device, NotificationEvent

logger = logging.getLogger(__name__)


def enqueue_order_notification(order_id):
    try:
        if settings.PUSH_BACKEND == "log":
            notify_order(order_id)
        else:
            notify_order.delay(order_id)
    except Exception:  # noqa: BLE001 - Any provider/broker failure must leave the durable outbox retryable.
        logger.warning("Push enqueue unavailable; durable outbox will retry")


@shared_task
def dispatch_notifications():
    now = timezone.now()
    due = NotificationEvent.objects.filter(
        delivered_at__isnull=True, available_at__lte=now
    ).filter(Q(lease_until__isnull=True) | Q(lease_until__lte=now))
    for order_id in due.order_by("available_at").values_list("order_id", flat=True)[
        :100
    ]:
        enqueue_order_notification(order_id)


@shared_task
def notify_order(order_id):
    now = timezone.now()
    with transaction.atomic():
        event = (
            NotificationEvent.objects.select_for_update()
            .filter(order_id=order_id)
            .first()
        )
        if (
            not event
            or event.delivered_at
            or event.available_at > now
            or (event.lease_until and event.lease_until > now)
        ):
            return
        event.lease_until = now + timedelta(minutes=5)
        event.attempts += 1
        event.save(update_fields=["lease_until", "attempts"])
    # Never hold database locks during provider calls.
    try:
        if settings.PUSH_BACKEND == "log":
            logger.info("Development push: new order %s", order_id)
        elif settings.PUSH_BACKEND == "fcm":
            from firebase_admin import messaging

            from .firebase import get_firebase_app

            order = event.order
            failed = False
            devices = Device.objects.filter(
                membership__business_id=order.business_id,
                membership__branch_id=order.branch_id,
                membership__active=True,
            ).exclude(pk__in=event.delivered_devices)
            app = get_firebase_app()
            for device in devices:
                if device.token.startswith("local:"):
                    continue
                try:
                    messaging.send(
                        messaging.Message(
                            token=device.token,
                            data={
                                "order_id": str(order_id),
                                "business_id": str(order.business_id),
                            },
                            notification=messaging.Notification(
                                title="New shop order",
                                body="Open DuukaYo to review it.",
                            ),
                        ),
                        app=app,
                    )
                except messaging.UnregisteredError:
                    device.delete()
                    continue
                except Exception:  # noqa: BLE001 - Any provider/broker failure must leave the durable outbox retryable.
                    failed = True
                    continue
                event.delivered_devices.append(device.pk)
                event.save(update_fields=["delivered_devices"])
            if failed:
                raise RuntimeError("delivery_failed")
        else:
            raise RuntimeError("push_backend_unconfigured")
    except Exception:  # noqa: BLE001 - Any provider/broker failure must leave the durable outbox retryable.
        # Store no tokens, credentials or provider response bodies.
        NotificationEvent.objects.filter(pk=event.pk).update(
            lease_until=None,
            available_at=timezone.now()
            + timedelta(seconds=min(3600, 30 * 2 ** min(event.attempts, 7))),
            last_error="delivery_failed",
        )
        logger.warning("Notification delivery deferred for order %s", order_id)
    else:
        NotificationEvent.objects.filter(pk=event.pk).update(
            delivered_at=timezone.now(), lease_until=None, last_error=""
        )
