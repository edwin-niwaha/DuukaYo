from typing import ClassVar

from django.db import migrations


def backfill(apps, schema_editor):
    Payment = apps.get_model("payments", "Payment")
    Allocation = apps.get_model("payments", "PaymentAllocation")
    for payment in Payment.objects.all().iterator(chunk_size=500):
        Allocation.objects.get_or_create(sale_id=payment.sale_id, defaults={key: getattr(payment, key) for key in ("method", "amount", "tendered", "change", "reference", "provider_verified")})


class Migration(migrations.Migration):
    dependencies: ClassVar[list] = [("payments", "0002_paymentallocation")]
    operations: ClassVar[list] = [migrations.RunPython(backfill, migrations.RunPython.noop)]
