from datetime import timedelta

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.utils import timezone
from unittest.mock import patch

from pages.models import MonitoredPage, MonitoredPageCheck
from pages.notifications import handle_post_check_notification, _consecutive_failures


SQLITE_TEST_DB = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}


@override_settings(DATABASES=SQLITE_TEST_DB)
class NotificationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u1", email="u1@example.com", password="x")
        self.page = MonitoredPage.objects.create(
            user=self.user,
            url="http://example.invalid/health",
            notifications_enabled=True,
            alert_threshold=2,
        )

    def _mk_check(self, is_up: bool, offset_seconds: int = 0, status_code: int | None = None):
        ts = timezone.now() + timedelta(seconds=offset_seconds)
        return MonitoredPageCheck.objects.create(
            page=self.page,
            checked_at=ts,
            is_up=is_up,
            status_code=status_code if status_code is not None else (200 if is_up else None),
            response_time_ms=123.0,
            message="OK" if is_up else "ERR",
        )

    def test_consecutive_failures_counter(self):
        # Start with two failures, then a success
        self._mk_check(False, offset_seconds=1)
        self._mk_check(False, offset_seconds=2)
        self.assertEqual(_consecutive_failures(self.page), 2)

        # Add a success; counter should reset to 0 (but function only counts from latest backward)
        self._mk_check(True, offset_seconds=3)
        self.assertEqual(_consecutive_failures(self.page), 0)

        # Add another failure; now streak is 1 (latest is failure)
        self._mk_check(False, offset_seconds=4)
        self.assertEqual(_consecutive_failures(self.page), 1)

        # Latest is success -> consecutive failures should be 0
        self._mk_check(True, offset_seconds=5)
        self.assertEqual(_consecutive_failures(self.page), 0)

    @patch("pages.notifications.send_mail")
    def test_email_sent_only_when_reaching_threshold(self, mock_send_mail):
        # First failure: below threshold -> no email
        self._mk_check(False, offset_seconds=1)
        latest = self.page.checks.order_by("-checked_at").first()
        handle_post_check_notification(self.page, latest)
        mock_send_mail.assert_not_called()

        # Second consecutive failure: equals threshold -> send exactly once
        self._mk_check(False, offset_seconds=2)
        latest = self.page.checks.order_by("-checked_at").first()
        handle_post_check_notification(self.page, latest)
        self.assertEqual(mock_send_mail.call_count, 1)

        # Third consecutive failure: above threshold -> no additional email
        self._mk_check(False, offset_seconds=3)
        latest = self.page.checks.order_by("-checked_at").first()
        handle_post_check_notification(self.page, latest)
        self.assertEqual(mock_send_mail.call_count, 1)

        # Success resets streak; after two more failures we should send again
        self._mk_check(True, offset_seconds=4)
        self._mk_check(False, offset_seconds=5)
        latest = self._mk_check(False, offset_seconds=6)
        handle_post_check_notification(self.page, latest)
        self.assertEqual(mock_send_mail.call_count, 2)

    @patch("pages.notifications.send_mail")
    def test_no_email_when_notifications_disabled(self, mock_send_mail):
        self.page.notifications_enabled = False
        self.page.save(update_fields=["notifications_enabled"])

        latest = self._mk_check(False, offset_seconds=1)
        handle_post_check_notification(self.page, latest)
        mock_send_mail.assert_not_called()

    @patch("pages.notifications.send_mail")
    def test_no_email_when_latest_is_up(self, mock_send_mail):
        latest = self._mk_check(True, offset_seconds=1)
        handle_post_check_notification(self.page, latest)
        mock_send_mail.assert_not_called()

    @patch("pages.notifications.send_mail")
    def test_no_email_when_user_has_no_email(self, mock_send_mail):
        self.user.email = ""
        self.user.save(update_fields=["email"])

        # Hit threshold
        self._mk_check(False, offset_seconds=1)
        latest = self._mk_check(False, offset_seconds=2)
        handle_post_check_notification(self.page, latest)
        mock_send_mail.assert_not_called()

    def test_send_mail_exceptions_are_swallowed(self):
        # Prepare to hit threshold
        self._mk_check(False, offset_seconds=1)
        latest = self._mk_check(False, offset_seconds=2)

        with patch("pages.notifications.send_mail", side_effect=Exception("boom")):
            # Should not raise
            handle_post_check_notification(self.page, latest)

    @patch("pages.notifications.send_mail")
    def test_notify_on_site_recovery(self, mock_send_mail):
        # Site is down for two checks (threshold=2), user notified for DOWN
        self._mk_check(False, offset_seconds=1)
        self._mk_check(False, offset_seconds=2)
        latest = self.page.checks.order_by("-checked_at").first()
        handle_post_check_notification(self.page, latest)
        self.assertEqual(mock_send_mail.call_count, 1)  # DOWN notification

        # Site goes up
        up_check = self._mk_check(True, offset_seconds=3)
        # Simulate notification logic for recovery
        # You may need to implement a recovery notification in handle_post_check_notification
        handle_post_check_notification(self.page, up_check)

        # Site goes down again
        self._mk_check(False, offset_seconds=4)
        self._mk_check(False, offset_seconds=5)
        latest = self.page.checks.order_by("-checked_at").first()
        handle_post_check_notification(self.page, latest)
        self.assertEqual(mock_send_mail.call_count, 2)  # Second DOWN notification
