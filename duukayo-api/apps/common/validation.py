"""Model validation shared by REST, admin and ordinary ORM saves.

Atomic QuerySet.update/bulk_update writes still require service validation.
"""
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.core.validators import URLValidator
from django.db import models


def validate_phone(value):
    if not re.fullmatch(r"\+?[0-9 ()-]+", value) or not 7 <= sum(c.isdigit() for c in value) <= 15:
        raise ValidationError("Enter a phone number with 7 to 15 digits, optionally starting with +.")


class ValidatedQuerySet(models.QuerySet):
    def bulk_create(self, objs, **kwargs):
        objs = list(objs)
        for obj in objs:
            obj.clean_fields()
            obj.clean()
        return super().bulk_create(objs, **kwargs)


class ValidatedModel(models.Model):
    objects = ValidatedQuerySet.as_manager()

    class Meta:
        abstract = True

    def clean_fields(self, exclude=None):
        excluded = set(exclude or ())
        errors = {}
        for field in self._meta.fields:
            value = getattr(self, field.attname)
            if field.auto_created or getattr(field, "auto_now", False) or getattr(field, "auto_now_add", False) or (field.null and value is None) or (isinstance(field, models.JSONField) and value in ({}, [])):
                excluded.add(field.name)
            if field.name in excluded:
                continue
            if isinstance(value, str) and not field.blank and not value.strip():
                errors[field.name] = "This field cannot be blank."
            if isinstance(field, models.IntegerField) and not isinstance(field, models.AutoField) and value is not None:
                if isinstance(value, bool) or not isinstance(value, int):
                    errors[field.name] = "Enter a whole number."
                elif abs(value) > (100_000_000_000 if field.name in {"price", "cost", "delivery_fee"} else 1_000_000_000_000_000):
                    errors[field.name] = "This number exceeds the supported range."
            if field.name == "phone" and value:
                try:
                    validate_phone(value)
                except ValidationError as exc:
                    errors[field.name] = exc.messages
            if field.name == "currency" and value and (not isinstance(value, str) or not re.fullmatch(r"[A-Z]{3}", value)):
                errors[field.name] = "Use a three-letter uppercase currency code."
            if field.name == "quantity" and self._meta.model_name != "stock" and isinstance(value, int) and value <= 0:
                errors[field.name] = "Quantity must be at least 1."
        try:
            super().clean_fields(exclude=excluded)
        except ValidationError as exc:
            errors.update(exc.message_dict)
        if errors:
            raise ValidationError(errors)

    def clean(self):
        super().clean()
        try:
            self._clean_domain()
        except ObjectDoesNotExist:
            # full_clean still invokes clean after invalid foreign-key fields.
            # clean_fields supplies the useful field error in that case.
            return

    def _clean_domain(self):
        errors = {}
        kind = self._meta.model_name
        if kind == "business":
            try:
                ZoneInfo(self.timezone)
            except (ZoneInfoNotFoundError, ValueError, TypeError):
                errors["timezone"] = "Choose a valid timezone, such as Africa/Kampala."
            if self.storefront_branch_id and self.storefront_branch.business_id != self.pk:
                errors["storefront_branch"] = "Choose a branch belonging to this shop."
        if kind == "product":
            if self.category_id and self.category.business_id != self.business_id:
                errors["category"] = "Choose a category belonging to this shop."
            if self.cost is None and (self.active or self.published):
                errors["cost"] = "Enter the purchase cost before activating or publishing this product."
            if not isinstance(self.gallery, list) or len(self.gallery) > 8:
                errors["gallery"] = "Use a list of at most 8 image URLs."
            else:
                for url in self.gallery:
                    try:
                        URLValidator(schemes=["http", "https"])(url)
                    except (ValidationError, TypeError):
                        errors["gallery"] = "Enter valid image URLs."
            attrs = self.attributes
            if (not isinstance(attrs, dict) or len(attrs) > 20 or any(
                not isinstance(k, str) or not isinstance(v, str) or not k.strip() or not v.strip() or len(k) > 60 or len(v) > 100
                for k, v in attrs.items()
            )):
                errors["attributes"] = "Use up to 20 named options with non-empty text values."
            elif len({k.strip().casefold() for k in attrs}) != len(attrs):
                errors["attributes"] = "Option names must be unique."
            if self.variant_group and not attrs:
                errors["attributes"] = "Add at least one option to this variant."
        if (
            (kind in {"membership", "sale", "order", "operation"} and self.branch_id)
            and (self.branch.business_id != self.business_id)
        ):
            errors["branch"] = "Choose a branch belonging to this shop."
        if kind == "sale":
            if self.customer_id and self.customer.business_id != self.business_id:
                errors["customer"] = "Choose a customer belonging to this shop."
            if self.shift_id and self.shift.register.branch_id != self.branch_id:
                errors["shift"] = "Choose a shift belonging to this branch."
        if kind == "movement" and self.stock_id and self.stock.branch.business_id != self.business_id:
            errors["stock"] = "Choose stock belonging to this shop."
        if kind == "cashmovement" and self.amount == 0:
            errors["amount"] = "Enter a non-zero cash movement."
        if (
            (kind == "stock" and self.branch_id and self.product_id)
            and (self.branch.business_id != self.product.business_id)
        ):
            errors["product"] = "Choose a product belonging to this branch's shop."
        if kind == "transfer":
            for name in ("source", "destination", "product"):
                if getattr(self, name + "_id") and getattr(self, name).business_id != self.business_id:
                    errors[name] = "Choose a record belonging to this shop."
            if self.source_id == self.destination_id:
                errors["destination"] = "Choose a different destination branch."
        if kind in {"saleline", "orderline"}:
            parent = self.sale if kind == "saleline" else self.order
            if self.product_id and self.product.business_id != parent.business_id:
                errors["product"] = "Choose a product belonging to this shop."
            if all(isinstance(v, int) for v in (self.discount, self.price, self.quantity)) and self.discount > self.price * self.quantity:
                errors["discount"] = "Discount cannot exceed the line total."
        if kind == "returnline":
            if self.line.sale_id != self.sale_return.sale_id:
                errors["line"] = "Choose a line from the sale being returned."
            if isinstance(self.quantity, int) and self.quantity > self.line.quantity:
                errors["quantity"] = "Return quantity cannot exceed the original sale quantity."
        if (
            (kind == "reservation")
            and (self.stock.product_id != self.line.product_id or self.stock.branch_id != self.line.order.branch_id)
        ):
            errors["stock"] = "Reserve the ordered product at its fulfilment branch."
        if kind == "marketplacecheckout" and self.quote.cart_id != self.cart_id:
            errors["quote"] = "Choose a quote belonging to this cart."
        if kind in {"payment", "paymentallocation", "salereturn"}:
            methods = {"cash", "manual_mtn", "manual_airtel"}
            if kind == "payment":
                methods.add("split")
            if self.method not in methods:
                errors["method"] = "Choose a supported payment method."
            if isinstance(self.method, str) and self.method.startswith("manual_") and not self.reference.strip():
                errors["reference"] = "Enter the received mobile-money transaction reference."
            if kind != "salereturn" and all(isinstance(v, int) for v in (self.tendered, self.amount, self.change)):
                if self.tendered < self.amount:
                    errors["tendered"] = "The received amount must cover the payment."
                if self.change != self.tendered - self.amount:
                    errors["change"] = "Change must equal the received amount minus the payment."
        if kind == "order":
            if self.delivery and not self.address.strip():
                errors["address"] = "Enter a delivery address."
            if self.status not in {"pending", "accepted", "preparing", "ready", "completed", "cancelled", "expired"}:
                errors["status"] = "Choose a valid order status."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        # Database uniqueness/constraints remain authoritative for race safety.
        self.clean_fields()
        self.clean()
        return super().save(*args, **kwargs)
