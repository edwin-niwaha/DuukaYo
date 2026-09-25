from typing import ClassVar

"""Explicit platform authority. Tenant endpoints never inherit this access."""
from datetime import date

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.db import IntegrityError, transaction
from django.db.models import Count, Q, Sum
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.operations_serializers import ReturnInput
from api.v1.serializers import (
    BusinessSerializer,
    OrderSerializer,
    SaleSerializer,
    StockInput,
    TransitionInput,
    valid,
)
from api.v1.views.business import CategoryViewSet, ProductViewSet
from api.v1.views.merchandising import ImageUploadView
from apps.accounts.models import UserProfile
from apps.businesses.models import Branch, Business, Membership
from apps.common.domain import audit, lock_business
from apps.common.models import Audit, PlatformSettings
from apps.inventory.models import Movement, Stock
from apps.inventory.services import change_stock
from apps.orders.models import Order
from apps.orders.services import transition_order
from apps.sales.models import Sale, SaleReturn
from apps.sales.operations import return_sale


def can_manage_platform(user):
    return bool(user.is_authenticated and user.is_active and user.is_staff and user.has_perm("common.manage_platform"))


class PlatformPermission(BasePermission):
    def has_permission(self, request, view):
        return can_manage_platform(request.user)


class PlatformView(APIView):
    permission_classes: ClassVar[list] = [PlatformPermission]


class PlatformPagination(PageNumberPagination):
    page_size = 50


def page_response(request, rows, serialize=lambda row: row):
    pager = PlatformPagination()
    page = pager.paginate_queryset(rows, request)
    return pager.get_paginated_response([serialize(row) for row in page])


def context(request, business_id, branch_id):
    if not can_manage_platform(request.user):
        raise PermissionDenied()
    business = get_object_or_404(Business, pk=business_id, deleted_at__isnull=True)
    branch = get_object_or_404(Branch, business=business, pk=branch_id)
    # An in-memory service context, never a persisted shop membership.
    return Membership(user=request.user, business=business, branch=branch, role="owner")


class PlatformBusinessSerializer(BusinessSerializer):
    owners = serializers.SerializerMethodField()

    def get_owners(self, obj):
        return list(obj.membership_set.filter(role="owner", active=True).values_list("user__username", flat=True))

    class Meta(BusinessSerializer.Meta):
        fields = BusinessSerializer.Meta.fields + ["suspended", "owners"]


class ShopCreateInput(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    slug = serializers.SlugField(max_length=50)
    owner = serializers.CharField(max_length=150)
    branch_name = serializers.CharField(max_length=100, default="Main branch")


class ShopsView(PlatformView):
    def get(self, request):
        rows = Business.objects.filter(deleted_at__isnull=True).order_by("name", "pk")
        query = request.query_params.get("q", "").strip()[:120]
        if query:
            rows = rows.filter(Q(name__icontains=query) | Q(slug__icontains=query))
        return page_response(request, rows, lambda row: PlatformBusinessSerializer(row).data)

    @transaction.atomic
    def post(self, request):
        data = valid(ShopCreateInput, request.data)
        owner = get_object_or_404(get_user_model(), username=data["owner"], is_active=True)
        try:
            with transaction.atomic():
                business = Business.objects.create(name=data["name"], slug=data["slug"])
                branch = Branch.objects.create(business=business, name=data["branch_name"])
                Membership.objects.create(user=owner, business=business, branch=branch, role="owner")
        except IntegrityError:
            raise ValidationError({"slug": "This shop URL is already in use."})
        audit(business, request.user, "platform.shop.created", business.pk, {"owner": owner.pk})
        return Response(PlatformBusinessSerializer(business).data, status=201)


class ShopView(PlatformView):
    @transaction.atomic
    def delete(self, request, business_id):
        business = get_object_or_404(Business.objects.select_for_update(), pk=business_id)
        if request.data.get("confirm_slug") != business.slug:
            raise ValidationError({"confirm_slug": "Enter the shop URL name to confirm deletion."})
        if business.deleted_at:
            return Response(status=204)
        if Order.objects.filter(business=business).exclude(status__in=["completed", "cancelled"]).exists():
            raise ValidationError("Complete or cancel all outstanding orders before deleting this shop. You can hide it meanwhile.")
        business.deleted_at = timezone.now()
        business.published = False
        business.suspended = True
        business.save(update_fields=["deleted_at", "published", "suspended"])
        audit(business, request.user, "platform.shop.deleted", business.pk, {"name": business.name, "slug": business.slug})
        return Response(status=204)

    def get(self, request, business_id):
        return Response(PlatformBusinessSerializer(get_object_or_404(Business, pk=business_id, deleted_at__isnull=True)).data)

    @transaction.atomic
    def patch(self, request, business_id):
        business = get_object_or_404(Business.objects.select_for_update(), pk=business_id, deleted_at__isnull=True)
        before = PlatformBusinessSerializer(business).data
        serializer = PlatformBusinessSerializer(business, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        audit(business, request.user, "platform.shop.updated", business.pk, {"before": before, "after": serializer.data})
        return Response(serializer.data)


class BranchInput(serializers.Serializer):
    name = serializers.CharField(max_length=100)


class BranchesView(PlatformView):
    @transaction.atomic
    def post(self, request, business_id):
        business = get_object_or_404(Business.objects.select_for_update(), pk=business_id, deleted_at__isnull=True)
        branch = Branch.objects.create(business=business, **valid(BranchInput, request.data))
        audit(business, request.user, "platform.branch.created", branch.pk, {"name": branch.name})
        return Response({"id": branch.pk, "name": branch.name}, status=201)

    @transaction.atomic
    def patch(self, request, business_id, branch_id):
        m = context(request, business_id, branch_id)
        lock_business(m.business)
        before = m.branch.name
        m.branch.name = valid(BranchInput, request.data)["name"]
        m.branch.save(update_fields=["name"])
        audit(m.business, request.user, "platform.branch.updated", branch_id, {"before": before, "after": m.branch.name})
        return Response({"id": branch_id, "name": m.branch.name})


class UserShopInput(serializers.Serializer):
    business = serializers.IntegerField(min_value=1)
    branch = serializers.IntegerField(min_value=1)
    role = serializers.ChoiceField(choices=["owner", "manager", "cashier"])
    active = serializers.BooleanField(default=True)


class UserInput(serializers.Serializer):
    def validate_photo(self, value):
        from apps.common.media import validate_image_url
        return validate_image_url(value)

    photo = serializers.URLField(max_length=500, allow_blank=True, required=False)
    phone = serializers.RegexField(r"^[+0-9 ()-]{0,40}$", allow_blank=True, required=False)
    job_title = serializers.CharField(max_length=100, allow_blank=True, required=False)
    location = serializers.CharField(max_length=150, allow_blank=True, required=False)
    shop_access = UserShopInput(many=True, required=False)

    first_name = serializers.CharField(max_length=150, allow_blank=True, required=False)
    last_name = serializers.CharField(max_length=150, allow_blank=True, required=False)
    is_active = serializers.BooleanField(required=False)
    platform_admin = serializers.BooleanField(required=False)


def user_data(user):
    profile = getattr(user, "profile", None)
    return {"id": user.pk, "username": user.username, "email": user.email,
            "first_name": user.first_name, "last_name": user.last_name,
            "is_active": user.is_active, "platform_admin": user.is_staff and user.has_perm("common.manage_platform"),
            "is_superuser": user.is_superuser, "is_staff": user.is_staff,
            "photo": profile.photo if profile else "", "phone": profile.phone if profile else "",
            "job_title": profile.job_title if profile else "", "location": profile.location if profile else "",
            "date_joined": user.date_joined.isoformat(), "last_login": user.last_login.isoformat() if user.last_login else None,
            "shop_access": [{"id": m.pk, "business": m.business_id, "shop_name": m.business.name,
                             "branch": m.branch_id, "branch_name": m.branch.name, "role": m.role, "active": m.active}
                            for m in user.membership_set.filter(business__deleted_at__isnull=True).select_related("business", "branch")]}


def protect_shop_owners(user):
    owned = Membership.objects.filter(user=user, role="owner", active=True, business__deleted_at__isnull=True)
    for m in owned.order_by("business_id"):
        lock_business(m.business)
        if not Membership.objects.filter(business=m.business, role="owner", active=True, user__is_active=True).exclude(user=user).exists():
            raise ValidationError(f"Assign another active owner for {m.business.name} first.")


def save_user_details(user, profile_data, access, actor):
    if profile_data:
        UserProfile.objects.update_or_create(user=user, defaults=profile_data)
    seen = set()
    for row in sorted(access, key=lambda item: item["business"]):
        if row["business"] in seen:
            raise ValidationError("Assign only one role per shop.")
        seen.add(row["business"])
        business = get_object_or_404(Business.objects.select_for_update(), pk=row["business"], deleted_at__isnull=True)
        branch = get_object_or_404(Branch, pk=row["branch"], business=business)
        m = Membership.objects.filter(user=user, business=business).first()
        if (
            (m and m.role == "owner" and m.active and (row["role"] != "owner" or not row["active"]))
            and (not Membership.objects.filter(business=business, role="owner", active=True, user__is_active=True).exclude(user=user).exists())
        ):
            raise ValidationError(f"Assign another active owner for {business.name} first.")
        if row["active"] and not user.is_active:
            raise ValidationError("Activate the account before assigning active shop access.")
        m, _ = Membership.objects.update_or_create(user=user, business=business, defaults={"branch": branch, "role": row["role"], "active": row["active"]})
        audit(business, actor, "platform.access.updated", m.pk, membership_data(m))


def pop_profile(data):
    return {key: data.pop(key) for key in ("photo", "phone", "job_title", "location") if key in data}


class UsersView(PlatformView):
    def get(self, request):
        rows = get_user_model().objects.filter(profile__deleted_at__isnull=True).select_related("profile").order_by("username", "pk")
        query = request.query_params.get("q", "").strip()[:120]
        if query:
            rows = rows.filter(Q(username__icontains=query) | Q(email__icontains=query) | Q(first_name__icontains=query) | Q(last_name__icontains=query) | Q(profile__phone__icontains=query))
        return page_response(request, rows, user_data)



class UserView(PlatformView):
    @transaction.atomic
    def delete(self, request, user_id):
        list(get_user_model().objects.select_for_update().filter(is_superuser=True).order_by("pk"))
        user = get_object_or_404(get_user_model().objects.select_for_update(), pk=user_id)
        if user.pk == request.user.pk:
            raise ValidationError("You cannot delete your own account.")
        if (user.is_staff or user.is_superuser or user.has_perm("common.manage_platform")) and not request.user.is_superuser:
            raise PermissionDenied("Only a superuser can delete administrator accounts.")
        if request.data.get("confirm_username") != user.username:
            raise ValidationError("Type the username to confirm deletion.")
        if user.is_superuser and not get_user_model().objects.filter(is_superuser=True, is_active=True).exclude(pk=user.pk).exists():
            raise ValidationError("Keep at least one active superuser.")
        profile, _ = UserProfile.objects.get_or_create(user=user)
        if profile.deleted_at:
            return Response(status=204)
        protect_shop_owners(user)
        user.is_active = False
        user.save(update_fields=["is_active"])
        Membership.objects.filter(user=user).update(active=False)
        profile.deleted_at = timezone.now()
        profile.save(update_fields=["deleted_at"])
        audit(None, request.user, "platform.user.deleted", user.pk, {"username": user.username})
        return Response(status=204)

    @transaction.atomic
    def patch(self, request, user_id):
        # Serialize privileged-account changes to protect the last active superuser.
        list(get_user_model().objects.select_for_update().filter(is_superuser=True).order_by("pk"))
        user = get_object_or_404(get_user_model().objects.select_for_update().exclude(pk__in=UserProfile.objects.filter(deleted_at__isnull=False).values("user_id")), pk=user_id)
        data = valid(UserInput, request.data)
        privileged = user.is_staff or user.is_superuser or user.has_perm("common.manage_platform")
        if not request.user.is_superuser and (privileged or "platform_admin" in data):
            raise PermissionDenied("Only a superuser can change administrator accounts.")
        protected_fields = {"password", "username", "email", "is_superuser", "is_staff", "groups", "user_permissions"} & request.data.keys()
        if protected_fields:
            raise ValidationError({key: "Account credentials and sign-in identity are managed by the account holder." for key in protected_fields})
        if user.pk == request.user.pk and (data.get("is_active") is False or data.get("platform_admin") is False):
            raise ValidationError("You cannot remove your own administrative access.")
        if user.is_superuser and data.get("platform_admin") is False:
            raise ValidationError("Superuser privileges must be managed through Django Admin.")
        if user.is_superuser and data.get("is_active") is False and not get_user_model().objects.filter(is_superuser=True, is_active=True).exclude(pk=user.pk).exists():
            raise ValidationError("Keep at least one active superuser.")
        if data.get("is_active") is False:
            protect_shop_owners(user)
        profile_data, access = pop_profile(data), data.pop("shop_access", [])
        before = user_data(user)
        grant = data.pop("platform_admin", None)
        for key, value in data.items():
            setattr(user, key, value)
        if grant is not None:
            user.is_staff = grant
            permission = Permission.objects.get(content_type__app_label="common", codename="manage_platform")
            if grant:
                user.user_permissions.add(permission)
            else:
                user.user_permissions.remove(permission)
        try:
            with transaction.atomic():
                user.save()
        except IntegrityError:
            raise ValidationError({"username": "Username is already in use."})
        save_user_details(user, profile_data, access, request.user)
        user = get_user_model().objects.get(pk=user.pk)
        audit(None, request.user, "platform.user.updated", user.pk, {"before": before, "after": user_data(user)})
        return Response(user_data(user))


class AccessInput(serializers.Serializer):
    username = serializers.CharField(max_length=150, required=False)
    branch = serializers.IntegerField(min_value=1, required=False)
    role = serializers.ChoiceField(choices=["owner", "manager", "cashier"], required=False)
    active = serializers.BooleanField(required=False)


def membership_data(m):
    profile = getattr(m.user, "profile", None)
    return {"first_name": m.user.first_name, "last_name": m.user.last_name, "photo": profile.photo if profile else "", "id": m.pk, "username": m.user.username, "branch": m.branch_id, "role": m.role, "active": m.active}


class AccessView(PlatformView):
    @transaction.atomic
    def delete(self, request, business_id, membership_id):
        business = get_object_or_404(Business.objects.select_for_update(), pk=business_id, deleted_at__isnull=True)
        m = get_object_or_404(Membership, pk=membership_id, business=business)
        if m.role == "owner" and m.active and not Membership.objects.filter(business=business, role="owner", active=True, user__is_active=True).exclude(pk=m.pk).exists():
            raise ValidationError("Assign another active owner before removing this owner.")
        audit(business, request.user, "platform.access.deleted", m.pk, membership_data(m))
        m.delete()
        return Response(status=204)

    def get(self, request, business_id):
        business = get_object_or_404(Business, pk=business_id, deleted_at__isnull=True)
        return page_response(request, Membership.objects.filter(business=business).select_related("user").order_by("pk"), membership_data)

    @transaction.atomic
    def post(self, request, business_id):
        business = get_object_or_404(Business.objects.select_for_update(), pk=business_id, deleted_at__isnull=True)
        data = valid(AccessInput, request.data)
        if not all(key in data for key in ("username", "branch", "role")):
            raise ValidationError("Username, role and branch are required.")
        user = get_object_or_404(get_user_model(), username=data["username"], is_active=True)
        branch = get_object_or_404(Branch, business=business, pk=data["branch"])
        try:
            with transaction.atomic():
                m = Membership.objects.create(user=user, business=business, branch=branch, role=data["role"], active=data.get("active", True))
        except IntegrityError:
            raise ValidationError("This account already has access. Edit its existing membership.")
        audit(business, request.user, "platform.access.created", m.pk, membership_data(m))
        return Response(membership_data(m), status=201)

    @transaction.atomic
    def patch(self, request, business_id, membership_id):
        business = get_object_or_404(Business.objects.select_for_update(), pk=business_id, deleted_at__isnull=True)
        m = get_object_or_404(Membership, pk=membership_id, business=business)
        data = valid(AccessInput, request.data)
        if "username" in data:
            raise ValidationError("Membership identity cannot be changed.")
        before = membership_data(m)
        if (
            (m.role == "owner" and m.active and (data.get("role", m.role) != "owner" or data.get("active") is False))
            and (not Membership.objects.filter(business=business, role="owner", active=True, user__is_active=True).exclude(pk=m.pk).exists())
        ):
            raise ValidationError("Assign another active owner before removing this owner.")
        if "branch" in data:
            m.branch = get_object_or_404(Branch, business=business, pk=data["branch"])
        m.role, m.active = data.get("role", m.role), data.get("active", m.active)
        m.save()
        audit(business, request.user, "platform.access.updated", m.pk, {"before": before, "after": membership_data(m)})
        return Response(membership_data(m))


class PlatformContext:
    permission_classes: ClassVar[list] = [PlatformPermission]
    pagination_class = PlatformPagination

    def initial(self, request, *args, **kwargs):
        APIView.initial(self, request, *args, **kwargs)
        self.membership = context(request, kwargs["business_id"], kwargs["branch_id"])


class ProductsView(PlatformContext, ProductViewSet):
    @action(detail=False, methods=["post"], url_path="variant-set")
    def variant_set(self, request, business_id=None, branch_id=None):
        return super().variant_set(request, business_id=business_id)


class CategoriesView(PlatformContext, CategoryViewSet):
    http_method_names = ("get", "post", "patch", "delete", "head", "options")

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        lock_business(self.membership.business)
        category = self.get_object()
        identifier = category.pk
        try:
            category.delete()
        except ProtectedError:
            raise ValidationError("Move products out of this category before deleting it.")
        audit(self.membership.business, request.user, "platform.category.deleted", identifier)
        return Response(status=204)


class UserPhotoView(ImageUploadView):
    permission_classes: ClassVar[list] = [PlatformPermission]

    def storage_context(self, request, **kwargs):
        return f"profiles/{request.user.pk}", None


class ImagesView(ImageUploadView):
    permission_classes: ClassVar[list] = [PlatformPermission]

    def get_membership(self, request, business_id):
        business = get_object_or_404(Business, pk=business_id, deleted_at__isnull=True)
        branch = business.branch_set.order_by("pk").first()
        if not branch:
            raise ValidationError("Create a branch first.")
        return context(request, business_id, branch.pk)


class RecordsView(PlatformView):
    def get(self, request, business_id, branch_id, resource):
        m = context(request, business_id, branch_id)
        if resource == "orders":
            rows = Order.objects.filter(business=m.business, branch=m.branch).order_by("-pk")
            if request.query_params.get("status"):
                rows = rows.filter(status=request.query_params["status"])
            return page_response(request, rows, lambda row: OrderSerializer(row).data)
        if resource == "sales":
            rows = Sale.objects.filter(business=m.business, branch=m.branch).select_related("payment").prefetch_related("lines", "allocations").order_by("-pk")
            return page_response(request, rows, lambda row: {**SaleSerializer(row).data, "returned": list(row.returns.values("id", "amount", "reason", "method", "reference"))})
        if resource == "stock":
            rows = Stock.objects.filter(branch=m.branch, product__business=m.business).select_related("product").order_by("product__name")
            return page_response(request, rows, lambda row: {"id": row.pk, "product": row.product_id, "name": row.product.name, "quantity": row.quantity, "reserved": row.reserved})
        if resource == "movements":
            rows = Movement.objects.filter(business=m.business, stock__branch=m.branch).order_by("-pk").values("id", "stock__product__name", "delta", "reason", "created_at")
            return page_response(request, rows)
        raise ValidationError("Unknown record collection.")


class StockView(PlatformView):
    def post(self, request, business_id, branch_id):
        m = context(request, business_id, branch_id)
        stock = change_stock(m, valid(StockInput, request.data))
        return Response({"quantity": stock.quantity, "reserved": stock.reserved})


class OrderView(PlatformView):
    def post(self, request, business_id, branch_id, order_id):
        m = context(request, business_id, branch_id)
        return Response(OrderSerializer(transition_order(m, order_id, valid(TransitionInput, request.data))).data)


class ReturnView(PlatformView):
    def post(self, request, business_id, branch_id, sale_id):
        return Response(return_sale(context(request, business_id, branch_id), sale_id, valid(ReturnInput, request.data)))


class SettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformSettings
        fields: ClassVar[list] = ["name", "support_email", "notice", "orders_enabled", "shop_registration_enabled"]


class SettingsView(PlatformView):
    def get(self, request):
        return Response(SettingsSerializer(PlatformSettings.current()).data)

    @transaction.atomic
    def patch(self, request):
        obj = PlatformSettings.current()
        obj = PlatformSettings.objects.select_for_update().get(pk=obj.pk)
        before = SettingsSerializer(obj).data
        serializer = SettingsSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        audit(None, request.user, "platform.settings.updated", obj.pk, {"before": before, "after": serializer.data})
        return Response(serializer.data)


class PublicSettingsView(APIView):
    permission_classes: ClassVar[list] = [AllowAny]
    authentication_classes: ClassVar[list] = []

    def get(self, request):
        return Response(SettingsSerializer(PlatformSettings.current()).data)


class ReportsView(PlatformView):
    def get(self, request):
        start = request.query_params.get("from", timezone.localdate().replace(day=1).isoformat())
        end = request.query_params.get("to", timezone.localdate().isoformat())
        try:
            start, end = date.fromisoformat(start), date.fromisoformat(end)
            if start > end or (end - start).days > 366:
                raise ValueError()
        except ValueError:
            raise ValidationError("Choose a date range of at most 366 days.")
        sales = Sale.objects.filter(occurred_at__date__range=(start, end))
        refunds = SaleReturn.objects.filter(created_at__date__range=(start, end))
        totals = {row["currency"]: {"currency": row["currency"], "sales": row["total"], "transactions": row["count"], "refunds": 0}
                  for row in sales.values("currency").annotate(total=Sum("total"), count=Count("pk"))}
        for row in refunds.values("sale__currency").annotate(total=Sum("amount")):
            item = totals.setdefault(row["sale__currency"], {"currency": row["sale__currency"], "sales": 0, "transactions": 0, "refunds": 0})
            item["refunds"] = row["total"]
        return Response({"from": start, "to": end, "timezone": "UTC", "shops": Business.objects.filter(deleted_at__isnull=True).count(),
                         "suspended_shops": Business.objects.filter(suspended=True, deleted_at__isnull=True).count(),
                         "users": get_user_model().objects.count(),
                         "pending_orders": Order.objects.filter(status="pending").count(),
                         "totals": [{**row, "net": row["sales"] - row["refunds"]} for row in totals.values()]})


class AuditView(PlatformView):
    def get(self, request):
        rows = Audit.objects.select_related("actor", "business").order_by("-pk")
        query = request.query_params.get("q", "").strip()[:120]
        if query:
            rows = rows.filter(Q(action__icontains=query) | Q(actor__username__icontains=query) | Q(business__name__icontains=query))
        return page_response(request, rows, lambda row: {"id": row.pk, "actor": row.actor.username if row.actor else "System",
            "shop": row.business.name if row.business else "Platform", "action": row.action,
            "reference": row.reference, "detail": row.detail, "created_at": row.created_at})
