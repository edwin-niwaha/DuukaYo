from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.db.models import BigIntegerField, Count, ExpressionWrapper, F, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.inventory.models import Stock
from apps.notifications.models import Device
from apps.payments.models import PaymentAllocation
from apps.sales.models import ReturnLine, Sale, SaleLine, SaleReturn


def daily_report(m, requested):
    tz = ZoneInfo(m.business.timezone)
    try:
        day = (
            date.fromisoformat(requested)
            if requested
            else timezone.now().astimezone(tz).date()
        )
        start = datetime.combine(day, time.min, tzinfo=tz)
        end = start + timedelta(days=1)
    except (ValueError, OverflowError):
        raise ValidationError("Use a supported YYYY-MM-DD date.")
    scope = {} if m.role == "owner" else {"branch": m.branch}
    sales = Sale.objects.filter(
        business=m.business, occurred_at__gte=start, occurred_at__lt=end, **scope
    )
    refunds = SaleReturn.objects.filter(
        sale__business=m.business,
        created_at__gte=start,
        created_at__lt=end,
        **({} if m.role == "owner" else {"sale__branch": m.branch}),
    )
    totals = sales.aggregate(total=Sum("total"), count=Count("pk"))
    returned = refunds.aggregate(total=Sum("amount"))["total"] or 0
    methods = {
        x["method"]: x["total"]
        for x in PaymentAllocation.objects.filter(sale__in=sales)
        .values("method")
        .annotate(total=Sum("amount"))
    }
    for value in refunds.values("method").annotate(total=Sum("amount")):
        methods[value["method"]] = methods.get(value["method"], 0) - value["total"]
    expression = ExpressionWrapper(
        (F("price") - F("cost")) * F("quantity") - F("discount"),
        output_field=BigIntegerField(),
    )
    profit = (
        SaleLine.objects.filter(sale__in=sales).aggregate(total=Sum(expression))[
            "total"
        ]
        or 0
    )
    recovered_cost = (
        ReturnLine.objects.filter(sale_return__in=refunds, restock=True).aggregate(
            total=Sum(
                ExpressionWrapper(
                    F("quantity") * F("line__cost"), output_field=BigIntegerField()
                )
            )
        )["total"]
        or 0
    )
    stock = Stock.objects.filter(branch__business=m.business).filter(
        quantity__lte=F("reserved") + F("product__low_stock_threshold")
    )
    devices = Device.objects.filter(
        membership__business=m.business, membership__active=True
    )
    if m.role != "owner":
        stock = stock.filter(branch=m.branch)
        devices = devices.filter(membership__branch=m.branch)
    low = [
        {
            "product": s.product_id,
            "name": s.product.name,
            "branch": s.branch_id,
            "quantity": s.quantity,
            "reserved": s.reserved,
            "threshold": s.product.low_stock_threshold,
        }
        for s in stock.select_related("product").order_by("branch_id", "product_id")[
            :500
        ]
    ]
    return {
        "date": str(day),
        "timezone": m.business.timezone,
        "currency": m.business.currency,
        "scope": "business" if m.role == "owner" else "branch",
        "branch": None if m.role == "owner" else m.branch_id,
        "total": (totals["total"] or 0) - returned,
        "gross_sales": totals["total"] or 0,
        "refunds": returned,
        "transactions": totals["count"],
        "estimated_gross_profit": profit - returned + recovered_cost,
        "by_payment_method": methods,
        "low_stock": low,
        "low_stock_count": stock.count(),
        "known_pending_sales": devices.aggregate(total=Sum("pending_sales"))["total"]
        or 0,
        "sync_notice": "Synchronized sales less refunds recorded in this period. Offline devices may have unreported sales. Delivery fees are excluded from estimated gross profit.",
        "devices": list(
            devices.order_by("pk").values("pending_sales", "updated_at")[:200]
        ),
    }
