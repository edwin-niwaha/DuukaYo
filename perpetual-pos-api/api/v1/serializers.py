from apps.businesses.models import Business
from apps.catalog.models import Category, Product
from apps.customers.models import Customer
from apps.orders.models import Order
from apps.payments.models import Payment
from apps.sales.models import Sale, SaleLine
from rest_framework import serializers


class BusinessSerializer(serializers.ModelSerializer):
    delivery_fee = serializers.IntegerField(
        min_value=0, max_value=100000000000, required=False
    )

    class Meta:
        model = Business
        fields = [
            "id",
            "name",
            "slug",
            "logo",
            "currency",
            "timezone",
            "contact",
            "delivery_enabled",
            "delivery_fee",
            "safety_buffer",
        ]
        read_only_fields = ["id", "currency"]

    def validate_timezone(self, value):
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise serializers.ValidationError("Unknown timezone")
        return value


class ProductSerializer(serializers.ModelSerializer):
    price = serializers.IntegerField(min_value=0, max_value=100000000000)
    cost = serializers.IntegerField(min_value=0, max_value=100000000000)
    quantity = serializers.IntegerField(read_only=True, default=0)
    reserved = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Product
        fields = [
            "id",
            "category",
            "name",
            "sku",
            "barcode",
            "price",
            "cost",
            "image",
            "published",
            "active",
            "low_stock_threshold",
            "quantity",
            "reserved",
            "updated_at",
        ]

    def validate_category(self, value):
        if value and value.business_id != self.context["business"].pk:
            raise serializers.ValidationError("Category belongs to another business.")
        return value


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name"]


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["id", "name", "phone"]


class LineInput(serializers.Serializer):
    product = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=10000)
    price = serializers.IntegerField(
        min_value=0, max_value=100000000000, required=False
    )
    discount = serializers.IntegerField(min_value=0, max_value=100000000000, default=0)
    cost = serializers.IntegerField(min_value=0, max_value=100000000000, required=False)


class LinesInput(serializers.Serializer):
    client_id = serializers.UUIDField()
    lines = LineInput(many=True, allow_empty=False, max_length=200)

    def validate_lines(self, value):
        ids = [x["product"] for x in value]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError(
                "Combine duplicate products into one line."
            )
        return value


class SaleInput(LinesInput):
    branch = serializers.IntegerField(required=False)
    customer = serializers.IntegerField(required=False, allow_null=True)
    method = serializers.ChoiceField(choices=["cash", "manual_mtn", "manual_airtel"])
    tendered = serializers.IntegerField(min_value=0, max_value=1000000000000000)
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True)
    offline = serializers.BooleanField(default=False)
    occurred_at = serializers.DateTimeField(required=False)

    def validate(self, data):
        if any("price" not in line for line in data["lines"]):
            raise serializers.ValidationError(
                "Every sale line requires its observed price."
            )
        if data["offline"] and "occurred_at" not in data:
            raise serializers.ValidationError("Offline sales require occurred_at.")
        return data


class OrderInput(LinesInput):
    name = serializers.CharField(max_length=100)
    phone = serializers.RegexField(r"^\+?[0-9 ()-]{7,25}$")
    delivery = serializers.BooleanField(default=False)
    address = serializers.CharField(max_length=250, allow_blank=True, required=False)

    def validate_lines(self, value):
        value = super().validate_lines(value)
        if any(x["discount"] for x in value):
            raise serializers.ValidationError("Storefront discounts are unavailable.")
        return value


class StockInput(serializers.Serializer):
    client_id = serializers.UUIDField()
    product = serializers.IntegerField(min_value=1)
    delta = serializers.IntegerField(min_value=-10000000, max_value=10000000)
    kind = serializers.ChoiceField(choices=["opening", "receipt", "adjustment"])
    reason = serializers.CharField(min_length=3, max_length=200)


class TransitionInput(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=["accepted", "preparing", "ready", "completed", "cancelled"]
    )
    method = serializers.ChoiceField(
        choices=["cash", "manual_mtn", "manual_airtel"], required=False
    )
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True)


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = [
            "method",
            "amount",
            "tendered",
            "change",
            "provider_verified",
            "reference",
        ]


class SaleLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleLine
        fields = [
            "product",
            "name",
            "quantity",
            "price",
            "cost",
            "discount",
            "currency",
        ]


class SaleSerializer(serializers.ModelSerializer):
    lines = SaleLineSerializer(many=True)
    payment = PaymentSerializer()

    class Meta:
        model = Sale
        fields = [
            "id",
            "client_id",
            "branch",
            "customer",
            "total",
            "delivery_fee",
            "currency",
            "offline",
            "review_reasons",
            "occurred_at",
            "created_at",
            "lines",
            "payment",
        ]


class OrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = [
            "id",
            "name",
            "phone",
            "delivery",
            "address",
            "delivery_fee",
            "currency",
            "total",
            "lines",
            "status",
            "payment_state",
            "expires_at",
            "created_at",
            "sale",
        ]


class RegisterInput(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True)
    username = serializers.RegexField(r"^[a-zA-Z0-9@.+_-]{3,150}$")
    password = serializers.CharField(min_length=10, write_only=True)
    name = serializers.CharField(max_length=120)
    slug = serializers.SlugField(max_length=50)


class LoginInput(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class StaffInput(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True)
    username = serializers.RegexField(r"^[a-zA-Z0-9@.+_-]{3,150}$")
    password = serializers.CharField(min_length=10, write_only=True)
    role = serializers.ChoiceField(choices=["manager", "cashier"])


class DeviceInput(serializers.Serializer):
    token = serializers.CharField(max_length=512)
    pending_sales = serializers.IntegerField(min_value=0, max_value=100000)


def valid(serializer, data, **kwargs):
    result = serializer(data=data, **kwargs)
    result.is_valid(raise_exception=True)
    return result.validated_data


class GoogleInput(serializers.Serializer):
    id_token = serializers.CharField(max_length=10000, write_only=True)


class CreateBusinessInput(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    slug = serializers.SlugField(max_length=50)
