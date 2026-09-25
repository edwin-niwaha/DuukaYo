import hashlib
import json
from pathlib import Path
from urllib.parse import unquote, urlparse

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import UserProfile
from apps.businesses.models import Business
from apps.catalog.models import Product
from apps.common.media import cloudinary_url, upload_cloudinary


class Command(BaseCommand):
    help = "Copy referenced images to Cloudinary without deleting originals. Dry run unless --apply is supplied."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true")
        parser.add_argument("--backup", help="New JSON backup file required with --apply")

    def handle(self, *args, **options):
        records = []
        for model, fields in ((Business, ("logo",)), (Product, ("image", "gallery")), (UserProfile, ("photo",))):
            for obj in model.objects.all().iterator():
                folder = f"businesses/{obj.pk if model is Business else obj.business_id}" if model is not UserProfile else f"profiles/{obj.user_id}"
                for field in fields:
                    value = getattr(obj, field)
                    urls = value if isinstance(value, list) else [value]
                    if any(u and not cloudinary_url(u) for u in urls):
                        records.append((model, obj.pk, field, value, folder))
        self.stdout.write(f"{len(records)} image fields need migration.")
        if not options["apply"]:
            return
        if not all((settings.CLOUDINARY_CLOUD_NAME, settings.CLOUDINARY_API_KEY, settings.CLOUDINARY_API_SECRET)):
            raise CommandError("Configure the three Cloudinary environment variables first.")
        if not options["backup"]:
            raise CommandError("Provide --backup with a new JSON file path.")
        with Path(options["backup"]).open("x", encoding="utf-8") as backup:
            json.dump([{"model": m._meta.label, "pk": pk, "field": f, "value": v} for m, pk, f, v, _ in records], backup, indent=2)
        cache = {}
        updated = 0
        for model, pk, field, value, folder in records:
            def convert(url, folder=folder, model=model, pk=pk):
                if not url or cloudinary_url(url):
                    return url
                key = (url, folder)
                if key not in cache:
                    parsed = urlparse(url)
                    media_path = urlparse(settings.MEDIA_URL).path
                    local_hosts = {"localhost", "127.0.0.1", "10.0.2.2", urlparse(settings.PUBLIC_MEDIA_ORIGIN).hostname}
                    if parsed.hostname in local_hosts and parsed.path.startswith(media_path):
                        root = Path(settings.MEDIA_ROOT).resolve()
                        source = (root / unquote(parsed.path[len(media_path):])).resolve()
                        if not source.is_relative_to(root) or not source.is_file():
                            raise CommandError(f"Missing or unsafe local image for {model._meta.label} #{pk}.")
                        content = source.read_bytes()
                    elif parsed.scheme in ("http", "https") and parsed.hostname not in local_hosts:
                        # Cloudinary fetches public remote images; the API does not fetch arbitrary URLs.
                        content = url
                    else:
                        raise CommandError(f"Unsupported image reference for {model._meta.label} #{pk}.")
                    public_id = "duukayo/" + folder + "/migrated-" + hashlib.sha256(url.encode()).hexdigest()[:32]
                    cache[key] = upload_cloudinary(content, public_id)
                return cache[key]
            new_value = [convert(url) for url in value] if isinstance(value, list) else convert(value)
            # Do not overwrite edits made since the inventory was read.
            changed = model.objects.filter(pk=pk, **{field: value}).update(**{field: new_value})
            updated += changed
            self.stdout.write(f"{model._meta.label} #{pk} {field}: {'updated' if changed else 'skipped (changed concurrently)'}")
        self.stdout.write(self.style.SUCCESS(f"Updated {updated} fields; original files retained."))
