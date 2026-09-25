import uuid
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.businesses.models import Branch
from apps.common.services import change_stock, checkout, place_order, transition_order
from apps.common.tests import Fixture
from apps.inventory.models import Movement
from apps.notifications.models import NotificationEvent
from apps.orders.models import Reservation


class DomainIntegrityTests(Fixture, TestCase):
    def test_stock_replay_returns_original_result_after_later_changes(self):
        data = {
            "client_id": uuid.uuid4(),
            "product": self.product.pk,
            "delta": 5,
            "kind": "receipt",
            "reason": "Restocking",
        }
        self.assertEqual(change_stock(self.m, data).quantity, 15)
        change_stock(self.m, dict(data, client_id=uuid.uuid4(), delta=2))
        self.assertEqual(change_stock(self.m, data).quantity, 15)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 17)

    def test_stock_key_cannot_be_replayed_in_another_branch(self):
        data = {
            "client_id": uuid.uuid4(),
            "product": self.product.pk,
            "delta": 5,
            "kind": "receipt",
            "reason": "Restocking",
        }
        change_stock(self.m, data)
        self.m.branch = Branch.objects.create(business=self.business, name="Second")
        with self.assertRaises(ValidationError):
            change_stock(self.m, data)
        self.assertEqual(Movement.objects.count(), 1)

    def test_manual_reference_required_at_api_and_service(self):
        data = self.sale_data(method="manual_mtn", tendered=5000)
        with self.assertRaises(ValidationError):
            checkout(self.m, data)
        self.assertEqual(
            self.client.post(self.base + "sales/", data, format="json").status_code, 400
        )

    def test_completion_retry_must_match_payment(self):
        order = place_order(self.business, self.order_data())
        for status in ("accepted", "preparing", "ready", "completed"):
            transition_order(self.m, order.pk, {"status": status, "method": "cash"})
        with self.assertRaises(ValidationError):
            transition_order(
                self.m,
                order.pk,
                {
                    "status": "completed",
                    "method": "manual_mtn",
                    "reference": "different",
                },
            )
        self.assertEqual(Reservation.objects.get().state, "consumed")

    def test_offline_conflict_blocks_order_fulfilment(self):
        order = place_order(self.business, self.order_data())
        for status in ("accepted", "preparing", "ready"):
            transition_order(self.m, order.pk, {"status": status})
        data = self.sale_data(offline=True, occurred_at=timezone.now(), tendered=25000)
        data["lines"][0]["quantity"] = 10
        checkout(self.m, data)
        with self.assertRaises(ValidationError):
            transition_order(
                self.m, order.pk, {"status": "completed", "method": "cash"}
            )
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.reserved, 2)

    def test_pos_releases_expired_reservations_before_checking_stock(self):
        order = place_order(self.business, self.order_data())
        order.expires_at = timezone.now() - timedelta(seconds=1)
        order.save()
        data = self.sale_data(tendered=25000)
        data["lines"][0]["quantity"] = 10
        checkout(self.m, data)
        self.assertEqual(Reservation.objects.get().state, "released")

    def test_password_whitespace_is_preserved_for_session_login(self):
        self.user.set_password("  long-whitespace-password  ")
        self.user.save()
        client = APIClient()
        self.assertEqual(
            client.post(
                "/api/v1/auth/session/",
                {"username": "owner", "password": "  long-whitespace-password  "},
            ).status_code,
            200,
        )

    def test_order_has_durable_notification_and_line_snapshot(self):
        order = place_order(self.business, self.order_data())
        self.assertEqual(order.items.get().cost, 1800)
        self.assertTrue(
            NotificationEvent.objects.filter(
                order=order, delivered_at__isnull=True
            ).exists()
        )

    def test_partial_receipt_can_reconcile_an_offline_shortage(self):
        self.stock.quantity = -5
        self.stock.reserved = 2
        self.stock.save()
        change_stock(
            self.m,
            {
                "client_id": uuid.uuid4(),
                "product": self.product.pk,
                "delta": 3,
                "kind": "receipt",
                "reason": "First supplier batch",
            },
        )
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, -2)
        self.assertEqual(self.stock.reserved, 2)

    def test_order_backfill_preserves_existing_stock_and_snapshots(self):
        import importlib
        from types import SimpleNamespace

        from django.apps import apps
        from django.db import connection

        from apps.orders.models import OrderLine

        order = place_order(self.business, self.order_data())
        Reservation.objects.filter(line__order=order).delete()
        OrderLine.objects.filter(order=order).delete()
        backfill = importlib.import_module(
            "apps.orders.migrations.0003_backfill_order_ledger"
        ).backfill
        backfill(apps, SimpleNamespace(connection=connection))
        backfill(apps, SimpleNamespace(connection=connection))
        self.assertEqual(order.items.count(), 1)
        self.assertEqual(order.items.get().cost, 1800)
        self.stock.refresh_from_db()
        self.assertEqual((self.stock.quantity, self.stock.reserved), (10, 2))


from django.test import TransactionTestCase, skipUnlessDBFeature


class MixedCheckoutConcurrencyTests(Fixture, TransactionTestCase):
    @skipUnlessDBFeature("has_select_for_update")
    def test_pos_and_storefront_compete_for_last_items_without_overselling(self):
        from concurrent.futures import ThreadPoolExecutor

        from django.db import connections

        from apps.businesses.models import Business, Membership

        self.stock.quantity = 2
        self.stock.save()

        def attempt(kind):
            try:
                if kind == "sale":
                    checkout(
                        Membership.objects.select_related(
                            "business", "branch", "user"
                        ).get(pk=self.m.pk),
                        self.sale_data(),
                    )
                else:
                    place_order(
                        Business.objects.get(pk=self.business.pk), self.order_data()
                    )
                return True
            except ValidationError:
                return False
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(
                sorted(pool.map(attempt, ["sale", "order"])), [False, True]
            )
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity - self.stock.reserved, 0)
