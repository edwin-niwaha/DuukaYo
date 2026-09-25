"""Server-side Cloudinary image uploads; credentials never leave the API."""
import hashlib
import time
from urllib.parse import urlparse

import requests
from django.conf import settings
from rest_framework.exceptions import APIException, ValidationError


class MediaUnavailable(APIException):
    status_code = 503
    default_detail = "Image storage is unavailable. Please try uploading again."


def cloudinary_url(value):
    parsed = urlparse(value)
    return (parsed.scheme == "https" and parsed.netloc == "res.cloudinary.com"
            and parsed.path.startswith(f"/{settings.CLOUDINARY_CLOUD_NAME}/image/upload/"))


def validate_image_url(value):
    if value and settings.MEDIA_BACKEND == "cloudinary" and not cloudinary_url(value):
        raise ValidationError("Upload this image to Cloudinary first, or use an image URL from this Cloudinary account.")
    return value


def upload_cloudinary(content, public_id):
    cloud, key, secret = settings.CLOUDINARY_CLOUD_NAME, settings.CLOUDINARY_API_KEY, settings.CLOUDINARY_API_SECRET
    if not all((cloud, key, secret)):
        raise MediaUnavailable()
    params = {"public_id": public_id, "timestamp": str(int(time.time())), "overwrite": "true"}
    signed = "&".join(f"{key}={params[key]}" for key in sorted(params)) + secret
    data = {**params, "api_key": key, "signature": hashlib.sha256(signed.encode()).hexdigest()}
    kwargs = {"data": data, "timeout": (120, 60)}
    if isinstance(content, str):
        data["file"] = content
    else:
        kwargs["files"] = {"file": ("image.png", content, "image/png")}
    try:
        response = requests.post(f"https://api.cloudinary.com/v1_1/{cloud}/image/upload", **kwargs)
        response.raise_for_status()
        result = response.json()
        url = result["secure_url"]
        if not cloudinary_url(url) or result.get("public_id") != public_id:
            raise ValueError("Unexpected upload response")
        return url
    except (requests.RequestException, ValueError, KeyError, TypeError):
        # Never expose Cloudinary responses, signed requests or credentials.
        raise MediaUnavailable() from None
