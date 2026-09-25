from django.db import transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.common.domain import audit, lock_business
from apps.common.operations import record, replay
from apps.inventory.services import movement, stock_for
from apps.payments.models import PaymentAllocation
from apps.payments.services import validate_payment
from apps.sales.models import (
    CashMovement,
    Register,
    ReturnLine,
    Sale,
    SaleReturn,
    Shift,
)


def manager(m):
    if m.role not in ("owner", "manager"):
        raise PermissionDenied("A manager or owner must authorize this operation.")


def current_shift(m):
    return Shift.objects.filter(
        register__branch=m.branch, cashier=m.user, closed_at__isnull=True
    ).first()


def expected_cash(shift):
    collected = (
        PaymentAllocation.objects.filter(sale__shift=shift, method="cash").aggregate(
            n=Sum("amount")
        )["n"]
        or 0
    )
    paid_out = (
        SaleReturn.objects.filter(shift=shift, method="cash").aggregate(
            n=Sum("amount")
        )["n"]
        or 0
    )
    adjustments = shift.cash_movements.aggregate(n=Sum("amount"))["n"] or 0
    return shift.opening_float + collected - paid_out + adjustments


@transaction.atomic
def shift_command(m, data):
    lock_business(m.business)
    cached = replay(m, "shift", data)
    if cached is not None:
        return cached
    action = data["action"]
    if action == "open":
        register = get_object_or_404(
            Register, pk=data["register"], branch=m.branch, active=True
        )
        if (
            Shift.objects.filter(register=register, closed_at__isnull=True).exists()
            or Shift.objects.filter(cashier=m.user, closed_at__isnull=True).exists()
        ):
            raise ValidationError("The cashier or register already has an open shift.")
        shift = Shift.objects.create(
            register=register, cashier=m.user, opening_float=data["amount"]
        )
    else:
        shift = get_object_or_404(Shift, pk=data["shift"], register__branch=m.branch)
        if shift.closed_at:
            raise ValidationError("This shift is closed.")
        if shift.cashier_id != m.user_id:
            manager(m)
        if action in ("cash_in", "cash_out"):
            manager(m)
            if not data.get("reason", "").strip() or data["amount"] <= 0:
                raise ValidationError(
                    "Cash movements require a positive amount and a reason."
                )
            if action == "cash_out" and data["amount"] > expected_cash(shift):
                raise ValidationError("Cash withdrawal exceeds expected drawer cash.")
            CashMovement.objects.create(
                shift=shift,
                actor=m.user,
                amount=data["amount"] * (-1 if action == "cash_out" else 1),
                reason=data["reason"],
            )
        else:
            shift.expected_cash = expected_cash(shift)
            shift.counted_cash = data["amount"]
            shift.discrepancy_reason = data.get("reason", "")
            if (
                shift.expected_cash != shift.counted_cash
                and not shift.discrepancy_reason.strip()
            ):
                raise ValidationError("Explain the cash-count discrepancy.")
            shift.closed_at = timezone.now()
            shift.save()
    result = {
        "id": shift.pk,
        "expected_cash": expected_cash(shift),
        "counted_cash": shift.counted_cash,
        "closed": bool(shift.closed_at),
    }
    audit(m.business, m.user, "shift." + action, shift.pk)
    return record(m, "shift", data, result)


@transaction.atomic
def return_sale(m, sale_id, data):
    manager(m)
    lock_business(m.business)
    payload = dict(data, sale=sale_id)
    cached = replay(m, "sale_return", payload)
    if cached is not None:
        return cached
    sale = get_object_or_404(Sale, pk=sale_id, business=m.business, branch=m.branch)
    validate_payment(data["method"], data.get("reference", ""))
    shift = current_shift(m)
    lines, total = [], 0
    for item in data["lines"]:
        line = get_object_or_404(sale.lines, pk=item["line"])
        returned = (
            ReturnLine.objects.filter(line=line).aggregate(n=Sum("quantity"))["n"] or 0
        )
        if returned + item["quantity"] > line.quantity:
            raise ValidationError(
                "Return quantity exceeds the remaining sold quantity."
            )
        # Cumulative integer allocation ensures the final return includes rounding remainder.
        net = line.price * line.quantity - line.discount
        amount = (
            net * (returned + item["quantity"]) // line.quantity
            - net * returned // line.quantity
        )
        total += amount
        lines.append((line, item, amount))
    refunded = sale.returns.aggregate(n=Sum("amount"))["n"] or 0
    if total + refunded > sale.total:
        raise ValidationError("Refund exceeds the amount collected.")
    if data["method"] == "cash" and shift and total > expected_cash(shift):
        raise ValidationError(
            "The drawer has insufficient expected cash for this refund."
        )
    result = SaleReturn.objects.create(
        sale=sale,
        actor=m.user,
        reason=data["reason"],
        amount=total,
        method=data["method"],
        reference=data.get("reference", ""),
        shift=shift,
    )
    for line, item, amount in lines:
        ReturnLine.objects.create(
            sale_return=result,
            line=line,
            quantity=item["quantity"],
            restock=item["restock"],
            amount=amount,
        )
        if item["restock"]:
            movement(
                stock_for(m.branch, line.product),
                item["quantity"],
                "Sale return",
                result.pk,
            )
    audit(
        m.business,
        m.user,
        "sale.returned",
        result.pk,
        {"sale": sale.pk, "amount": total},
    )
    return record(
        m,
        "sale_return",
        payload,
        {"id": result.pk, "sale": sale.pk, "amount": total, "method": result.method},
    )
