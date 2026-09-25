from typing import ClassVar

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies: ClassVar[list] = [("catalog", "0001_initial")]
    operations: ClassVar[list] = [
        migrations.AlterField(
            model_name="product",
            name="cost",
            field=models.PositiveBigIntegerField(null=True, blank=True),
        ),
        migrations.AddConstraint(
            model_name="product",
            constraint=models.CheckConstraint(
                condition=models.Q(cost__isnull=False)
                | models.Q(active=False, published=False),
                name="unknown_cost_draft_only",
            ),
        ),
    ]
