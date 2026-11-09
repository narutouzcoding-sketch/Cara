from . import views
from django.urls import path

urlpatterns = [
    path('register', views.register, name='register'),
    path('login', views.login_view, name='login'),
    path('logout', views.logout_view, name='logout'),
    path('profile', views.profile, name='profile'),
    path('change-password', views.change_password, name='change_password'),
    path('me', views.me, name='me'),
]