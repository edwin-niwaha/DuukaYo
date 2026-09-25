from typing import ClassVar

from django.db import migrations


def backfill(apps, schema_editor):
    Order = apps.get_model("orders", "Order")
    Line = apps.get_model("orders", "OrderLine")
    Reservation = apps.get_model("orders", "Reservation")
    Stock = apps.get_model("inventory", "Stock")
    for order in Order.objects.using(schema_editor.connection.alias).all().iterator(chunk_size=500):
        for value in order.lines:
            line, _ = Line.objects.get_or_create(order=order, product_id=value["product"], defaults={k: value[k] for k in ("name", "quantity", "price", "cost", "discount", "currency")})
            stock, _ = Stock.objects.get_or_create(branch_id=order.branch_id, product_id=value["product"])
            state = "consumed" if order.status == "completed" else "released" if order.status == "cancelled" else "active"
            Reservation.objects.get_or_create(line=line, defaults={"stock": stock, "quantity": value["quantity"], "state": state})


class Migration(migrations.Migration):
    dependencies: ClassVar[list] = [("orders", "0002_orderline_reservation_orderline_unique_order_product")]
    operations: ClassVar[list] = [migrations.RunPython(backfill, migrations.RunPython.noop)]
