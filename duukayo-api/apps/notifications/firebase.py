"""Lazily initialize Firebase only when FCM notifications are enabled."""

import base64
import binascii
import json
from threading import Lock

import firebase_admin
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from firebase_admin import credentials

_lock = Lock()


def get_firebase_app():
    with _lock:
        try:
            return firebase_admin.get_app()
        except ValueError:
            pass
        credential = None
        if settings.FIREBASE_SERVICE_ACCOUNT_SECRET_B64:
            try:
                data = json.loads(
                    base64.b64decode(
                        settings.FIREBASE_SERVICE_ACCOUNT_SECRET_B64, validate=True
                    )
                )
                credential = credentials.Certificate(data)
            except (ValueError, TypeError, KeyError, binascii.Error) as exc:
                raise ImproperlyConfigured(
                    "FIREBASE_SERVICE_ACCOUNT_B64 must contain a valid base64 service-account JSON document."
                ) from exc
        options = (
            {"projectId": settings.FIREBASE_PROJECT_ID}
            if settings.FIREBASE_PROJECT_ID
            else None
        )
        # With no base64 credential, Firebase uses GOOGLE_APPLICATION_CREDENTIALS / ADC.
        return firebase_admin.initialize_app(credential, options=options)
