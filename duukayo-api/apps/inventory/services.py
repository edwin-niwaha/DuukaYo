from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError

from apps.catalog.models import Product
from apps.common.domain import audit, fingerprint, lock_business
from apps.common.models import Audit
from apps.common.operations import record, replay
from apps.inventory.models import Movement, Stock


def stock_for(branch, product):
    if branch.business_id != product.business_id:
        raise ValidationError(
            "Stock product and branch must belong to the same business."
        )
    return Stock.objects.get_or_create(branch=branch, product=product)[0]


def movement(stock, delta, reason, reference):
    stock.quantity += delta
    stock.save(update_fields=["quantity"])
    Movement.objects.create(
        business=stock.branch.business,
        stock=stock,
        delta=delta,
        reason=reason,
        reference=str(reference),
    )


@transaction.atomic
def change_stock(m, data):
    lock_business(m.business)
    product = get_object_or_404(Product, pk=data["product"], business=m.business)
    stock = stock_for(m.branch, product)
    result = replay(m, "stock", data)
    if result is not None:
        stock.quantity, stock.reserved = result["quantity"], result["reserved"]
        return stock
    key = "stock:" + str(data["client_id"])
    previous = Audit.objects.filter(
        business=m.business, action="stock.changed", reference=key
    ).first()
    digest = fingerprint(data)
    if previous:
        original = (
            Movement.objects.filter(business=m.business, reference=key)
            .select_related("stock")
            .first()
        )
        if (
            previous.detail["hash"] != digest
            or previous.actor_id != m.user_id
            or not original
            or original.stock.branch_id != m.branch_id
        ):
            raise ValidationError("Stock operation key reused with different data.")
        return stock
    if data["kind"] in ("opening", "receipt") and data["delta"] <= 0:
        raise ValidationError("Opening stock and receipts require a positive quantity.")
    if data["kind"] == "opening" and Movement.objects.filter(stock=stock).exists():
        raise ValidationError("Opening stock has already been recorded.")
    if data["delta"] < 0 and stock.quantity + data["delta"] < stock.reserved:
        raise ValidationError("Adjustment would consume reserved stock.")
    movement(stock, data["delta"], data["kind"] + ": " + data["reason"], key)
    audit(
        m.business,
        m.user,
        "stock.changed",
        key,
        {"hash": digest, "delta": data["delta"]},
    )
    record(m, "stock", data, {"quantity": stock.quantity, "reserved": stock.reserved})
    return stock
