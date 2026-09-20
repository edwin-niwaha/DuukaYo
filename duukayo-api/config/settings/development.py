from .base import *

DEBUG = env_bool("DEBUG", True)
# Keep the local web proxy usable alongside explicitly listed borrowed origins.
ALLOWED_HOSTS = list(
    dict.fromkeys(ALLOWED_HOSTS + ["localhost", "127.0.0.1", "10.0.2.2", "testserver"])
)
CSRF_TRUSTED_ORIGINS = list(
    dict.fromkeys(CSRF_TRUSTED_ORIGINS + ["http://localhost:3000"])
)
