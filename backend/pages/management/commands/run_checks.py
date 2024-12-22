import ssl
import time
import urllib.request
import urllib.error

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta

from pages.models import MonitoredPage, MonitoredPageCheck
from pages.notifications import handle_post_check_notification
from pages.screenshots import capture_screenshot, compute_diff, delete_screenshot_file, cleanup_old_screenshots


DEFAULT_TIMEOUT_SECONDS = 10
DEFAULT_INTERVAL_SECONDS = 60


class Command(BaseCommand):
    help = "Periodically check monitored pages and record status/latency."

    def add_arguments(self, parser):
        parser.add_argument(
            "--interval",
            type=int,
            default=DEFAULT_INTERVAL_SECONDS,
            help="Seconds between check rounds (how often to scan for sites to check).",
        )
        parser.add_argument(
            "--timeout",
            type=int,
            default=DEFAULT_TIMEOUT_SECONDS,
            help="Request timeout in seconds.",
        )
        parser.add_argument(
            "--once",
            action="store_true",
            help="Run a single check round and exit.",
        )

    def handle(self, *args, **options):
        interval = max(1, int(options["interval"]))
        timeout = max(1, int(options["timeout"]))
        run_once = options["once"]

        self.stdout.write(self.style.SUCCESS("Starting monitor checks"))
        self.stdout.write(f"Scan interval: {interval}s (checks sites based on their individual check_interval)")

        while True:
            self._run_checks(timeout=timeout)
            if run_once:
                break
            time.sleep(interval)

    def _run_checks(self, timeout):
        pages = MonitoredPage.objects.all()
        if not pages:
            self.stdout.write("No monitored pages to check.")
            return

        now = timezone.now()
        checked_count = 0

        for page in pages:
            # Get the last check for this page
            last_check = page.checks.order_by('-checked_at').first()

            # Determine if we should check this page
            should_check = False
            if last_check is None:
                # Never checked before, check it now
                should_check = True
            else:
                # Check if enough time has passed based on the page's check_interval
                time_since_last_check = now - last_check.checked_at
                check_interval_delta = timedelta(minutes=page.check_interval)

                if time_since_last_check >= check_interval_delta:
                    should_check = True

            if not should_check:
                continue

            # Perform the check
            started_at = time.perf_counter()
            status_code = None
            is_up = False
            message = ""
            try:
                request = urllib.request.Request(
                    page.url,
                    headers={"User-Agent": "WebpageMonitor/1.0"},
                )
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                with urllib.request.urlopen(request, timeout=timeout, context=ctx) as response:
                    status_code = response.getcode()
                    is_up = 200 <= status_code < 400
                    message = "OK" if is_up else f"Status {status_code}"
            except urllib.error.HTTPError as exc:
                status_code = exc.code
                is_up = 200 <= status_code < 400
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

            # --- Screenshot capture & visual diff ---
            screenshot_rel = ""
            diff_rel = ""
            diff_score = None
            if page.screenshot_enabled and is_up:
                try:
                    screenshot_rel = capture_screenshot(page.url, page.id)
                    if screenshot_rel and last_check and last_check.screenshot_path:
                        diff_rel, diff_score = compute_diff(
                            last_check.screenshot_path, screenshot_rel, page.id
                        )
                        # If nothing changed, discard the new screenshot and
                        # reuse the previous one so we don't waste disk space.
                        if diff_score is not None and diff_score == 0:
                            delete_screenshot_file(screenshot_rel)
                            screenshot_rel = last_check.screenshot_path
                            # diff image is not created when score==0
                except Exception:
                    pass  # never break the checker

            latest = MonitoredPageCheck.objects.create(
                page=page,
                checked_at=timezone.now(),
                status_code=status_code,
                response_time_ms=round(elapsed_ms, 2),
                is_up=is_up,
                message=message,
                screenshot_path=screenshot_rel,
                diff_path=diff_rel,
                diff_score=diff_score,
            )

            # Prune old screenshots beyond the retention limit
            if screenshot_rel:
                try:
                    cleanup_old_screenshots(page)
                except Exception:
                    pass

            # Trigger notifications, if applicable
            try:
                handle_post_check_notification(page, latest)
            except Exception:
                # Never allow notification errors to break the loop
                pass

            checked_count += 1
            ss_tag = " [+screenshot]" if screenshot_rel else ""
            diff_tag = f" [diff={diff_score:.1f}%]" if diff_score is not None else ""
            self.stdout.write(
                f"Checked {page.url} (interval: {page.check_interval}m) -> "
                f"{status_code or 'ERR'} in {elapsed_ms:.2f}ms{ss_tag}{diff_tag}"
            )

        if checked_count == 0:
            self.stdout.write("No sites due for checking this round.")
        else:
            self.stdout.write(self.style.SUCCESS(f"Checked {checked_count} site(s) this round."))
