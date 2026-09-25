from io import BytesIO, StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

import requests
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.exceptions import ValidationError

from apps.common.media import MediaUnavailable, upload_cloudinary, validate_image_url
from apps.common.tests import Fixture


@override_settings(MEDIA_BACKEND="cloudinary", CLOUDINARY_CLOUD_NAME="example", CLOUDINARY_API_KEY="test-key", CLOUDINARY_API_SECRET="test-secret")
class CloudinaryTests(Fixture, TestCase):
    def test_signed_upload_returns_cloudinary_url_without_leaking_secret(self):
        url = "https://res.cloudinary.com/example/image/upload/v1/duukayo/businesses/1/test.png"
        with patch("apps.common.media.requests.post", return_value=Mock(json=lambda: {"secure_url": url, "public_id": "duukayo/businesses/1/test"})) as post:
            self.assertEqual(upload_cloudinary(b"image", "duukayo/businesses/1/test"), url)
        data = post.call_args.kwargs["data"]
        self.assertEqual(len(data["signature"]), 64)
        self.assertNotIn("test-secret", str(data))
        self.assertTrue(post.call_args.args[0].startswith("https://api.cloudinary.com/"))

    def test_provider_failure_is_safe_and_does_not_fall_back_locally(self):
        with (
            patch("apps.common.media.requests.post", side_effect=requests.Timeout("secret provider details")),
            self.assertRaises(MediaUnavailable) as error,
        ):
            upload_cloudinary(b"test", "duukayo/test")
        self.assertNotIn("secret provider details", str(error.exception))

    def test_only_configured_cloud_is_accepted(self):
        for value in ("https://example.com/a.png", "http://res.cloudinary.com/example/image/upload/a.png", "https://res.cloudinary.com/other/image/upload/a.png"):
            with self.assertRaises(ValidationError):
                validate_image_url(value)
        self.assertEqual(validate_image_url(""), "")

    def test_upload_endpoint_routes_to_cloudinary(self):
        image = BytesIO(); Image.new("RGB", (64, 64), "green").save(image, format="PNG")
        url = "https://res.cloudinary.com/example/image/upload/v1/duukayo/businesses/1/test.png"
        with patch("apps.common.media.upload_cloudinary", return_value=url) as upload, patch("api.v1.views.merchandising.default_storage.save") as local:
            result = self.client.post(self.base + "images/", {"image": SimpleUploadedFile("image.png", image.getvalue(), content_type="image/png")}, format="multipart")
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(result.data["url"], url)
        self.assertTrue(upload.call_args.args[1].startswith(f"duukayo/businesses/{self.business.pk}/"))
        local.assert_not_called()

    def test_migration_dry_run_backup_and_rerun(self):
        with TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory, MEDIA_URL="/media/"):
            Path(directory, "old.png").write_bytes(b"image")
            self.product.image = "http://localhost:8000/media/old.png"
            self.product.save()
            new = "https://res.cloudinary.com/example/image/upload/v1/duukayo/migrated.png"
            with patch("apps.common.management.commands.migrate_media_to_cloudinary.upload_cloudinary", return_value=new) as upload:
                call_command("migrate_media_to_cloudinary", stdout=StringIO())
                upload.assert_not_called()
                backup = str(Path(directory, "backup.json"))
                call_command("migrate_media_to_cloudinary", apply=True, backup=backup, stdout=StringIO())
                self.product.refresh_from_db()
                self.assertEqual(self.product.image, new)
                self.assertIn("old.png", Path(backup).read_text())
                self.assertTrue(Path(directory, "old.png").exists())
                call_command("migrate_media_to_cloudinary", stdout=StringIO())
                self.assertEqual(upload.call_count, 1)
