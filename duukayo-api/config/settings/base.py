import os
from datetime import timedelta
from pathlib import Path

from environment import (
    database_config,
    env_bool,
    env_int,
    env_list,
    google_client_ids,
    load_environment,
)

load_environment()

BASE_DIR = Path(__file__).resolve().parents[2]
SECRET_KEY = os.environ.get("SECRET_KEY", "development-only-change-before-deploying")
DEBUG = False
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1,10.0.2.2,testserver")
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
] + [
    "apps." + name
    for name in ["common", "accounts", "businesses", "catalog", "inventory", "customers", "sales", "orders", "payments", "notifications", "reports"]
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "DIRS": [BASE_DIR / "templates"],
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]
ROOT_URLCONF = "config.urls"
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
PUBLIC_ADMIN_URL = os.environ.get("PUBLIC_ADMIN_URL", "").strip()
WSGI_APPLICATION = "config.wsgi.application"
DATABASES = {"default": database_config()}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
TIME_ZONE = "UTC"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
]
REST_FRAMEWORK = {
    "EXCEPTION_HANDLER": "apps.common.exceptions.exception_handler",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"anon": "120/min"},
}
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "CHECK_REVOKE_TOKEN": True,
    "TOKEN_REFRESH_SERIALIZER": "api.v1.views.account.SafeTokenRefreshSerializer",
}
PASSWORD_RESET_TIMEOUT = 3600
SPECTACULAR_SETTINGS = {
    "ENUM_NAME_OVERRIDES": {"PaymentMethodEnum": ["cash", "manual_mtn", "manual_airtel"], "SaleMethodEnum": ["cash", "manual_mtn", "manual_airtel", "split"]},
    "TITLE": "DuukaYo API",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "DESCRIPTION": "Storefront discovery, marketplace checkout and branch-scoped point of sale. Start with the developer guide at /api/v1/docs/.",
    "SWAGGER_UI_SETTINGS": {"deepLinking": True, "filter": True, "displayRequestDuration": True, "docExpansion": "none", "persistAuthorization": False},
}
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
CORS_URLS_REGEX = r"^/api/.*$"
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", "http://localhost:3000")
CELERY_BROKER_URL = (
    os.environ.get("CELERY_BROKER_URL")
    or os.environ.get("REDIS_URL")
    or "redis://127.0.0.1:6379/0"
)
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND") or None
CELERY_TASK_DEFAULT_QUEUE = (
    os.environ.get("CELERY_TASK_DEFAULT_QUEUE") or "duukayo"
)
CELERY_TASK_IGNORE_RESULT = True
CELERY_BEAT_SCHEDULE = {
    "dispatch-notification-outbox": {"task": "apps.notifications.tasks.dispatch_notifications", "schedule": 30.0},
    "expire-reservations": {
        "task": "apps.orders.tasks.expire_reservations",
        "schedule": 60.0,
    }
}
PUSH_BACKEND = os.environ.get("PUSH_BACKEND", "log")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"json": {"()": "apps.common.logging.JsonFormatter"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "json"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}


LOGGING["loggers"] = {
    "django.server": {"handlers": ["console"], "level": "INFO", "propagate": False}
}

# GOOGLE_KEY is the borrowed format's public OAuth client ID; GOOGLE_SECRET is
# not used by this ID-token flow.
GOOGLE_CLIENT_IDS = google_client_ids()
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID") or None
FIREBASE_SERVICE_ACCOUNT_SECRET_B64 = os.environ.get("FIREBASE_SERVICE_ACCOUNT_B64", "")

# SMTP configuration is available to Django mail callers. No emails are sent at startup.
EMAIL_BACKEND = os.environ.get(
    "EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = os.environ.get("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = env_int("EMAIL_PORT", 587, 1)
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_USE_SSL = env_bool("EMAIL_USE_SSL", False)
EMAIL_TIMEOUT = env_int("EMAIL_TIMEOUT", 10, 1)
DEFAULT_FROM_EMAIL = (
    os.environ.get("DEFAULT_FROM_EMAIL")
    or os.environ.get("RESEND_FROM_EMAIL")
    or "DuukaYo <noreply@localhost>"
)

# Persist this directory or configure Django default storage for object storage.
MEDIA_ROOT = os.environ.get("MEDIA_ROOT") or str(BASE_DIR / "media")
MEDIA_URL = os.environ.get("MEDIA_URL") or "/media/"
PUBLIC_MEDIA_ORIGIN = os.environ.get("PUBLIC_MEDIA_ORIGIN", "").rstrip("/")
DATA_UPLOAD_MAX_MEMORY_SIZE = 9 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 1024 * 1024

# All application uploads use Cloudinary. Local storage is explicit for tests/offline development.
MEDIA_BACKEND = os.environ.get("MEDIA_BACKEND", "cloudinary")
CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME", "").strip()
CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY", "").strip()
CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET", "").strip()
if MEDIA_BACKEND not in {"cloudinary", "local"}:
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured("MEDIA_BACKEND must be cloudinary or local.")
