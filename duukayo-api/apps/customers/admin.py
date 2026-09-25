from django.contrib import admin

from .models import Customer


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("name", "phone", "business")
    search_fields = ("name", "phone")
    list_filter = ("business",)

    def get_readonly_fields(self, request, obj=None):
        return ("business",) if obj else ()
