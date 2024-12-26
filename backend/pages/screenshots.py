"""Screenshot capture and visual-diff utilities.

Uses Playwright (headless Chromium) to capture full-page screenshots
and Pillow + imagehash for perceptual diff scoring.
"""

import hashlib
import logging
import os
from pathlib import Path

from django.conf import settings
from PIL import Image

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
    HASH_PREFIX_LENGTH = 10
    h = hashlib.md5(ts.encode()).hexdigest()[:HASH_PREFIX_LENGTH]
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


def _crop_to_region(abs_path, page_id: int) -> str | None:
    """Create a cropped copy of the screenshot for diff comparison.

    The original full-page screenshot at *abs_path* is kept intact.
    Returns the absolute path of the cropped file, or ``None`` if no crop
    is needed (i.e. the region covers the full page).
    """
    from .models import MonitoredPage  # local import to avoid circular

    try:
        monitored_page = MonitoredPage.objects.get(id=page_id)
    except MonitoredPage.DoesNotExist:
        return None

    left_pct = monitored_page.region_left_pct
    top_pct = monitored_page.region_top_pct
    width_pct = monitored_page.region_width_pct
    height_pct = monitored_page.region_height_pct

    if width_pct >= 1.0 and height_pct >= 1.0 and left_pct <= 0 and top_pct <= 0:
        return None  # full page – nothing to crop

    try:
        img = Image.open(abs_path)
        box = (
            int(left_pct * img.width),
            int(top_pct * img.height),
            int((left_pct + width_pct) * img.width),
            int((top_pct + height_pct) * img.height),
        )
        cropped_path = Path(str(abs_path).replace('.png', '_crop.png'))
        img.crop(box).save(str(cropped_path))
        logger.debug("Saved cropped copy for diff (page %s): %s", page_id, cropped_path)
        return str(cropped_path)
    except Exception:
        logger.warning("Failed to crop screenshot for page %s", page_id, exc_info=True)
        return None


# ---------------------------------------------------------------------------
# Screenshot capture (Playwright) – synchronous version
# ---------------------------------------------------------------------------

def capture_screenshot(url: str, page_id: int, timeout_ms: int = 30_000) -> tuple[str, str]:
    """Capture a full-page screenshot of *url*.

    Returns ``(full_rel_path, crop_rel_path)`` where *crop_rel_path* is the
    region-cropped copy used for diffing (empty string when there is no
    region crop configured).  The full screenshot is always preserved.

    Returns ``("", "")`` on failure (logged, never raises).
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        logger.error("playwright is not installed – skipping screenshot")
        return ("", "")

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

        # Create a cropped copy for diff comparison (if region is configured)
        cropped_abs = _crop_to_region(abs_path, page_id)
        crop_rel = ""
        if cropped_abs:
            crop_rel = str(Path(cropped_abs).relative_to(_screenshots_root()))

        logger.info("Screenshot saved: %s", abs_path)
        return (rel_path, crop_rel)
    except Exception:
        logger.exception("Failed to capture screenshot for page %s (%s)", page_id, url)
        return ("", "")


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
        from PIL import Image
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
        WHITE_RGB = (255, 255, 255)
        canvas_prev = Image.new("RGB", (w, h), WHITE_RGB)
        canvas_curr = Image.new("RGB", (w, h), WHITE_RGB)
        canvas_prev.paste(img_prev, (0, 0))
        canvas_curr.paste(img_curr, (0, 0))

        # Perceptual hash distance → score 0-100
        hash_prev = imagehash.phash(canvas_prev)
        hash_curr = imagehash.phash(canvas_curr)
        hamming = hash_prev - hash_curr  # int
        PHASH_BIT_COUNT = 64
        SCORE_PERCENTAGE_SCALE = 100
        SCORE_ROUNDING_DECIMALS = 2
        score = round((hamming / PHASH_BIT_COUNT) * SCORE_PERCENTAGE_SCALE, SCORE_ROUNDING_DECIMALS)

        # Only create the diff image when there is an actual change
        diff_rel = ""
        if score > 0:
            # Build a highlighted overlay: start from the current screenshot,
            # tint changed pixels blue (#3b82f6) so the result looks like the
            # real page with changes marked in blue — readable, not inverted.
            from PIL import ImageChops

            raw_diff = ImageChops.difference(canvas_prev, canvas_curr)

            # Split channels to find changed pixels without numpy
            # A pixel is "changed" if any channel differs by more than threshold
            THRESHOLD = 10
            ALPHA = 0.55
            # Highlight colour: blue #3b82f6 = (59, 130, 246)
            H_R, H_G, H_B = 59, 130, 246

            r_diff, g_diff, b_diff = raw_diff.split()
            r_curr, g_curr, b_curr = canvas_curr.split()

            # Build a mask: pixels where any channel change > THRESHOLD
            # Use point() to threshold each channel, then composite them with "lighter"
            def _thresh(ch):
                return ch.point(lambda v: 255 if v > THRESHOLD else 0)

            mask_r = _thresh(r_diff)
            mask_g = _thresh(g_diff)
            mask_b = _thresh(b_diff)

            # Combine: a pixel is "changed" if ANY channel is above threshold
            from PIL import ImageChops as IC
            changed = IC.lighter(IC.lighter(mask_r, mask_g), mask_b)

            # Blend: out = curr * (1-alpha) + highlight * alpha  for changed pixels
            #        out = curr                                   for unchanged pixels
            def _blend(curr_ch, highlight_val):
                # curr_ch blended toward highlight_val at ALPHA strength
                blended = curr_ch.point(lambda v: int(v * (1 - ALPHA) + highlight_val * ALPHA))
                # Composite: use blended where changed, original elsewhere
                out = Image.new("L", curr_ch.size)
                out.paste(blended, mask=changed)
                out.paste(curr_ch, mask=ImageChops.invert(changed))
                return out

            r_out = _blend(r_curr, H_R)
            g_out = _blend(g_curr, H_G)
            b_out = _blend(b_curr, H_B)

            diff_img = Image.merge("RGB", (r_out, g_out, b_out))
            diff_rel = _unique_filename(page_id, "_diff.png")
            diff_abs = root / diff_rel
            diff_img.save(str(diff_abs))
            logger.info("Blue-overlay diff saved: %s", diff_abs)

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
        delete_screenshot_file(check.crop_path)
        delete_screenshot_file(check.diff_path)
        check.screenshot_path = ''
        check.crop_path = ''
        check.diff_path = ''
        check.save(update_fields=['screenshot_path', 'crop_path', 'diff_path'])


