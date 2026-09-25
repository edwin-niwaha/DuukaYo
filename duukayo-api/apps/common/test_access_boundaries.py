"""Accounts can shop everywhere; business authority is local to a membership."""
import uuid

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.businesses.models import Branch, Membership
from apps.catalog.models import Product
from apps.common.services import checkout, place_order
from apps.common.tests import Fixture
from apps.inventory.models import Stock


class AccessBoundaryTests(Fixture, TestCase):
    def add_existing(self, **changes):
        return self.client.post(self.base + "staff/", {
            "username": self.other.username, "existing_account": True,
            "role": "cashier", "branch": self.branch.pk, **changes,
        }, format="json")

    def test_existing_owner_can_be_staff_elsewhere_without_account_changes(self):
        password = self.other.password
        self.assertEqual(self.add_existing().status_code, 201)
        self.other.refresh_from_db()
        self.assertEqual(self.other.password, password)
        self.assertEqual(Membership.objects.get(user=self.other, business=self.b2).role, "owner")
        self.client.force_authenticate(self.other)
        self.assertEqual(len(self.client.get("/api/v1/auth/me/").data["memberships"]), 2)
        self.assertEqual(self.client.patch(self.base, {"name": "Not mine"}).status_code, 403)
        self.assertEqual(self.client.patch(f"/api/v1/businesses/{self.b2.pk}/", {"name": "My shop"}).status_code, 200)

    def test_customer_account_can_receive_staff_membership(self):
        customer = get_user_model().objects.create_user("buyer", password="customer-password")
        self.assertEqual(self.add_existing(username=customer.username).status_code, 201)
        self.assertEqual(Membership.objects.get(user=customer).business, self.business)

    def test_staff_attachment_rejects_foreign_branch_password_and_duplicate(self):
        self.assertEqual(self.add_existing(branch=self.branch2.pk).status_code, 404)
        self.assertEqual(self.add_existing(password="overwrite-password").status_code, 400)
        self.assertEqual(self.add_existing(email="overwrite@example.com").status_code, 400)
        self.assertEqual(self.add_existing().status_code, 201)
        self.assertEqual(self.add_existing(role="manager").status_code, 400)
        self.assertEqual(Membership.objects.get(user=self.other, business=self.business).role, "cashier")

    def test_staff_access_can_be_removed_without_removing_shopping_or_other_shop(self):
        staff_id = self.add_existing().data["id"]
        self.assertEqual(self.client.patch(self.base + f"staff/{staff_id}/", {"active": False}, format="json").status_code, 200)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.base + "sales/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/businesses/{self.b2.pk}/").status_code, 200)
        self.assertEqual(self.client.post("/api/v1/shop/one/", self.order_data(), format="json").status_code, 201)

    def test_foreign_owner_cannot_change_details_add_or_delete_products(self):
        self.client.force_authenticate(self.other)
        for method, path, data in [
            ("patch", self.base, {"name": "Hijacked", "published": False}),
            ("post", self.base + "products/", {"name": "Injected", "sku": "injected", "price": 1, "cost": 1}),
            ("patch", self.base + f"products/{self.product.pk}/", {"price": 1}),
            ("delete", self.base + f"products/{self.product.pk}/", {}),
            ("post", self.base + "branches/", {"name": "Injected"}),
        ]:
            with self.subTest(method=method, path=path):
                self.assertEqual(getattr(self.client, method)(path, data, format="json").status_code, 404)
        self.business.refresh_from_db()
        self.assertEqual(self.business.name, "One")
        self.assertTrue(Product.objects.filter(pk=self.product.pk).exists())

    def test_each_owner_can_edit_details_and_add_edit_delete_own_unused_product(self):
        for user, business in [(self.user, self.business), (self.other, self.b2)]:
            with self.subTest(user=user.username):
                self.client.force_authenticate(user)
                base = f"/api/v1/businesses/{business.pk}/"
                self.assertEqual(self.client.patch(base, {"name": "Updated", "contact": "0700000000", "description": "My shop"}, format="json").status_code, 200)
                product = self.client.post(base + "products/", {"name": "New", "sku": "new", "price": 100, "cost": 50}, format="json")
                self.assertEqual(product.status_code, 201)
                path = base + f"products/{product.data['id']}/"
                self.assertEqual(self.client.patch(path, {"name": "Edited"}, format="json").status_code, 200)
                self.assertEqual(self.client.delete(path).status_code, 204)

    def test_branch_staff_cannot_read_other_branch_receipts_or_manage_orders(self):
        sale = checkout(self.m, self.sale_data())
        order = place_order(self.business, self.order_data())
        branch = Branch.objects.create(business=self.business, name="Second")
        self.m.branch = branch
        self.m.role = "manager"
        self.m.save()
        self.assertEqual(self.client.get(self.base + "sales/").data, [])
        self.assertEqual(self.client.get(self.base + "orders/").data, [])
        self.assertEqual(self.client.get(self.base + f"sales/{sale.pk}/").status_code, 404)
        self.assertEqual(self.client.post(self.base + f"orders/{order.pk}/", {"status": "accepted"}, format="json").status_code, 404)
        self.assertEqual(self.client.post(self.base + "sales/", self.sale_data(branch=self.branch.pk), format="json").status_code, 400)

    def test_invalid_membership_branch_cannot_access_business(self):
        # Simulate a legacy corrupt row; normal saves now reject this assignment.
        type(self.m).objects.filter(pk=self.m.pk).update(branch=self.branch2)
        self.assertEqual(self.client.get(self.base + "products/").status_code, 403)

    def test_owner_cannot_reassign_staff_to_another_business_branch(self):
        staff_id = self.add_existing().data["id"]
        self.assertEqual(self.client.patch(self.base + f"staff/{staff_id}/", {"branch": self.branch2.pk}, format="json").status_code, 404)

    def test_staff_can_buy_from_multiple_shops_without_receiving_business_access(self):
        self.p2.published = True
        self.p2.save()
        Stock.objects.create(branch=self.branch2, product=self.p2, quantity=10)
        self.m.role = "cashier"
        self.m.save()
        cart = self.client.post("/api/v1/carts/", {}, format="json").data
        url = f"/api/v1/carts/{cart['id']}/"
        self.assertEqual(self.client.put(url, {"lines": [{"product": self.product.pk, "quantity": 1}, {"product": self.p2.pk, "quantity": 1}]}, format="json").status_code, 200)
        quote = self.client.post(url + "quotes/", {"name": "Buyer", "phone": "+256700000000"}, format="json")
        self.assertEqual(quote.status_code, 201)
        result = self.client.post(url + "checkout/", {"quote": quote.data["id"], "client_id": str(uuid.uuid4())}, format="json")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(len(result.data["orders"]), 2)
        self.assertEqual(len(self.client.get("/api/v1/my/orders/").data), 1)
        self.assertEqual(self.client.get(f"/api/v1/businesses/{self.b2.pk}/sales/").status_code, 404)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.get("/api/v1/my/orders/").data, [])

    def test_all_published_shops_are_visible_even_without_visible_products(self):
        for user in [None, self.user, self.other]:
            self.client.force_authenticate(user)
            shops = self.client.get("/api/v1/shops/").data["shops"]
            self.assertEqual({shop["slug"] for shop in shops}, {"one", "two"})
            empty = next(shop for shop in shops if shop["slug"] == "two")
            self.assertEqual(empty["preview_products"], [])
            self.assertEqual(self.client.get("/api/v1/shops/?q=Secret").data["shops"], [])
        self.b2.published = False
        self.b2.save()
        self.assertEqual([shop["slug"] for shop in self.client.get("/api/v1/shops/").data["shops"]], ["one"])
