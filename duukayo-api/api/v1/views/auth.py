from typing import ClassVar

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.middleware.csrf import get_token
from django.urls import reverse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from api.v1.serializers import (
    BusinessSerializer,
    CreateBusinessInput,
    GoogleInput,
    LoginInput,
    RegisterInput,
    valid,
)
from apps.accounts.google import google_user
from apps.accounts.throttles import LoginThrottle
from apps.businesses.models import Branch, Business, Membership
from apps.common.models import PlatformSettings


def check_shop_registration():
    if not PlatformSettings.current().shop_registration_enabled:
        raise ValidationError("New shop registration is temporarily paused. Contact platform support.")


class GoogleLoginThrottle(AnonRateThrottle):
    rate = "10/min"
    scope = "google_login"


def password_ok(password, user):
    try:
        validate_password(password, user)
    except DjangoValidationError as exc:
        raise ValidationError({"password": exc.messages})


@method_decorator(csrf_protect, name="dispatch")
class RegisterView(APIView):
    throttle_classes: ClassVar[list] = [LoginThrottle]
    permission_classes: ClassVar[list] = [AllowAny]
    authentication_classes: ClassVar[list] = []

    @extend_schema(request=RegisterInput, responses=BusinessSerializer)
    @transaction.atomic
    def post(self, request):
        check_shop_registration()
        data = valid(RegisterInput, request.data)
        user = get_user_model()(
            username=data["username"], email=data.get("email", "").lower()
        )
        password_ok(data["password"], user)
        if (
            get_user_model().objects.filter(username=data["username"]).exists()
            or Business.objects.filter(slug=data["slug"]).exists()
        ):
            raise ValidationError("Username or shop slug is unavailable.")
        user.set_password(data["password"])
        try:
            with transaction.atomic():
                user.save()
                business = Business.objects.create(name=data["name"], slug=data["slug"])
                branch = Branch.objects.create(business=business)
                Membership.objects.create(
                    business=business, branch=branch, user=user, role="owner"
                )
        except IntegrityError:
            raise ValidationError("Username or shop slug is unavailable.")
        return Response(BusinessSerializer(business).data, status=201)


@method_decorator(csrf_protect, name="dispatch")
@extend_schema(responses={200: dict})
class SessionView(APIView):
    throttle_classes: ClassVar[list] = [LoginThrottle]
    permission_classes: ClassVar[list] = [AllowAny]
    authentication_classes: ClassVar[list] = []

    def get(self, request):
        return Response({"csrfToken": get_token(request)})

    @extend_schema(request=LoginInput, responses={200: dict})
    def post(self, request):
        data = valid(LoginInput, request.data)
        user = authenticate(request, **data)
        if user is None:
            return Response({"detail": "Invalid credentials"}, status=401)
        login(request, user)
        return Response({"csrfToken": get_token(request)})

    def delete(self, request):
        logout(request)
        return Response(status=204)


@extend_schema(responses={200: dict})
class MeView(APIView):
    def get(self, request):
        return Response(
            {
                "id": request.user.pk,
                "username": request.user.username,
                "first_name": request.user.first_name,
                "last_name": request.user.last_name,
                "email": request.user.email,
                "has_password": request.user.has_usable_password(),
                "is_staff": request.user.is_staff,
                "can_manage_platform": request.user.is_staff and request.user.has_perm("common.manage_platform"),
                "can_manage_admins": request.user.is_superuser,
                "admin_url": (
                    settings.PUBLIC_ADMIN_URL or request.build_absolute_uri(reverse("admin:index"))
                ) if request.user.is_staff and request.user.is_active else None,
                "memberships": [
                    {
                        "business": BusinessSerializer(m.business).data,
                        "branch": m.branch_id,
                        "role": m.role,
                    }
                    for m in Membership.objects.filter(
                        user=request.user, active=True, business__deleted_at__isnull=True
                    ).select_related("business").prefetch_related("business__branch_set")
                ],
            }
        )


class GoogleTokenView(APIView):
    permission_classes: ClassVar[list] = [AllowAny]
    authentication_classes: ClassVar[list] = []
    throttle_classes: ClassVar[list] = [GoogleLoginThrottle]

    @extend_schema(request=GoogleInput, responses={200: dict})
    def post(self, request):
        user = google_user(valid(GoogleInput, request.data)["id_token"])
        refresh = RefreshToken.for_user(user)
        return Response({"access": str(refresh.access_token), "refresh": str(refresh)})


@method_decorator(csrf_protect, name="dispatch")
class GoogleSessionView(APIView):
    permission_classes: ClassVar[list] = [AllowAny]
    authentication_classes: ClassVar[list] = []
    throttle_classes: ClassVar[list] = [GoogleLoginThrottle]

    @extend_schema(request=GoogleInput, responses={200: dict})
    def post(self, request):
        user = google_user(valid(GoogleInput, request.data)["id_token"])
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        return Response({"csrfToken": get_token(request)})


class CreateBusinessView(APIView):
    @extend_schema(request=CreateBusinessInput, responses={201: BusinessSerializer})
    def post(self, request):
        check_shop_registration()
        data = valid(CreateBusinessInput, request.data)
        try:
            with transaction.atomic():
                business = Business.objects.create(**data)
                branch = Branch.objects.create(business=business)
                Membership.objects.create(
                    user=request.user, business=business, branch=branch, role="owner"
                )
        except IntegrityError as exc:
            raise ValidationError({"slug": "This shop URL is already in use."}) from exc
        return Response(BusinessSerializer(business).data, status=201)


class CredentialTokenView(TokenObtainPairView):
    throttle_classes: ClassVar[list] = [LoginThrottle]


class AccountRegistrationInput(serializers.Serializer):
    username = serializers.RegexField(r"^[a-zA-Z0-9@.+_-]{3,150}$")
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(min_length=10, max_length=128, trim_whitespace=False, write_only=True)
    confirm_password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)

    def validate(self, data):
        if set(self.initial_data) - set(self.fields):
            raise ValidationError("Only username, email and password details are accepted during registration.")
        if data["password"] != data["confirm_password"]:
            raise ValidationError({"confirm_password": "Passwords do not match."})
        return data


class AccountRegistrationView(APIView):
    """Stateless signup: no session, shop or elevated privileges are created."""
    permission_classes: ClassVar[list] = [AllowAny]
    authentication_classes: ClassVar[list] = []
    throttle_classes: ClassVar[list] = [LoginThrottle]

    @extend_schema(request=AccountRegistrationInput, responses={201: dict})
    @transaction.atomic
    def post(self, request):
        data = valid(AccountRegistrationInput, request.data)
        User = get_user_model()
        email = data["email"].strip().lower()
        user = User(username=data["username"], email=email, is_staff=False, is_superuser=False)
        password_ok(data["password"], user)
        if User.objects.filter(username__iexact=user.username).exists() or User.objects.filter(email__iexact=email).exists():
            raise ValidationError("Unable to register with these details. Try signing in or recovering your account.")
        user.set_password(data["password"])
        try:
            with transaction.atomic():
                user.save()
        except IntegrityError:
            raise ValidationError("Unable to register with these details. Try signing in or recovering your account.")
        return Response({"detail": "Account created. Sign in to continue. Share your username with your shop administrator if you need team access."}, status=201)
