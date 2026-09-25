from django import forms
from django.contrib import admin

from api.v1.serializers import BusinessSerializer

from .models import Branch, Business, Membership


class BusinessForm(forms.ModelForm):
    class Meta:
        model = Business
        fields = "__all__"

    def clean(self):
        data = super().clean()
        serializer = BusinessSerializer(
            self.instance if self.instance.pk else None,
            data={key: (value.pk if isinstance(value, Branch) else value)
                  for key, value in data.items()}, partial=True,
        )
        if not serializer.is_valid():
            for field, errors in serializer.errors.items():
                self.add_error(field if field in self.fields else None, errors)
        return data


@admin.register(Business)
class BusinessAdmin(admin.ModelAdmin):
    form = BusinessForm
    list_display = ("name", "slug", "published", "deleted_at", "contact")
    list_filter = ("published", "deleted_at")
    search_fields = ("name", "slug", "contact")
    readonly_fields = ("currency", "deleted_at")


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("name", "business")
    list_filter = ("business",)
    search_fields = ("name", "business__name")

    def get_readonly_fields(self, request, obj=None):
        return ("business",) if obj else ()


class MembershipForm(forms.ModelForm):
    class Meta:
        model = Membership
        fields = "__all__"

    def clean(self):
        data = super().clean()
        business = data.get("business") or (self.instance.business if self.instance.pk else None)
        branch = data.get("branch")
        if branch and business and branch.business_id != business.pk:
            self.add_error("branch", "Choose a branch belonging to this business.")
        return data


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    form = MembershipForm
    list_display = ("user", "business", "branch", "role", "active")
    list_filter = ("role", "active", "business")
    search_fields = ("user__username", "business__name")
    autocomplete_fields = ("user", "branch")

    def get_readonly_fields(self, request, obj=None):
        return ("user", "business") if obj else ()
