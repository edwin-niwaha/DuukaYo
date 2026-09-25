from django.db.models import Q


def visible_products(prefix=""):
    """Drafts stay private unless a merchant explicitly enables a showcase preview."""
    return (Q(**{prefix + "active": True, prefix + "published": True}) | Q(**{prefix + "showcase": True})) & Q(**{prefix + "business__suspended": False})


def orderable(product):
    return product.active and product.published
