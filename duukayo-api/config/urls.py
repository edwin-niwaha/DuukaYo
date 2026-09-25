from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.views.generic import TemplateView

from api.v1.views.business import health

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", TemplateView.as_view(template_name="api/docs.html")),
    path("health/", health),
    path("api/v1/", include("api.v1.urls")),
]
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
