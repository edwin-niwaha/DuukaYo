"""Environment parsing shared by Django, WSGI and Celery entry points."""

import os
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

API_ROOT = Path(__file__).resolve().parent


def load_environment():
    # Shell/container values win, followed by machine-local overrides and .env.
    load_dotenv(API_ROOT / ".env.local", override=False)
    load_dotenv(API_ROOT / ".env", override=False)


def configure_settings(default="production"):
    load_environment()
    if os.environ.get("DJANGO_SETTINGS_MODULE"):
        return
    name = os.environ.get("DJANGO_ENV", default).strip().lower()
    names = {
        "dev": "development",
        "development": "development",
        "local": "development",
        "prod": "production",
        "production": "production",
        "test": "test",
        "testing": "test",
    }
    if name not in names:
        raise ImproperlyConfigured(
            "DJANGO_ENV must be development, production, or test."
        )
    os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings." + names[name]


def env_list(name, default=""):
    return list(
        dict.fromkeys(
            item.strip()
            for item in os.environ.get(name, default).split(",")
            if item.strip()
        )
    )


def env_bool(name, default=False):
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    value = raw.strip().lower()
    if value not in {"true", "false", "1", "0", "yes", "no", "on", "off"}:
        raise ImproperlyConfigured(f"{name} must be a boolean.")
    return value in {"true", "1", "yes", "on"}


def env_int(name, default, minimum=0):
    try:
        value = int(os.environ.get(name) or default)
        if value < minimum:
            raise ValueError
        return value
    except ValueError as exc:
        raise ImproperlyConfigured(
            f"{name} must be an integer of at least {minimum}."
        ) from exc


def database_config():
    # URL has precedence; DB_* is the alternative when DATABASE_URL is blank.
    url = os.environ.get("DATABASE_URL", "").strip()
    if url:
        try:
            config = dj_database_url.parse(
                url, conn_max_age=60, conn_health_checks=True
            )
        except (ValueError, KeyError) as exc:
            raise ImproperlyConfigured("DATABASE_URL is invalid.") from exc
    else:
        config = {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("DB_NAME") or "perpetual_pos",
            "USER": os.environ.get("DB_USER") or "perpetual",
            "PASSWORD": os.environ.get("DB_PASSWORD", "perpetual_dev"),
            "HOST": os.environ.get("DB_HOST") or "127.0.0.1",
            "PORT": env_int("DB_PORT", 55432, 1),
            "CONN_MAX_AGE": 60,
            "CONN_HEALTH_CHECKS": True,
        }
        if os.environ.get("DB_SSLMODE"):
            config["OPTIONS"] = {"sslmode": os.environ["DB_SSLMODE"]}
    if config["ENGINE"] == "django.db.backends.postgresql":
        config.setdefault("OPTIONS", {}).setdefault("connect_timeout", 5)
    return config


def google_client_ids():
    # Native Google sign-in returns ID tokens for its web client ID.
    return list(
        dict.fromkeys(
            env_list("GOOGLE_CLIENT_IDS")
            + env_list("MOBILE_GOOGLE_CLIENT_IDS")
            + env_list("GOOGLE_KEY")
        )
    )
