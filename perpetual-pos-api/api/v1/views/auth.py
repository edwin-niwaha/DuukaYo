from apps.accounts.google import google_user
from apps.businesses.models import Branch, Business, Membership
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from api.v1.serializers import (
    BusinessSerializer,
    CreateBusinessInput,
    GoogleInput,
    LoginInput,
    RegisterInput,
    valid,
)


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
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=RegisterInput, responses=BusinessSerializer)
    @transaction.atomic
    def post(self, request):
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
        user.save()
        business = Business.objects.create(name=data["name"], slug=data["slug"])
        branch = Branch.objects.create(business=business)
        Membership.objects.create(
            business=business, branch=branch, user=user, role="owner"
        )
        return Response(BusinessSerializer(business).data, status=201)


@method_decorator(csrf_protect, name="dispatch")
@extend_schema(responses={200: dict})
class SessionView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

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
                "memberships": [
                    {
                        "business": BusinessSerializer(m.business).data,
                        "branch": m.branch_id,
                        "role": m.role,
                    }
                    for m in Membership.objects.filter(
                        user=request.user, active=True
                    ).select_related("business")
                ],
            }
        )


class GoogleTokenView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [GoogleLoginThrottle]

    @extend_schema(request=GoogleInput, responses={200: dict})
    def post(self, request):
        user = google_user(valid(GoogleInput, request.data)["id_token"])
        refresh = RefreshToken.for_user(user)
        return Response({"access": str(refresh.access_token), "refresh": str(refresh)})


@method_decorator(csrf_protect, name="dispatch")
class GoogleSessionView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [GoogleLoginThrottle]

    @extend_schema(request=GoogleInput, responses={200: dict})
    def post(self, request):
        user = google_user(valid(GoogleInput, request.data)["id_token"])
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        return Response({"csrfToken": get_token(request)})


class CreateBusinessView(APIView):
    @extend_schema(request=CreateBusinessInput, responses={201: BusinessSerializer})
    def post(self, request):
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
