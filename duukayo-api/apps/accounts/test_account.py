from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class AccountTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user("account-owner", email="owner@example.com", password="Original!Pass2026")
        self.client = APIClient()
        self.refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + str(self.refresh.access_token))
        self.guest = APIClient()

    def request_code(self, email="owner@example.com"):
        return self.guest.post("/api/v1/auth/password/recovery/", {"email": email}, format="json")

    def code(self):
        self.request_code()
        return mail.outbox[-1].body.split("\n\n")[1]

    def reset(self, code):
        return self.guest.post("/api/v1/auth/password/reset/", {"code": code, "new_password": "Different!Pass2026", "confirm_password": "Different!Pass2026"}, format="json")

    def test_profile_saved_without_privilege_or_identity_changes(self):
        r = self.client.post("/api/v1/auth/profile/", {"first_name": "Drake", "last_name": "K", "is_staff": True, "email": "attacker@example.com", "username": "admin"}, format="json")
        self.assertEqual(r.status_code, 200)
        me = self.client.get("/api/v1/auth/me/").data
        self.assertEqual(me["first_name"], "Drake")
        self.assertEqual(me["email"], "owner@example.com")
        self.assertEqual(me["username"], "account-owner")
        self.assertTrue(me["has_password"])
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_staff)
        self.assertIn(self.guest.post("/api/v1/auth/profile/", {"first_name": "X", "last_name": "Y"}).status_code, [401, 403])

    def test_change_password_revokes_access_and_refresh_tokens(self):
        r = self.client.post("/api/v1/auth/password/change/", {"current_password": "Original!Pass2026", "new_password": "Different!Pass2026", "confirm_password": "Different!Pass2026"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertIn(self.client.get("/api/v1/auth/me/").status_code, [401, 403])
        self.assertEqual(self.guest.post("/api/v1/auth/refresh/", {"refresh": str(self.refresh)}).status_code, 401)
        self.assertEqual(self.guest.post("/api/v1/auth/token/", {"username": self.user.username, "password": "Different!Pass2026"}).status_code, 200)

    def test_change_rejects_wrong_current_mismatch_and_weak_password(self):
        for current, new, confirm in [("wrong", "Different!Pass2026", "Different!Pass2026"), ("Original!Pass2026", "Different!Pass2026", "mismatch"), ("Original!Pass2026", "123", "123")]:
            r = self.client.post("/api/v1/auth/password/change/", {"current_password": current, "new_password": new, "confirm_password": confirm}, format="json")
            self.assertEqual(r.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Original!Pass2026"))

    def test_recovery_is_generic_and_case_insensitive(self):
        found = self.request_code("OWNER@example.com")
        missing = self.request_code("missing@example.com")
        self.assertEqual(found.status_code, 200)
        self.assertEqual(found.data, missing.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertNotIn("code", found.data)

    def test_recovery_code_is_single_use_and_revokes_sessions(self):
        code = self.code()
        self.assertEqual(self.reset(code).status_code, 200)
        self.assertEqual(self.reset(code).status_code, 400)
        self.assertIn(self.client.get("/api/v1/auth/me/").status_code, [401, 403])
        self.assertEqual(self.guest.post("/api/v1/auth/refresh/", {"refresh": str(self.refresh)}).status_code, 401)

    def test_recovery_rejects_expired_or_malformed_code(self):
        code = self.code()
        with patch.object(default_token_generator, "_now", return_value=default_token_generator._now() + timedelta(hours=2)):
            self.assertEqual(self.reset(code).status_code, 400)
        for code in ["broken", "invalid.token", "MQ.invalid", "!.invalid"]:
            self.assertEqual(self.reset(code).status_code, 400)

    def test_recovery_does_not_choose_duplicate_or_inactive_email(self):
        get_user_model().objects.create_user("duplicate", email="OWNER@example.com")
        self.request_code()
        self.assertEqual(len(mail.outbox), 0)
        self.user.is_active = False
        self.user.email = "inactive@example.com"
        self.user.save()
        self.request_code("inactive@example.com")
        self.assertEqual(len(mail.outbox), 0)

    def test_google_only_account_can_set_password_via_email(self):
        self.user.set_unusable_password()
        self.user.save()
        self.assertEqual(self.reset(self.code()).status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Different!Pass2026"))

    def test_recovery_throttles_even_unknown_email(self):
        for _ in range(3):
            self.assertEqual(self.request_code("unknown@example.com").status_code, 200)
        self.assertEqual(self.request_code("unknown@example.com").status_code, 429)

    def test_mail_failure_keeps_generic_response(self):
        with patch("api.v1.views.account.send_mail", side_effect=RuntimeError("smtp unavailable")):
            failed = self.request_code()
        self.assertEqual(failed.data, self.request_code("missing@example.com").data)

    def test_password_change_invalidates_browser_session(self):
        browser = APIClient()
        browser.force_login(self.user)
        self.assertEqual(self.reset(self.code()).status_code, 200)
        self.assertIn(browser.get("/api/v1/auth/me/").status_code, [401, 403])

    def test_refresh_still_works_before_password_change(self):
        r = self.guest.post("/api/v1/auth/refresh/", {"refresh": str(self.refresh)})
        self.assertEqual(r.status_code, 200)
        self.assertIn("access", r.data)
