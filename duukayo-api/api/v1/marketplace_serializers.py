from typing import ClassVar

from rest_framework import serializers

from apps.common.validation import validate_phone
from apps.customers.models import Address


class CartItemInput(serializers.Serializer):
    product = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=10000)


class CartInput(serializers.Serializer):
    lines = CartItemInput(many=True, allow_empty=True, max_length=200)

    def validate_lines(self, value):
        if len({x["product"] for x in value}) != len(value):
            raise serializers.ValidationError("Combine duplicate cart items.")
        return value


class CartCreateInput(serializers.Serializer):
    guest = serializers.BooleanField(default=False)


class QuoteInput(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    phone = serializers.CharField(max_length=30, validators=[validate_phone])
    delivery = serializers.BooleanField(default=False)
    address = serializers.CharField(max_length=250, allow_blank=True, default="")


class CheckoutInput(serializers.Serializer):
    client_id = serializers.UUIDField()
    quote = serializers.IntegerField(min_value=1)


class MergeInput(serializers.Serializer):
    source = serializers.IntegerField(min_value=1)
    token = serializers.CharField(max_length=100, write_only=True)


class AddressSerializer(serializers.ModelSerializer):
    phone = serializers.CharField(max_length=30, validators=[validate_phone])

    class Meta:
        model = Address
        fields: ClassVar[list] = ["id", "label", "name", "phone", "address"]
        read_only_fields: ClassVar[list] = ["id"]
