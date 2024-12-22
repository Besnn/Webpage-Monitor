from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.utils import timezone
from datetime import timedelta

import json
import time
import urllib.request
import urllib.error

from .models import MonitoredPage, MonitoredPageCheck

# Create your views here.

def homePageView(request):
    return HttpResponse("Hello, World")

@csrf_exempt
@require_http_methods(["GET", "POST"])
def monitor(request):
    user = getattr(request, 'user', None)
    if user is None or not user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)

    if request.method == 'GET':
        pages = MonitoredPage.objects.filter(user=user).values('id', 'url', 'created_at')
        return JsonResponse({'pages': list(pages)}, status=200)

    try:
        data = json.loads(request.body.decode('utf-8'))
        url = (data.get('webpageURL') or '').strip()
        if not url:
            return JsonResponse({'error': 'webpageURL is required'}, status=400)

        page, created = MonitoredPage.objects.get_or_create(user=user, url=url)

        # If this is a newly created page, immediately perform a check so the UI has fresh status
        if created:
            _perform_single_check(page)

        return JsonResponse(
            {
                'page': {
                    'id': str(page.id),
                    'url': page.url,
                    'created_at': page.created_at.isoformat(),
                },
                'created': created,
            },
            status=201 if created else 200,
        )
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON format'}, status=400)


def _perform_single_check(page, timeout_seconds: int = 10) -> None:
    """Perform a single HTTP check for the given MonitoredPage and store the result.

    This mirrors the logic from the periodic checker (management command) but is kept
    here to trigger an initial check right after a page is added for monitoring.
    """
    started_at = time.perf_counter()
    status_code = None
    is_up = False
    message = ""

    try:
        request = urllib.request.Request(
            page.url,
            headers={"User-Agent": "WebpageMonitor/1.0"},
        )
        with urllib.request.urlopen(request, timeout=max(1, int(timeout_seconds))) as response:
            status_code = response.getcode()
            is_up = 200 <= status_code < 400
            message = "OK" if is_up else f"Status {status_code}"
    except urllib.error.HTTPError as exc:
        status_code = exc.code
        is_up = False
        message = f"HTTP {exc.code}"
    except urllib.error.URLError as exc:
        status_code = None
        is_up = False
        message = f"Error: {getattr(exc, 'reason', exc)}"
    except Exception as exc:  # pragma: no cover - defensive fallback
        status_code = None
        is_up = False
        message = f"Error: {exc}"

    elapsed_ms = (time.perf_counter() - started_at) * 1000

    # Store the check result
    MonitoredPageCheck.objects.create(
        page=page,
        checked_at=timezone.now(),
        status_code=status_code,
        response_time_ms=round(elapsed_ms, 2),
        is_up=is_up,
        message=message,
    )

@require_http_methods(["GET"])
def monitor_site_detail(request, site_id):
    user = getattr(request, 'user', None)
    if user is None or not user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)

    try:
        page = MonitoredPage.objects.get(pk=site_id, user=user)
    except MonitoredPage.DoesNotExist:
        return JsonResponse({'error': 'Site not found'}, status=404)

    latest_check = page.checks.order_by('-checked_at').first()
    limit = getattr(settings, 'RECENT_CHECKS_LIMIT', 10)
    checks = page.checks.order_by('-checked_at')[:limit]

    check_items = [
        {
            'id': str(check.id),
            'checked_at': check.checked_at.isoformat(),
            'status_code': check.status_code,
            'response_time_ms': check.response_time_ms,
            'is_up': check.is_up,
            'message': check.message,
        }
        for check in checks
    ]

    # Calculate uptime percentage from recent checks
    total_checks = len(check_items)
    up_checks = sum(1 for check in check_items if check['is_up'])
    uptime_percent = (up_checks / total_checks * 100) if total_checks > 0 else None

    summary = {
        'current_status': 'UP' if latest_check and latest_check.is_up else 'DOWN',
        'last_checked_at': latest_check.checked_at.isoformat() if latest_check else None,
        'last_status_code': latest_check.status_code if latest_check else None,
        'last_response_time_ms': latest_check.response_time_ms if latest_check else None,
        'uptime_percent': round(uptime_percent, 2) if uptime_percent is not None else None,
    }

    return JsonResponse(
        {
            'site': {
                'id': str(page.id),
                'url': page.url,
                'created_at': page.created_at.isoformat(),
                'check_interval': page.check_interval,
                'notifications_enabled': page.notifications_enabled,
                'alert_threshold': page.alert_threshold,
            },
            'summary': summary,
            'checks': check_items,
        },
        status=200,
    )


@require_http_methods(["GET"])
def monitor_site_history(request, site_id):
    user = getattr(request, 'user', None)
    if user is None or not user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)

    try:
        page = MonitoredPage.objects.get(pk=site_id, user=user)
    except MonitoredPage.DoesNotExist:
        return JsonResponse({'error': 'Site not found'}, status=404)

    hours = request.GET.get('hours')
    try:
        hours = int(hours) if hours else 24
    except ValueError:
        hours = 24

    since = timezone.now() - timedelta(hours=hours)
    checks = page.checks.filter(checked_at__gte=since).order_by('checked_at')

    history_items = [
        {
            'checked_at': check.checked_at.isoformat(),
            'response_time_ms': check.response_time_ms,
            'status_code': check.status_code,
            'is_up': check.is_up,
        }
        for check in checks
    ]

    return JsonResponse({'history': history_items}, status=200)


@csrf_exempt
@require_http_methods(["PUT", "PATCH"])
def monitor_site_settings(request, site_id):
    user = getattr(request, 'user', None)
    if user is None or not user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated'}, status=401)

    try:
        page = MonitoredPage.objects.get(pk=site_id, user=user)
    except MonitoredPage.DoesNotExist:
        return JsonResponse({'error': 'Site not found'}, status=404)

    try:
        data = json.loads(request.body.decode('utf-8'))
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON format'}, status=400)

    # Update URL if provided
    if 'url' in data:
        url = data['url'].strip()
        if url:
            page.url = url

    # Update check_interval if provided
    if 'checkInterval' in data:
        try:
            check_interval = int(data['checkInterval'])
            if 1 <= check_interval <= 60:
                page.check_interval = check_interval
            else:
                return JsonResponse({'error': 'Check interval must be between 1 and 60 minutes'}, status=400)
        except (ValueError, TypeError):
            return JsonResponse({'error': 'Invalid check interval value'}, status=400)

    # Update notifications_enabled if provided
    if 'notificationsEnabled' in data:
        page.notifications_enabled = bool(data['notificationsEnabled'])

    # Update alert_threshold if provided
    if 'alertThreshold' in data:
        try:
            alert_threshold = int(data['alertThreshold'])
            if 1 <= alert_threshold <= 10:
                page.alert_threshold = alert_threshold
            else:
                return JsonResponse({'error': 'Alert threshold must be between 1 and 10'}, status=400)
        except (ValueError, TypeError):
            return JsonResponse({'error': 'Invalid alert threshold value'}, status=400)

    page.save()

    return JsonResponse(
        {
            'success': True,
            'site': {
                'id': str(page.id),
                'url': page.url,
                'created_at': page.created_at.isoformat(),
                'check_interval': page.check_interval,
                'notifications_enabled': page.notifications_enabled,
                'alert_threshold': page.alert_threshold,
            },
        },
        status=200,
    )
