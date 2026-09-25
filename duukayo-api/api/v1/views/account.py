import hashlib
import logging
from typing import ClassVar

from django.conf import settings
from django.contrib.auth import get_user_model, logout
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import transaction
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import (
    AnonRateThrottle,
    SimpleRateThrottle,
    UserRateThrottle,
)
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.utils import get_md5_hash_password

from api.v1.serializers import valid
from api.v1.views.auth import password_ok


class ProfileInput(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, allow_blank=True)
    last_name = serializers.CharField(max_length=150, allow_blank=True)


class PasswordInput(serializers.Serializer):
    current_password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)
    new_password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)
    confirm_password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)


class RecoveryInput(serializers.Serializer):
    email = serializers.EmailField(max_length=254)


class ResetInput(serializers.Serializer):
    code = serializers.CharField(max_length=300)
    new_password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)
    confirm_password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)


class SecurityThrottle(UserRateThrottle):
    rate = "10/hour"
    scope = "account_security"


class RecoveryThrottle(AnonRateThrottle):
    rate = "10/hour"
    scope = "password_recovery"


class RecoveryEmailThrottle(SimpleRateThrottle):
    rate = "3/hour"
    scope = "recovery_email"

    def get_cache_key(self, request, view):
        email = str(request.data.get("email", "")).strip().lower()
        return self.cache_format % {"scope": self.scope, "ident": hashlib.sha256(email.encode()).hexdigest()}


class SafeTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        token = RefreshToken(attrs["refresh"])
        user = get_user_model().objects.filter(pk=token.get(api_settings.USER_ID_CLAIM)).first()
        if not user or not user.is_active or token.get(api_settings.REVOKE_TOKEN_CLAIM) != get_md5_hash_password(user.password):
            raise AuthenticationFailed("Session ended. Sign in again.")
        return super().validate(attrs)


def set_new_password(user, data):
    if data["new_password"] != data["confirm_password"]:
        raise ValidationError({"confirm_password": "Passwords do not match."})
    if user.check_password(data["new_password"]):
        raise ValidationError({"new_password": "Choose a different password."})
    password_ok(data["new_password"], user)
    user.set_password(data["new_password"])
    user.save(update_fields=["password"])


class ProfileView(APIView):
    @extend_schema(request=ProfileInput, responses={200: dict})
    def post(self, request):
        data = valid(ProfileInput, request.data)
        user = request.user
        user.first_name, user.last_name = data["first_name"], data["last_name"]
        user.save(update_fields=["first_name", "last_name"])
        return Response(data)


class ChangePasswordView(APIView):
    throttle_classes: ClassVar[list] = [SecurityThrottle]

    @extend_schema(request=PasswordInput, responses={200: dict})
    @transaction.atomic
    def post(self, request):
        data = valid(PasswordInput, request.data)
        user = get_user_model().objects.select_for_update().get(pk=request.user.pk)
        if not user.check_password(data["current_password"]):
            raise ValidationError({"current_password": "Current password is incorrect."})
        set_new_password(user, data)
        logout(request)
        return Response({"detail": "Password changed. Sign in again on your devices."})


class RequestRecoveryView(APIView):
    permission_classes: ClassVar[list] = [AllowAny]
    authentication_classes: ClassVar[list] = []
    throttle_classes: ClassVar[list] = [RecoveryThrottle, RecoveryEmailThrottle]

    @extend_schema(request=RecoveryInput, responses={200: dict})
    def post(self, request):
        data = valid(RecoveryInput, request.data)
        users = list(get_user_model().objects.filter(email__iexact=data["email"], is_active=True)[:2])
        # Never pick an account when old data has an ambiguous email address.
        if len(users) == 1:
            user = users[0]
            code = urlsafe_base64_encode(force_bytes(user.pk)) + "." + default_token_generator.make_token(user)
            try:
                send_mail(
                    "Reset your DuukaYo password",
                    "Open DuukaYo > Account > Password recovery, then paste this recovery code:\n\n"
                    + code + "\n\nThe code expires in one hour and works once. If you did not request this, ignore this email.",
                    settings.DEFAULT_FROM_EMAIL, [user.email],
                )
            except Exception:  # noqa: BLE001 - Keep recovery responses private for any email backend failure.
                # Keep the public response identical; never log a recovery code or recipient.
                logging.getLogger(__name__).error("Password recovery email delivery failed")
        return Response({"detail": "If this email matches an active account, recovery instructions will arrive shortly."})


class ConfirmRecoveryView(APIView):
    permission_classes: ClassVar[list] = [AllowAny]
    authentication_classes: ClassVar[list] = []
    throttle_classes: ClassVar[list] = [RecoveryThrottle]

    @extend_schema(request=ResetInput, responses={200: dict})
    @transaction.atomic
    def post(self, request):
        data = valid(ResetInput, request.data)
        try:
            uid, token = data["code"].split(".", 1)
            user_id = urlsafe_base64_decode(uid).decode()
            user = get_user_model().objects.select_for_update().get(pk=user_id, is_active=True)
        except (ValueError, TypeError, OverflowError, UnicodeDecodeError, get_user_model().DoesNotExist):
            raise ValidationError({"code": "Recovery code is invalid or expired."})
        if not default_token_generator.check_token(user, token):
            raise ValidationError({"code": "Recovery code is invalid or expired."})
        set_new_password(user, data)
        return Response({"detail": "Password reset. Sign in with your new password."})
