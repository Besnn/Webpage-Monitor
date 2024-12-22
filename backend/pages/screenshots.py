"""Screenshot capture and visual-diff utilities.

Uses Playwright (headless Chromium) to capture full-page screenshots
and Pillow + imagehash for perceptual diff scoring.
"""

import hashlib
import logging
import os
from pathlib import Path

from django.conf import settings

logger = logging.getLogger(__name__)

# Maximum number of screenshots to keep per monitored page.
MAX_SCREENSHOTS_PER_PAGE = 30

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _screenshots_root() -> Path:
    """Return the root directory for all screenshot artefacts."""
    root = Path(getattr(settings, "SCREENSHOTS_DIR", os.path.join(settings.BASE_DIR, "screenshots")))
    root.mkdir(parents=True, exist_ok=True)
    return root


def _page_dir(page_id: int) -> Path:
    """Return the per-page sub-directory inside SCREENSHOTS_DIR."""
    d = _screenshots_root() / str(page_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _unique_filename(page_id: int, suffix: str = ".png") -> str:
    """Return a filename like ``<page_id>/<timestamp_hash>.png``."""
    import time
    ts = str(time.time_ns())
    h = hashlib.md5(ts.encode()).hexdigest()[:10]
    return os.path.join(str(page_id), f"{h}{suffix}")


def delete_screenshot_file(rel_path: str) -> None:
    """Delete a screenshot artefact from disk.  Silently ignores missing files."""
    if not rel_path:
        return
    try:
        abs_path = _screenshots_root() / rel_path
        if abs_path.is_file():
            abs_path.unlink()
    except Exception:
        logger.exception("Failed to delete screenshot file: %s", rel_path)


# ---------------------------------------------------------------------------
# Screenshot capture (Playwright)
# ---------------------------------------------------------------------------

def capture_screenshot(url: str, page_id: int, timeout_ms: int = 30_000) -> str:
    """Capture a full-page screenshot of *url* and return the relative path.

    The path is relative to ``SCREENSHOTS_DIR`` so it can be stored in the DB
    and later resolved for serving.

    Returns an empty string on failure (logged, never raises).
    """
    try:
        from playwright.sync_api import sync_playwright  # heavy import – keep lazy
    except ImportError:
        logger.error("playwright is not installed – skipping screenshot")
        return ""

    rel_path = _unique_filename(page_id, ".png")
    abs_path = _screenshots_root() / rel_path

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1280, "height": 720},
                ignore_https_errors=True,
            )
            page = context.new_page()
            page.goto(url, wait_until="networkidle", timeout=timeout_ms)
            page.screenshot(path=str(abs_path), full_page=True)
            context.close()
            browser.close()

        logger.info("Screenshot saved: %s", abs_path)
        return rel_path
    except Exception:
        logger.exception("Failed to capture screenshot for page %s (%s)", page_id, url)
        return ""


# ---------------------------------------------------------------------------
# Visual diff (Pillow + imagehash)
# ---------------------------------------------------------------------------

def compute_diff(prev_rel_path: str, curr_rel_path: str, page_id: int) -> tuple[str, float | None]:
    """Compare two screenshots and produce a highlighted-diff image.

    Returns ``(diff_rel_path, diff_score)`` where *diff_score* is 0–100.
    ``("", None)`` is returned when diffing is not possible.
    """
    if not prev_rel_path or not curr_rel_path:
        return ("", None)

    root = _screenshots_root()
    prev_abs = root / prev_rel_path
    curr_abs = root / curr_rel_path

    if not prev_abs.is_file() or not curr_abs.is_file():
        return ("", None)

    try:
        from PIL import Image, ImageChops
        import imagehash
    except ImportError:
        logger.error("Pillow / imagehash not installed – skipping diff")
        return ("", None)

    try:
        img_prev = Image.open(prev_abs).convert("RGB")
        img_curr = Image.open(curr_abs).convert("RGB")

        # Resize to same dimensions (use the larger canvas)
        w = max(img_prev.width, img_curr.width)
        h = max(img_prev.height, img_curr.height)
        canvas_prev = Image.new("RGB", (w, h), (255, 255, 255))
        canvas_curr = Image.new("RGB", (w, h), (255, 255, 255))
        canvas_prev.paste(img_prev, (0, 0))
        canvas_curr.paste(img_curr, (0, 0))

        # Perceptual hash distance → score 0-100
        hash_prev = imagehash.phash(canvas_prev)
        hash_curr = imagehash.phash(canvas_curr)
        # phash returns 64-bit hash; Hamming distance max = 64
        hamming = hash_prev - hash_curr  # int
        score = round((hamming / 64) * 100, 2)

        # Only create the diff image when there is an actual change
        diff_rel = ""
        if score > 0:
            diff_img = ImageChops.difference(canvas_prev, canvas_curr)
            diff_rel = _unique_filename(page_id, "_diff.png")
            diff_abs = root / diff_rel
            diff_img.save(str(diff_abs))

        logger.info("Diff score for page %s: %.2f%%", page_id, score)
        return (diff_rel, score)

    except Exception:
        logger.exception("Failed to compute diff for page %s", page_id)
        return ("", None)


# ---------------------------------------------------------------------------
# Pruning – keep only MAX_SCREENSHOTS_PER_PAGE screenshots per page
# ---------------------------------------------------------------------------

def cleanup_old_screenshots(page) -> None:
    """Delete screenshot & diff artefacts that exceed the retention limit.

    Keeps the newest ``MAX_SCREENSHOTS_PER_PAGE`` checks that have a
    screenshot_path, and removes the files (+ clears DB fields) for
    everything older.
    """
    from .models import MonitoredPageCheck  # avoid circular import

    limit = getattr(settings, 'MAX_SCREENSHOTS_PER_PAGE', MAX_SCREENSHOTS_PER_PAGE)

    checks_with_ss = (
        MonitoredPageCheck.objects
        .filter(page=page)
        .exclude(screenshot_path='')
        .order_by('-checked_at')
    )
    to_prune = list(checks_with_ss[limit:])
    if not to_prune:
        return

    for check in to_prune:
        delete_screenshot_file(check.screenshot_path)
        delete_screenshot_file(check.diff_path)
        check.screenshot_path = ''
        check.diff_path = ''
        check.save(update_fields=['screenshot_path', 'diff_path'])


