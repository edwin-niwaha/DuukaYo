from django.contrib.auth import get_user_model
from django.db import DatabaseError, IntegrityError, connection, transaction
from django.db.models import OuterRef, Q, Subquery, Value
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
    OrderConfirmationSerializer,
    OrderInput,
    OrderSerializer,
    ProductSerializer,
    SaleInput,
    SaleSerializer,
    ShopCatalogSerializer,
    ShopDirectorySerializer,
    StaffInput,
    StockInput,
    TransitionInput,
    VariantSetSerializer,
    valid,
)
from apps.businesses.models import Branch, Business, Membership
from apps.catalog.models import Category, Product
from apps.catalog.visibility import orderable, visible_products
from apps.common.pagination import OptionalPagination, collection_response
from apps.common.services import (
    audit,
    change_stock,
    checkout,
    expire_for_business,
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


class TenantMixin:
    pagination_class = OptionalPagination
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
    http_method_names = ("get", "post", "patch", "delete", "head", "options")

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        lock_business(self.membership.business)
        return super().create(request, *args, **kwargs)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        lock_business(self.membership.business)
        return super().update(request, *args, **kwargs)

    @extend_schema(request=VariantSetSerializer, responses=VariantSetSerializer)
    @action(detail=False, methods=["post"], url_path="variant-set")
    @transaction.atomic
    def variant_set(self, request, business_id=None):
        """Save a bounded set atomically; a bad row leaves the whole set unchanged."""
        lock_business(self.membership.business)
        rows = request.data.get("products") if isinstance(request.data, dict) else None
        if not isinstance(rows, list) or not 1 <= len(rows) <= 100:
            raise ValidationError({"products": "Save between 1 and 100 variants at a time."})
        ids = [row.get("id") for row in rows if isinstance(row, dict) and row.get("id") is not None]
        if len(ids) != len(set(map(str, ids))):
            raise ValidationError({"products": "Each existing variant may appear only once."})
        if any(not isinstance(identifier, int) or isinstance(identifier, bool) or identifier < 1 for identifier in ids):
            raise ValidationError({"products": "Existing product IDs must be positive integers."})
        result = []
        for position, row in enumerate(rows):
            if not isinstance(row, dict):
                raise ValidationError({"products": f"Variant {position + 1} is invalid."})
            instance = get_object_or_404(self.get_queryset(), pk=row["id"]) if row.get("id") else None
            serializer = self.get_serializer(instance, data=row, partial=bool(instance))
            if not serializer.is_valid():
                raise ValidationError({"products": {str(position + 1): serializer.errors}})
            if instance:
                self.perform_update(serializer)
            else:
                self.perform_create(serializer)
            result.append(serializer.data)
        return Response({"products": result})

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        from django.db.models.deletion import ProtectedError
        lock_business(self.membership.business)
        product = self.get_object()
        # Even zero stock can have an inventory ledger. Preserve its references.
        if Stock.objects.filter(product=product).exists():
            raise ValidationError({"detail": "This product has inventory records. Archive it instead."})
        identifier = product.pk
        try:
            product.delete()
        except ProtectedError:
            raise ValidationError({"detail": "This product is used by carts or transactions. Archive it instead."})
        audit(self.membership.business, request.user, "catalog.deleted", identifier)
        return Response(status=204)

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Product.objects.none()
        stock = Stock.objects.filter(
            branch=self.membership.branch, product=OuterRef("pk")
        )
        query = self.request.query_params.get("q", "").strip()[:120]
        products = Product.objects.filter(business=self.membership.business)
        if query:
            products = products.filter(Q(name__icontains=query) | Q(sku__icontains=query) | Q(barcode__icontains=query))
        category = self.request.query_params.get("category")
        if category:
            try:
                products = products.filter(category_id=int(category))
            except (ValueError, OverflowError):
                raise ValidationError({"category": "Use a numeric category ID."})
        return (
            products.select_related("category")
            .annotate(
                quantity=Coalesce(Subquery(stock.values("quantity")[:1]), Value(0)),
                reserved=Coalesce(Subquery(stock.values("reserved")[:1]), Value(0)),
            )
            .order_by("name")
        )


class CategoryViewSet(TenantMixin, viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    http_method_names = ("get", "post", "patch", "head", "options")

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Category.objects.none()
        return Category.objects.filter(business=self.membership.business).order_by(
            "name"
        )


class CustomerViewSet(TenantMixin, viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    http_method_names = ("get", "post", "patch", "head", "options")

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
                    customer=self.get_object(), business=self.membership.business, branch=self.membership.branch
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
                    "id", "user__username", "role", "active", "branch"
                )
            )
        )

    @extend_schema(request=StaffInput)
    @transaction.atomic
    def post(self, request, business_id):
        m = membership(request.user, business_id, ["owner"])
        lock_business(m.business)
        data = valid(StaffInput, request.data)
        branch = get_object_or_404(Branch, business=m.business, pk=data.get("branch", m.branch_id))
        user = get_object_or_404(get_user_model(), username=data["username"], is_active=True)
        if Membership.objects.filter(user=user, business=m.business).exists():
            raise ValidationError("This account already has a membership. Update its existing access instead.")
        try:
            with transaction.atomic():
                staff = Membership.objects.create(user=user, business=m.business, branch=branch, role=data["role"])
        except IntegrityError:
            raise ValidationError("Membership is already in use.")
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
        rows = Sale.objects.filter(business=m.business, branch=m.branch).select_related("payment").prefetch_related("lines", "allocations").order_by("-created_at", "-pk")
        return collection_response(rows, request, SaleSerializer, legacy_limit=300)

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
        rows = Order.objects.filter(business=m.business, branch=m.branch).order_by("-created_at", "-pk")
        status = request.query_params.get("status")
        if status:
            if status not in ("pending", "accepted", "preparing", "ready", "completed", "cancelled"):
                raise ValidationError({"status": "Unknown order status."})
            rows = rows.filter(status=status)
        return collection_response(rows, request, OrderSerializer, legacy_limit=300)


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
        try:
            with transaction.atomic():
                device, _created = Device.objects.get_or_create(
                    token=data["token"], defaults={"membership": m, "pending_sales": data["pending_sales"]})
                device = Device.objects.select_for_update().get(pk=device.pk)
                if device.membership_id != m.pk:
                    raise ValidationError("Device is registered to another membership.")
                device.pending_sales = data["pending_sales"]
                device.save(update_fields=["pending_sales", "updated_at"])
        except IntegrityError:
            raise ValidationError("Device registration conflicted; retry the request.")
        return Response({"ok": True})


@extend_schema(responses={200: ShopDirectorySerializer})
class ShopsView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def get(self, request):
        # Page shops before loading previews; never prefetch the entire marketplace.
        query = request.query_params.get("q", "").strip()[:120]
        try:
            page = int(request.query_params.get("page", 1))
            if not 1 <= page <= 100000:
                raise ValueError
        except ValueError:
            raise ValidationError("Invalid page.")
        filters = Q(published=True, suspended=False, branch__isnull=False)
        if query:
            # Search only public products; an empty published shop still appears by name.
            matches = Product.objects.filter(visible_products()).filter(
                Q(name__icontains=query) | Q(category__name__icontains=query)
            ).values("business_id")
            filters &= Q(name__icontains=query) | Q(pk__in=matches)
        stores = Business.objects.filter(filters).distinct().order_by("name", "pk")
        count = stores.count()
        results = []
        for store in stores.select_related("storefront_branch")[(page - 1) * 24:page * 24]:
            public = Product.objects.filter(visible_products(), business=store)
            ordered = public.select_related("category").order_by("-updated_at", "pk")
            matches = list(ordered.filter(Q(name__icontains=query) | Q(category__name__icontains=query))[:4]) if query else []
            products = matches or list(ordered[:4])
            stocks = {s.product_id: s for s in Stock.objects.filter(branch=store.online_branch(), product__in=products)}
            results.append({
                "name": store.name, "slug": store.slug, "logo": store.logo,
                "description": store.description, "website": store.website,
                "currency": store.currency, "contact": store.contact,
                "delivery_enabled": store.delivery_enabled, "delivery_fee": store.delivery_fee,
                "product_count": public.count(),
                "categories": list(Category.objects.filter(product__in=public).order_by("name").values_list("name", flat=True).distinct()),
                "preview_products": [{
                    "id": p.pk, "name": p.name, "image": p.image, "price": p.price,
                    "available": max(0, stocks[p.pk].quantity - stocks[p.pk].reserved - store.safety_buffer) if p.pk in stocks and orderable(p) else 0,
                    "preview": not orderable(p),
                } for p in products],
            })
        return Response({"shops": results, "count": count, "next_page": page + 1 if page * 24 < count else None})


@extend_schema(responses={200: ShopCatalogSerializer})
class ShopView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    @transaction.atomic
    def get(self, request, slug):
        b = get_object_or_404(Business.objects.select_for_update(), slug=slug, published=True, suspended=False)
        expire_for_business(b)
        products = []
        branch = b.online_branch()
        stocks = {s.product_id: s for s in Stock.objects.filter(branch=branch)}
        for p in (
            Product.objects.filter(visible_products(), business=b)
            .select_related("category")
            .order_by("name")
        ):
            stock = stocks.get(p.pk)
            available = (
                max(0, stock.quantity - stock.reserved - b.safety_buffer)
                if stock and orderable(p)
                else 0
            )
            products.append(
                {
                    "id": p.pk,
                    "name": p.name,
                    "price": p.price,
                    "image": p.image,
                    "description": p.description,
                    "gallery": p.gallery,
                    "variant_group": p.variant_group,
                    "attributes": p.attributes,
                    "available": available,
                    "preview": not orderable(p),
                    "category": p.category_id,
                    "category_name": p.category.name
                    if p.category
                    else "Other essentials",
                }
            )
        return Response(
            {
                "shop": {
                    "description": b.description, "website": b.website,
                    "name": b.name,
                    "slug": b.slug,
                    "logo": b.logo,
                    "contact": b.contact,
                    "currency": b.currency,
                    "delivery_enabled": b.delivery_enabled,
                    "delivery_fee": b.delivery_fee,
                },
                "products": products,
                "categories": list(
                    Category.objects.filter(
                        visible_products("product__"), business=b
                    )
                    .distinct()
                    .order_by("name")
                    .values("id", "name")
                ),
                "availability_notice": "Availability is provisional while POS devices are offline. The shop confirms every order.",
            }
        )

    @extend_schema(request=OrderInput, responses={201: OrderConfirmationSerializer})
    def post(self, request, slug):
        order = place_order(
            get_object_or_404(Business, slug=slug), valid(OrderInput, request.data)
        )
        return Response({"token": order.token, "id": order.pk}, status=201)


@method_decorator(never_cache, name="dispatch")
@extend_schema(responses={200: dict})
class GuestOrderView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    @transaction.atomic
    def get(self, request, token):
        order = get_object_or_404(Order, token=token)
        lock_business(order.business)
        expire_for_business(order.business)
        order.refresh_from_db()
        return Response(
            {
                "id": order.pk,
                "shop": order.business.name,
                "shop_slug": order.business.slug,
                "contact": order.business.contact,
                "delivery": order.delivery,
                "created_at": order.created_at,
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
