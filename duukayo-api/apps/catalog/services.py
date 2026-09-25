from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.catalog.models import Product
from apps.inventory.models import Stock
from apps.inventory.services import stock_for


def resolve_lines(business, branch, data, offline=False, role="guest", public=False):
    lines, issues = [], []
    products = {
        p.pk: p
        for p in Product.objects.filter(
            business=business,
            pk__in=[x["product"] for x in data],
            **({"active": True} if not offline else {}),
            **({"published": True} if public else {}),
        )
    }
    stocks = {
        s.product_id: s
        for s in Stock.objects.filter(branch=branch, product_id__in=products)
    }
    for item in data:
        product = products.get(item["product"])
        if product is None:
            from django.http import Http404

            raise Http404("Product is unavailable.")
        price = item.get("price", product.price)
        discount = item.get("discount", 0)
        cost = item.get("cost", product.cost) if offline else product.cost
        if cost is None:
            raise ValidationError(
                {"cost": "An offline sale requires its recorded cost snapshot."}
            )
        if offline and not product.active:
            issues.append(f"Archived product: {product.sku}")
        if offline and cost != product.cost:
            issues.append(f"Stale cost: {product.sku}")
        if price != product.price:
            if not offline:
                raise ValidationError(
                    {"price": f"Price changed for {product.name}; refresh the catalog."}
                )
            issues.append(f"Stale price: {product.sku}")
        if discount and (offline or role not in ("owner", "manager")):
            raise PermissionDenied(
                "Only connected managers and owners may discount sales."
            )
        if discount > price * item["quantity"]:
            raise ValidationError("Discount exceeds line value.")
        stock = stocks.get(product.pk) or stock_for(branch, product)
        available = (
            stock.quantity - stock.reserved - (business.safety_buffer if public else 0)
        )
        if available < item["quantity"]:
            if not offline:
                raise ValidationError(
                    {"stock": f"Insufficient available stock for {product.name}."}
                )
            issues.append(f"Stock conflict: {product.sku}")
        lines.append(
            {
                "product": product.pk,
                "name": product.order_name,
                "quantity": item["quantity"],
                "price": price,
                "cost": cost,
                "discount": discount,
                "currency": business.currency,
            }
        )
    return lines, issues
