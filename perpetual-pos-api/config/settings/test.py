from .base import *

# Only fast unit/API tests use SQLite. PostgreSQL tests select base configuration.
if os.environ.get("TEST_DATABASE_URL"):
    DATABASES = {
        "default": dj_database_url.parse(
            os.environ["TEST_DATABASE_URL"]
            + ("&" if "?" in os.environ["TEST_DATABASE_URL"] else "?")
            + "connect_timeout=5"
        )
    }
else:
    DATABASES = {
        "default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}
    }
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
CELERY_TASK_ALWAYS_EAGER = True
