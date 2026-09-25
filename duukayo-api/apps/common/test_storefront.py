from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.catalog.models import Category
from apps.common.services import place_order
from apps.common.tests import Fixture


class StorefrontTests(Fixture, TestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=None)

    def test_directory_excludes_private_catalogs_and_supports_search(self):
        response = self.client.get("/api/v1/shops/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([s["slug"] for s in response.data["shops"]], ["one", "two"])
        self.assertEqual(response.data["shops"][0]["product_count"], 1)
        self.assertNotIn("cost", response.data["shops"][0]["preview_products"][0])
        self.assertEqual(
            self.client.get("/api/v1/shops/?q=milk").data["shops"][0]["slug"], "one"
        )
        self.assertEqual(self.client.get("/api/v1/shops/?q=secret").data["shops"], [])

    def test_catalog_categories_stock_and_private_fields(self):
        category = Category.objects.create(business=self.business, name="Dairy")
        self.product.category = category
        self.product.save()
        result = self.client.get("/api/v1/shop/one/").data
        self.assertEqual(result["categories"], [{"id": category.pk, "name": "Dairy"}])
        self.assertEqual(result["products"][0]["available"], 10)
        self.assertEqual(result["products"][0]["category_name"], "Dairy")
        self.assertNotIn("cost", result["products"][0])

    def test_guest_checkout_retry_delivery_and_tracking(self):
        self.business.delivery_enabled = True
        self.business.delivery_fee = 3000
        self.business.save()
        payload = self.order_data(delivery=True, address="Plot 12, Kampala")
        response = self.client.post("/api/v1/shop/one/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        retry = self.client.post("/api/v1/shop/one/", payload, format="json")
        self.assertEqual(retry.data, response.data)
        result = self.client.get(f"/api/v1/guest-orders/{response.data['token']}/").data
        self.assertEqual(result["total"], 8000)
        self.assertEqual(result["shop_slug"], "one")
        self.assertTrue(result["delivery"])
        self.assertNotIn("cost", result["lines"][0])
        self.assertNotIn("phone", result)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.reserved, 2)

    def test_expired_orders_release_stock_when_tracking(self):
        order = place_order(self.business, self.order_data())
        order.expires_at = timezone.now() - timedelta(seconds=1)
        order.save()
        self.assertEqual(
            self.client.get(f"/api/v1/guest-orders/{order.token}/").data["status"],
            "cancelled",
        )
        self.assertEqual(
            self.client.get("/api/v1/shop/one/").data["products"][0]["available"], 10
        )

    def test_browsing_releases_expired_reservations_without_worker(self):
        order = place_order(self.business, self.order_data())
        order.expires_at = timezone.now() - timedelta(seconds=1)
        order.save()
        self.assertEqual(
            self.client.get("/api/v1/shop/one/").data["products"][0]["available"], 10
        )
        order.refresh_from_db()
        self.assertEqual(order.status, "cancelled")

    def test_cross_store_products_and_price_tampering_rejected(self):
        for line in [
            {"product": self.p2.pk, "quantity": 1},
            {"product": self.product.pk, "quantity": 1, "price": 1},
        ]:
            response = self.client.post(
                "/api/v1/shop/one/", self.order_data(lines=[line]), format="json"
            )
            self.assertIn(response.status_code, [400, 404])
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.reserved, 0)
