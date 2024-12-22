"""
URL configuration for WebpageMonitorBackend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from pages.views import homePageView, monitor, monitor_site_detail, monitor_site_history, monitor_site_settings

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", homePageView, name="home"),
    path("monitor", monitor, name="monitor"),
    path("api/monitor/", monitor, name="monitor_api"),
    path("api/monitor/<int:site_id>/", monitor_site_detail, name="monitor_site_detail"),
    path("api/monitor/<int:site_id>/history/", monitor_site_history, name="monitor_site_history"),
    path("api/monitor/<int:site_id>/settings/", monitor_site_settings, name="monitor_site_settings"),
    path("api/auth/", include("authentication.urls")),
    path("api/admin/", include("authentication.admin_urls")),
]