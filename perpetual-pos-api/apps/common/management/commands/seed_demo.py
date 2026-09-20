import uuid

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.businesses.models import Branch, Business, Membership
from apps.catalog.models import Category, Product
from apps.common.services import place_order
from apps.customers.models import Customer
from apps.inventory.models import Movement, Stock


class Command(BaseCommand):
    help = "Idempotent development-only demo seed; never resets existing stock or passwords."

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Seed is restricted to development settings.")
        for index, (name, slug) in enumerate(
            [
                ("Kampala Corner Shop", "kampala-corner"),
                ("Jinja Daily Market", "jinja-daily"),
            ]
        ):
            business, _ = Business.objects.get_or_create(
                slug=slug,
                defaults={
                    "name": name,
                    "contact": "+256 700 123 456",
                    "delivery_enabled": True,
                    "delivery_fee": 3000,
                },
            )
            branch, _ = Branch.objects.get_or_create(
                business=business, name="Main branch"
            )
            for role in ["owner", "cashier"]:
                user, created = get_user_model().objects.get_or_create(
                    username=f"{slug}-{role}"
                )
                if created:
                    user.set_password("DemoOnly!2026")
                    user.save()
                Membership.objects.get_or_create(
                    user=user,
                    business=business,
                    defaults={"branch": branch, "role": role},
                )
            category, _ = Category.objects.get_or_create(
                business=business, name="Everyday essentials"
            )
            products = []
            for sku, title, price, cost, qty in [
                ("MILK", "Fresh Dairy Milk 500ml", 2500, 1900, 40),
                ("BREAD", "Ntake Bread 400g", 4500, 3500, 25),
                ("SUGAR", "Kakira Sugar 1kg", 5000, 4200, 60),
                ("SOAP", "Mukwano Laundry Soap 1kg", 6500, 5000, 20),
                ("WATER", "Rwenzori Water 500ml", 1000, 650, 80),
                ("RICE", "Kaiso Rice 1kg", 4500, 3600, 35),
                ("TEA", "Igara Tea 250g", 4000, 2800, 4),
                ("OIL", "Fortune Cooking Oil 1L", 9500, 7900, 18),
            ]:
                product, _ = Product.objects.get_or_create(
                    business=business,
                    sku=sku,
                    defaults={
                        "category": category,
                        "name": title,
                        "price": price,
                        "cost": cost,
                        "published": True,
                        "barcode": f"256{index}{len(products):09d}",
                    },
                )
                stock, created = Stock.objects.get_or_create(
                    branch=branch, product=product, defaults={"quantity": qty}
                )
                if created:
                    Movement.objects.create(
                        business=business,
                        stock=stock,
                        delta=qty,
                        reason="Demo opening stock",
                        reference="seed",
                    )
                products.append(product)
            Customer.objects.get_or_create(
                business=business,
                phone="+256700000001",
                defaults={"name": "Amina Nakato"},
            )
            place_order(
                business,
                {
                    "client_id": uuid.uuid5(uuid.NAMESPACE_URL, slug),
                    "name": "Demo pickup customer",
                    "phone": "+256700000002",
                    "delivery": False,
                    "lines": [
                        {"product": products[0].pk, "quantity": 2, "discount": 0}
                    ],
                },
            )
        self.stdout.write(
            self.style.SUCCESS(
                "Demo businesses ready. Password for newly created accounts: DemoOnly!2026"
            )
        )
