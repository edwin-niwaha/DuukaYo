from django.apps import apps
from django.core.exceptions import ValidationError
from django.test import TestCase

from apps.businesses.models import Business
from apps.catalog.models import Product
from apps.common.tests import Fixture
from apps.common.validation import ValidatedModel, validate_phone
from apps.customers.models import Customer
from apps.inventory.models import Stock
from apps.orders.models import Cart, CartLine


class ValidationTests(Fixture, TestCase):
    def test_all_application_models_share_validation(self):
        for model in apps.get_models():
            if model.__module__.startswith("apps."):
                self.assertTrue(issubclass(model, ValidatedModel), model.__name__)

    def test_invalid_scalar_values_cannot_be_saved(self):
        for changes in ({"name": "   "}, {"price": -1}, {"price": 1.5}, {"price": True}, {"sku": "x" * 61}):
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                Product.objects.create(business=self.business, **{ "name": "Rice", "sku": "rice", "price": 100, "cost": 50, **changes })

    def test_phone_counts_digits_not_punctuation(self):
        for phone in ("-------", "123456", "+2561234567890123", "0700abc123"):
            with self.subTest(phone=phone), self.assertRaises(ValidationError):
                validate_phone(phone)
        for phone in ("0700 123456", "+256 (700) 123-456"):
            validate_phone(phone)

    def test_bulk_create_validates_before_writing_any_rows(self):
        before = Customer.objects.count()
        with self.assertRaises(ValidationError):
            Customer.objects.bulk_create([
                Customer(business=self.business, name="Valid", phone="0700123456"),
                Customer(business=self.business, name="Invalid", phone="-------"),
            ])
        self.assertEqual(Customer.objects.count(), before)

    def test_cross_shop_assignment_rejected(self):
        self.m.branch = self.branch2
        with self.assertRaisesMessage(ValidationError, "branch"):
            self.m.save()
        with self.assertRaisesMessage(ValidationError, "product"):
            Stock.objects.create(branch=self.branch, product=self.p2)

    def test_offline_negative_stock_is_still_supported(self):
        self.stock.quantity = -2
        self.stock.save()
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, -2)

    def test_line_quantity_must_be_positive(self):
        cart = Cart.objects.create(token_hash="a" * 64)
        with self.assertRaisesMessage(ValidationError, "quantity"):
            CartLine.objects.create(cart=cart, product=self.product, quantity=0)

    def test_timezone_and_product_options(self):
        with self.assertRaisesMessage(ValidationError, "timezone"):
            Business.objects.create(name="Test", slug="test", timezone="Unknown/Nowhere")
        self.product.attributes = {"Size": "M", " size ": "L"}
        with self.assertRaisesMessage(ValidationError, "attributes"):
            self.product.save()

    def test_api_returns_field_errors_without_saving(self):
        response = self.client.post(self.base + "customers/", {"name": "Buyer", "phone": "-------"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "validation_error")
        self.assertIn("phone", response.data)
