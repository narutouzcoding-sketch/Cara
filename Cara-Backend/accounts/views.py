import json
from django.shortcuts import render
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.http import require_GET, require_POST
from django.contrib.auth import authenticate, login, logout

@require_GET
def me(request):
    user_data = None
    if request.user.is_authenticated:
        user_data = {
            'username': request.user.username,
            'email': request.user.email,
            'role': request.user.role,
        }
    csrf_token = get_token(request)
    return JsonResponse({"user": user_data, "csrfToken": csrf_token})

@require_POST
def register(request):
    return render(request, 'accounts/register.html')


@require_POST
def login_view(request):
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse(
            {"error": "JSON noto‘g‘ri"},
            status=400,
        )

    if not isinstance(data, dict):
        return JsonResponse(
            {"error": "JSON obyekt yuboring"},
            status=400,
        )

    username = data.get("username")
    password = data.get("password")

    if not isinstance(username, str) or not isinstance(password, str):
        return JsonResponse(
            {"error": "Username va parol matn bo‘lishi kerak"},
            status=400,
        )

    if not username.strip() or not password:
        return JsonResponse(
            {"error": "Username va parolni kiriting"},
            status=400,
        )

    user = authenticate(
        request,
        username=username,
        password=password,
    )

    if user is None:
        return JsonResponse(
            {"error": "Username yoki parol noto‘g‘ri"},
            status=401,
        )

    login(request, user)
    csrf_token = get_token(request)

    user_data = {
        "username": user.username,
        "email": user.email,
        "role": user.role,
    }

    return JsonResponse({
        "user": user_data,
        "csrfToken": csrf_token,
    })

@require_POST
def logout_view(request):
    logout(request)
    return JsonResponse({"message": "Muvaffaqiyatli chiqdi"})

def profile(request):
    return render(request, 'accounts/profile.html')

def change_password(request):
    return render(request, 'accounts/change_password.html')