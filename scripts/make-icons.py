#!/usr/bin/env python3
"""
Generates the full app-icon set from a single source image.

    python3 scripts/make-icons.py <source.png>

Expo needs three distinct icons, and getting the Android one wrong is the
common mistake:

  icon.png            1024x1024, the artwork edge-to-edge. iOS applies its own
                      rounded-corner mask, so the square must be filled.
  adaptive-icon.png   1024x1024 FOREGROUND only, with generous transparent
                      padding. Android crops this to a circle/squircle/rounded
                      square depending on the launcher, and clips ~25% off every
                      edge — so the subject must sit within the safe centre or it
                      gets its head cropped off. We composite the source at ~66%
                      scale on transparency to guarantee that.
  splash-icon.png     1024x1024 on transparency, shown on the launch screen over
                      the brand background.
  favicon.png         48x48 for the (unused) web build.

The Android adaptive background colour is set separately in app.json; here we
only produce the foreground so the launcher can mask it cleanly.
"""
import sys
from pathlib import Path

from PIL import Image

SIZE = 1024
# Fraction of the canvas the subject occupies inside the adaptive foreground.
# Android's mask clips to roughly the centre 72%, so 0.66 keeps the whole
# subject inside the safe zone on every launcher shape.
ADAPTIVE_SUBJECT = 0.66


def load_square(path: Path) -> Image.Image:
    """Loads the source and centre-crops it to a square without distorting it."""
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side)).resize((SIZE, SIZE), Image.LANCZOS)


def sample_background(img: Image.Image) -> tuple[int, int, int]:
    """Averages the four corners to approximate the artwork's backdrop colour."""
    px = img.load()
    pts = [(4, 4), (SIZE - 5, 4), (4, SIZE - 5), (SIZE - 5, SIZE - 5)]
    r = sum(px[x, y][0] for x, y in pts) // 4
    g = sum(px[x, y][1] for x, y in pts) // 4
    b = sum(px[x, y][2] for x, y in pts) // 4
    return r, g, b


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: make-icons.py <source.png>", file=sys.stderr)
        raise SystemExit(1)

    src = load_square(Path(sys.argv[1]))
    out = Path(__file__).resolve().parent.parent / "assets"
    out.mkdir(exist_ok=True)

    # iOS / main icon — artwork fills the square; the OS rounds the corners.
    src.convert("RGB").save(out / "icon.png")

    # Android adaptive foreground — subject inset on transparency so the
    # launcher mask never clips it. The background colour lives in app.json.
    inset = int(SIZE * ADAPTIVE_SUBJECT)
    subject = src.resize((inset, inset), Image.LANCZOS)
    fg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    offset = (SIZE - inset) // 2
    fg.paste(subject, (offset, offset), subject)
    fg.save(out / "adaptive-icon.png")

    # Splash — same subject inset, kept on transparency over the brand colour.
    fg.save(out / "splash-icon.png")

    # Web favicon.
    src.convert("RGB").resize((48, 48), Image.LANCZOS).save(out / "favicon.png")

    bg = sample_background(src)
    print(f"✓ wrote icon.png, adaptive-icon.png, splash-icon.png, favicon.png to {out}")
    print(f"  sampled background colour: #{bg[0]:02X}{bg[1]:02X}{bg[2]:02X}")
    print("  → set android.adaptiveIcon.backgroundColor in app.json to match if desired")


if __name__ == "__main__":
    main()
