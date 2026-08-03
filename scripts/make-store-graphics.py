#!/usr/bin/env python3
"""Generate the Play Store feature graphic from the real app assets.

Play requires a 1024x500 feature graphic with no transparency, and it will not
publish a listing without one. Building it here rather than in a design tool
means it stays in sync with the brand tokens in src/theme/tokens.ts and with
assets/icon.png -- if the icon changes, re-running this picks it up.

Usage:  python3 scripts/make-store-graphics.py
Output: store/feature-graphic.png (1024x500, RGB, no alpha)
        store/icon-512.png        (512x512, RGBA)

Note on safe areas: Play crops the feature graphic differently across surfaces
and may overlay a play button in the centre. Keep text out of the middle band
and away from the outer ~5%.
"""

from __future__ import annotations

import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
OUT_DIR = os.path.join(ROOT, "store")

# Brand tokens, mirrored from src/theme/tokens.ts.
GREEN_500 = (0x22, 0xC5, 0x5E)
GREEN_700 = (0x15, 0x80, 0x3D)
GREEN_900 = (0x06, 0x5F, 0x46)
AMBER_500 = (0xF5, 0x9E, 0x0B)
WHITE = (0xFF, 0xFF, 0xFF)

W, H = 1024, 500

# Icon sits right-of-centre; text occupies the left. Keeping them apart matters
# because Play crops this graphic differently on different surfaces.
ICON_CX, ICON_CY, ICON_SIZE = 828, 250, 300

# macOS system fonts -- present on any Mac, so no font files to vendor.
FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/Library/Fonts/Arial Bold.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def diagonal_gradient() -> Image.Image:
    """Green diagonal gradient, drawn small then upscaled so it stays smooth."""
    small = Image.new("RGB", (64, 32))
    px = small.load()
    for y in range(32):
        for x in range(64):
            # Diagonal sweep: dark bottom-left to bright top-right.
            t = (x / 63 * 0.65) + ((31 - y) / 31 * 0.35)
            if t < 0.5:
                col = lerp(GREEN_900, GREEN_700, t / 0.5)
            else:
                col = lerp(GREEN_700, GREEN_500, (t - 0.5) / 0.5)
            px[x, y] = col
    return small.resize((W, H), Image.LANCZOS)


def add_glow(img: Image.Image) -> None:
    """Soft amber glow behind the icon, so it lifts off the green."""
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse(
        [ICON_CX - 210, ICON_CY - 210, ICON_CX + 210, ICON_CY + 210],
        fill=(64, 50, 8),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    # Screen blend, which Pillow has no built-in mode for.
    base = img.load()
    gl = glow.load()
    for y in range(H):
        for x in range(W):
            b = base[x, y]
            g = gl[x, y]
            base[x, y] = tuple(255 - (255 - b[i]) * (255 - g[i]) // 255 for i in range(3))


def draw_text(img: Image.Image) -> None:
    d = ImageDraw.Draw(img)
    # Text must not run under the icon. Fonts resolve differently across
    # machines, so this is checked rather than assumed.
    text_right = ICON_CX - ICON_SIZE // 2 - 24
    widest = 0

    # Everything lives left of the icon. Play crops the sides of this graphic on
    # some surfaces, so nothing important goes past TEXT_RIGHT or near the edges.
    title_font = load_font(62)
    sub_font = load_font(27)
    tag_font = load_font(22)

    x = 58

    def line(y: int, text: str, font: ImageFont.FreeTypeFont, fill, dx: int = 0) -> float:
        nonlocal widest
        d.text((x + dx, y), text, font=font, fill=fill)
        w = dx + d.textlength(text, font=font)
        widest = max(widest, w)
        return d.textlength(text, font=font)

    line(118, "COUNT EVERY", title_font, WHITE)
    rep_w = line(186, "REP", title_font, AMBER_500)
    line(186, "YOU DO", title_font, WHITE, dx=round(rep_w + d.textlength(" ", font=title_font)))

    line(272, "AI rep counter for push-ups & squats", sub_font, WHITE, dx=2)
    line(308, "Duel friends  •  Train as a couple", sub_font, (0xBB, 0xF7, 0xD0), dx=2)

    # Pill badge -- reads as a product claim, not decoration.
    pill = "ON-DEVICE  •  NO EQUIPMENT"
    pw = d.textlength(pill, font=tag_font)
    d.rounded_rectangle([x, 366, x + pw + 36, 408], radius=21, fill=WHITE)
    d.text((x + 18, 376), pill, font=tag_font, fill=GREEN_700)
    widest = max(widest, pw + 36)

    overflow = x + widest - text_right
    if overflow > 0:
        raise SystemExit(
            f"headline overruns the icon by {overflow:.0f}px -- shrink the font "
            f"or shorten the copy (text may not pass x={text_right})"
        )


def rounded(icon: Image.Image, radius: int) -> Image.Image:
    """Mask the icon to a squircle.

    assets/icon.png is a full-bleed square whose own rounded corners sit on
    opaque black. Pasted straight onto the gradient those corners read as hard
    black notches, so the alpha has to be replaced rather than trusted.
    """
    mask = Image.new("L", icon.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, icon.size[0] - 1, icon.size[1] - 1],
                                           radius=radius, fill=255)
    out = icon.copy()
    out.putalpha(mask)
    return out


def paste_icon(img: Image.Image) -> None:
    icon_path = os.path.join(ASSETS, "icon.png")
    if not os.path.exists(icon_path):
        raise SystemExit(f"missing {icon_path}")
    icon = Image.open(icon_path).convert("RGBA")
    icon = icon.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
    radius = round(ICON_SIZE * 0.22)
    icon = rounded(icon, radius)

    left, top = ICON_CX - ICON_SIZE // 2, ICON_CY - ICON_SIZE // 2

    # Drop shadow, so the icon does not float flat on the gradient.
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [left + 6, top + 16, left + ICON_SIZE + 6, top + ICON_SIZE + 16],
        radius=radius,
        fill=(0, 0, 0, 130),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    img.paste(shadow, (0, 0), shadow)
    img.paste(icon, (left, top), icon)


def make_feature_graphic() -> str:
    img = diagonal_gradient()
    add_glow(img)
    paste_icon(img)
    draw_text(img)

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, "feature-graphic.png")
    # Play rejects transparency on the feature graphic, so force RGB.
    img.convert("RGB").save(out, "PNG", optimize=True)
    return out


def make_icon_512() -> str:
    """Play wants a 512x512 32-bit PNG for the listing icon."""
    icon = Image.open(os.path.join(ASSETS, "icon.png")).convert("RGBA")
    icon = icon.resize((512, 512), Image.LANCZOS)
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, "icon-512.png")
    icon.save(out, "PNG", optimize=True)
    return out


if __name__ == "__main__":
    for path in (make_feature_graphic(), make_icon_512()):
        with Image.open(path) as im:
            print(f"{os.path.relpath(path, ROOT)}  {im.size[0]}x{im.size[1]}  {im.mode}")
