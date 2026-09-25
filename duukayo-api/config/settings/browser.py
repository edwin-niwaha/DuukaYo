"""Isolated local browser-test database; never uses the application database."""
from .test import *

DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "browser-test.sqlite3"}}
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]
CSRF_TRUSTED_ORIGINS = ["http://localhost:3105", "http://localhost:3108"]

DEBUG = True
