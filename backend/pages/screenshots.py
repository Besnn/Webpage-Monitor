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

# JPEG quality for all saved images (1-95). Higher = better quality, larger file.
JPEG_QUALITY = int(getattr(settings, "SCREENSHOT_JPEG_QUALITY", 82))

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _screenshots_root() -> Path:
    """Return the root directory for all screenshot artefacts."""
    root = Path(getattr(settings, "SCREENSHOTS_DIR", os.path.join(settings.BASE_DIR, "screenshots")))
    root.mkdir(parents=True, exist_ok=True)
    return root


def _page_dir(page_id: int) -> Path:
    d = _screenshots_root() / str(page_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _unique_filename(page_id: int, suffix: str = ".jpg") -> str:
    """Return a filename like ``<page_id>/<timestamp_hash>.jpg``."""
    import time
    ts = str(time.time_ns())
    HASH_PREFIX_LENGTH = 10
    h = hashlib.md5(ts.encode()).hexdigest()[:HASH_PREFIX_LENGTH]
    return os.path.join(str(page_id), f"{h}{suffix}")


def _save_jpeg(img: Image.Image, path) -> None:
    """Save a Pillow image as JPEG, converting RGBA/P modes first."""
    if img.mode in ("RGBA", "P", "LA"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")
    img.save(str(path), format="JPEG", quality=JPEG_QUALITY, optimize=True)


# Thumbnail width in pixels — height is calculated to preserve aspect ratio
THUMBNAIL_WIDTH = 480
THUMBNAIL_JPEG_QUALITY = 55


def create_thumbnail(source_rel: str, page_id: int) -> str:
    """Generate a low-res thumbnail JPEG from an existing screenshot.

    Saves it alongside the source as ``<stem>_thumb.jpg``.
    Returns the relative path of the thumbnail, or '' on failure.
    """
    root = _screenshots_root()
    src_abs = root / source_rel
    if not src_abs.is_file():
        return ''
    thumb_abs = src_abs.with_name(src_abs.stem + '_thumb.jpg')
    # Return immediately if already generated
    if thumb_abs.is_file():
        return str(thumb_abs.relative_to(root))
    try:
        with Image.open(src_abs) as img:
            if img.mode not in ('RGB', 'L'):
                img = img.convert('RGB')
            w, h = img.size
            new_h = max(1, int(h * THUMBNAIL_WIDTH / w))
            thumb = img.resize((THUMBNAIL_WIDTH, new_h), Image.LANCZOS)
            thumb.save(str(thumb_abs), format='JPEG',
                       quality=THUMBNAIL_JPEG_QUALITY, optimize=True)
        logger.debug("Thumbnail saved: %s", thumb_abs)
        return str(thumb_abs.relative_to(root))
    except Exception:
        logger.warning("Failed to create thumbnail for %s", source_rel, exc_info=True)
        return ''


def get_or_create_thumbnail(source_rel: str, page_id: int) -> str:
    """Return the thumbnail rel-path for *source_rel*, creating it if needed."""
    if not source_rel:
        return ''
    root = _screenshots_root()
    src_abs = root / source_rel
    thumb_abs = src_abs.with_name(src_abs.stem + '_thumb.jpg')
    if thumb_abs.is_file():
        return str(thumb_abs.relative_to(root))
    return create_thumbnail(source_rel, page_id)


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
    """Create a cropped JPEG copy of the screenshot for diff comparison.

    The original full-page screenshot at *abs_path* is kept intact.
    Returns the absolute path of the cropped file, or ``None`` if no crop
    is needed (i.e. the region covers the full page).
    """
    from .models import MonitoredPage  # local import to avoid circular

    try:
        monitored_page = MonitoredPage.objects.get(id=page_id)
    except MonitoredPage.DoesNotExist:
        return None

    left_pct   = monitored_page.region_left_pct
    top_pct    = monitored_page.region_top_pct
    width_pct  = monitored_page.region_width_pct
    height_pct = monitored_page.region_height_pct

    if width_pct >= 1.0 and height_pct >= 1.0 and left_pct <= 0 and top_pct <= 0:
        return None  # full page – nothing to crop

    try:
        img = Image.open(abs_path)
        box = (
            int(left_pct   * img.width),
            int(top_pct    * img.height),
            int((left_pct  + width_pct)  * img.width),
            int((top_pct   + height_pct) * img.height),
        )
        # Derive crop path: replace extension with _crop.jpg
        crop_path = Path(str(abs_path)).with_suffix('').with_name(
            Path(abs_path).stem + "_crop.jpg"
        )
        _save_jpeg(img.crop(box), crop_path)
        logger.debug("Saved cropped copy for diff (page %s): %s", page_id, crop_path)
        return str(crop_path)
    except Exception:
        logger.warning("Failed to crop screenshot for page %s", page_id, exc_info=True)
        return None


# ---------------------------------------------------------------------------
# Screenshot capture (Playwright) – synchronous version
# ---------------------------------------------------------------------------

def capture_screenshot(url: str, page_id: int, timeout_ms: int = 30_000) -> tuple[str, str]:
    """Capture a full-page screenshot of *url* and save it as JPEG.

    Returns ``(full_rel_path, crop_rel_path)`` where *crop_rel_path* is the
    region-cropped copy used for diffing (empty string when no region is set).
    Returns ``("", "")`` on failure.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        logger.error("playwright is not installed – skipping screenshot")
        return ("", "")

    rel_path = _unique_filename(page_id, ".jpg")
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
            # Playwright captures PNG natively; we convert to JPEG after
            tmp_png = abs_path.with_suffix(".tmp.png")
            page.screenshot(path=str(tmp_png), full_page=True)
            context.close()
            browser.close()

        # Convert PNG → JPEG and remove the temp file
        with Image.open(str(tmp_png)) as raw:
            _save_jpeg(raw, abs_path)
        tmp_png.unlink(missing_ok=True)

        # Create a cropped copy for diff comparison (if region is configured)
        cropped_abs = _crop_to_region(abs_path, page_id)
        crop_rel = ""
        if cropped_abs:
            crop_rel = str(Path(cropped_abs).relative_to(_screenshots_root()))

        logger.info("Screenshot saved: %s", abs_path)
        # Pre-generate the thumbnail so it's ready for the home page
        create_thumbnail(rel_path, page_id)
        return (rel_path, crop_rel)
    except Exception:
        logger.exception("Failed to capture screenshot for page %s (%s)", page_id, url)
        return ("", "")


# ---------------------------------------------------------------------------
# Visual diff (Pillow + imagehash)
# ---------------------------------------------------------------------------

def compute_diff(prev_rel_path: str, curr_rel_path: str, page_id: int) -> tuple[str, float | None]:
    """Compare two screenshots and produce a highlighted-diff JPEG.

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

        w = max(img_prev.width, img_curr.width)
        h = max(img_prev.height, img_curr.height)
        canvas_prev = Image.new("RGB", (w, h), (255, 255, 255))
        canvas_curr = Image.new("RGB", (w, h), (255, 255, 255))
        canvas_prev.paste(img_prev, (0, 0))
        canvas_curr.paste(img_curr, (0, 0))

        hash_prev = imagehash.phash(canvas_prev)
        hash_curr = imagehash.phash(canvas_curr)
        hamming   = hash_prev - hash_curr
        score     = round((hamming / 64) * 100, 2)

        diff_rel = ""
        if score > 0:
            from PIL import ImageChops

            raw_diff = ImageChops.difference(canvas_prev, canvas_curr)

            THRESHOLD = 10
            ALPHA     = 0.55
            H_R, H_G, H_B = 59, 130, 246   # blue #3b82f6

            r_diff, g_diff, b_diff = raw_diff.split()
            r_curr, g_curr, b_curr = canvas_curr.split()

            def _thresh(ch):
                return ch.point(lambda v: 255 if v > THRESHOLD else 0)

            from PIL import ImageChops as IC
            changed = IC.lighter(IC.lighter(_thresh(r_diff), _thresh(g_diff)), _thresh(b_diff))

            def _blend(curr_ch, highlight_val):
                blended = curr_ch.point(lambda v: int(v * (1 - ALPHA) + highlight_val * ALPHA))
                out = Image.new("L", curr_ch.size)
                out.paste(blended, mask=changed)
                out.paste(curr_ch, mask=ImageChops.invert(changed))
                return out

            diff_img = Image.merge("RGB", (
                _blend(r_curr, H_R),
                _blend(g_curr, H_G),
                _blend(b_curr, H_B),
            ))

            diff_rel = _unique_filename(page_id, "_diff.jpg")
            diff_abs = root / diff_rel
            _save_jpeg(diff_img, diff_abs)
            logger.info("Blue-overlay diff saved: %s", diff_abs)

        logger.info("Diff score for page %s: %.2f%%", page_id, score)
        return (diff_rel, score)

    except Exception:
        logger.exception("Failed to compute diff for page %s", page_id)
        return ("", None)


# ---------------------------------------------------------------------------
# Pruning
# ---------------------------------------------------------------------------

def cleanup_old_screenshots(page) -> None:
    """Delete screenshot & diff artefacts that exceed the retention limit."""
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
