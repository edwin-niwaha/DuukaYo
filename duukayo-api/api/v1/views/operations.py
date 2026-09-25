from django.db import transaction
from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.operations_serializers import (
    CashRegisterInput,
    ReturnInput,
    ShiftInput,
    StaffUpdateInput,
    TransferInput,
)
from api.v1.serializers import valid
from apps.common.domain import audit, lock_business, membership
from apps.inventory.models import Transfer
from apps.inventory.transfers import transfer_stock
from apps.sales.models import Register, Shift
from apps.sales.operations import expected_cash, return_sale, shift_command


class RegistersView(APIView):
    @extend_schema(responses={200: dict})
    def get(self, request, business_id):
        m = membership(request.user, business_id)
        return Response(
            list(
                Register.objects.filter(branch=m.branch, active=True).values(
                    "id", "name"
                )
            )
        )

    @extend_schema(request=CashRegisterInput, responses={201: dict})
    def post(self, request, business_id):
        m = membership(request.user, business_id, ["owner", "manager"])
        data = valid(CashRegisterInput, request.data)
        with transaction.atomic():
            lock_business(m.business)
            register, created = Register.objects.get_or_create(
                branch=m.branch, name=data["name"]
            )
            if created:
                audit(m.business, m.user, "register.created", register.pk)
        return Response(
            {"id": register.pk, "name": register.name}, status=201 if created else 200
        )


class ShiftsView(APIView):
    @extend_schema(responses={200: dict})
    def get(self, request, business_id):
        m = membership(request.user, business_id)
        shifts = Shift.objects.filter(register__branch=m.branch).select_related(
            "register"
        )
        if m.role == "cashier":
            shifts = shifts.filter(cashier=m.user)
        return Response(
            [
                {
                    "id": s.pk,
                    "register": s.register_id,
                    "register_name": s.register.name,
                    "cashier": s.cashier_id,
                    "opening_float": s.opening_float,
                    "expected_cash": s.expected_cash
                    if s.closed_at
                    else expected_cash(s),
                    "counted_cash": s.counted_cash,
                    "closed": bool(s.closed_at),
                }
                for s in shifts.order_by("-pk")[:100]
            ]
        )

    @extend_schema(request=ShiftInput, responses={200: dict})
    def post(self, request, business_id):
        return Response(
            shift_command(
                membership(request.user, business_id), valid(ShiftInput, request.data)
            )
        )


class ReturnsView(APIView):
    @extend_schema(request=ReturnInput, responses={200: dict})
    def post(self, request, business_id, sale_id):
        return Response(
            return_sale(
                membership(request.user, business_id, ["owner", "manager"]),
                sale_id,
                valid(ReturnInput, request.data),
            )
        )


class TransfersView(APIView):
    @extend_schema(responses={200: dict})
    def get(self, request, business_id):
        m = membership(request.user, business_id, ["owner", "manager"])
        return Response(
            list(
                Transfer.objects.filter(business=m.business)
                .filter(Q(source=m.branch) | Q(destination=m.branch))
                .order_by("-pk")
                .values(
                    "id",
                    "source",
                    "destination",
                    "product",
                    "quantity",
                    "status",
                    "reference",
                )[:100]
            )
        )

    @extend_schema(request=TransferInput, responses={200: dict})
    def post(self, request, business_id):
        return Response(
            transfer_stock(
                membership(request.user, business_id, ["owner", "manager"]),
                valid(TransferInput, request.data),
            )
        )


class StaffMemberView(APIView):
    @extend_schema(request=StaffUpdateInput, responses={200: dict})
    @transaction.atomic
    def patch(self, request, business_id, staff_id):
        from django.shortcuts import get_object_or_404

        from api.v1.operations_serializers import StaffUpdateInput
        from apps.businesses.models import Branch, Membership

        m = membership(request.user, business_id, ["owner"])
        lock_business(m.business)
        staff = get_object_or_404(Membership, business=m.business, pk=staff_id)
        data = valid(StaffUpdateInput, request.data)
        if staff.role == "owner":
            raise ValidationError(
                "Owner membership changes require a separate ownership-transfer workflow."
            )
        if "branch" in data:
            staff.branch = get_object_or_404(
                Branch, business=m.business, pk=data["branch"]
            )
        if "active" in data:
            staff.active = data["active"]
        if "role" in data:
            staff.role = data["role"]
        staff.save()
        audit(m.business, m.user, "staff.updated", staff.pk, data)
        return Response(
            {
                "id": staff.pk,
                "branch": staff.branch_id,
                "role": staff.role,
                "active": staff.active,
            }
        )
