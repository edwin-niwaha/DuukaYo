from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import SimpleRouter
from rest_framework_simplejwt.views import (
    TokenBlacklistView,
    TokenObtainPairView,
    TokenRefreshView,
)

from api.v1.views.auth import (
    CreateBusinessView,
    GoogleSessionView,
    GoogleTokenView,
    MeView,
    RegisterView,
    SessionView,
)
from api.v1.views.business import (
    BusinessView,
    CategoryViewSet,
    CustomerViewSet,
    DeviceView,
    GuestOrderView,
    OrderActionView,
    OrdersView,
    ProductViewSet,
    ReceiptView,
    ReportView,
    SalesView,
    ShopView,
    StaffView,
    StockView,
)

router = SimpleRouter()
router.register("products", ProductViewSet, basename="product")
router.register("categories", CategoryViewSet, basename="category")
router.register("customers", CustomerViewSet, basename="customer")
urlpatterns = [
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema")),
]
urlpatterns += [
    path(p, v)
    for p, v in [
        ("auth/google/", GoogleTokenView.as_view()),
        ("auth/google/session/", GoogleSessionView.as_view()),
        ("businesses/", CreateBusinessView.as_view()),
        ("auth/register/", RegisterView.as_view()),
        ("auth/session/", SessionView.as_view()),
        ("auth/token/", TokenObtainPairView.as_view()),
        ("auth/refresh/", TokenRefreshView.as_view()),
        ("auth/revoke/", TokenBlacklistView.as_view()),
        ("auth/me/", MeView.as_view()),
        ("businesses/<int:business_id>/", BusinessView.as_view()),
        ("businesses/<int:business_id>/staff/", StaffView.as_view()),
        ("businesses/<int:business_id>/stock/", StockView.as_view()),
        ("businesses/<int:business_id>/sales/", SalesView.as_view()),
        ("businesses/<int:business_id>/sales/<int:sale_id>/", ReceiptView.as_view()),
        ("businesses/<int:business_id>/orders/", OrdersView.as_view()),
        (
            "businesses/<int:business_id>/orders/<int:order_id>/",
            OrderActionView.as_view(),
        ),
        ("businesses/<int:business_id>/reports/", ReportView.as_view()),
        ("businesses/<int:business_id>/devices/", DeviceView.as_view()),
        ("shop/<slug:slug>/", ShopView.as_view()),
        ("guest-orders/<str:token>/", GuestOrderView.as_view()),
    ]
]
urlpatterns += [path("businesses/<int:business_id>/", include(router.urls))]
