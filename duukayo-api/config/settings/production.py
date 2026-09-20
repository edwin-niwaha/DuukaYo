from .base import *

if not os.environ.get("SECRET_KEY") or len(SECRET_KEY) < 40:
    raise RuntimeError(
        "Production requires a unique SECRET_KEY of at least 40 characters"
    )
if not os.environ.get("DATABASE_URL") and not all(
    os.environ.get(name)
    for name in ("DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT")
):
    raise RuntimeError("Set DATABASE_URL or all DB_* connection fields explicitly")
if not os.environ.get("ALLOWED_HOSTS"):
    raise RuntimeError("Set ALLOWED_HOSTS explicitly")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
