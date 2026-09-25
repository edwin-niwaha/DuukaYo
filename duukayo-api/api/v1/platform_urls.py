from django.urls import include, path
from rest_framework.routers import SimpleRouter

from api.v1.views import platform as views

router = SimpleRouter()
router.register("products", views.ProductsView, basename="platform-product")
router.register("categories", views.CategoriesView, basename="platform-category")

urlpatterns = [
    path("shops/", views.ShopsView.as_view()),
    path("shops/<int:business_id>/", views.ShopView.as_view()),
    path("shops/<int:business_id>/images/", views.ImagesView.as_view()),
    path("shops/<int:business_id>/access/", views.AccessView.as_view()),
    path("shops/<int:business_id>/access/<int:membership_id>/", views.AccessView.as_view()),
    path("shops/<int:business_id>/branches/", views.BranchesView.as_view()),
    path("shops/<int:business_id>/branches/<int:branch_id>/", views.BranchesView.as_view()),
    path("shops/<int:business_id>/branches/<int:branch_id>/stock/adjust/", views.StockView.as_view()),
    path("shops/<int:business_id>/branches/<int:branch_id>/orders/<int:order_id>/", views.OrderView.as_view()),
    path("shops/<int:business_id>/branches/<int:branch_id>/sales/<int:sale_id>/returns/", views.ReturnView.as_view()),
    path("shops/<int:business_id>/branches/<int:branch_id>/", include(router.urls)),
    path("shops/<int:business_id>/branches/<int:branch_id>/<str:resource>/", views.RecordsView.as_view()),
    path("users/photos/", views.UserPhotoView.as_view()),
    path("users/", views.UsersView.as_view()),
    path("users/<int:user_id>/", views.UserView.as_view()),
    path("settings/", views.SettingsView.as_view()),
    path("reports/", views.ReportsView.as_view()),
    path("audit/", views.AuditView.as_view()),
]
