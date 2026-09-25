from django import forms
from django.contrib import admin

from api.v1.serializers import ProductSerializer

from .models import Category, Product


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "business")
    search_fields = ("name", "business__name")
    list_filter = ("business",)

    def get_readonly_fields(self, request, obj=None):
        return ("business",) if obj else ()


class ProductForm(forms.ModelForm):
    class Meta:
        model = Product
        fields = "__all__"

    def clean(self):
        data = super().clean()
        data["gallery"] = data.get("gallery") or []
        data["attributes"] = data.get("attributes") or {}
        business = data.get("business") or (self.instance.business if self.instance.pk else None)
        if business:
            values = {key: (value.pk if isinstance(value, Category) else value)
                      for key, value in data.items() if key != "business"}
            serializer = ProductSerializer(self.instance if self.instance.pk else None,
                                           data=values, partial=True, context={"business": business})
            if not serializer.is_valid():
                for field, errors in serializer.errors.items():
                    self.add_error(field if field in self.fields else None, errors)
            else:
                data.update(serializer.validated_data)
        return data


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    form = ProductForm
    list_display = ("name", "sku", "business", "price", "active", "published")
    list_filter = ("business", "active", "published")
    search_fields = ("name", "sku", "barcode")
    autocomplete_fields = ("category",)

    def get_readonly_fields(self, request, obj=None):
        return ("business", "updated_at") if obj else ("updated_at",)
