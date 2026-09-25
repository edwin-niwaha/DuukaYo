from concurrent.futures import ThreadPoolExecutor

from django.db import close_old_connections
from django.test import TestCase, TransactionTestCase, skipUnlessDBFeature
from rest_framework.exceptions import ValidationError

from apps.businesses.models import Branch, Business, Membership
from apps.catalog.models import Product
from apps.common.services import checkout, place_order, transition_order
from apps.common.tests import Fixture
from apps.inventory.models import Stock
from apps.orders.models import Order
from apps.sales.models import Sale


class ShoppingUpgradeTests(Fixture, TestCase):
    def test_explicit_branch_drives_public_stock_and_orders(self):
        branch = Branch.objects.create(business=self.business, name="Online")
        Stock.objects.create(branch=branch, product=self.product, quantity=4)
        self.business.storefront_branch = branch
        self.business.save()
        self.client.force_authenticate(None)
        catalog = self.client.get("/api/v1/shop/one/").data
        self.assertEqual(catalog["products"][0]["available"], 4)
        order = place_order(self.business, self.order_data())
        self.assertEqual(order.branch, branch)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.reserved, 0)

    def test_owner_cannot_select_foreign_branch_and_cashier_cannot_change_settings(self):
        response = self.client.patch(self.base, {"storefront_branch": self.branch2.pk}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "validation_error")
        self.m.role = "cashier"
        self.m.save()
        self.assertEqual(self.client.patch(self.base, {"storefront_branch": self.branch.pk}, format="json").status_code, 403)

    def test_directory_pagination_and_bounded_previews(self):
        for i in range(26):
            business = Business.objects.create(published=True, name=f"Store {i:02}", slug=f"s{i}")
            Branch.objects.create(business=business)
            Product.objects.create(business=business, name="Bread", sku="b", price=1, cost=1, published=True)
        self.client.force_authenticate(None)
        first = self.client.get("/api/v1/shops/").data
        second = self.client.get("/api/v1/shops/?page=2").data
        self.assertEqual(len(first["shops"]), 24)
        self.assertEqual(first["next_page"], 2)
        self.assertEqual(len(second["shops"]), 4)
        self.assertIsNone(second["next_page"])
        self.assertFalse({s["slug"] for s in first["shops"]} & {s["slug"] for s in second["shops"]})
        for shop in first["shops"]:
            self.assertLessEqual(len(shop["preview_products"]), 4)
            self.assertNotIn("cost", shop["preview_products"][0])
            self.assertIn("available", shop["preview_products"][0])

    def test_search_does_not_match_private_products_in_an_otherwise_public_shop(self):
        Product.objects.create(business=self.business, name="Unpublished-secret", sku="hidden", price=1, cost=1, published=False)
        self.client.force_authenticate(None)
        response = self.client.get("/api/v1/shops/?q=Unpublished-secret")
        self.assertEqual(response.data["shops"], [])
        self.assertEqual(response.data["count"], 0)

    def test_changed_retry_does_not_create_another_order(self):
        data = self.order_data()
        place_order(self.business, data)
        with self.assertRaises(ValidationError):
            place_order(self.business, {**data, "name": "Changed"})
        self.assertEqual(Order.objects.count(), 1)

    def test_fulfilment_retry_makes_one_sale(self):
        order = place_order(self.business, self.order_data())
        for state in ["accepted", "preparing", "ready", "completed", "completed"]:
            transition_order(self.m, order.pk, {"status": state, "method": "cash"})
        self.assertEqual(Sale.objects.count(), 1)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 8)
        self.assertEqual(self.stock.reserved, 0)


class MixedCheckoutConcurrencyTests(Fixture, TransactionTestCase):
    @skipUnlessDBFeature("has_select_for_update")
    def test_pos_and_guest_compete_for_the_same_stock(self):
        self.stock.quantity = 3
        self.stock.save()
        def buy(channel):
            close_old_connections()
            try:
                if channel == "pos":
                    checkout(Membership.objects.get(pk=self.m.pk), self.sale_data())
                else:
                    place_order(Business.objects.get(pk=self.business.pk), self.order_data())
                return True
            except ValidationError:
                return False
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(buy, ["pos", "guest"]))
        self.assertEqual(sorted(outcomes), [False, True])
        self.stock.refresh_from_db()
        self.assertGreaterEqual(self.stock.quantity - self.stock.reserved, 0)
