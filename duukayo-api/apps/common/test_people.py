from io import BytesIO
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image

from apps.accounts.models import UserProfile
from apps.businesses.models import Membership
from apps.common.models import Audit
from apps.common.tests import Fixture


class PeopleTests(Fixture, TestCase):
    def setUp(self):
        super().setUp()
        self.admin = get_user_model().objects.create_superuser("people-admin", password="strong-password-123")
        self.client.force_authenticate(self.admin)
        self.url = "/api/v1/platform/users/"

    def payload(self):
        return {"username": "new-person", "password": "different-long-password-934",
                "first_name": "Amina", "last_name": "Nabirye", "email": "amina@example.com",
                "phone": "+256 700 111222", "job_title": "Supervisor", "location": "Kampala",
                "photo": "https://example.com/avatar.png",
                "shop_access": [{"business": self.business.pk, "branch": self.branch.pk, "role": "manager"}]}

    def test_update_registered_user_profile_and_roles_atomically_and_search(self):
        user = get_user_model().objects.create_user("new-person", email="amina@example.com", password="different-long-password-934")
        data = self.payload()
        for key in ("username", "password", "email"):
            data.pop(key)
        result = self.client.patch(self.url + str(user.pk) + "/", data, format="json")
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data["phone"], "+256 700 111222")
        user = get_user_model().objects.get(pk=result.data["id"])
        self.assertEqual(user.profile.location, "Kampala")
        self.assertEqual(user.membership_set.get().role, "manager")
        self.assertEqual(self.client.get(self.url, {"q": "Amina"}).data["count"], 1)
        response = self.client.patch(self.url + str(user.pk) + "/", {"phone": "", "photo": "", "shop_access": [{"business": self.business.pk, "branch": self.branch.pk, "role": "cashier"}]}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["photo"], "")
        self.assertEqual(user.membership_set.get().role, "cashier")

    def test_foreign_branch_rolls_back_profile_and_role_changes(self):
        user = get_user_model().objects.create_user("registered-user")
        data = {"first_name": "Changed", "shop_access": [{"business": self.business.pk, "branch": self.branch2.pk, "role": "cashier"}]}
        self.assertEqual(self.client.patch(self.url + str(user.pk) + "/", data, format="json").status_code, 404)
        user.refresh_from_db()
        self.assertEqual(user.first_name, "")
        self.assertFalse(user.membership_set.exists())

    def test_admin_cannot_create_accounts_or_replace_signin_identity(self):
        self.assertEqual(self.client.post(self.url, self.payload(), format="json").status_code, 405)
        for data in ({"password": "different-long-password-934"}, {"email": "other@example.com"}, {"username": "changed"}):
            with self.subTest(data=data):
                self.assertEqual(self.client.patch(self.url + str(self.other.pk) + "/", data, format="json").status_code, 400)
        self.other.refresh_from_db()
        self.assertTrue(self.other.check_password("strong-password-123"))

    def test_delete_account_revokes_signin_and_access_preserves_audit(self):
        user = get_user_model().objects.create_user("cashier-person", password="long-test-password-123")
        m = Membership.objects.create(user=user, business=self.business, branch=self.branch, role="cashier")
        path = self.url + str(user.pk) + "/"
        self.assertEqual(self.client.delete(path, {"confirm_username": "wrong"}, format="json").status_code, 400)
        for _ in range(2):
            self.assertEqual(self.client.delete(path, {"confirm_username": user.username}, format="json").status_code, 204)
        user.refresh_from_db(); m.refresh_from_db()
        self.assertFalse(user.is_active)
        self.assertFalse(m.active)
        self.assertIsNotNone(UserProfile.objects.get(user=user).deleted_at)
        self.assertEqual(Audit.objects.filter(action="platform.user.deleted").count(), 1)
        self.assertEqual(self.client.get(self.url, {"q": user.username}).data["count"], 0)
        self.assertEqual(self.client.patch(path, {"is_active": True}, format="json").status_code, 404)
        self.assertFalse(self.client.login(username=user.username, password="long-test-password-123"))

    def test_last_owner_and_own_admin_account_protected(self):
        path = self.url + str(self.user.pk) + "/"
        self.assertEqual(self.client.delete(path, {"confirm_username": self.user.username}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(path, {"is_active": False}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(path, {"shop_access": [{"business": self.business.pk, "branch": self.branch.pk, "role": "cashier"}]}, format="json").status_code, 400)
        self.assertEqual(self.client.delete(self.url + str(self.admin.pk) + "/", {"confirm_username": self.admin.username}, format="json").status_code, 400)

    def test_delete_shop_access_is_scoped_and_preserves_other_roles(self):
        m = Membership.objects.create(user=self.user, business=self.b2, branch=self.branch2, role="cashier")
        base = f"/api/v1/platform/shops/{self.business.pk}/access/"
        self.assertEqual(self.client.delete(base + str(m.pk) + "/").status_code, 404)
        self.assertEqual(self.client.delete(base + str(self.m.pk) + "/").status_code, 400)
        self.assertEqual(self.client.delete(f"/api/v1/platform/shops/{self.b2.pk}/access/{m.pk}/").status_code, 204)
        self.assertTrue(Membership.objects.filter(pk=self.m.pk).exists())

    def test_photo_upload_validates_image_and_requires_platform_authority(self):
        path = self.url + "photos/"
        output = BytesIO(); Image.new("RGB", (64, 64), "green").save(output, format="PNG")
        with TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory):
            response = self.client.post(path, {"image": SimpleUploadedFile("face.png", output.getvalue(), content_type="image/png")}, format="multipart")
            self.assertEqual(response.status_code, 201, response.data)
            self.assertIn("/profiles/", response.data["url"])
            self.assertEqual(self.client.post(path, {"image": SimpleUploadedFile("bad.png", b"not an image")}, format="multipart").status_code, 400)
            self.client.force_authenticate(self.user)
            self.assertEqual(self.client.post(path, {}, format="multipart").status_code, 403)
