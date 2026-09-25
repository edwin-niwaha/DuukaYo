import uuid

from django.test import TestCase

from apps.businesses.models import Branch
from apps.common.services import checkout
from apps.common.tests import Fixture
from apps.inventory.models import Stock
from apps.payments.models import PaymentAllocation
from apps.sales.models import SaleReturn


class PosOperationsTests(Fixture, TestCase):
    def post(self, path, **data):
        return self.client.post(
            self.base + path, {"client_id": str(uuid.uuid4()), **data}, format="json"
        )

    def open_shift(self):
        register = self.post("registers/", name="Front counter").json()["id"]
        response = self.post("shifts/", action="open", register=register, amount=1000)
        self.assertEqual(response.status_code, 200, response.data)
        return response.json()["id"]

    def test_shift_sale_refund_and_close_reconcile(self):
        shift = self.open_shift()
        sale = checkout(self.m, self.sale_data())
        result = self.post(
            f"sales/{sale.pk}/returns/",
            reason="Returned unopened",
            method="cash",
            lines=[{"line": sale.lines.get().pk, "quantity": 1, "restock": True}],
        )
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.json()["amount"], 2500)
        result = self.post("shifts/", action="close", shift=shift, amount=3500)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.json()["expected_cash"], 3500)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 9)

    def test_refund_retry_and_over_return(self):
        sale = checkout(self.m, self.sale_data())
        data = {
            "client_id": str(uuid.uuid4()),
            "reason": "Returned unopened",
            "method": "cash",
            "lines": [{"line": sale.lines.get().pk, "quantity": 2, "restock": True}],
        }
        path = f"sales/{sale.pk}/returns/"
        first = self.post(path, **data)
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(self.post(path, **data).json(), first.json())
        self.assertEqual(
            self.post(path, **dict(data, client_id=str(uuid.uuid4()))).status_code, 400
        )
        self.assertEqual(SaleReturn.objects.count(), 1)

    def test_cashier_cannot_refund_or_move_cash(self):
        shift = self.open_shift()
        sale = checkout(self.m, self.sale_data())
        self.m.role = "cashier"
        self.m.save()
        self.assertEqual(
            self.post(
                "shifts/", action="cash_out", shift=shift, amount=1, reason="Petty cash"
            ).status_code,
            403,
        )
        self.assertEqual(
            self.post(
                f"sales/{sale.pk}/returns/",
                reason="Return",
                method="cash",
                lines=[{"line": sale.lines.get().pk, "quantity": 1}],
            ).status_code,
            403,
        )

    def test_split_tenders_sum_and_snapshot(self):
        data = self.sale_data(
            method="split",
            tendered=6000,
            payments=[
                {"method": "cash", "amount": 2000, "tendered": 3000},
                {
                    "method": "manual_mtn",
                    "amount": 3000,
                    "tendered": 3000,
                    "reference": "MTN-42",
                },
            ],
        )
        response = self.client.post(self.base + "sales/", data, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(PaymentAllocation.objects.count(), 2)
        self.assertEqual(response.json()["payment"]["change"], 1000)
        data["client_id"] = str(uuid.uuid4())
        data["payments"][0]["amount"] = 1000
        self.assertEqual(
            self.client.post(self.base + "sales/", data, format="json").status_code, 400
        )

    def test_transfer_dispatch_receive_once_and_tenant_isolation(self):
        branch = Branch.objects.create(business=self.business, name="Receiving")
        data = {
            "action": "dispatch",
            "destination": branch.pk,
            "product": self.product.pk,
            "quantity": 3,
        }
        response = self.post("transfers/", **data)
        self.assertEqual(response.status_code, 200, response.data)
        transfer = response.json()["id"]
        self.assertEqual(
            self.post("transfers/", action="receive", transfer=transfer).status_code,
            404,
        )
        self.m.branch = branch
        self.m.save()
        received = {
            "action": "receive", "transfer": transfer, "client_id": str(uuid.uuid4())
        }
        self.assertEqual(self.post("transfers/", **received).status_code, 200)
        self.assertEqual(self.post("transfers/", **received).status_code, 200)
        self.assertEqual(
            Stock.objects.get(branch=branch, product=self.product).quantity, 3
        )
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 7)
        self.assertEqual(
            self.post(
                "transfers/", **dict(data, destination=self.branch2.pk)
            ).status_code,
            404,
        )
