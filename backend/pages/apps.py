import logging
import os
import sys
import threading
from django.apps import AppConfig
from django.core.management import call_command

logger = logging.getLogger(__name__)


class PagesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "pages"

    _run_checks_started = False

    def ready(self):
        should_start = (
            "runserver" in sys.argv
            and (os.environ.get("RUN_MAIN") == "true" or "--noreload" in sys.argv)
        )
        if not should_start or PagesConfig._run_checks_started:
            return

        PagesConfig._run_checks_started = True
        thread = threading.Thread(target=self._start_run_checks, daemon=True, name="run_checks")
        thread.start()

    def _start_run_checks(self):
        try:
            call_command("run_checks", "--interval", "60")
        except Exception:  # pragma: no cover
            logger.exception("Background monitor checks failed")
