from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.businesses.models import Business, Membership


class RegistrationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient(enforce_csrf_checks=True)
        self.data = {"username": "new-buyer", "email": "buyer@example.com", "password": "My-private-passphrase-743", "confirm_password": "My-private-passphrase-743"}

    def test_public_signup_creates_only_an_ordinary_account(self):
        response = self.client.post("/api/v1/auth/accounts/", self.data, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        user = get_user_model().objects.get(username="new-buyer")
        self.assertTrue(user.check_password(self.data["password"]))
        self.assertFalse(user.is_staff or user.is_superuser)
        self.assertFalse(user.user_permissions.exists())
        self.assertFalse(Membership.objects.exists())
        self.assertFalse(Business.objects.exists())
        self.assertNotIn("sessionid", response.cookies)
        self.assertNotIn(self.data["password"], str(response.data))

    def test_signup_cannot_request_privileged_access(self):
        for extra in ({"is_staff": True}, {"platform_admin": True}, {"role": "owner"}, {"shop_access": []}):
            with self.subTest(extra=extra):
                self.assertEqual(self.client.post("/api/v1/auth/accounts/", {**self.data, **extra}, format="json").status_code, 400)
        self.assertFalse(get_user_model().objects.exists())

    def test_confirmation_and_password_policy_are_enforced(self):
        for changes in ({"confirm_password": "wrong"}, {"password": "abc", "confirm_password": "abc"}, {"email": "not-email"}):
            self.assertEqual(self.client.post("/api/v1/auth/accounts/", {**self.data, **changes}, format="json").status_code, 400)
        self.assertFalse(get_user_model().objects.exists())

    def test_duplicate_identity_returns_generic_error_without_replacing_credentials(self):
        get_user_model().objects.create_user("new-buyer", email="buyer@example.com", password="Original-secret-978")
        response = self.client.post("/api/v1/auth/accounts/", self.data, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unable to register", str(response.data))
        self.assertTrue(get_user_model().objects.get().check_password("Original-secret-978"))

    def test_owner_assigns_existing_account_without_setting_credentials(self):
        owner = get_user_model().objects.create_user("owner")
        from apps.businesses.models import Branch
        shop = Business.objects.create(name="Shop", slug="shop")
        branch = Branch.objects.create(business=shop)
        Membership.objects.create(user=owner, business=shop, branch=branch, role="owner")
        self.client.force_authenticate(owner)
        path = f"/api/v1/businesses/{shop.pk}/staff/"
        self.assertEqual(self.client.post(path, {"username": "missing", "password": "Initial-password-123", "role": "cashier"}, format="json").status_code, 400)
        self.assertFalse(get_user_model().objects.filter(username="missing").exists())
        self.assertEqual(self.client.post("/api/v1/auth/accounts/", self.data, format="json").status_code, 201)
        self.assertEqual(self.client.post(path, {"username": "new-buyer", "role": "cashier"}, format="json").status_code, 201)
