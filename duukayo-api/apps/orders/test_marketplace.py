import uuid
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.common.tests import Fixture
from apps.inventory.models import Stock
from apps.orders.models import MarketplaceCheckout, Order, Quote


class MarketplaceTests(Fixture, TestCase):
    def test_account_cart_is_stable_and_private(self):
        first = self.client.get("/api/v1/my/cart/").json()
        self.assertEqual(first, self.client.get("/api/v1/my/cart/").json())
        self.client.force_authenticate(self.other)
        other = self.client.get("/api/v1/my/cart/").json()
        self.assertNotEqual(first["id"], other["id"])
        self.assertEqual(self.client.get(f"/api/v1/carts/{first['id']}/").status_code, 404)
        self.assertIn(APIClient().get("/api/v1/my/cart/").status_code, (401, 403))

    def test_guest_cart_merges_once_and_restores_shop_details(self):
        guest = APIClient()
        source = guest.post("/api/v1/carts/", {}, format="json").json()
        guest.credentials(HTTP_X_CART_TOKEN=source["token"])
        url = f"/api/v1/carts/{source['id']}/"
        self.assertEqual(guest.put(url, {"lines": [{"product": self.product.pk, "quantity": 2}]}, format="json").status_code, 200)
        target = self.client.get("/api/v1/my/cart/").json()
        target_url = f"/api/v1/carts/{target['id']}/"
        self.client.put(target_url, {"lines": [{"product": self.product.pk, "quantity": 3}]}, format="json")
        body = {"source": source["id"], "token": source["token"]}
        result = self.client.post(target_url + "merge/", body, format="json")
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.json()["lines"][0]["quantity"], 5)
        self.assertEqual(result.json()["lines"][0]["slug"], self.business.slug)
        self.assertEqual(self.client.post(target_url + "merge/", body, format="json").json(), result.json())
        self.assertEqual(guest.get(url).status_code, 404)
        self.client.force_authenticate(self.other)
        other = self.client.get("/api/v1/my/cart/").json()
        self.assertEqual(self.client.post(f"/api/v1/carts/{other['id']}/merge/", body, format="json").status_code, 404)

    def test_signed_in_browser_can_upload_a_guest_cart_for_merging(self):
        source = self.client.post("/api/v1/carts/", {"guest": True}, format="json").json()
        from apps.orders.models import Cart

        self.assertIsNone(Cart.objects.get(pk=source["id"]).user_id)

    def setup_cart(self, guest=False):
        if guest:
            self.client = APIClient()
        cart = self.client.post("/api/v1/carts/", {}, format="json").json()
        self.cart = cart
        self.url = f"/api/v1/carts/{cart['id']}/"
        self.client.credentials(HTTP_X_CART_TOKEN=cart["token"])
        self.p2.published = True
        self.p2.save()
        self.b2.safety_buffer = 0
        self.b2.save()
        Stock.objects.create(branch=self.branch2, product=self.p2, quantity=5)
        result = self.client.put(
            self.url,
            {
                "lines": [
                    {"product": self.product.pk, "quantity": 2},
                    {"product": self.p2.pk, "quantity": 1},
                ]
            },
            format="json",
        )
        self.assertEqual(result.status_code, 200, result.data)

    def quote(self):
        result = self.client.post(
            self.url + "quotes/",
            {"name": "Customer", "phone": "+256700000000"},
            format="json",
        )
        self.assertEqual(result.status_code, 201, result.data)
        return result.json()

    def test_multishop_checkout_retry_and_history(self):
        self.setup_cart()
        quote = self.quote()
        self.assertEqual(quote["total"], 14000)
        payload = {"quote": quote["id"], "client_id": str(uuid.uuid4())}
        result = self.client.post(self.url + "checkout/", payload, format="json")
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(len(result.json()["orders"]), 2)
        self.assertEqual(
            self.client.post(self.url + "checkout/", payload, format="json").json(),
            result.json(),
        )
        self.assertEqual(Order.objects.count(), 2)
        self.assertEqual(len(self.client.get("/api/v1/my/orders/").json()), 1)
        self.assertEqual(self.client.get(self.url).json()["lines"], [])

    def test_price_change_requires_reconfirmation_without_partial_orders(self):
        self.setup_cart()
        quote = self.quote()
        self.p2.price += 100
        self.p2.save()
        result = self.client.post(
            self.url + "checkout/",
            {"quote": quote["id"], "client_id": str(uuid.uuid4())},
            format="json",
        )
        self.assertEqual(result.status_code, 400)
        self.assertEqual(Order.objects.count(), 0)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.reserved, 0)

    def test_second_shop_shortage_rolls_back_every_shop(self):
        self.setup_cart()
        quote = self.quote()
        Stock.objects.filter(product=self.p2).update(quantity=0)
        result = self.client.post(
            self.url + "checkout/",
            {"quote": quote["id"], "client_id": str(uuid.uuid4())},
            format="json",
        )
        self.assertEqual(result.status_code, 400)
        self.assertEqual(MarketplaceCheckout.objects.count(), 0)
        self.assertEqual(Order.objects.count(), 0)

    def test_guest_cart_requires_capability_and_expired_quote_rejected(self):
        self.setup_cart(guest=True)
        quote = self.quote()
        self.client.credentials()
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.client.credentials(HTTP_X_CART_TOKEN=self.cart["token"])
        Quote.objects.filter(pk=quote["id"]).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )
        self.assertEqual(
            self.client.post(
                self.url + "checkout/",
                {"quote": quote["id"], "client_id": str(uuid.uuid4())},
                format="json",
            ).status_code,
            400,
        )

    def test_customer_addresses_are_private(self):
        result = self.client.post(
            "/api/v1/my/addresses/",
            {
                "label": "Home",
                "name": "Owner",
                "phone": "+256700000000",
                "address": "Kampala",
            },
            format="json",
        )
        self.assertEqual(result.status_code, 201)
        self.client.force_authenticate(self.other)
        self.assertEqual(
            self.client.patch(
                f"/api/v1/my/addresses/{result.json()['id']}/",
                {"name": "Someone else"},
                format="json",
            ).status_code,
            404,
        )
