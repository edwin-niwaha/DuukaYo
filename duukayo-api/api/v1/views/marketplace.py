import secrets
from typing import ClassVar

from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.marketplace_serializers import (
    AddressSerializer,
    CartCreateInput,
    CartInput,
    CheckoutInput,
    MergeInput,
    QuoteInput,
)
from api.v1.serializers import valid
from apps.catalog.models import Product
from apps.customers.models import Address
from apps.orders.marketplace import (
    authorized_cart,
    checkout_cart,
    checkout_result,
    create_quote,
    token_hash,
)
from apps.orders.models import Cart, CartLine, MarketplaceCheckout


def cart_result(cart):
    return {
        "id": cart.pk,
        "lines": [
            {
                "product": x.product_id,
                "name": x.product.order_name,
                "quantity": x.quantity,
                "price": x.product.price,
                "currency": x.product.business.currency,
                "shop": x.product.business.name,
                "slug": x.product.business.slug,
                "image": x.product.image,
                "available": x.product.active
                and x.product.published
                and x.product.business.published and not x.product.business.suspended,
                "shop_suspended": x.product.business.suspended,
            }
            for x in cart.items.select_related("product__business").order_by(
                "product_id"
            )
        ],
    }


class CartsView(APIView):
    permission_classes: ClassVar[list] = [AllowAny]

    @extend_schema(request=CartCreateInput, responses={201: dict})
    def post(self, request):
        data = valid(CartCreateInput, request.data)
        token = secrets.token_urlsafe(32)
        cart = Cart.objects.create(
            user=request.user if request.user.is_authenticated and not data["guest"] else None,
            token_hash=token_hash(token),
        )
        return Response({"id": cart.pk, "token": token, "lines": []}, status=201)


class MyCartView(APIView):
    """One stable account cart, serialized against concurrent first visits."""

    @transaction.atomic
    def get(self, request):
        get_user_model().objects.select_for_update().get(pk=request.user.pk)
        cart, _ = Cart.objects.get_or_create(user=request.user, token_hash=token_hash(f"account-cart:{request.user.pk}"))
        return Response(cart_result(cart))


class CartView(APIView):
    permission_classes: ClassVar[list] = [AllowAny]

    @extend_schema(responses={200: dict})
    def get(self, request, cart_id):
        return Response(cart_result(authorized_cart(request, cart_id)))

    @extend_schema(request=CartInput, responses={200: dict})
    @transaction.atomic
    def put(self, request, cart_id):
        cart = authorized_cart(request, cart_id, lock=True)
        data = valid(CartInput, request.data)
        products = Product.objects.filter(
            pk__in=[x["product"] for x in data["lines"]],
            active=True,
            published=True,
            business__published=True,
            business__suspended=False,
        )
        if products.count() != len(data["lines"]):
            raise ValidationError("A product is no longer available.")
        cart.items.all().delete()
        CartLine.objects.bulk_create(
            [
                CartLine(cart=cart, product_id=x["product"], quantity=x["quantity"])
                for x in data["lines"]
            ]
        )
        cart.save(update_fields=["updated_at"])
        return Response(cart_result(cart))


class MergeCartView(APIView):
    @extend_schema(request=MergeInput, responses={200: dict})
    @transaction.atomic
    def post(self, request, cart_id):
        data = valid(MergeInput, request.data)
        list(
            Cart.objects.select_for_update()
            .filter(pk__in=[cart_id, data["source"]])
            .order_by("pk")
        )
        target = authorized_cart(request, cart_id)
        if target.user_id != request.user.pk or cart_id == data["source"]:
            raise ValidationError(
                "Choose your account cart and a different guest cart."
            )
        source = get_object_or_404(Cart, pk=data["source"])
        if not secrets.compare_digest(source.token_hash, token_hash(data["token"])):
            raise NotFound()
        if source.user_id:
            # A lost merge response can be retried without adding quantities twice.
            if source.user_id == request.user.pk and not source.items.exists():
                return Response(cart_result(target))
            raise NotFound()
        lines = {x.product_id: x.quantity for x in target.items.all()}
        for line in source.items.all():
            lines[line.product_id] = lines.get(line.product_id, 0) + line.quantity
        if len(lines) > 200 or any(q > 10000 for q in lines.values()):
            raise ValidationError("Merged cart exceeds the supported item limits.")
        for product_id, quantity in lines.items():
            CartLine.objects.update_or_create(
                cart=target, product_id=product_id, defaults={"quantity": quantity}
            )
        source.items.all().delete()
        source.user = request.user
        source.save(update_fields=["user", "updated_at"])
        return Response(cart_result(target))


class QuotesView(APIView):
    permission_classes: ClassVar[list] = [AllowAny]

    @extend_schema(request=QuoteInput, responses={201: dict})
    def post(self, request, cart_id):
        quote = create_quote(request, cart_id, valid(QuoteInput, request.data))
        return Response(
            {"id": quote.pk, "expires_at": quote.expires_at, **quote.snapshot},
            status=201,
        )


class MarketplaceCheckoutView(APIView):
    permission_classes: ClassVar[list] = [AllowAny]

    @extend_schema(request=CheckoutInput, responses={200: dict})
    def post(self, request, cart_id):
        return Response(
            checkout_cart(request, cart_id, valid(CheckoutInput, request.data))
        )


class MyOrdersView(APIView):
    @extend_schema(responses={200: dict})
    def get(self, request):
        orders = MarketplaceCheckout.objects.filter(cart__user=request.user).order_by(
            "-pk"
        )[:100]
        return Response([checkout_result(order) for order in orders])


class AddressesView(APIView):
    @extend_schema(responses=AddressSerializer(many=True))
    def get(self, request):
        return Response(
            AddressSerializer(Address.objects.filter(user=request.user), many=True).data
        )

    @extend_schema(request=AddressSerializer, responses=AddressSerializer)
    def post(self, request):
        if Address.objects.filter(user=request.user).count() >= 20:
            raise ValidationError("You can save up to 20 addresses.")
        serializer = AddressSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response(serializer.data, status=201)


class AddressView(APIView):
    @extend_schema(request=AddressSerializer, responses=AddressSerializer)
    def patch(self, request, address_id):
        serializer = AddressSerializer(
            get_object_or_404(Address, pk=address_id, user=request.user),
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @extend_schema(responses={204: None})
    def delete(self, request, address_id):
        get_object_or_404(Address, pk=address_id, user=request.user).delete()
        return Response(status=204)
