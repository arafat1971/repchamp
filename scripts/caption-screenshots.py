#!/usr/bin/env python3
"""Add branded caption bands to Play Store screenshots.

Play does not index caption text, but captioned screenshots convert measurably
better than bare screen grabs -- and conversion is the ranking factor that
actually moves. Doing it here rather than by hand keeps every caption on the
same grid, in the same brand colours, at the same size.

The band is added ABOVE the screen content and the screen is scaled to fit, so
no UI is ever covered -- the failure mode of captioning in an image editor.

Usage:
    /usr/bin/python3 scripts/caption-screenshots.py

Reads:  store/screenshots-raw/*.png   (device captures, any 9:16-ish size)
Writes: store/screenshots/NN-slug.png (1080x1920, 9:16, ready to upload)

Note: use /usr/bin/python3 -- the Homebrew python3 on this Mac has an x86_64
Pillow that will not load on arm64.
"""

from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, "store", "screenshots-raw")
OUT_DIR = os.path.join(ROOT, "store", "screenshots")

# Brand tokens, mirrored from src/theme/tokens.ts.
GREEN_600 = (0x16, 0xA3, 0x4A)
GREEN_900 = (0x06, 0x5F, 0x46)
WHITE = (0xFF, 0xFF, 0xFF)

# 1080x1920 is exactly 9:16 and is the minimum size Play requires to be
# eligible for its promotional/featured surfaces.
#
# It also fixes a problem in the raw captures: Play requires the long side to
# be at most twice the short side, and a Pixel 7a grab is 1080x2400 (2.22x).
# Uploaded as-is those would be rejected -- compositing onto this canvas is
# what makes them valid, not just prettier.
OUT_W, OUT_H = 1080, 1920
BAND_H = 240

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]

# Order matters: these are the listing positions. The first two show without
# swiping in search results, so they carry the whole argument. Rationale for
# each shot is in STORE_SCREENSHOTS.md.
CAPTIONS: list[tuple[str, str]] = [
    ("01-session", "Your camera counts every rep"),
    ("02-duel", "Race a friend in real time"),
    ("03-couple", "Share one streak together"),
    ("04-profile", "Climb Bronze to Platinum"),
    ("05-arena", "Weekly leaderboards that reset"),
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def fit_text(draw: ImageDraw.ImageDraw, text: str, max_w: int) -> ImageFont.FreeTypeFont:
    """Largest font size that keeps the caption on one line.

    Captions differ in length and a fixed size would either overflow the long
    ones or leave the short ones looking timid, so the size is solved per
    caption and clamped to a range that still reads as one consistent system.
    """
    for size in range(62, 33, -2):
        font = load_font(size)
        if draw.textlength(text, font=font) <= max_w:
            return font
    return load_font(34)


def compose(src: Image.Image, caption: str) -> Image.Image:
    out = Image.new("RGB", (OUT_W, OUT_H), GREEN_900)
    d = ImageDraw.Draw(out)

    # Caption band: a vertical brand gradient, drawn small and upscaled so it
    # stays smooth without a per-pixel loop over the full width.
    grad = Image.new("RGB", (1, BAND_H))
    gp = grad.load()
    for y in range(BAND_H):
        t = y / (BAND_H - 1)
        gp[0, y] = tuple(round(GREEN_600[i] + (GREEN_900[i] - GREEN_600[i]) * t) for i in range(3))
    out.paste(grad.resize((OUT_W, BAND_H), Image.LANCZOS), (0, 0))

    # Screen content below the band, scaled to fit whole. Aspect ratio is
    # preserved and nothing is cropped -- the tab bar at the bottom of the app
    # is UI a reviewer looks for, so cropping to fill is not an option.
    #
    # A 9:20 phone screen inside a 9:16 frame leaves ~160px either side. Rather
    # than let that read as dead space, the screen gets a rounded device
    # surround, which is what the margin is for.
    avail_h = OUT_H - BAND_H
    scale = min(OUT_W / src.width, avail_h / src.height)
    sw, sh = round(src.width * scale), round(src.height * scale)
    new = src.resize((sw, sh), Image.LANCZOS).convert("RGB")

    left, top = (OUT_W - sw) // 2, BAND_H + (avail_h - sh) // 2
    radius = round(sw * 0.055)

    # Device surround: a slightly larger rounded rect behind the screen.
    bez = 10
    d.rounded_rectangle(
        [left - bez, top - bez, left + sw + bez, top + sh + bez],
        radius=radius + bez, fill=(12, 30, 22),
    )

    # Round the screen's own corners to match the surround.
    mask = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, sw - 1, sh - 1], radius=radius, fill=255)
    out.paste(new, (left, top), mask)

    font = fit_text(d, caption, OUT_W - 120)
    tw = d.textlength(caption, font=font)
    bbox = font.getbbox(caption)
    d.text(((OUT_W - tw) / 2, (BAND_H - (bbox[3] - bbox[1])) / 2 - bbox[1]),
           caption, font=font, fill=WHITE)
    return out


def main() -> int:
    if not os.path.isdir(RAW_DIR):
        print(f"no raw screenshots at {os.path.relpath(RAW_DIR, ROOT)}/", file=sys.stderr)
        print("capture them first -- see STORE_SCREENSHOTS.md", file=sys.stderr)
        return 1

    raws = sorted(f for f in os.listdir(RAW_DIR) if f.lower().endswith((".png", ".jpg", ".jpeg")))
    if not raws:
        print(f"{os.path.relpath(RAW_DIR, ROOT)}/ is empty", file=sys.stderr)
        return 1

    # Play's own constraints, asserted rather than assumed. The 2x rule is the
    # one that bites: a raw 1080x2400 phone capture is 2.22x and gets rejected.
    lo, hi = min(OUT_W, OUT_H), max(OUT_W, OUT_H)
    assert lo >= 320 and hi <= 3840, f"{OUT_W}x{OUT_H} outside Play's 320..3840"
    assert hi <= 2 * lo, f"{OUT_W}x{OUT_H}: long side exceeds 2x the short side"

    os.makedirs(OUT_DIR, exist_ok=True)
    for i, name in enumerate(raws[: len(CAPTIONS)]):
        slug, caption = CAPTIONS[i]
        with Image.open(os.path.join(RAW_DIR, name)) as src:
            out_img = compose(src.convert("RGB"), caption)
        out_path = os.path.join(OUT_DIR, f"{slug}.png")
        out_img.save(out_path, "PNG", optimize=True)
        print(f"{name}  ->  store/screenshots/{slug}.png   \"{caption}\"")

    if len(raws) > len(CAPTIONS):
        print(f"\nnote: {len(raws) - len(CAPTIONS)} extra raw file(s) ignored -- "
              f"add captions to CAPTIONS to include them")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
