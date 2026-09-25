"""Tenant-scoped media and bounded, independent marketplace merchandising."""

import warnings
from io import BytesIO
from uuid import uuid4

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db.models import CharField, F, Value, Window
from django.db.models.functions import MD5, Cast, Concat, RowNumber
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import extend_schema
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.businesses.models import Branch
from apps.catalog.models import Product
from apps.catalog.visibility import orderable, visible_products
from apps.common.services import audit, membership
from apps.inventory.models import Stock


class ImageUploadInput(serializers.Serializer):
    image = serializers.FileField()


class ImageUploadOutput(serializers.Serializer):
    url = serializers.URLField()


class BranchInput(serializers.Serializer):
    name = serializers.CharField(max_length=100)


class BranchOutput(BranchInput):
    id = serializers.IntegerField()


class FeaturedProductSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    image = serializers.URLField()
    shop = serializers.CharField()
    shop_id = serializers.IntegerField()
    slug = serializers.CharField()
    price = serializers.IntegerField()
    currency = serializers.CharField()
    available = serializers.IntegerField()
    destination = serializers.CharField()
    preview = serializers.BooleanField()


class FeaturedFeedSerializer(serializers.Serializer):
    products = FeaturedProductSerializer(many=True)


class ImageUploadView(APIView):
    parser_classes = (MultiPartParser,)

    def storage_context(self, request, **kwargs):
        m = self.get_membership(request, kwargs["business_id"])
        return f"businesses/{m.business_id}", m.business

    def get_membership(self, request, business_id):
        return membership(request.user, business_id, ["owner", "manager"])

    @extend_schema(request=ImageUploadInput, responses={201: ImageUploadOutput})
    def post(self, request, **kwargs):
        folder, business = self.storage_context(request, **kwargs)
        upload = request.FILES.get("image")
        if not upload or upload.size > 8 * 1024 * 1024:
            raise ValidationError(
                {"image": "Choose a JPEG, PNG or WebP image up to 8 MB."}
            )
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                source = Image.open(upload)
                if source.format not in ("JPEG", "PNG", "WEBP"):
                    raise ValueError()
                w, h = source.size
                if min(w, h) < 32 or max(w, h) > 6000 or w * h > 24000000:
                    raise ValueError()
                source.verify()
                upload.seek(0)
                source = ImageOps.exif_transpose(Image.open(upload))
                source.load()
                source.thumbnail((2000, 2000))
                # Re-encode to a native-compatible format and remove metadata.
                output = BytesIO()
                source.convert("RGBA").save(output, format="PNG", optimize=True)
        except (
            UnidentifiedImageError,
            OSError,
            ValueError,
            Image.DecompressionBombError,
            Image.DecompressionBombWarning,
        ):
            raise ValidationError(
                {
                    "image": "Invalid image. Use JPEG, PNG or WebP, 32–6000 px, at most 24 megapixels."
                }
            )
        name = f"{folder}/{uuid4().hex}.png"
        if settings.MEDIA_BACKEND == "cloudinary":
            from apps.common.media import upload_cloudinary
            url = upload_cloudinary(output.getvalue(), "duukayo/" + name[:-4])
        else:
            name = default_storage.save(name, ContentFile(output.getvalue()))
            url = default_storage.url(name)
            if not url.startswith(("https://", "http://")):
                url = settings.PUBLIC_MEDIA_ORIGIN + url if settings.PUBLIC_MEDIA_ORIGIN else request.build_absolute_uri(url)
        audit(business, request.user, "image.uploaded", name)
        return Response({"url": url}, status=201)


class BranchesView(APIView):
    @extend_schema(request=BranchInput, responses={201: BranchOutput})
    def post(self, request, business_id):
        m = membership(request.user, business_id, ["owner"])
        name = str(request.data.get("name", "")).strip()
        if not name or len(name) > 100:
            raise ValidationError(
                {"name": "Enter a branch name of up to 100 characters."}
            )
        branch = Branch.objects.create(business=m.business, name=name)
        audit(m.business, request.user, "branch.created", branch.pk)
        return Response({"id": branch.pk, "name": branch.name}, status=201)


@method_decorator(never_cache, name="dispatch")
class FeaturedProductsView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    @extend_schema(responses=FeaturedFeedSerializer)
    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", 12))
            if not 1 <= limit <= 24:
                raise ValueError()
        except ValueError:
            raise ValidationError({"limit": "Choose between 1 and 24 products."})
        # Missing photos use the clients' placeholders; they must not hide shops.
        # Rank within each shop before taking the bounded global page. Each shop
        # gets its first placement before another receives its second placement.
        products = list(
            Product.objects.filter(
                business__published=True,
                business_id__in=Branch.objects.values("business_id"),
            )
            .filter(visible_products())
            .annotate(
                shop_order=MD5(
                    Concat(
                        Cast("business_id", CharField()),
                        Value(timezone.now().date().isoformat()),
                    )
                ),
                position=Window(
                    RowNumber(),
                    partition_by=[F("business_id")],
                    order_by=[F("updated_at").desc(), F("pk").asc()],
                ),
            )
            .select_related("business", "business__storefront_branch")
            .order_by("position", "shop_order", "pk")[:limit]
        )
        results = []
        for p in products:
            b = p.business
            stock = Stock.objects.filter(branch=b.online_branch(), product=p).first()
            results.append(
                {
                    "id": p.pk,
                    "name": p.name,
                    "image": p.image,
                    "price": p.price,
                    "currency": b.currency,
                    "shop": b.name,
                    "slug": b.slug,
                    "shop_id": b.pk,
                    "available": max(
                        0, stock.quantity - stock.reserved - b.safety_buffer
                    )
                    if stock and orderable(p)
                    else 0,
                    "preview": not orderable(p),
                    "destination": f"/shop/{b.slug}?product={p.pk}",
                }
            )
        return Response({"products": results})
