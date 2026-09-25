from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.catalog.models import Product
from apps.catalog.services import resolve_lines
from apps.common.domain import audit, fingerprint, lock_business
from apps.customers.models import Customer
from apps.inventory.services import movement, stock_for
from apps.orders.services import expire_for_business
from apps.payments.models import Payment
from apps.payments.services import allocation_plan, record_allocations
from apps.sales.models import Sale, SaleLine


@transaction.atomic
def checkout(m, data):
    business = lock_business(m.business)
    existing = Sale.objects.filter(
        business=business, client_id=data["client_id"]
    ).first()
    digest = fingerprint(data)
    if existing:
        if (
            existing.payload_hash != digest
            or existing.cashier_id != m.user_id
            or existing.branch_id != m.branch_id
        ):
            raise ValidationError(
                "Idempotency key was already used for a different request."
            )
        return existing
    if data.get("branch", m.branch_id) != m.branch_id:
        raise ValidationError("Branch is outside your membership.")
    offline = data.get("offline", False)
    if offline and data["method"] != "cash":
        raise ValidationError("Only cash sales can be recorded offline.")
    expire_for_business(business)
    customer = (
        get_object_or_404(Customer, pk=data["customer"], business=business)
        if data.get("customer")
        else None
    )
    lines, issues = resolve_lines(business, m.branch, data["lines"], offline, m.role)
    total = sum(x["quantity"] * x["price"] - x["discount"] for x in lines)
    if total > 1_000_000_000_000_000:
        raise ValidationError("Sale total exceeds the supported monetary range.")
    tendered = data["tendered"]
    parts = allocation_plan(data, total)
    if tendered < total:
        raise ValidationError(
            "Tendered amount must cover total; manual mobile money must equal total."
        )
    occurred = data.get("occurred_at", timezone.now())
    if occurred > timezone.now() + timedelta(minutes=5):
        raise ValidationError("Sale timestamp is in the future.")
    from apps.sales.operations import current_shift

    shift = current_shift(m)
    if offline:
        # A later synchronization must never change an already balanced shift.
        shift = None
    sale = Sale.objects.create(
        shift=shift,
        business=business,
        branch=m.branch,
        cashier=m.user,
        customer=customer,
        client_id=data["client_id"],
        payload_hash=digest,
        total=total,
        currency=business.currency,
        offline=offline,
        review_reasons=issues,
        occurred_at=occurred,
    )
    for line in lines:
        product_id = line.pop("product")
        SaleLine.objects.create(sale=sale, product_id=product_id, **line)
        movement(
            stock_for(m.branch, Product.objects.get(pk=product_id)),
            -line["quantity"],
            "Offline sale" if offline else "Sale",
            sale.pk,
        )
    Payment.objects.create(
        sale=sale,
        method=data["method"],
        amount=total,
        tendered=tendered,
        change=tendered - total,
        reference=data.get("reference", ""),
    )
    record_allocations(sale, parts)
    audit(business, m.user, "sale.completed", sale.pk, {"review_reasons": issues})
    return sale
