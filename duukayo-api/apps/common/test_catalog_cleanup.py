from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.management import call_command
from django.test import TestCase, override_settings

from apps.businesses.models import Branch, Business
from apps.catalog.models import Product
from apps.inventory.models import Stock


class CatalogCleanupTests(TestCase):
    def test_preview_apply_and_repeat_preserve_merchant_and_history(self):
        shop = Business.objects.create(name="Merchant", slug="jobell-inc")
        branch = Branch.objects.create(business=shop)
        with TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory):
            image = Path(directory) / "businesses" / str(shop.pk) / "sample.png"
            image.parent.mkdir(parents=True)
            image.write_bytes(b"sample")
            imported = Product.objects.create(business=shop, sku="JOBELL-IMPORTED", name="Imported", price=1, cost=1, image=f"http://localhost/media/businesses/{shop.pk}/sample.png")
            historical = Product.objects.create(business=shop, sku="JOBELL-HISTORY", name="History", price=1, cost=1, showcase=True, image="https://example.com/old.jpg")
            Stock.objects.create(branch=branch, product=historical, quantity=3)
            own = Product.objects.create(business=shop, sku="MERCHANT-1", name="Own product", price=1, cost=1)
            call_command("remove_jobell_content", stdout=StringIO())
            self.assertTrue(Product.objects.filter(pk=imported.pk).exists())
            self.assertTrue(image.exists())
            with self.captureOnCommitCallbacks(execute=True):
                call_command("remove_jobell_content", apply=True, stdout=StringIO())
            self.assertFalse(Product.objects.filter(pk=imported.pk).exists())
            self.assertFalse(image.exists())
            historical.refresh_from_db()
            self.assertFalse(historical.active or historical.published or historical.showcase)
            self.assertEqual(historical.image, "")
            self.assertEqual(Stock.objects.get(product=historical).quantity, 3)
            self.assertTrue(Product.objects.filter(pk=own.pk).exists())
            self.assertTrue(Business.objects.filter(pk=shop.pk).exists())
            call_command("remove_jobell_content", apply=True, stdout=StringIO())
            self.assertEqual(Product.objects.filter(business=shop).count(), 2)
