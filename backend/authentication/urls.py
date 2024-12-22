from django.urls import path
from .views import login_view, register_view, me_view, admin_user_search, admin_user_sites

urlpatterns = [
    path('login/', login_view, name='login'),
    path('register/', register_view, name='register'),
    path('me/', me_view, name='me'),
    path('admin/users/', admin_user_search, name='admin_user_search'),
    path('admin/users/<int:user_id>/sites/', admin_user_sites, name='admin_user_sites'),
]