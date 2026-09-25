from typing import ClassVar

import django.db.models.deletion
from django.db import migrations, models


def select_existing_branch(apps, schema_editor):
    Business = apps.get_model("businesses", "Business")
    Branch = apps.get_model("businesses", "Branch")
    for business in Business.objects.all().iterator():
        branch = Branch.objects.filter(business_id=business.pk).order_by("pk").first()
        if branch:
            business.storefront_branch_id = branch.pk
            business.save(update_fields=["storefront_branch"])


class Migration(migrations.Migration):
    dependencies: ClassVar[list] = [("businesses", "0001_initial")]
    operations: ClassVar[list] = [
        migrations.AddField(
            model_name="business", name="storefront_branch",
            field=models.ForeignKey(null=True, blank=True, on_delete=django.db.models.deletion.PROTECT,
                                    related_name="storefront_businesses", to="businesses.branch"),
        ),
        migrations.RunPython(select_existing_branch, migrations.RunPython.noop),
    ]
