from django.core.mail import send_mail
from django.conf import settings


def handle_change_notification(page, latest_check) -> None:
    """Send an email when a visual change is detected on the page.

    Only fires when:
    - change_notifications_enabled is True on the page
    - screenshot_enabled is True
    - diff_score is set and > 0 (an actual change was detected)
    - the user has an email address
    """
    try:
        if not getattr(page, 'change_notifications_enabled', False):
            return
        if not getattr(page, 'screenshot_enabled', False):
            return

        diff_score = getattr(latest_check, 'diff_score', None)
        if diff_score is None or diff_score <= 0:
            return

        user = getattr(page, 'user', None)
        recipient = getattr(user, 'email', None)
        if not recipient:
            return

        subject = f"Visual change detected: {page.url}"
        body_lines = [
            f"A visual change was detected on your monitored page.",
            f"",
            f"URL: {page.url}",
            f"Time: {latest_check.checked_at.isoformat()}",
            f"Change score: {diff_score:.1f}% (0 = no change, 100 = completely different)",
        ]
        body = "\n".join(body_lines)

        send_mail(
            subject,
            body,
            getattr(settings, 'DEFAULT_FROM_EMAIL', 'webmon@localhost'),
            [recipient],
            fail_silently=True,
        )
    except Exception:
        return


def _consecutive_failures(page) -> int:
    """Return number of consecutive failed checks for the page (including the latest).

    Stops counting at the first successful check.
    """
    count = 0
    # We need to iterate over checks in reverse chronological order
    # and stop at the first successful check.
    # Using .iterator() to avoid loading all checks into memory if there are many.
    checks = page.checks.order_by('-checked_at').values_list('is_up', flat=True)
    
    for is_up in checks:
        if is_up:
            break
        count += 1
    return count


def handle_post_check_notification(page, latest_check) -> None:
    """Send an email alert when failure threshold is reached.

    Minimal anti-spam: only send when the consecutive failures count equals
    the configured alert_threshold (i.e., when the threshold is crossed).
    """
    try:
        # If notifications are disabled or the check was successful, do nothing.
        if not getattr(page, 'notifications_enabled', False):
            return
        if latest_check.is_up:
            return

        threshold = int(getattr(page, 'alert_threshold', 0) or 0)
        if threshold <= 0:
            return

        # Compute current streak of failures (includes latest_check)
        failures = _consecutive_failures(page)

        # Only notify when we exactly hit the threshold to avoid repeated emails
        if failures != threshold:
            return

        user = getattr(page, 'user', None)
        recipient = getattr(user, 'email', None)
        if not recipient:
            return

        subject = f"Webpage DOWN alert: {page.url}"
        
        status_display = 'ERR'
        if latest_check.status_code is not None:
            status_display = str(latest_check.status_code)
            
        body_lines = [
            f"Your monitored page appears to be DOWN.",
            f"URL: {page.url}",
            f"Time: {latest_check.checked_at.isoformat()}",
            f"Status: {status_display}",
            f"Message: {latest_check.message or 'Unknown error'}",
            f"Consecutive failures: {failures} (threshold: {threshold})",
        ]
        body = "\n".join(body_lines)

        send_mail(
            subject,
            body,
            getattr(settings, 'DEFAULT_FROM_EMAIL', 'webmon@localhost'),
            [recipient],
            fail_silently=True,
        )
    except Exception:
        # Avoid breaking the checker due to email issues
        return
