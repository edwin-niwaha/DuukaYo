from apps.businesses.models import Business, Membership
from apps.catalog.models import Category, Product
from apps.common.services import (
    audit,
    change_stock,
    checkout,
    lock_business,
    membership,
    place_order,
    transition_order,
)
from apps.customers.models import Customer
from apps.inventory.models import Movement, Stock
from apps.notifications.models import Device
from apps.orders.models import Order
from apps.sales.models import Sale
from django.contrib.auth import get_user_model
from django.db import DatabaseError, IntegrityError, connection, transaction
from django.db.models import OuterRef, Subquery, Value
from django.db.models.functions import Coalesce
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.serializers import (
    BusinessSerializer,
    CategorySerializer,
    CustomerSerializer,
    DeviceInput,
    OrderInput,
    OrderSerializer,
    ProductSerializer,
    SaleInput,
    SaleSerializer,
    StaffInput,
    StockInput,
    TransitionInput,
    valid,
)
from api.v1.views.auth import password_ok


class TenantMixin:
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.membership = membership(request.user, kwargs["business_id"])
        if request.method not in ("GET", "HEAD", "OPTIONS") and isinstance(
            self, (ProductViewSet, CategoryViewSet)
        ):
            membership(request.user, kwargs["business_id"], ["owner", "manager"])

    def get_serializer_context(self):
        return {
            **super().get_serializer_context(),
            "business": self.membership.business,
        }

    def perform_create(self, serializer):
        try:
            with transaction.atomic():
                lock_business(self.membership.business)
                obj = serializer.save(business=self.membership.business)
                audit(
                    self.membership.business,
                    self.request.user,
                    "catalog.created",
                    obj.pk,
                )
        except IntegrityError:
            raise ValidationError("A record with these details already exists.")

    def perform_update(self, serializer):
        try:
            with transaction.atomic():
                lock_business(self.membership.business)
                obj = serializer.save()
                audit(
                    self.membership.business,
                    self.request.user,
                    "catalog.updated",
                    obj.pk,
                )
        except IntegrityError:
            raise ValidationError("A record with these details already exists.")


class ProductViewSet(TenantMixin, viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Product.objects.none()
        stock = Stock.objects.filter(
            branch=self.membership.branch, product=OuterRef("pk")
        )
        return (
            Product.objects.filter(business=self.membership.business)
            .annotate(
                quantity=Coalesce(Subquery(stock.values("quantity")[:1]), Value(0)),
                reserved=Coalesce(Subquery(stock.values("reserved")[:1]), Value(0)),
            )
            .order_by("name")
        )


class CategoryViewSet(TenantMixin, viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Category.objects.none()
        return Category.objects.filter(business=self.membership.business).order_by(
            "name"
        )


class CustomerViewSet(TenantMixin, viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Customer.objects.none()
        return Customer.objects.filter(business=self.membership.business).order_by(
            "name"
        )

    @action(detail=True, methods=["get"])
    def purchases(self, request, **kwargs):
        return Response(
            SaleSerializer(
                Sale.objects.filter(
                    customer=self.get_object(), business=self.membership.business
                ).order_by("-created_at"),
                many=True,
            ).data
        )


class BusinessView(APIView):
    @extend_schema(responses=BusinessSerializer)
    def get(self, request, business_id):
        return Response(
            BusinessSerializer(membership(request.user, business_id).business).data
        )

    @extend_schema(request=BusinessSerializer, responses=BusinessSerializer)
    @transaction.atomic
    def patch(self, request, business_id):
        m = membership(request.user, business_id, ["owner"])
        business = lock_business(m.business)
        s = BusinessSerializer(business, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        audit(business, request.user, "business.updated", business.pk)
        return Response(s.data)


@extend_schema(responses={200: dict})
class StaffView(APIView):
    def get(self, request, business_id):
        m = membership(request.user, business_id, ["owner"])
        return Response(
            list(
                Membership.objects.filter(business=m.business).values(
                    "id", "user__username", "role", "active"
                )
            )
        )

    @extend_schema(request=StaffInput)
    @transaction.atomic
    def post(self, request, business_id):
        m = membership(request.user, business_id, ["owner"])
        data = valid(StaffInput, request.data)
        if get_user_model().objects.filter(username=data["username"]).exists():
            raise ValidationError("Username is unavailable.")
        user = get_user_model()(
            username=data["username"], email=data.get("email", "").lower()
        )
        password_ok(data["password"], user)
        user.set_password(data["password"])
        user.save()
        staff = Membership.objects.create(
            user=user, business=m.business, branch=m.branch, role=data["role"]
        )
        audit(m.business, request.user, "staff.created", staff.pk)
        return Response({"id": staff.pk}, status=201)


@extend_schema(responses={200: dict})
class StockView(APIView):
    def get(self, request, business_id):
        m = membership(request.user, business_id)
        return Response(
            list(
                Movement.objects.filter(business=m.business, stock__branch=m.branch)
                .order_by("-created_at")
                .values(
                    "id",
                    "stock__product__name",
                    "delta",
                    "reason",
                    "reference",
                    "created_at",
                )[:500]
            )
        )

    @extend_schema(request=StockInput)
    def post(self, request, business_id):
        m = membership(request.user, business_id, ["owner", "manager"])
        stock = change_stock(m, valid(StockInput, request.data))
        return Response({"quantity": stock.quantity, "reserved": stock.reserved})


class SalesView(APIView):
    @extend_schema(responses=SaleSerializer(many=True))
    def get(self, request, business_id):
        m = membership(request.user, business_id)
        return Response(
            SaleSerializer(
                Sale.objects.filter(business=m.business, branch=m.branch).order_by(
                    "-created_at"
                )[:300],
                many=True,
            ).data
        )

    @extend_schema(request=SaleInput, responses=SaleSerializer)
    def post(self, request, business_id):
        m = membership(request.user, business_id)
        return Response(
            SaleSerializer(checkout(m, valid(SaleInput, request.data))).data, status=201
        )


class ReceiptView(APIView):
    @extend_schema(responses=SaleSerializer)
    def get(self, request, business_id, sale_id):
        m = membership(request.user, business_id)
        sale = get_object_or_404(Sale, business=m.business, branch=m.branch, pk=sale_id)
        return Response(SaleSerializer(sale).data)


class OrdersView(APIView):
    @extend_schema(responses=OrderSerializer(many=True))
    def get(self, request, business_id):
        m = membership(request.user, business_id)
        return Response(
            OrderSerializer(
                Order.objects.filter(business=m.business, branch=m.branch).order_by(
                    "-created_at"
                )[:300],
                many=True,
            ).data
        )


class OrderActionView(APIView):
    @extend_schema(request=TransitionInput, responses=OrderSerializer)
    def post(self, request, business_id, order_id):
        m = membership(request.user, business_id, ["owner", "manager"])
        return Response(
            OrderSerializer(
                transition_order(m, order_id, valid(TransitionInput, request.data))
            ).data
        )


@extend_schema(responses={200: dict})
class DeviceView(APIView):
    @extend_schema(request=DeviceInput)
    def post(self, request, business_id):
        m = membership(request.user, business_id)
        data = valid(DeviceInput, request.data)
        existing = Device.objects.filter(token=data["token"]).first()
        if existing and existing.membership_id != m.pk:
            raise ValidationError("Device is registered to another membership.")
        Device.objects.update_or_create(
            token=data["token"],
            defaults={"membership": m, "pending_sales": data["pending_sales"]},
        )
        return Response({"ok": True})


@extend_schema(responses={200: dict})
class ShopView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug):
        b = get_object_or_404(Business, slug=slug)
        products = []
        branch = b.branch_set.first()
        for p in Product.objects.filter(
            business=b, published=True, active=True
        ).order_by("name"):
            stock = Stock.objects.filter(branch=branch, product=p).first()
            available = (
                max(0, stock.quantity - stock.reserved - b.safety_buffer)
                if stock
                else 0
            )
            products.append(
                {
                    "id": p.pk,
                    "name": p.name,
                    "price": p.price,
                    "image": p.image,
                    "available": available,
                    "category": p.category_id,
                }
            )
        return Response(
            {
                "shop": {
                    "name": b.name,
                    "slug": b.slug,
                    "logo": b.logo,
                    "contact": b.contact,
                    "currency": b.currency,
                    "delivery_enabled": b.delivery_enabled,
                    "delivery_fee": b.delivery_fee,
                },
                "products": products,
                "availability_notice": "Availability is provisional while POS devices are offline. The shop confirms every order.",
            }
        )

    @extend_schema(request=OrderInput)
    def post(self, request, slug):
        order = place_order(
            get_object_or_404(Business, slug=slug), valid(OrderInput, request.data)
        )
        return Response({"token": order.token, "id": order.pk}, status=201)


@method_decorator(never_cache, name="dispatch")
@extend_schema(responses={200: dict})
class GuestOrderView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, token):
        order = get_object_or_404(Order, token=token)
        return Response(
            {
                "id": order.pk,
                "shop": order.business.name,
                "status": order.status,
                "payment_state": order.payment_state,
                "total": order.total,
                "currency": order.currency,
                "delivery_fee": order.delivery_fee,
                "expires_at": order.expires_at,
                "lines": [
                    {k: v for k, v in x.items() if k not in ("cost", "product")}
                    for x in order.lines
                ],
            }
        )


@extend_schema(responses={200: dict})
class ReportView(APIView):
    def get(self, request, business_id):
        from apps.reports.services import daily_report

        m = membership(request.user, business_id, ["owner", "manager"])
        return Response(daily_report(m, request.query_params.get("date")))


def health(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except DatabaseError:
        return JsonResponse(
            {"status": "unhealthy", "database": "unavailable"}, status=503
        )
    return JsonResponse({"status": "ok", "database": "ok"})
