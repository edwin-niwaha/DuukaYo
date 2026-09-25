import uuid
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase, skipUnlessDBFeature
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.test import APIClient

from apps.businesses.models import Branch, Business, Membership
from apps.catalog.models import Category, Product
from apps.common.services import (
    change_stock,
    checkout,
    expire_for_business,
    place_order,
    transition_order,
)
from apps.customers.models import Customer
from apps.inventory.models import Movement, Stock
from apps.payments.models import Payment
from apps.sales.models import Sale


class Fixture:
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            "owner", password="strong-password-123"
        )
        self.other = get_user_model().objects.create_user(
            "other", password="strong-password-123"
        )
        self.business = Business.objects.create(published=True, name="One", slug="one", safety_buffer=0)
        self.b2 = Business.objects.create(published=True, name="Two", slug="two")
        self.branch = Branch.objects.create(business=self.business)
        self.branch2 = Branch.objects.create(business=self.b2)
        self.m = Membership.objects.create(
            user=self.user, business=self.business, branch=self.branch, role="owner"
        )
        Membership.objects.create(
            user=self.other, business=self.b2, branch=self.branch2, role="owner"
        )
        self.product = Product.objects.create(
            business=self.business,
            name="Milk",
            sku="milk",
            price=2500,
            cost=1800,
            published=True,
        )
        self.p2 = Product.objects.create(
            business=self.b2,
            name="Secret",
            sku="secret",
            price=9000,
            cost=2000,
            published=False,
        )
        self.stock = Stock.objects.create(
            branch=self.branch, product=self.product, quantity=10
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.base = f"/api/v1/businesses/{self.business.pk}/"
        self.patcher = patch("apps.notifications.tasks.enqueue_order_notification")
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def sale_data(self, **changes):
        data = {
            "client_id": uuid.uuid4(),
            "method": "cash",
            "tendered": 10000,
            "lines": [
                {
                    "product": self.product.pk,
                    "quantity": 2,
                    "price": 2500,
                    "discount": 0,
                }
            ],
        }
        data.update(changes)
        return data

    def order_data(self, **changes):
        data = {
            "client_id": uuid.uuid4(),
            "name": "Guest",
            "phone": "+256700000000",
            "lines": [{"product": self.product.pk, "quantity": 2, "discount": 0}],
        }
        data.update(changes)
        return data


class IntegrityTests(Fixture, TestCase):
    def test_sale_totals_snapshots_stock_and_change(self):
        sale = checkout(self.m, self.sale_data())
        self.assertEqual(sale.total, 5000)
        self.assertEqual(sale.payment.change, 5000)
        self.assertEqual(sale.lines.get().cost, 1800)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 8)
        self.assertEqual(Movement.objects.get().delta, -2)

    def test_sale_retry_is_exactly_once(self):
        data = self.sale_data()
        a = checkout(self.m, data)
        b = checkout(self.m, data)
        self.assertEqual(a.pk, b.pk)
        self.assertEqual(Sale.objects.count(), 1)
        self.assertEqual(Payment.objects.count(), 1)
        self.assertEqual(Movement.objects.count(), 1)

    def test_reused_key_with_different_payload_rejected(self):
        data = self.sale_data()
        checkout(self.m, data)
        data["tendered"] = 11000
        with self.assertRaises(ValidationError):
            checkout(self.m, data)

    def test_stock_shortage_rolls_back(self):
        self.stock.quantity = 1
        self.stock.save()
        with self.assertRaises(ValidationError):
            checkout(self.m, self.sale_data())
        self.assertEqual(Sale.objects.count(), 0)
        self.assertEqual(Payment.objects.count(), 0)

    def test_offline_cash_preserved_and_flagged(self):
        self.stock.quantity = 1
        self.stock.save()
        data = self.sale_data(offline=True, occurred_at=timezone.now())
        data["lines"][0]["price"] = 2400
        sale = checkout(self.m, data)
        self.assertEqual(sale.total, 4800)
        self.assertEqual(len(sale.review_reasons), 2)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, -1)

    def test_offline_provider_payment_rejected(self):
        with self.assertRaises(ValidationError):
            checkout(self.m, self.sale_data(offline=True, method="manual_mtn"))

    def test_cashier_discount_rejected(self):
        self.m.role = "cashier"
        data = self.sale_data()
        data["lines"][0]["discount"] = 100
        with self.assertRaises(PermissionDenied):
            checkout(self.m, data)

    def test_manual_money_never_verified(self):
        sale = checkout(self.m, self.sale_data(method="manual_mtn", tendered=5000, reference="MTN-TEST-1"))
        self.assertFalse(sale.payment.provider_verified)

    def test_reservation_cancel_releases(self):
        order = place_order(self.business, self.order_data())
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.reserved, 2)
        transition_order(self.m, order.pk, {"status": "cancelled"})
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.reserved, 0)
        self.assertEqual(self.stock.quantity, 10)

    def test_expiry_releases(self):
        order = place_order(self.business, self.order_data())
        order.expires_at = timezone.now() - timedelta(seconds=1)
        order.save()
        expire_for_business(self.business)
        self.stock.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(order.status, "cancelled")
        self.assertEqual(self.stock.reserved, 0)

    def test_completion_deducts_once(self):
        order = place_order(self.business, self.order_data())
        for state in ["accepted", "preparing", "ready", "completed", "completed"]:
            transition_order(self.m, order.pk, {"status": state, "method": "cash"})
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 8)
        self.assertEqual(self.stock.reserved, 0)
        self.assertEqual(Sale.objects.count(), 1)
        self.assertEqual(Payment.objects.count(), 1)

    def test_invalid_lifecycle(self):
        order = place_order(self.business, self.order_data())
        with self.assertRaises(ValidationError):
            transition_order(
                self.m, order.pk, {"status": "completed", "method": "cash"}
            )

    def test_reservation_insufficient_stock(self):
        data = self.order_data()
        data["lines"][0]["quantity"] = 9
        place_order(self.business, data)
        with self.assertRaises(ValidationError):
            place_order(self.business, self.order_data())

    def test_order_retry_does_not_reserve_twice(self):
        data = self.order_data()
        a = place_order(self.business, data)
        b = place_order(self.business, data)
        self.assertEqual(a.pk, b.pk)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.reserved, 2)

    def test_business_isolation_all_collections(self):
        for endpoint in [
            "products/",
            "customers/",
            "categories/",
            "sales/",
            "orders/",
            "reports/",
            "stock/",
            "staff/",
        ]:
            self.assertEqual(
                self.client.get(
                    f"/api/v1/businesses/{self.b2.pk}/" + endpoint
                ).status_code,
                404,
                endpoint,
            )

    def test_cross_business_product_and_customer_rejected(self):
        data = self.sale_data()
        data["lines"][0]["product"] = self.p2.pk
        self.assertEqual(
            self.client.post(self.base + "sales/", data, format="json").status_code, 404
        )
        customer = Customer.objects.create(
            business=self.b2, name="Hidden", phone="123456789"
        )
        data = self.sale_data(customer=customer.pk)
        self.assertEqual(
            self.client.post(self.base + "sales/", data, format="json").status_code, 404
        )

    def test_cross_business_category_rejected(self):
        category = Category.objects.create(business=self.b2, name="Private")
        response = self.client.patch(
            self.base + f"products/{self.product.pk}/",
            {"category": category.pk},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_cashier_cannot_manage_stock_staff_catalog_reports(self):
        self.m.role = "cashier"
        self.m.save()
        for endpoint in ["stock/", "staff/", "products/"]:
            self.assertEqual(
                self.client.post(self.base + endpoint, {}, format="json").status_code,
                403,
            )
        self.assertEqual(self.client.get(self.base + "reports/").status_code, 403)

    def test_guest_cannot_enumerate_orders_or_private_products(self):
        self.client.force_authenticate(None)
        # JWT authentication returns a challenge so mobile clients can refresh.
        self.assertEqual(self.client.get(self.base + "orders/").status_code, 401)
        self.assertEqual(self.client.get("/api/v1/guest-orders/1/").status_code, 404)
        self.assertEqual(self.client.get("/api/v1/shop/two/").json()["products"], [])
        order = place_order(self.business, self.order_data())
        result = self.client.get(f"/api/v1/guest-orders/{order.token}/").json()
        self.assertNotIn("phone", result)
        self.assertNotIn("cost", result["lines"][0])

    def test_duplicate_lines_rejected(self):
        data = self.sale_data()
        data["lines"] *= 2
        self.assertEqual(
            self.client.post(self.base + "sales/", data, format="json").status_code, 400
        )

    def test_stock_operation_retry(self):
        data = {
            "client_id": uuid.uuid4(),
            "product": self.product.pk,
            "delta": 5,
            "kind": "receipt",
            "reason": "Supplier delivery",
        }
        change_stock(self.m, data)
        change_stock(self.m, data)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 15)

    def test_login_requires_csrf(self):
        client = APIClient(enforce_csrf_checks=True)
        self.assertEqual(
            client.post(
                "/api/v1/auth/session/",
                {"username": "owner", "password": "strong-password-123"},
            ).status_code,
            403,
        )
        token = client.get("/api/v1/auth/session/").json()["csrfToken"]
        result = client.post(
            "/api/v1/auth/session/",
            {"username": "owner", "password": "strong-password-123"},
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(result.status_code, 200)
        self.assertTrue(result.cookies["sessionid"]["httponly"])


class ConcurrencyTests(Fixture, TransactionTestCase):
    @skipUnlessDBFeature("has_select_for_update")
    def test_two_reservations_cannot_oversell(self):
        from concurrent.futures import ThreadPoolExecutor

        from django.db import close_old_connections, connections

        self.stock.quantity = 3
        self.stock.save()

        def attempt(_):
            close_old_connections()
            try:
                place_order(
                    Business.objects.get(pk=self.business.pk), self.order_data()
                )
                return True
            except ValidationError:
                return False
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(attempt, range(2)))
        self.assertEqual(sorted(outcomes), [False, True])
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.reserved, 2)


class AdditionalIntegrityTests(Fixture, TestCase):
    def test_snapshots_do_not_change_with_catalog(self):
        sale = checkout(self.m, self.sale_data())
        self.product.price = 9000
        self.product.cost = 7000
        self.product.save()
        self.assertEqual(sale.lines.get().price, 2500)
        self.assertEqual(sale.lines.get().cost, 1800)

    def test_offline_cost_snapshot_is_preserved_and_flagged(self):
        data = self.sale_data(offline=True, occurred_at=timezone.now())
        data["lines"][0]["cost"] = 1700
        sale = checkout(self.m, data)
        self.assertEqual(sale.lines.get().cost, 1700)
        self.assertIn("Stale cost: milk", sale.review_reasons)

    def test_adjustment_cannot_consume_reserved_stock(self):
        place_order(self.business, self.order_data())
        with self.assertRaises(ValidationError):
            change_stock(
                self.m,
                {
                    "client_id": uuid.uuid4(),
                    "product": self.product.pk,
                    "delta": -9,
                    "kind": "adjustment",
                    "reason": "Count correction",
                },
            )

    def test_revoked_membership_cannot_upload(self):
        self.m.active = False
        self.m.save()
        self.assertEqual(
            self.client.post(
                self.base + "sales/", self.sale_data(), format="json"
            ).status_code,
            404,
        )

    def test_cross_business_branch_rejected(self):
        self.assertEqual(
            self.client.post(
                self.base + "sales/",
                self.sale_data(branch=self.branch2.pk),
                format="json",
            ).status_code,
            400,
        )

    def test_delivery_fee_snapshot_and_separate_payment_state(self):
        self.business.delivery_enabled = True
        self.business.delivery_fee = 3000
        self.business.save()
        order = place_order(
            self.business, self.order_data(delivery=True, address="Plot 12, Kampala")
        )
        self.assertEqual(order.total, 8000)
        self.assertEqual(order.payment_state, "unpaid")
        for state in ["accepted", "preparing", "ready", "completed"]:
            transition_order(
                self.m, order.pk, {"status": state, "method": "manual_airtel", "reference": "AIRTEL-TEST-1"}
            )
        order.refresh_from_db()
        self.assertEqual(order.sale.delivery_fee, 3000)
        self.assertFalse(order.sale.payment.provider_verified)

    def test_reports_use_business_local_date(self):
        from datetime import datetime
        from datetime import timezone as dt_timezone

        from apps.reports.services import daily_report

        when = datetime(2026, 1, 1, 22, 0, tzinfo=dt_timezone.utc)
        checkout(self.m, self.sale_data(occurred_at=when))
        report = daily_report(self.m, "2026-01-02")
        self.assertEqual(report["total"], 5000)
        self.assertEqual(report["estimated_gross_profit"], 1400)
        self.assertEqual(daily_report(self.m, "2026-01-01")["total"], 0)

    def test_public_order_rejects_private_product(self):
        self.product.published = False
        self.product.save()
        guest = APIClient()
        response = guest.post("/api/v1/shop/one/", self.order_data(), format="json")
        self.assertEqual(response.status_code, 404)


class ConcurrentSalesTests(Fixture, TransactionTestCase):
    @skipUnlessDBFeature("has_select_for_update")
    def test_concurrent_sale_retries_create_one_payment(self):
        from concurrent.futures import ThreadPoolExecutor

        from django.db import close_old_connections, connections

        data = self.sale_data()

        def attempt(_):
            close_old_connections()
            try:
                return checkout(
                    Membership.objects.select_related("business", "branch", "user").get(
                        pk=self.m.pk
                    ),
                    data,
                ).pk
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            ids = list(pool.map(attempt, range(2)))
        self.assertEqual(ids[0], ids[1])
        self.assertEqual(Payment.objects.count(), 1)
        self.assertEqual(Movement.objects.count(), 1)
