from typing import ClassVar

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies: ClassVar[list] = [("orders", "0004_cart_quote_cartline_marketplacecheckout")]
    operations: ClassVar[list] = [
        migrations.AlterField(model_name="orderline", name="name", field=models.CharField(max_length=4000)),
    ]
