from typing import ClassVar

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies: ClassVar[list] = [("sales", "0003_register_salereturn_returnline_shift_and_more")]
    operations: ClassVar[list] = [
        migrations.AlterField(model_name="saleline", name="name", field=models.CharField(max_length=4000)),
    ]
