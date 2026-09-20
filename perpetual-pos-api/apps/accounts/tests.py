from unittest.mock import patch

from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from google.auth.exceptions import TransportError
from rest_framework.test import APIClient

from apps.accounts.models import GoogleIdentity
from apps.businesses.models import Membership


@override_settings(
    GOOGLE_CLIENT_IDS=["trusted-client"],
    REST_FRAMEWORK={
        "DEFAULT_THROTTLE_CLASSES": [],
        "DEFAULT_AUTHENTICATION_CLASSES": [
            "rest_framework.authentication.SessionAuthentication",
            "rest_framework_simplejwt.authentication.JWTAuthentication",
        ],
        "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    },
)
class GoogleLoginTests(TestCase):
    def setUp(self):
        from django.core.cache import cache

        cache.clear()
        self.client = APIClient()
        self.claims = {
            "sub": "google-subject",
            "email": "owner@gmail.com",
            "email_verified": True,
            "aud": "trusted-client",
        }
        self.verifier = patch(
            "apps.accounts.google.id_token.verify_oauth2_token",
            return_value=self.claims,
        ).start()
        self.addCleanup(patch.stopall)

    def post(self, path="/api/v1/auth/google/", **kwargs):
        return self.client.post(
            path, {"id_token": "signed-token"}, format="json", **kwargs
        )

    def test_tokens_identify_user_and_do_not_grant_membership(self):
        response = self.post()
        self.assertEqual(response.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + response.data["access"])
        profile = self.client.get("/api/v1/auth/me/")
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.data["memberships"], [])
        self.assertFalse(GoogleIdentity.objects.get().user.has_usable_password())
        self.assertIn("refresh", response.data)

    def test_gmail_matches_existing_account_case_insensitively(self):
        user = get_user_model().objects.create_user(
            "owner", email="Owner@Gmail.com", password="old-password"
        )
        self.assertEqual(self.post().status_code, 200)
        self.assertEqual(GoogleIdentity.objects.get().user_id, user.pk)
        self.claims["email"] = "changed@gmail.com"
        self.assertEqual(self.post().status_code, 200)
        self.assertEqual(get_user_model().objects.count(), 1)

    def test_rejects_invalid_claims(self):
        for key, value in [
            ("aud", "foreign-client"),
            ("email_verified", False),
            ("email_verified", "false"),
            ("sub", ""),
            ("email", ""),
        ]:
            with self.subTest(key=key, value=value):
                claims = {**self.claims, key: value}
                self.verifier.return_value = claims
                self.assertIn(self.post().status_code, [401, 403])
        self.assertFalse(GoogleIdentity.objects.exists())

    def test_rejects_invalid_signature_or_expired_token(self):
        self.verifier.side_effect = ValueError("expired")
        self.assertIn(self.post().status_code, [401, 403])

    def test_provider_outage(self):
        self.verifier.side_effect = TransportError("timeout")
        self.assertEqual(self.post().status_code, 503)

    @override_settings(GOOGLE_CLIENT_IDS=[])
    def test_disabled_when_unconfigured(self):
        self.assertEqual(self.post().status_code, 503)
        self.verifier.assert_not_called()

    def test_rejects_inactive_and_duplicate_email(self):
        user = get_user_model().objects.create_user(
            "owner", email="owner@gmail.com", is_active=False
        )
        self.assertIn(self.post().status_code, [401, 403])
        user.is_active = True
        user.save()
        get_user_model().objects.create_user("duplicate", email="OWNER@gmail.com")
        self.assertIn(self.post().status_code, [401, 403])
        self.assertFalse(GoogleIdentity.objects.exists())

    def test_inactive_linked_identity_rejected(self):
        self.post()
        user = GoogleIdentity.objects.get().user
        user.is_active = False
        user.save()
        self.assertIn(self.post().status_code, [401, 403])

    def test_external_email_cannot_take_over_existing_account(self):
        self.claims["email"] = "owner@example.com"
        get_user_model().objects.create_user("owner", email="owner@example.com")
        self.assertIn(self.post().status_code, [401, 403])

    def test_missing_token(self):
        self.assertEqual(
            self.client.post("/api/v1/auth/google/", {}, format="json").status_code, 400
        )

    def test_browser_requires_csrf_and_sets_session_without_jwt(self):
        self.client = APIClient(enforce_csrf_checks=True)
        self.assertEqual(self.post("/api/v1/auth/google/session/").status_code, 403)
        csrf = self.client.get("/api/v1/auth/session/").data["csrfToken"]
        response = self.post("/api/v1/auth/google/session/", HTTP_X_CSRFTOKEN=csrf)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("access", response.data)
        self.assertTrue(response.cookies["sessionid"]["httponly"])
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 200)

    def test_business_onboarding_requires_auth_and_creates_owner(self):
        data = {"name": "Google Shop", "slug": "google-shop"}
        self.assertIn(
            self.client.post("/api/v1/businesses/", data).status_code, [401, 403]
        )
        token = self.post().data["access"]
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + token)
        self.assertEqual(self.client.post("/api/v1/businesses/", data).status_code, 201)
        membership = Membership.objects.get()
        self.assertEqual(membership.role, "owner")
        self.assertEqual(membership.branch.business_id, membership.business_id)
        self.assertEqual(self.client.post("/api/v1/businesses/", data).status_code, 400)
        self.assertEqual(Membership.objects.count(), 1)

    def test_existing_app_labels_and_tables_are_preserved(self):
        self.assertEqual(apps.get_app_config("orders").name, "apps.orders")
        self.assertEqual(
            apps.get_model("businesses", "Business")._meta.db_table,
            "businesses_business",
        )
