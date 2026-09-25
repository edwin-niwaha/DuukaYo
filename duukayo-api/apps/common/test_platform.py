import uuid

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import TestCase

from apps.businesses.models import Business, Membership
from apps.common.models import Audit
from apps.common.services import checkout, place_order
from apps.common.tests import Fixture
from apps.inventory.models import Movement
from apps.sales.models import SaleReturn


class PlatformTests(Fixture, TestCase):
    def setUp(self):
        super().setUp()
        self.admin = get_user_model().objects.create_superuser("platform-admin", password="strong-platform-password")
        self.client.force_authenticate(self.admin)
        self.shop = f"/api/v1/platform/shops/{self.business.pk}/"
        self.branch_url = self.shop + f"branches/{self.branch.pk}/"

    def test_permission_is_explicit_and_does_not_grant_tenant_membership(self):
        self.assertEqual(self.client.get(self.base).status_code, 404)
        self.assertEqual(self.client.get(self.shop).status_code, 200)
        for user in (None, self.user):
            self.client.force_authenticate(user)
            self.assertIn(self.client.get("/api/v1/platform/shops/").status_code, (401, 403))
        self.user.is_staff = True
        self.user.save()
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(self.shop).status_code, 403)
        self.user.user_permissions.add(Permission.objects.get(codename="manage_platform"))
        self.client.force_authenticate(get_user_model().objects.get(pk=self.user.pk))
        self.assertEqual(self.client.get(self.shop).status_code, 200)

    def test_admin_shop_creation_owner_assignment_and_duplicate_rollback(self):
        payload = {"name": "New", "slug": "new", "owner": self.other.username, "branch_name": "Central"}
        result = self.client.post("/api/v1/platform/shops/", payload, format="json")
        self.assertEqual(result.status_code, 201, result.data)
        m = Membership.objects.get(business_id=result.data["id"])
        self.assertEqual((m.user, m.role, m.branch.name), (self.other, "owner", "Central"))
        self.assertEqual(self.client.post("/api/v1/platform/shops/", payload, format="json").status_code, 400)
        self.assertEqual(Business.objects.filter(slug="new").count(), 1)

    def test_shop_updates_audit_and_foreign_fulfilment_rejected(self):
        response = self.client.patch(self.shop, {"name": "Updated", "description": "New description", "published": True}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Audit.objects.get(action="platform.shop.updated").actor, self.admin)
        self.assertEqual(self.client.patch(self.shop, {"storefront_branch": self.branch2.pk}, format="json").status_code, 400)

    def test_hide_and_show_preserve_staff_access(self):
        self.assertEqual(self.client.patch(self.shop, {"published": False}, format="json").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/shop/one/").status_code, 404)
        self.assertEqual(self.client.post("/api/v1/shop/one/", self.order_data(), format="json").status_code, 400)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(self.base).status_code, 200)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.patch(self.shop, {"published": True}, format="json").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/shop/one/").status_code, 200)

    def test_delete_shop_preserves_history_and_blocks_all_shop_access(self):
        sale = checkout(self.m, self.sale_data())
        payload = {"confirm_slug": self.business.slug}
        self.assertEqual(self.client.delete(self.shop, {"confirm_slug": "wrong"}, format="json").status_code, 400)
        self.assertEqual(self.client.delete(self.shop, payload, format="json").status_code, 204)
        self.assertEqual(self.client.delete(self.shop, payload, format="json").status_code, 204)
        self.business.refresh_from_db()
        self.assertIsNotNone(self.business.deleted_at)
        self.assertTrue(self.business.suspended)
        self.assertFalse(self.business.published)
        self.assertTrue(self.business.sale_set.filter(pk=sale.pk).exists())
        self.assertEqual(Audit.objects.filter(action="platform.shop.deleted").count(), 1)
        from rest_framework.exceptions import PermissionDenied
        with self.assertRaises(PermissionDenied):
            checkout(self.m, self.sale_data())
        self.assertNotIn(self.business.pk, [row["id"] for row in self.client.get("/api/v1/platform/shops/").data["results"]])
        self.assertEqual(self.client.get(self.shop).status_code, 404)
        self.assertEqual(self.client.patch(self.shop, {"published": True, "suspended": False}, format="json").status_code, 404)
        self.assertEqual(self.client.get(self.branch_url + "products/").status_code, 404)
        self.assertEqual(self.client.post(self.shop + "branches/", {"name": "Revived"}, format="json").status_code, 404)
        self.assertEqual(self.client.get("/api/v1/shop/one/").status_code, 404)
        self.assertEqual(self.client.post("/api/v1/shop/one/", self.order_data(), format="json").status_code, 403)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(self.base).status_code, 403)
        self.assertEqual(self.client.get("/api/v1/auth/me/").data["memberships"], [])
        self.assertEqual(self.client.get("/api/v1/shop/two/").status_code, 200)

    def test_delete_rejects_outstanding_orders(self):
        order = place_order(self.business, self.order_data())
        response = self.client.delete(self.shop, {"confirm_slug": "one"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.business.refresh_from_db()
        self.assertIsNone(self.business.deleted_at)
        from apps.orders.services import transition_order
        transition_order(self.m, order.pk, {"status": "cancelled"})
        self.assertEqual(self.client.delete(self.shop, {"confirm_slug": "one"}, format="json").status_code, 204)

    def test_owners_and_customers_cannot_delete_through_platform(self):
        for user in (self.user, self.other, None):
            self.client.force_authenticate(user)
            self.assertIn(self.client.delete(self.shop, {"confirm_slug": "one"}, format="json").status_code, (401, 403))

    def test_suspension_hides_shop_and_blocks_owner_access_and_checkout(self):
        response = self.client.patch(self.shop, {"suspended": True}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotIn("one", [row["slug"] for row in self.client.get("/api/v1/shops/").data["shops"]])
        self.assertEqual(self.client.get("/api/v1/shop/one/").status_code, 404)
        self.assertEqual(self.client.post("/api/v1/shop/one/", self.order_data(), format="json").status_code, 400)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(self.base).status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.patch(self.shop, {"suspended": False}, format="json").status_code, 200)

    def test_access_assignment_branch_validation_and_last_owner_guard(self):
        url = self.shop + "access/"
        payload = {"username": self.other.username, "branch": self.branch2.pk, "role": "owner"}
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 404)
        self.assertEqual(self.client.patch(url + f"{self.m.pk}/", {"active": False}, format="json").status_code, 400)
        payload["branch"] = self.branch.pk
        added = self.client.post(url, payload, format="json")
        self.assertEqual(added.status_code, 201)
        self.assertEqual(self.client.patch(url + f"{self.m.pk}/", {"role": "manager"}, format="json").status_code, 200)
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 400)

    def test_registered_users_can_be_edited_and_deactivated_without_leaking_passwords(self):
        user = get_user_model().objects.create_user("newbuyer", password="unique-strong-pass-739")
        identifier = user.pk
        result = self.client.patch(f"/api/v1/platform/users/{identifier}/", {"first_name": "Buyer", "is_active": False}, format="json")
        self.assertEqual(result.status_code, 200)
        self.assertFalse(get_user_model().objects.get(pk=identifier).is_active)
        self.assertNotIn("unique-strong-pass-739", str(list(Audit.objects.values("detail"))))
        self.assertNotIn("password", result.data)

    def test_superuser_grants_platform_role_but_delegate_cannot_escalate(self):
        result = self.client.patch(f"/api/v1/platform/users/{self.other.pk}/", {"platform_admin": True}, format="json")
        self.assertEqual(result.status_code, 200)
        self.other.refresh_from_db()
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.shop).status_code, 200)
        self.assertEqual(self.client.patch(f"/api/v1/platform/users/{self.user.pk}/", {"platform_admin": True}, format="json").status_code, 403)
        self.assertEqual(self.client.patch(f"/api/v1/platform/users/{self.admin.pk}/", {"password": "changed-password-123"}, format="json").status_code, 403)

    def test_superuser_cannot_deactivate_itself(self):
        self.assertEqual(self.client.patch(f"/api/v1/platform/users/{self.admin.pk}/", {"is_active": False}, format="json").status_code, 400)

    def test_catalog_crud_and_foreign_branch_rejection(self):
        base = self.branch_url + "products/"
        product = self.client.post(base, {"name": "Admin product", "sku": "admin", "price": 100, "cost": 50}, format="json")
        self.assertEqual(product.status_code, 201, product.data)
        path = base + f"{product.data['id']}/"
        self.assertEqual(self.client.patch(path, {"price": 120}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(path).status_code, 204)
        self.assertEqual(self.client.get(self.shop + f"branches/{self.branch2.pk}/products/").status_code, 404)
        self.assertEqual(self.client.patch(base + f"{self.p2.pk}/", {"name": "Wrong"}, format="json").status_code, 404)
        self.assertEqual(self.client.post(base + "variant-set/", {"products": [{"name": "Variant", "sku": "v", "price": 1, "cost": 1}]}, format="json").status_code, 200)

    def test_stock_command_is_idempotent_and_preserves_reservations(self):
        url = self.branch_url + "stock/adjust/"
        payload = {"client_id": str(uuid.uuid4()), "product": self.product.pk, "delta": 3, "kind": "receipt", "reason": "Supplier delivery"}
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 200)
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 200)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 13)
        self.assertEqual(Movement.objects.count(), 1)
        payload.update(client_id=str(uuid.uuid4()), delta=-50, kind="adjustment")
        self.assertEqual(self.client.post(url, payload, format="json").status_code, 400)

    def test_order_transition_and_refund_use_existing_services(self):
        order = place_order(self.business, self.order_data())
        response = self.client.post(self.branch_url + f"orders/{order.pk}/", {"status": "accepted"}, format="json")
        self.assertEqual(response.status_code, 200)
        sale = checkout(self.m, self.sale_data())
        url = self.branch_url + f"sales/{sale.pk}/returns/"
        payload = {"client_id": str(uuid.uuid4()), "reason": "Customer return", "method": "cash", "lines": [{"line": sale.lines.get().pk, "quantity": 1, "restock": True}]}
        first = self.client.post(url, payload, format="json")
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(self.client.post(url, payload, format="json").data, first.data)
        self.assertEqual(SaleReturn.objects.count(), 1)
        self.assertEqual(self.client.patch(self.branch_url + f"sales/{sale.pk}/", {"total": 1}, format="json").status_code, 404)

    def test_platform_settings_enforce_checkout_and_registration(self):
        response = self.client.patch("/api/v1/platform/settings/", {"orders_enabled": False, "shop_registration_enabled": False, "notice": "Maintenance"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/v1/public/settings/").data["notice"], "Maintenance")
        self.assertEqual(self.client.post("/api/v1/shop/one/", self.order_data(), format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/v1/businesses/", {"name": "No", "slug": "no"}, format="json").status_code, 400)

    def test_reports_separate_currencies_and_audit_is_read_only(self):
        checkout(self.m, self.sale_data())
        report = self.client.get("/api/v1/platform/reports/").data
        self.assertEqual(report["totals"][0]["sales"], 5000)
        self.assertEqual(report["totals"][0]["currency"], "UGX")
        self.assertEqual(self.client.get("/api/v1/platform/reports/?from=bad").status_code, 400)
        self.assertEqual(self.client.get("/api/v1/platform/audit/").status_code, 200)
        self.assertEqual(self.client.delete("/api/v1/platform/audit/").status_code, 405)
