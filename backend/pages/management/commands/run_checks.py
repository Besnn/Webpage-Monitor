import time
import urllib.request
import urllib.error

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta

from pages.models import MonitoredPage, MonitoredPageCheck


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
                with urllib.request.urlopen(request, timeout=timeout) as response:
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
                message = f"Error: {exc.reason}"
            except Exception as exc:  # pragma: no cover - defensive fallback
                status_code = None
                is_up = False
                message = f"Error: {exc}"

            elapsed_ms = (time.perf_counter() - started_at) * 1000

            MonitoredPageCheck.objects.create(
                page=page,
                checked_at=timezone.now(),
                status_code=status_code,
                response_time_ms=round(elapsed_ms, 2),
                is_up=is_up,
                message=message,
            )

            checked_count += 1
            self.stdout.write(
                f"Checked {page.url} (interval: {page.check_interval}m) -> {status_code or 'ERR'} in {elapsed_ms:.2f}ms"
            )

        if checked_count == 0:
            self.stdout.write("No sites due for checking this round.")
        else:
            self.stdout.write(self.style.SUCCESS(f"Checked {checked_count} site(s) this round."))

