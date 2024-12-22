from django.contrib.auth import authenticate, login
from django.contrib.auth.hashers import make_password, check_password
from django.contrib.auth.models import User
from django.db import connection, transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.contrib.auth import get_user_model
from django.db.models import Q, Count
import json
import logging

from pages.models import MonitoredPage

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["POST"])
def login_view(request):
    """Authenticate against Django's built-in User model.

    Expected JSON:
      {"username": "user@example.com", "password": "..."}

    We treat the incoming "username" as an email for convenience.
    """
    try:
        data = json.loads(request.body)
        email = (data.get('username') or '').strip()
        password = data.get('password') or ''

        if not email or not password:
            return JsonResponse({'error': 'Username and password are required'}, status=400)

        # Try email first.
        try:
            user_obj = User.objects.get(email__iexact=email)
            username = user_obj.username
        except User.DoesNotExist:
            # Fall back to treating the input as a username.
            username = email

        user = authenticate(request, username=username, password=password)
        if user is None:
            return JsonResponse({'error': 'Invalid username or password'}, status=401)

        if not user.is_active:
            return JsonResponse({'error': 'This account is disabled'}, status=403)

        # Establish a Django session (cookie-based).
        login(request, user)

        role = 'admin' if (user.is_staff or user.is_superuser) else 'user'
        full_name = (user.get_full_name() or '').strip()

        return JsonResponse(
            {
                'message': 'Login successful',
                'user': {
                    'id': str(user.id),
                    'email': user.email or '',
                    'full_name': full_name,
                    'role': role,
                },
            },
            status=200,
        )

    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON format'}, status=400)
    except Exception as e:
        logger.exception("Login failed")
        return JsonResponse({'error': 'An error occurred during login', 'details': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def register_view(request):
    """Register a new Django user in auth_user.

    Expected JSON:
      {"username": "display name", "email": "user@example.com", "password": "..."}

    New users are created as normal users (non-staff).
    """
    try:
        data = json.loads(request.body)
        display_name = (data.get('username') or '').strip()
        email = (data.get('email') or '').strip()
        password = data.get('password') or ''

        if not display_name or not email or not password:
            return JsonResponse({'error': 'Username, email, and password are required'}, status=400)

        if User.objects.filter(email__iexact=email).exists():
            return JsonResponse({'error': 'An account with this email already exists'}, status=400)

        # Create a unique username for Django's auth system.
        base_username = email.split('@')[0] or 'user'
        username = base_username
        suffix = 1
        while User.objects.filter(username__iexact=username).exists():
            suffix += 1
            username = f"{base_username}{suffix}"

        first_name = display_name
        last_name = ''

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
        )
        # Ensure normal user by default.
        user.is_staff = False
        user.is_superuser = False
        user.save(update_fields=['is_staff', 'is_superuser'])

        return JsonResponse(
            {
                'message': 'Registration successful',
                'user': {
                    'id': str(user.id),
                    'email': user.email,
                    'full_name': (user.get_full_name() or '').strip(),
                    'role': 'user',
                },
            },
            status=201,
        )

    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON format'}, status=400)
    except Exception as e:
        logger.exception("Registration failed")
        return JsonResponse({'error': 'An error occurred during registration', 'details': str(e)}, status=500)


@require_http_methods(["GET"])
def me_view(request):
    """Return the currently authenticated user (session-based)."""
    user = getattr(request, 'user', None)
    if user is None or not user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)

    role = 'admin' if (user.is_staff or user.is_superuser) else 'user'
    return JsonResponse(
        {
            'user': {
                'id': str(user.id),
                'email': user.email or '',
                'full_name': (user.get_full_name() or '').strip(),
                'role': role,
            }
        },
        status=200,
    )


def _ensure_admin(request):
    user = getattr(request, 'user', None)
    if user is None or not user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)
    if not (user.is_staff or user.is_superuser):
        return JsonResponse({'error': 'Admin access required'}, status=403)
    return None


@require_http_methods(["GET"])
def admin_user_search(request):
    """Search users by username or email (admin-only)."""
    denial = _ensure_admin(request)
    if denial is not None:
        return denial

    query = (request.GET.get('query') or '').strip()
    if not query:
        return JsonResponse({'users': []}, status=200)

    User = get_user_model()
    users = (
        User.objects.filter(Q(username__icontains=query) | Q(email__icontains=query))
        .annotate(monitored_sites_count=Count('monitored_pages'))
        .order_by('username')
    )

    results = []
    for user in users:
        results.append(
            {
                'id': str(user.id),
                'username': user.username,
                'email': user.email or '',
                'full_name': (user.get_full_name() or '').strip(),
                'monitored_sites_count': user.monitored_sites_count,
                'is_active': user.is_active,
                'is_staff': user.is_staff,
                'date_joined': user.date_joined.isoformat(),
            }
        )

    return JsonResponse({'users': results}, status=200)


@require_http_methods(["GET"])
def admin_user_sites(request, user_id):
    """List monitored sites for a user (admin-only)."""
    denial = _ensure_admin(request)
    if denial is not None:
        return denial

    User = get_user_model()
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return JsonResponse({'error': 'User not found'}, status=404)

    pages = MonitoredPage.objects.filter(user=user).order_by('-created_at')
    results = [
        {
            'id': str(page.id),
            'url': page.url,
            'created_at': page.created_at.isoformat(),
        }
        for page in pages
    ]

    return JsonResponse({'sites': results}, status=200)
