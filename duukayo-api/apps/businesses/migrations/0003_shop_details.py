from typing import ClassVar

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies: ClassVar[list] = [("businesses", "0002_storefront_branch")]
    operations: ClassVar[list] = [
        migrations.AddField(
            model_name="business",
            name="description",
            field=models.TextField(blank=True, max_length=2000),
        ),
        migrations.AddField(
            model_name="business", name="website", field=models.URLField(blank=True)
        ),
        migrations.AddField(
            model_name="business",
            name="published",
            field=models.BooleanField(default=True),
        ),
        migrations.AlterField(
            model_name="business",
            name="published",
            field=models.BooleanField(default=False),
        ),
    ]
