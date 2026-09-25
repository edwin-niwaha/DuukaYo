from typing import ClassVar

from rest_framework import serializers

from apps.businesses.models import Business
from apps.catalog.models import Category, Product
from apps.common.validation import validate_phone
from apps.customers.models import Customer
from apps.orders.models import Order
from apps.payments.models import Payment, PaymentAllocation
from apps.sales.models import Sale, SaleLine


class BranchSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


def validate_tenant_image(value, business_id):
    from apps.common.media import validate_image_url
    validate_image_url(value)
    import posixpath
    import re
    from urllib.parse import unquote, urlparse
    path = posixpath.normpath(unquote(urlparse(value).path).replace("\\", "/"))
    match = re.search(r"/businesses/(\d+)/", path, re.IGNORECASE)
    if match and int(match.group(1)) != business_id:
        raise serializers.ValidationError("Choose an image uploaded for this shop.")
    return value


class BusinessSerializer(serializers.ModelSerializer):
    def validate_logo(self, value):
        return validate_tenant_image(value, self.instance.pk if self.instance else None)

    def validate(self, data):
        if data.get("published") and self.instance and not self.instance.online_branch():
            raise serializers.ValidationError({"published": "Add a fulfilment branch before publishing."})
        return data

    branches = BranchSummarySerializer(source="branch_set", many=True, read_only=True)

    def validate_storefront_branch(self, value):
        if value and (not self.instance or value.business_id != self.instance.pk):
            raise serializers.ValidationError("Choose a branch belonging to this business.")
        return value
    delivery_fee = serializers.IntegerField(
        min_value=0, max_value=100000000000, required=False
    )

    class Meta:
        model = Business
        fields: ClassVar[list] = [
            "id",
            "name",
            "slug",
            "logo",
            "description",
            "website",
            "published",
            "currency",
            "timezone",
            "contact",
            "delivery_enabled",
            "delivery_fee",
            "safety_buffer",
            "storefront_branch",
            "branches",
        ]
        read_only_fields: ClassVar[list] = ["id", "currency"]

    def validate_timezone(self, value):
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise serializers.ValidationError("Unknown timezone")
        return value


class ProductSerializer(serializers.ModelSerializer):
    gallery = serializers.ListField(child=serializers.URLField(max_length=500), max_length=8, required=False)
    attributes = serializers.DictField(child=serializers.CharField(max_length=100), required=False)

    def validate_gallery(self, value):
        return [validate_tenant_image(url, self.context["business"].pk) for url in value]

    def validate_attributes(self, value):
        if len(value) > 20 or any(len(key) > 60 for key in value):
            raise serializers.ValidationError("Use at most 20 attributes with names up to 60 characters.")
        cleaned = {key.strip(): text.strip() for key, text in value.items()}
        if any(not key or not text for key, text in cleaned.items()) or len({key.casefold() for key in cleaned}) != len(value):
            raise serializers.ValidationError("Option names and values must be non-empty, with unique option names.")
        return cleaned

    def validate(self, data):
        if data.get("active") is False and not data.get("showcase", False):
            data["published"] = False
            data["showcase"] = False
        def current(key, default):
            return data.get(key, getattr(self.instance, key, default))
        if current("cost", None) is None and (current("active", True) or current("published", False)):
            raise serializers.ValidationError({"cost": "Enter the actual purchase cost before activating or publishing this product."})
        group = current("variant_group", "").strip()
        attributes = current("attributes", {})
        if group:
            if not attributes:
                raise serializers.ValidationError({"attributes": "Add at least one option to this variant."})
            signature = {key.strip().casefold(): value.strip().casefold() for key, value in attributes.items()}
            siblings = Product.objects.filter(business=self.context["business"], variant_group__iexact=group)
            if self.instance:
                siblings = siblings.exclude(pk=self.instance.pk)
            for sibling in siblings:
                other = {key.strip().casefold(): value.strip().casefold() for key, value in sibling.attributes.items()}
                if other == signature:
                    raise serializers.ValidationError({"attributes": "This option combination already exists in this shop."})
                if other and other.keys() != signature.keys():
                    raise serializers.ValidationError({"attributes": "Use the same option names for every variant in this group."})
        if "variant_group" in data:
            data["variant_group"] = group
        return data

    def validate_image(self, value):
        return validate_tenant_image(value, self.context["business"].pk)

    category_name = serializers.CharField(source="category.name", read_only=True, default="Other essentials")
    price = serializers.IntegerField(min_value=0, max_value=100000000000)
    cost = serializers.IntegerField(min_value=0, max_value=100000000000, allow_null=True)
    quantity = serializers.IntegerField(read_only=True, default=0)
    reserved = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Product
        fields: ClassVar[list] = [
            "id",
            "category",
            "category_name",
            "name",
            "sku",
            "barcode",
            "price",
            "cost",
            "image",
            "description",
            "gallery",
            "variant_group",
            "attributes",
            "published",
            "showcase",
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


class VariantSetItemSerializer(ProductSerializer):
    id = serializers.IntegerField(required=False, min_value=1)


class VariantSetSerializer(serializers.Serializer):
    products = VariantSetItemSerializer(many=True, min_length=1, max_length=100)


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields: ClassVar[list] = ["id", "name"]


class CustomerSerializer(serializers.ModelSerializer):
    phone = serializers.CharField(max_length=30, validators=[validate_phone])
    class Meta:
        model = Customer
        fields: ClassVar[list] = ["id", "name", "phone"]


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


class PaymentPartInput(serializers.Serializer):
    method = serializers.ChoiceField(choices=["cash", "manual_mtn", "manual_airtel"])
    amount = serializers.IntegerField(min_value=1, max_value=1000000000000000)
    tendered = serializers.IntegerField(min_value=1, max_value=1000000000000000)
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True)


class SaleInput(LinesInput):
    payments = PaymentPartInput(many=True, required=False, max_length=5)
    branch = serializers.IntegerField(required=False)
    customer = serializers.IntegerField(required=False, allow_null=True)
    method = serializers.ChoiceField(choices=["cash", "manual_mtn", "manual_airtel", "split"])
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
    phone = serializers.CharField(max_length=30, validators=[validate_phone])
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
        fields: ClassVar[list] = [
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
        fields: ClassVar[list] = [
            "id",
            "product",
            "name",
            "quantity",
            "price",
            "cost",
            "discount",
            "currency",
        ]


class AllocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentAllocation
        fields: ClassVar[list] = ["method", "amount", "tendered", "change", "reference", "provider_verified"]


class SaleSerializer(serializers.ModelSerializer):
    allocations = AllocationSerializer(many=True, read_only=True)
    lines = SaleLineSerializer(many=True)
    payment = PaymentSerializer()

    class Meta:
        model = Sale
        fields: ClassVar[list] = [
            "id",
            "client_id",
            "branch",
            "customer",
            "total",
            "delivery_fee",
            "currency",
            "offline",
            "review_reasons",
            "allocations",
            "occurred_at",
            "created_at",
            "lines",
            "payment",
        ]


class OrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields: ClassVar[list] = [
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
    password = serializers.CharField(min_length=10, max_length=128, trim_whitespace=False, write_only=True)
    name = serializers.CharField(max_length=120)
    slug = serializers.SlugField(max_length=50)


class LoginInput(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)


class StaffInput(serializers.Serializer):
    username = serializers.RegexField(r"^[a-zA-Z0-9@.+_-]{3,150}$")
    existing_account = serializers.BooleanField(default=True)
    branch = serializers.IntegerField(min_value=1, required=False)
    role = serializers.ChoiceField(choices=["manager", "cashier"])

    def validate(self, data):
        if not data["existing_account"] or {"password", "email"} & self.initial_data.keys():
            raise serializers.ValidationError("Users must register themselves. Add shop access using their existing username.")
        return data


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

class PublicProductSerializer(serializers.Serializer):
    preview = serializers.BooleanField(required=False)
    description = serializers.CharField(required=False)
    gallery = serializers.ListField(child=serializers.URLField(), required=False)
    variant_group = serializers.CharField(required=False)
    attributes = serializers.DictField(child=serializers.CharField(), required=False)
    id = serializers.IntegerField()
    name = serializers.CharField()
    image = serializers.CharField(allow_blank=True)
    price = serializers.IntegerField()
    available = serializers.IntegerField()
    category = serializers.IntegerField(allow_null=True, required=False)
    category_name = serializers.CharField(required=False)


class PublicShopSerializer(serializers.Serializer):
    description = serializers.CharField(required=False, allow_blank=True)
    website = serializers.CharField(required=False, allow_blank=True)
    name = serializers.CharField()
    slug = serializers.CharField()
    logo = serializers.CharField(allow_blank=True)
    currency = serializers.CharField()
    contact = serializers.CharField(allow_blank=True)
    delivery_enabled = serializers.BooleanField()
    delivery_fee = serializers.IntegerField()


class ShopSummarySerializer(PublicShopSerializer):
    product_count = serializers.IntegerField()
    categories = serializers.ListField(child=serializers.CharField())
    preview_products = PublicProductSerializer(many=True)


class ShopDirectorySerializer(serializers.Serializer):
    shops = ShopSummarySerializer(many=True)
    count = serializers.IntegerField()
    next_page = serializers.IntegerField(allow_null=True)


class ShopCatalogSerializer(serializers.Serializer):
    shop = PublicShopSerializer()
    products = PublicProductSerializer(many=True)
    categories = CategorySerializer(many=True)
    availability_notice = serializers.CharField()


class OrderConfirmationSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    token = serializers.CharField()
