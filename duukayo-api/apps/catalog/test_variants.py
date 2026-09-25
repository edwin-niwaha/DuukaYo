from django.test import TestCase

from apps.catalog.models import Product
from apps.common.services import place_order, transition_order
from apps.common.tests import Fixture
from apps.inventory.models import Stock
from apps.orders.models import OrderLine


class VariantCatalogTests(Fixture, TestCase):
    def row(self, sku="volume-50", volume="50 ml"):
        return {"name": "Perfume", "sku": sku, "price": 40000, "cost": 25000,
                "published": True, "variant_group": "perfume", "attributes": {"Volume": volume}}

    def batch(self, rows):
        return self.client.post(self.base + "products/variant-set/", {"products": rows}, format="json")

    def test_variants_are_independent_and_public_without_cost(self):
        response = self.batch([self.row(), self.row("volume-100", "100 ml")])
        self.assertEqual(response.status_code, 200, response.data)
        ids = [p["id"] for p in response.data["products"]]
        for identifier, quantity in zip(ids, [5, 0]):
            Stock.objects.create(branch=self.branch, product_id=identifier, quantity=quantity)
        catalog = self.client.get("/api/v1/shop/one/").data
        variants = [p for p in catalog["products"] if p["id"] in ids]
        self.assertEqual(sorted(p["available"] for p in variants), [0, 5])
        self.assertTrue(all(p["variant_group"] == "perfume" for p in variants))
        self.assertTrue(all("cost" not in p for p in variants))

    def test_duplicate_combinations_roll_back_whole_set(self):
        response = self.batch([self.row(), self.row("other-sku", " 50 ML ")])
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Product.objects.filter(variant_group="perfume").exists())

    def test_bad_later_row_rolls_back_updates(self):
        response = self.batch([{"id": self.product.id, "price": 3000}, self.row("bad", "")])
        self.assertEqual(response.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.price, 2500)

    def test_group_is_shop_scoped_and_update_checks_duplicate_options(self):
        created = self.batch([self.row(), self.row("volume-100", "100 ml")]).data["products"]
        response = self.client.patch(self.base + f"products/{created[1]['id']}/", {"attributes": {"Volume": "50 ml"}}, format="json")
        self.assertEqual(response.status_code, 400)
        self.client.force_authenticate(self.other)
        response = self.client.post(f"/api/v1/businesses/{self.b2.pk}/products/", self.row(), format="json")
        self.assertEqual(response.status_code, 201)

    def test_protected_and_unused_product_deletion(self):
        created = self.batch([self.row()]).data["products"][0]
        self.assertEqual(self.client.delete(self.base + f"products/{created['id']}/").status_code, 204)
        self.assertEqual(self.client.delete(self.base + f"products/{self.product.id}/").status_code, 400)
        self.assertTrue(Product.objects.filter(pk=self.product.id).exists())

    def test_foreign_ids_and_cashier_cannot_mutate_variants(self):
        self.assertEqual(self.batch([{"id": self.p2.id, "price": 5}]).status_code, 404)
        self.m.role = "cashier"
        self.m.save()
        self.assertEqual(self.batch([self.row()]).status_code, 403)
        self.assertEqual(self.client.delete(self.base + f"products/{self.product.id}/").status_code, 403)

    def test_option_names_must_be_consistent_and_nonempty(self):
        self.assertEqual(self.batch([self.row(), {**self.row("x"), "attributes": {"Size": "L"}}]).status_code, 400)
        self.assertEqual(self.batch([{**self.row(), "attributes": {"": "50 ml"}}]).status_code, 400)
        self.assertEqual(self.batch([{**self.row(), "attributes": {"Size": "M", " size ": "L"}}]).status_code, 400)

    def test_order_and_sale_keep_selected_variant_after_catalog_changes(self):
        self.product.variant_group = "milk"
        self.product.attributes = {"Volume": "1 litre"}
        self.product.save()
        order = place_order(self.business, self.order_data())
        expected = "Milk — Volume: 1 litre"
        self.assertEqual(order.lines[0]["name"], expected)
        self.assertEqual(OrderLine.objects.get(order=order).name, expected)
        self.product.attributes = {"Volume": "2 litres"}
        self.product.name = "Renamed"
        self.product.save()
        for state in ["accepted", "preparing", "ready", "completed"]:
            order = transition_order(self.m, order.pk, {"status": state, "method": "cash"})
        self.assertEqual(order.sale.lines.get().name, expected)

    def test_archive_hides_showcase_previews(self):
        self.product.showcase = True
        self.product.save()
        response = self.client.patch(self.base + f"products/{self.product.id}/", {"active": False}, format="json")
        self.assertEqual(response.status_code, 200)
        self.product.refresh_from_db()
        self.assertFalse(self.product.showcase)
        self.assertFalse(self.product.published)
        self.assertEqual(self.client.get("/api/v1/shop/one/").data["products"], [])

    def test_invalid_ids_are_validation_errors(self):
        for value in ["not-an-id", [], True]:
            response = self.batch([{"id": value, "name": "Invalid"}])
            self.assertEqual(response.status_code, 400)

from concurrent.futures import ThreadPoolExecutor

from django.db import close_old_connections
from django.test import TransactionTestCase, skipUnlessDBFeature
from rest_framework.test import APIClient


class VariantConcurrencyTests(Fixture, TransactionTestCase):
    @skipUnlessDBFeature("has_select_for_update")
    def test_concurrent_duplicate_combinations_are_serialized(self):
        def save(sku):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(self.user)
                return client.post(self.base + "products/variant-set/", {"products": [{
                    "name": "Shirt", "sku": sku, "price": 100, "cost": 50,
                    "variant_group": "shirt", "attributes": {"Size": "M"}
                }]}, format="json").status_code
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(save, ["shirt-one", "shirt-two"]))
        self.assertEqual(sorted(results), [200, 400])
        self.assertEqual(Product.objects.filter(variant_group="shirt").count(), 1)
