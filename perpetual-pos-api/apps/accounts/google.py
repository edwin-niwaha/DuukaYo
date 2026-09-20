from uuid import uuid4

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from google.auth.exceptions import TransportError
from google.auth.transport.requests import Request
from google.oauth2 import id_token
from rest_framework.exceptions import APIException, AuthenticationFailed

from .models import GoogleIdentity


class GoogleUnavailable(APIException):
    status_code = 503
    default_detail = "Google sign-in is unavailable. Please try again."


class BoundedRequest(Request):
    def __call__(self, *args, **kwargs):
        kwargs["timeout"] = 10
        return super().__call__(*args, **kwargs)


def google_user(token):
    if not settings.GOOGLE_CLIENT_IDS:
        raise GoogleUnavailable("Google sign-in is not configured.")
    try:
        claims = id_token.verify_oauth2_token(token, BoundedRequest(), audience=None)
    except TransportError as exc:
        raise GoogleUnavailable() from exc
    except (ValueError, TypeError) as exc:
        raise AuthenticationFailed("Invalid or expired Google sign-in token.") from exc
    if claims.get("aud") not in settings.GOOGLE_CLIENT_IDS:
        raise AuthenticationFailed("Google token was issued for another application.")
    email = str(claims.get("email", "")).strip().lower()
    subject = claims.get("sub")
    if (
        not isinstance(subject, str)
        or not subject
        or len(subject) > 255
        or not email
        or claims.get("email_verified") is not True
    ):
        raise AuthenticationFailed("A verified Google email is required.")
    try:
        with transaction.atomic():
            identity = (
                GoogleIdentity.objects.select_related("user")
                .filter(subject=subject)
                .first()
            )
            if identity:
                user = identity.user
            else:
                users = list(
                    get_user_model()
                    .objects.select_for_update()
                    .filter(email__iexact=email)[:2]
                )
                if len(users) > 1:
                    raise AuthenticationFailed(
                        "Multiple accounts use this email. Contact support."
                    )
                if users:
                    # Google is authoritative for Gmail and verified Workspace addresses only.
                    if not (email.endswith("@gmail.com") or claims.get("hd")):
                        raise AuthenticationFailed(
                            "Sign in with your password for this email address."
                        )
                    user = users[0]
                    if GoogleIdentity.objects.filter(user=user).exists():
                        raise AuthenticationFailed(
                            "This account is linked to another Google identity."
                        )
                else:
                    user = get_user_model().objects.create_user(
                        username="google_" + uuid4().hex,
                        email=email,
                        password=None,
                        first_name=str(claims.get("given_name", ""))[:150],
                        last_name=str(claims.get("family_name", ""))[:150],
                    )
                if not user.is_active:
                    raise AuthenticationFailed("This account is inactive.")
                GoogleIdentity.objects.create(user=user, subject=subject)
            if not user.is_active:
                raise AuthenticationFailed("This account is inactive.")
            return user
    except IntegrityError as exc:
        raise AuthenticationFailed(
            "Account linking changed. Please retry sign-in."
        ) from exc
