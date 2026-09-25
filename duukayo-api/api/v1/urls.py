from django.urls import include, path
from django.views.generic import TemplateView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import SimpleRouter
from rest_framework_simplejwt.views import (
    TokenBlacklistView,
    TokenRefreshView,
)

from api.v1.views.account import (
    ChangePasswordView,
    ConfirmRecoveryView,
    ProfileView,
    RequestRecoveryView,
)
from api.v1.views.auth import (
    AccountRegistrationView,
    CreateBusinessView,
    CredentialTokenView,
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
    ShopsView,
    ShopView,
    StaffView,
    StockView,
)
from api.v1.views.marketplace import (
    AddressesView,
    AddressView,
    CartsView,
    CartView,
    MarketplaceCheckoutView,
    MergeCartView,
    MyCartView,
    MyOrdersView,
    QuotesView,
)
from api.v1.views.merchandising import (
    BranchesView,
    FeaturedProductsView,
    ImageUploadView,
)
from api.v1.views.operations import (
    RegistersView,
    ReturnsView,
    ShiftsView,
    StaffMemberView,
    TransfersView,
)
from api.v1.views.platform import PublicSettingsView

router = SimpleRouter()
router.register("products", ProductViewSet, basename="product")
router.register("categories", CategoryViewSet, basename="category")
router.register("customers", CustomerViewSet, basename="customer")
urlpatterns = [
    path("public/settings/", PublicSettingsView.as_view()),
    path("platform/", include("api.v1.platform_urls")),
    path("carts/", CartsView.as_view()),
    path("my/cart/", MyCartView.as_view()),
    path("carts/<int:cart_id>/", CartView.as_view()),
    path("carts/<int:cart_id>/merge/", MergeCartView.as_view()),
    path("carts/<int:cart_id>/quotes/", QuotesView.as_view()),
    path("carts/<int:cart_id>/checkout/", MarketplaceCheckoutView.as_view()),
    path("my/orders/", MyOrdersView.as_view()),
    path("my/addresses/", AddressesView.as_view()),
    path("my/addresses/<int:address_id>/", AddressView.as_view()),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("", TemplateView.as_view(template_name="api/docs.html"), name="api-home"),
    path("docs/", TemplateView.as_view(template_name="api/docs.html"), name="api-docs"),
    path("docs/explorer/", SpectacularSwaggerView.as_view(url_name="schema", template_name="api/explorer.html"), name="api-explorer"),
]
urlpatterns += [
    path(p, v)
    for p, v in [
        ("auth/google/", GoogleTokenView.as_view()),
        ("auth/google/session/", GoogleSessionView.as_view()),
        ("businesses/", CreateBusinessView.as_view()),
        ("auth/register/", RegisterView.as_view()),
        ("auth/accounts/", AccountRegistrationView.as_view()),
        ("auth/session/", SessionView.as_view()),
        ("auth/token/", CredentialTokenView.as_view()),
        ("auth/refresh/", TokenRefreshView.as_view()),
        ("auth/revoke/", TokenBlacklistView.as_view()),
        ("auth/me/", MeView.as_view()),
        ("auth/profile/", ProfileView.as_view()),
        ("auth/password/change/", ChangePasswordView.as_view()),
        ("auth/password/recovery/", RequestRecoveryView.as_view()),
        ("auth/password/reset/", ConfirmRecoveryView.as_view()),
        ("businesses/<int:business_id>/", BusinessView.as_view()),
        ("businesses/<int:business_id>/staff/", StaffView.as_view()),
        ("businesses/<int:business_id>/staff/<int:staff_id>/", StaffMemberView.as_view()),
        ("businesses/<int:business_id>/stock/", StockView.as_view()),
        ("businesses/<int:business_id>/registers/", RegistersView.as_view()),
        ("businesses/<int:business_id>/shifts/", ShiftsView.as_view()),
        ("businesses/<int:business_id>/transfers/", TransfersView.as_view()),
        ("businesses/<int:business_id>/sales/<int:sale_id>/returns/", ReturnsView.as_view()),
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
        ("shops/", ShopsView.as_view()),
        ("featured-products/", FeaturedProductsView.as_view()),
        ("businesses/<int:business_id>/images/", ImageUploadView.as_view()),
        ("businesses/<int:business_id>/branches/", BranchesView.as_view()),
        ("guest-orders/<str:token>/", GuestOrderView.as_view()),
    ]
]
urlpatterns += [path("businesses/<int:business_id>/", include(router.urls))]
