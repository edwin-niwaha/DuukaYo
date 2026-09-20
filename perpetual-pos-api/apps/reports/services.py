from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.inventory.models import Stock
from apps.notifications.models import Device
from apps.sales.models import Sale


def daily_report(m, requested):
    tz = ZoneInfo(m.business.timezone)
    try:
        day = (
            date.fromisoformat(requested)
            if requested
            else timezone.now().astimezone(tz).date()
        )
    except ValueError:
        raise ValidationError("Use YYYY-MM-DD for date.")
    start = datetime.combine(day, time.min, tzinfo=tz)
    end = start + timedelta(days=1)
    sales = Sale.objects.filter(
        business=m.business, occurred_at__gte=start, occurred_at__lt=end
    ).prefetch_related("lines", "payment")
    methods = {}
    total = 0
    profit = 0
    count = 0
    for sale in sales:
        count += 1
        total += sale.total
        methods[sale.payment.method] = methods.get(sale.payment.method, 0) + sale.total
        profit += sum(
            (x.price - x.cost) * x.quantity - x.discount for x in sale.lines.all()
        )
    low = [
        {
            "product": s.product_id,
            "name": s.product.name,
            "quantity": s.quantity,
            "reserved": s.reserved,
            "threshold": s.product.low_stock_threshold,
        }
        for s in Stock.objects.filter(branch__business=m.business).select_related(
            "product"
        )
        if s.quantity - s.reserved <= s.product.low_stock_threshold
    ]
    devices = list(
        Device.objects.filter(membership__business=m.business).values(
            "pending_sales", "updated_at"
        )
    )
    return {
        "date": str(day),
        "timezone": m.business.timezone,
        "currency": m.business.currency,
        "total": total,
        "transactions": count,
        "estimated_gross_profit": profit,
        "by_payment_method": methods,
        "low_stock": low,
        "known_pending_sales": sum(x["pending_sales"] for x in devices),
        "sync_notice": "Includes synchronized sales only. Offline devices may have unreported sales. Delivery fees are excluded from estimated gross profit.",
        "devices": devices,
    }
