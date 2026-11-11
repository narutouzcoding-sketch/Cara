import json
from django.shortcuts import render
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.http import require_GET, require_POST
from django.contrib.auth import authenticate, login, logout
import re
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from .models import User


@require_GET
def me(request):
    user_data = None
    if request.user.is_authenticated:
        user_data = {
            "id": request.user.id,
            "username": request.user.username,
            "email": request.user.email,
            "role": request.user.role,
        }
    csrf_token = get_token(request)
    return JsonResponse(
        {
            "user": user_data,
            "csrfToken": csrf_token,
        }
    )


@require_POST
def register(request):
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
    email = data.get("email")
    password = data.get("password")

    if (
        not isinstance(username, str)
        or not isinstance(email, str)
        or not isinstance(password, str)
    ):
        return JsonResponse(
            {"error": "Username, email va parol matn bo‘lishi kerak"},
            status=400,
        )

    username = username.strip()
    email = email.strip()

    if not username or not email or not password:
        return JsonResponse(
            {"error": "Username, email va parolni kiriting"},
            status=400,
        )

    if not re.fullmatch(r"[a-zA-Z0-9_.-]{3,30}", username):
        return JsonResponse(
            {
                "error": (
                    "Username 3–30 belgidan iborat bo‘lsin. "
                    "Faqat lotin harflari, raqamlar, nuqta, "
                    "pastki chiziq va tire ishlating."
                )
            },
            status=400,
        )

    if not 5 <= len(email) <= 150:
        return JsonResponse(
            {"error": "Email 5–150 belgidan iborat bo‘lishi kerak"},
            status=400,
        )

    try:
        validate_email(email)
    except ValidationError:
        return JsonResponse(
            {"error": "To‘g‘ri email manzilini kiriting"},
            status=400,
        )

    if not 8 <= len(password) <= 128:
        return JsonResponse(
            {"error": "Parol 8–128 belgidan iborat bo‘lishi kerak"},
            status=400,
        )

    candidate = User(
        username=username,
        email=email,
    )

    try:
        validate_password(password, user=candidate)
    except ValidationError:
        return JsonResponse(
            {
                "error": (
                    "Parol xavfsizlik talablariga mos emas. "
                    "Juda oddiy, faqat raqamlardan iborat yoki "
                    "username/emailga juda o‘xshash parol tanlamang."
                )
            },
            status=400,
        )

    if User.objects.filter(username__iexact=username).exists():
        return JsonResponse(
            {"error": "Username allaqachon mavjud"},
            status=409,
        )

    if User.objects.filter(email__iexact=email).exists():
        return JsonResponse(
            {"error": "Email allaqachon mavjud"},
            status=409,
        )

    try:
        with transaction.atomic():
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
            )
    except IntegrityError:
        username_taken = User.objects.filter(
            username__iexact=username,
        ).exists()

        email_taken = User.objects.filter(
            email__iexact=email,
        ).exists()

        if username_taken or email_taken:
            return JsonResponse(
                {"error": "Username yoki email allaqachon mavjud"},
                status=409,
            )

        raise

    login(request, user)

    csrf_token = get_token(request)

    user_data = {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
    }

    return JsonResponse(
        {
            "user": user_data,
            "csrfToken": csrf_token,
        },
        status=201,
    )


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

    username = username.strip()

    saved_username = (
        User.objects.filter(username__iexact=username)
        .values_list("username", flat=True)
        .first()
    )

    user = authenticate(
        request,
        username=saved_username or username,
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
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
    }

    return JsonResponse(
        {
            "user": user_data,
            "csrfToken": csrf_token,
        }
    )


@require_POST
def logout_view(request):
    if not request.user.is_authenticated:
        return JsonResponse(
            {"error": "Avval hisobingizga kiring"},
            status=401,
        )

    logout(request)

    return JsonResponse(
        {
            "ok": True,
        }
    )


def profile(request):
    return render(request, "accounts/profile.html")


def change_password(request):
    return render(request, "accounts/change_password.html")
