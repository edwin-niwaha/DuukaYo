import base64
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIClient

from apps.notifications.firebase import get_firebase_app
from environment import (
    configure_settings,
    database_config,
    env_bool,
    env_int,
    env_list,
    google_client_ids,
    load_environment,
)


class EnvironmentTests(SimpleTestCase):
    def test_database_fields_when_url_is_blank(self):
        with patch.dict(
            os.environ,
            {
                "DATABASE_URL": "",
                "DB_NAME": "pos",
                "DB_USER": "user",
                "DB_PASSWORD": "p@ss:/?#",
                "DB_HOST": "db.local",
                "DB_PORT": "5433",
            },
            clear=True,
        ):
            config = database_config()
        self.assertEqual(config["NAME"], "pos")
        self.assertEqual(config["PASSWORD"], "p@ss:/?#")
        self.assertEqual(config["HOST"], "db.local")
        self.assertEqual(config["PORT"], 5433)
        self.assertEqual(config["OPTIONS"]["connect_timeout"], 5)

    def test_database_url_precedence(self):
        with patch.dict(
            os.environ,
            {
                "DATABASE_URL": "postgresql://user:pass@url-db:5432/url_name",
                "DB_NAME": "ignored",
            },
            clear=True,
        ):
            config = database_config()
        self.assertEqual(config["NAME"], "url_name")
        self.assertEqual(config["HOST"], "url-db")

    def test_sqlite_does_not_receive_postgres_options(self):
        with patch.dict(os.environ, {"DATABASE_URL": "sqlite:///:memory:"}, clear=True):
            config = database_config()
        self.assertNotIn("connect_timeout", config.get("OPTIONS", {}))

    def test_typed_parsing_and_lists(self):
        with patch.dict(
            os.environ,
            {"FLAG": "false", "COUNT": "25000", "LIST": " one, two, ,one "},
            clear=True,
        ):
            self.assertFalse(env_bool("FLAG"))
            self.assertEqual(env_int("COUNT", 1), 25000)
            self.assertEqual(env_list("LIST"), ["one", "two"])
        for value in ["abc", "-1"]:
            with (
                patch.dict(os.environ, {"COUNT": value}, clear=True),
                self.assertRaises(ImproperlyConfigured),
            ):
                env_int("COUNT", 1)

    def test_google_audiences_combine_borrowed_names(self):
        with patch.dict(
            os.environ,
            {
                "GOOGLE_KEY": "web",
                "GOOGLE_CLIENT_IDS": "extra,web",
                "MOBILE_GOOGLE_CLIENT_IDS": "mobile,web",
            },
            clear=True,
        ):
            self.assertEqual(google_client_ids(), ["extra", "web", "mobile"])

    @patch("environment.load_environment")
    def test_settings_selection_and_explicit_override(self, _load):
        for value, expected in [
            ("development", "development"),
            ("prod", "production"),
            ("test", "test"),
        ]:
            with patch.dict(os.environ, {"DJANGO_ENV": value}, clear=True):
                configure_settings()
                self.assertEqual(
                    os.environ["DJANGO_SETTINGS_MODULE"], "config.settings." + expected
                )
        with patch.dict(
            os.environ,
            {
                "DJANGO_ENV": "production",
                "DJANGO_SETTINGS_MODULE": "config.settings.test",
            },
            clear=True,
        ):
            configure_settings()
            self.assertEqual(
                os.environ["DJANGO_SETTINGS_MODULE"], "config.settings.test"
            )
        with (
            patch.dict(os.environ, {"DJANGO_ENV": "typo"}, clear=True),
            self.assertRaises(ImproperlyConfigured),
        ):
            configure_settings()

    def test_shell_then_local_then_base_env_precedence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env").write_text("ONE=base\nTWO=base\nTHREE=base\n")
            (root / ".env.local").write_text("ONE=local\nTWO=local\n")
            with (
                patch("environment.API_ROOT", root),
                patch.dict(os.environ, {"ONE": "shell"}, clear=True),
            ):
                load_environment()
                self.assertEqual(
                    [os.environ[key] for key in ["ONE", "TWO", "THREE"]],
                    ["shell", "local", "base"],
                )

    @override_settings(CORS_ALLOWED_ORIGINS=["https://allowed.example"])
    def test_cors_preflight_is_allowlisted(self):
        client = APIClient()
        for origin in ["https://allowed.example", "https://other.example"]:
            response = client.options(
                "/api/v1/auth/google/",
                HTTP_ORIGIN=origin,
                HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            )
            self.assertEqual(
                response.get("access-control-allow-origin"),
                origin if origin == "https://allowed.example" else None,
            )


class FirebaseConfigurationTests(SimpleTestCase):
    @override_settings(
        FIREBASE_SERVICE_ACCOUNT_SECRET_B64="", FIREBASE_PROJECT_ID="pos-project"
    )
    @patch("apps.notifications.firebase.firebase_admin.initialize_app")
    @patch("apps.notifications.firebase.firebase_admin.get_app", side_effect=ValueError)
    def test_default_credentials_fallback(self, _get, initialize):
        get_firebase_app()
        initialize.assert_called_once_with(None, options={"projectId": "pos-project"})

    @patch("apps.notifications.firebase.credentials.Certificate")
    @patch("apps.notifications.firebase.firebase_admin.initialize_app")
    @patch("apps.notifications.firebase.firebase_admin.get_app", side_effect=ValueError)
    def test_base64_credential(self, _get, initialize, certificate):
        payload = {"type": "service_account", "project_id": "pos-project"}
        encoded = base64.b64encode(json.dumps(payload).encode()).decode()
        with override_settings(
            FIREBASE_SERVICE_ACCOUNT_SECRET_B64=encoded,
            FIREBASE_PROJECT_ID="pos-project",
        ):
            get_firebase_app()
        certificate.assert_called_once_with(payload)
        initialize.assert_called_once_with(
            certificate.return_value, options={"projectId": "pos-project"}
        )

    @override_settings(
        FIREBASE_SERVICE_ACCOUNT_SECRET_B64="not-base64!", FIREBASE_PROJECT_ID=None
    )
    @patch("apps.notifications.firebase.firebase_admin.get_app", side_effect=ValueError)
    def test_invalid_credential_is_rejected(self, _get):
        with self.assertRaisesMessage(
            ImproperlyConfigured, "FIREBASE_SERVICE_ACCOUNT_B64"
        ):
            get_firebase_app()

    @patch("apps.notifications.firebase.firebase_admin.initialize_app")
    @patch("apps.notifications.firebase.firebase_admin.get_app")
    def test_reuses_existing_app(self, get, initialize):
        self.assertIs(get_firebase_app(), get.return_value)
        initialize.assert_not_called()
