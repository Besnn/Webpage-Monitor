from django.shortcuts import render

from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

import json

from .models import MonitoredPage

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
