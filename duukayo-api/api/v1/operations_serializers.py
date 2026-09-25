from rest_framework import serializers


class CommandInput(serializers.Serializer):
    client_id = serializers.UUIDField()


class CashRegisterInput(serializers.Serializer):
    name = serializers.CharField(max_length=100)


class ShiftInput(CommandInput):
    action = serializers.ChoiceField(choices=["open", "close", "cash_in", "cash_out"])
    register = serializers.IntegerField(min_value=1, required=False)
    shift = serializers.IntegerField(min_value=1, required=False)
    amount = serializers.IntegerField(min_value=0, max_value=1000000000000000)
    reason = serializers.CharField(max_length=250, required=False, allow_blank=True)

    def validate(self, data):
        key = "register" if data["action"] == "open" else "shift"
        if key not in data:
            raise serializers.ValidationError({key: "This field is required."})
        return data


class ReturnItemInput(serializers.Serializer):
    line = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=10000)
    restock = serializers.BooleanField(default=True)


class ReturnInput(CommandInput):
    lines = ReturnItemInput(many=True, allow_empty=False, max_length=200)
    reason = serializers.CharField(min_length=3, max_length=250)
    method = serializers.ChoiceField(choices=["cash", "manual_mtn", "manual_airtel"])
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True)

    def validate_lines(self, value):
        if len({x["line"] for x in value}) != len(value):
            raise serializers.ValidationError("Combine duplicate return lines.")
        return value


class TransferInput(CommandInput):
    action = serializers.ChoiceField(choices=["dispatch", "receive"])
    destination = serializers.IntegerField(min_value=1, required=False)
    product = serializers.IntegerField(min_value=1, required=False)
    quantity = serializers.IntegerField(min_value=1, max_value=10000000, required=False)
    transfer = serializers.IntegerField(min_value=1, required=False)
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True)

    def validate(self, data):
        required = (
            ["destination", "product", "quantity"]
            if data["action"] == "dispatch"
            else ["transfer"]
        )
        for key in required:
            if key not in data:
                raise serializers.ValidationError({key: "This field is required."})
        return data


class StaffUpdateInput(serializers.Serializer):
    branch = serializers.IntegerField(min_value=1, required=False)
    role = serializers.ChoiceField(choices=["manager", "cashier"], required=False)
    active = serializers.BooleanField(required=False)
