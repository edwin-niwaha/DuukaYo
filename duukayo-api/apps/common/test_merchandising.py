from io import BytesIO
from tempfile import TemporaryDirectory

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image

from apps.businesses.models import Branch, Business, Membership
from apps.catalog.models import Product
from apps.common.tests import Fixture
from apps.inventory.models import Stock


class MerchandisingTests(Fixture, TestCase):
    def test_new_shop_is_draft_with_owner_and_branch(self):
        response = self.client.post(
            "/api/v1/businesses/", {"name": "New", "slug": "new"}
        )
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.data["published"])
        business = Business.objects.get(slug="new")
        self.assertTrue(
            Membership.objects.filter(
                business=business, user=self.user, role="owner"
            ).exists()
        )
        self.assertIsNotNone(business.online_branch())

    def test_unpublish_hides_shop_and_blocks_new_orders_but_recovers_existing(self):
        data = self.order_data()
        order_id = self.client.post("/api/v1/shop/one/", data, format="json").data["id"]
        self.client.patch(self.base, {"published": False}, format="json")
        self.assertEqual(self.client.get("/api/v1/shop/one/").status_code, 404)
        self.assertEqual([s["slug"] for s in self.client.get("/api/v1/shops/").data["shops"]], ["two"])
        self.assertEqual(
            self.client.post("/api/v1/shop/one/", data, format="json").data["id"],
            order_id,
        )
        self.assertEqual(
            self.client.post(
                "/api/v1/shop/one/", self.order_data(), format="json"
            ).status_code,
            400,
        )

    def image(self, kind="PNG", size=(80, 80)):
        out = BytesIO()
        Image.new("RGB", size, "green").save(out, kind)
        return SimpleUploadedFile("photo.png", out.getvalue(), content_type="image/png")

    def test_upload_reencodes_and_is_tenant_scoped(self):
        with (
            TemporaryDirectory() as folder,
            override_settings(
                MEDIA_ROOT=folder, PUBLIC_MEDIA_ORIGIN="https://media.example.com"
            ),
        ):
            response = self.client.post(
                self.base + "images/", {"image": self.image()}, format="multipart"
            )
            self.assertEqual(response.status_code, 201)
            self.assertIn(f"/businesses/{self.business.pk}/", response.data["url"])
            self.assertTrue(
                response.data["url"].startswith("https://media.example.com/")
            )
            self.client.force_authenticate(self.other)
            other_base = f"/api/v1/businesses/{self.b2.pk}/"
            self.assertEqual(
                self.client.patch(
                    other_base + f"products/{self.p2.pk}/",
                    {"image": response.data["url"]},
                    format="json",
                ).status_code,
                400,
            )
            self.assertEqual(
                self.client.post(
                    self.base + "images/", {"image": self.image()}, format="multipart"
                ).status_code,
                404,
            )

    def test_upload_rejects_fake_too_small_and_cashier(self):
        fake = SimpleUploadedFile(
            "photo.png", b"<svg>not a photo</svg>", content_type="image/png"
        )
        self.assertEqual(
            self.client.post(
                self.base + "images/", {"image": fake}, format="multipart"
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(
                self.base + "images/",
                {"image": self.image(size=(1, 1))},
                format="multipart",
            ).status_code,
            400,
        )
        self.m.role = "cashier"
        self.m.save()
        self.assertEqual(
            self.client.post(
                self.base + "images/", {"image": self.image()}, format="multipart"
            ).status_code,
            403,
        )

    def test_featured_is_bounded_fair_and_tracks_publication(self):
        self.product.image = "https://example.com/milk.png"
        self.product.save()
        for i in range(5):
            Product.objects.create(
                business=self.business,
                name=f"More {i}",
                sku=f"more{i}",
                price=1,
                cost=1,
                published=True,
                image="https://example.com/p.png",
            )
        self.p2.published = True
        self.p2.image = "https://example.com/p.png"
        self.p2.save()
        Branch.objects.create(business=self.business, name="Second")
        response = self.client.get("/api/v1/featured-products/?limit=2")
        self.assertEqual(len(response.data["products"]), 2)
        self.assertEqual({p["slug"] for p in response.data["products"]}, {"one", "two"})
        self.assertIn("no-store", response["Cache-Control"])
        self.assertNotIn("cost", response.data["products"][0])
        self.b2.published = False
        self.b2.save()
        items = self.client.get("/api/v1/featured-products/").data["products"]
        self.assertEqual(len(items), 6)
        self.assertEqual(len({p["id"] for p in items}), 6)
        self.assertTrue(all(p["slug"] == "one" for p in items))
        self.assertEqual(
            self.client.get("/api/v1/featured-products/?limit=100").status_code, 400
        )

    def test_unknown_cost_cannot_be_active_or_published(self):
        p = Product.objects.create(
            business=self.business,
            name="Draft",
            sku="draft",
            price=40000,
            cost=None,
            active=False,
        )
        url = self.base + f"products/{p.pk}/"
        self.assertEqual(
            self.client.patch(url, {"active": True}, format="json").status_code, 400
        )
        self.assertEqual(
            self.client.patch(url, {"published": True}, format="json").status_code, 400
        )
        self.assertEqual(
            self.client.patch(
                url, {"cost": 20000, "active": True}, format="json"
            ).status_code,
            200,
        )

    def test_only_owner_can_add_branch(self):
        self.m.role = "manager"
        self.m.save()
        self.assertEqual(
            self.client.post(self.base + "branches/", {"name": "West"}).status_code, 403
        )


    def test_explicit_preview_is_visible_but_cannot_be_ordered(self):
        p = Product.objects.create(business=self.business, name="Preview perfume", sku="preview-perfume",
            price=40000, cost=None, active=False, published=False, showcase=True, image="https://example.com/perfume.jpg")
        Stock.objects.create(branch=self.branch, product=p, quantity=100)
        feed = self.client.get("/api/v1/featured-products/").data["products"]
        item = next(x for x in feed if x["id"] == p.pk)
        self.assertTrue(item["preview"])
        self.assertEqual(item["available"], 0)
        catalog = self.client.get("/api/v1/shop/one/").data["products"]
        self.assertEqual(next(x for x in catalog if x["id"] == p.pk)["available"], 0)
        self.assertTrue(self.client.get("/api/v1/shops/?q=Preview+perfume").data["shops"])
        data = self.order_data(lines=[{"product": p.pk, "quantity": 1, "discount": 0}])
        self.assertEqual(self.client.post("/api/v1/shop/one/", data, format="json").status_code, 404)
        self.assertEqual(self.client.post(self.base + "sales/", self.sale_data(lines=[{"product": p.pk, "quantity": 1, "price": 40000}]), format="json").status_code, 404)
        self.business.published = False
        self.business.save()
        self.assertFalse(self.client.get("/api/v1/featured-products/").data["products"])

    def test_featured_includes_shops_without_photos_and_keeps_drafts_private(self):
        self.product.image = ""
        self.product.save()
        self.p2.published = True
        self.p2.image = "https://example.com/photo.png"
        self.p2.save()
        draft = Product.objects.create(business=self.business, name="Private draft", sku="private-draft", price=1, cost=1, published=False)
        items = self.client.get("/api/v1/featured-products/?limit=2").data["products"]
        self.assertEqual({p["slug"] for p in items}, {"one", "two"})
        self.assertEqual(next(p for p in items if p["id"] == self.product.pk)["image"], "")
        self.assertNotIn(draft.pk, [p["id"] for p in items])
        self.product.image = "https://example.com/new-photo.png"
        self.product.save()
        items = self.client.get("/api/v1/featured-products/?limit=2").data["products"]
        self.assertEqual(next(p for p in items if p["id"] == self.product.pk)["image"], self.product.image)
