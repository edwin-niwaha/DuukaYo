from rest_framework.exceptions import ValidationError

METHODS = ("cash", "manual_mtn", "manual_airtel")
MAX_AMOUNT = 1_000_000_000_000_000


def validate_payment(method, reference=""):
    if method not in METHODS:
        raise ValidationError({"method": "Choose a supported payment method."})
    if method != "cash" and not reference.strip():
        raise ValidationError({"reference": "Enter the received mobile-money transaction reference."})
    if len(reference) > 100:
        raise ValidationError({"reference": "Reference must be at most 100 characters."})



def allocation_plan(data, total):
    if data["method"] != "split":
        if data.get("payments"):
            raise ValidationError({"payments": "Payment parts require the split method."})
        validate_payment(data["method"], data.get("reference", ""))
        parts = [{"method": data["method"], "amount": total, "tendered": data["tendered"], "reference": data.get("reference", "")}]
    else:
        parts = data.get("payments", [])
        if not 2 <= len(parts) <= 5 or sum(x["amount"] for x in parts) != total:
            raise ValidationError({"payments": "Supply two to five payments adding up to the sale total."})
        if sum(x["tendered"] for x in parts) != data["tendered"]:
            raise ValidationError({"tendered": "Tendered must equal the sum of payment parts."})
    for part in parts:
        validate_payment(part["method"], part.get("reference", ""))
        if part["tendered"] < part["amount"] or (part["method"] != "cash" and part["tendered"] != part["amount"]):
            raise ValidationError({"payments": "Cash must cover its allocation; mobile money must equal its allocation."})
    return parts


def record_allocations(sale, parts):
    from apps.payments.models import PaymentAllocation
    PaymentAllocation.objects.bulk_create([PaymentAllocation(sale=sale, method=p["method"], amount=p["amount"],
        tendered=p["tendered"], change=p["tendered"] - p["amount"], reference=p.get("reference", "")) for p in parts])
