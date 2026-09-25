"""Isolated database for platform portal integration tests."""
from .browser import *

DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "platform-browser.sqlite3"}}
MEDIA_ROOT = BASE_DIR / "platform-browser-media"
PUBLIC_MEDIA_ORIGIN = "http://localhost:8015"
