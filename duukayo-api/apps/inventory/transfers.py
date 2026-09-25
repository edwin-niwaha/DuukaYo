from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.businesses.models import Branch
from apps.catalog.models import Product
from apps.common.domain import audit, lock_business
from apps.common.operations import record, replay
from apps.inventory.models import Transfer
from apps.inventory.services import movement, stock_for
from apps.sales.operations import manager


@transaction.atomic
def transfer_stock(m, data):
    manager(m)
    lock_business(m.business)
    cached = replay(m, "transfer", data)
    if cached is not None:
        return cached
    if data["action"] == "dispatch":
        destination = get_object_or_404(
            Branch, business=m.business, pk=data["destination"]
        )
        if destination.pk == m.branch_id:
            raise ValidationError("Choose a different destination branch.")
        product = get_object_or_404(Product, business=m.business, pk=data["product"])
        stock = stock_for(m.branch, product)
        if stock.quantity - stock.reserved < data["quantity"]:
            raise ValidationError("Insufficient unreserved stock for transfer.")
        transfer = Transfer.objects.create(
            business=m.business,
            source=m.branch,
            destination=destination,
            product=product,
            quantity=data["quantity"],
            actor=m.user,
            reference=data.get("reference", ""),
        )
        movement(stock, -transfer.quantity, "Transfer dispatched", transfer.pk)
    else:
        transfer = get_object_or_404(
            Transfer, business=m.business, destination=m.branch, pk=data["transfer"]
        )
        if transfer.status != "dispatched":
            raise ValidationError("Transfer has already been received.")
        movement(
            stock_for(m.branch, transfer.product),
            transfer.quantity,
            "Transfer received",
            transfer.pk,
        )
        transfer.status = "received"
        transfer.received_at = timezone.now()
        transfer.save(update_fields=["status", "received_at"])
    audit(m.business, m.user, "transfer." + data["action"], transfer.pk)
    return record(
        m,
        "transfer",
        data,
        {"id": transfer.pk, "status": transfer.status, "quantity": transfer.quantity},
    )
