"""Remove the retired imported catalog without removing the merchant account."""
import json
from pathlib import Path
from urllib.parse import urlsplit

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models.deletion import ProtectedError

from apps.businesses.models import Business
from apps.catalog.models import Category, Product
from apps.inventory.models import Stock


class Command(BaseCommand):
    help = "Remove imported Jobell products and their unused local images. Preview by default."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true")

    def handle(self, *args, **options):
        report = {"mode": "apply" if options["apply"] else "preview", "deleted": [], "archived": [], "images": []}
        with transaction.atomic():
            shop = Business.objects.select_for_update().filter(slug="jobell-inc").first()
            if shop:
                images = set()
                categories = set()
                for product in Product.objects.filter(business=shop, sku__startswith="JOBELL-"):
                    images.update([product.image, *product.gallery])
                    categories.add(product.category_id)
                    sku = product.sku
                    try:
                        with transaction.atomic():
                            if Stock.objects.filter(product=product).exists():
                                raise ProtectedError("Inventory history", [product])
                            product.delete()
                        report["deleted"].append(sku)
                    except ProtectedError:
                        Product.objects.filter(pk=product.pk).update(
                            active=False, published=False, showcase=False,
                            image="", gallery=[], description="",
                        )
                        report["archived"].append(sku)
                Category.objects.filter(pk__in=categories, business=shop, product__isnull=True).delete()
                root = Path(settings.MEDIA_ROOT).resolve()
                for url in sorted(images):
                    path = urlsplit(url).path
                    prefix = f"/media/businesses/{shop.pk}/"
                    if not path.startswith(prefix):
                        continue
                    # A URL may occur in another gallery, so check all references.
                    relative = path.removeprefix("/media/")
                    if Product.objects.filter(image__endswith=path).exists() or Business.objects.filter(logo__endswith=path).exists():
                        continue
                    if any(any(urlsplit(image).path == path for image in gallery) for gallery in Product.objects.values_list("gallery", flat=True)):
                        continue
                    file = (root / relative).resolve()
                    if file.is_relative_to(root / "businesses" / str(shop.pk)) and file.is_file():
                        report["images"].append(relative)
                        if options["apply"]:
                            transaction.on_commit(lambda file=file: file.unlink(missing_ok=True))
            if not options["apply"]:
                transaction.set_rollback(True)
        self.stdout.write(json.dumps(report, indent=2))
