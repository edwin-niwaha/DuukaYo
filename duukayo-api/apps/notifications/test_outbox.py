from unittest.mock import patch

from django.test import TestCase, override_settings

from apps.common.services import place_order
from apps.common.tests import Fixture
from apps.notifications.models import NotificationEvent
from apps.notifications.tasks import enqueue_order_notification, notify_order


class OutboxTests(Fixture, TestCase):
    @override_settings(PUSH_BACKEND="fcm")
    def test_enqueue_failure_keeps_durable_event(self):
        order = place_order(self.business, self.order_data())
        # Fixture patches only the module's public enqueue attribute; imported function remains callable.
        with patch(
            "apps.notifications.tasks.notify_order.delay", side_effect=ConnectionError
        ):
            enqueue_order_notification(order.pk)
        self.assertTrue(
            NotificationEvent.objects.filter(
                order=order, delivered_at__isnull=True
            ).exists()
        )

    @override_settings(PUSH_BACKEND="log")
    def test_delivery_retries_do_not_repeat_completed_event(self):
        order = place_order(self.business, self.order_data())
        notify_order(order.pk)
        notify_order(order.pk)
        event = NotificationEvent.objects.get(order=order)
        self.assertEqual(event.attempts, 1)
        self.assertIsNotNone(event.delivered_at)
