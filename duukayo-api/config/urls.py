from api.v1.views.business import health
from django.urls import include, path

urlpatterns = [path("health/", health), path("api/v1/", include("api.v1.urls"))]
