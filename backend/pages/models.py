from django.db import models
from django.conf import settings

# Create your models here.

class MonitoredPage(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='monitored_pages')
    url = models.URLField(max_length=2048)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user_id}: {self.url}"


class MonitoredPageCheck(models.Model):
    page = models.ForeignKey(MonitoredPage, on_delete=models.CASCADE, related_name='checks')
    checked_at = models.DateTimeField(auto_now_add=True)
    status_code = models.IntegerField(null=True, blank=True)
    response_time_ms = models.FloatField(null=True, blank=True)
    is_up = models.BooleanField(default=False)
    message = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['-checked_at']
        indexes = [
            models.Index(fields=['page', 'checked_at'], name='pages_page_checked_idx'),
        ]

    def __str__(self):
        status = self.status_code if self.status_code is not None else 'ERR'
        return f"{self.page_id} @ {self.checked_at.isoformat()} ({status})"
