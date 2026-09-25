from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.businesses.admin import MembershipForm
from apps.businesses.models import Branch, Business
from apps.catalog.admin import ProductForm
from apps.catalog.models import Category


class AdminTests(TestCase):
    def test_admin_login_and_superuser_access(self):
        self.assertEqual(self.client.get("/admin/").status_code, 302)
        self.assertEqual(self.client.get("/admin/login/").status_code, 200)
        user = get_user_model().objects.create_superuser("administrator", password="test-password-123")
        self.client.force_login(user)
        response = self.client.get("/admin/")
        self.assertContains(response, "Businesses")
        self.assertContains(response, "Products")
        self.assertEqual(self.client.get("/admin/businesses/membership/add/").status_code, 200)
        profile = self.client.get("/api/v1/auth/me/").json()
        self.assertTrue(profile["is_staff"])
        self.assertEqual(profile["memberships"], [])
        self.assertEqual(profile["admin_url"], "http://testserver/admin/")

    def test_shop_owner_is_not_automatically_a_platform_admin(self):
        user = get_user_model().objects.create_user("owner", password="test-password-123")
        self.client.force_login(user)
        self.assertEqual(self.client.get("/admin/").status_code, 302)
        profile = self.client.get("/api/v1/auth/me/").json()
        self.assertFalse(profile["is_staff"])
        self.assertIsNone(profile["admin_url"])

    def test_admin_membership_form_rejects_foreign_branch(self):
        user = get_user_model().objects.create_user("staff")
        shop = Business.objects.create(name="One", slug="one")
        other = Business.objects.create(name="Two", slug="two")
        branch = Branch.objects.create(business=other)
        form = MembershipForm(data={"user": user.pk, "business": shop.pk, "branch": branch.pk, "role": "cashier", "active": True})
        self.assertFalse(form.is_valid())
        self.assertIn("branch", form.errors)

    def test_admin_product_form_rejects_foreign_category(self):
        shop = Business.objects.create(name="One", slug="one")
        other = Business.objects.create(name="Two", slug="two")
        category = Category.objects.create(business=other, name="Other")
        form = ProductForm(data={"business": shop.pk, "category": category.pk, "name": "Product", "sku": "p", "price": 100, "cost": 50, "active": True, "low_stock_threshold": 5})
        self.assertFalse(form.is_valid())
        self.assertIn("category", form.errors)
