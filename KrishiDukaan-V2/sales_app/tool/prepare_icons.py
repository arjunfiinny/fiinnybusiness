#!/usr/bin/env python3
"""Turn the supplied brand artwork into the two sources flutter_launcher_icons needs.

Run after replacing assets/icons/app_icon_source.png:

    python3 tool/prepare_icons.py
    dart run flutter_launcher_icons
    dart run flutter_native_splash:create

Why this exists rather than pointing the generator straight at the artwork:

* The artwork ships with rounded corners and a drop shadow. Android and iOS both
  apply their own mask, so a pre-rounded source gets rounded twice and the shadow
  survives as grey fringing along the cut. This squares the canvas off and fills
  the corners with the artwork's own background.
* iOS rejects transparency in an app icon; the alpha is flattened onto white.
* An Android adaptive icon can be cropped to any shape and only the centre ~66%
  is guaranteed visible, so the foreground is the artwork inset on a transparent
  canvas instead of the full-bleed square.
"""

from pathlib import Path
import sys

from PIL import Image

ICONS = Path(__file__).resolve().parent.parent / "assets" / "icons"
SOURCE = ICONS / "app_icon_source.png"
SQUARE = ICONS / "app_icon.png"
FOREGROUND = ICONS / "app_icon_foreground.png"

SIZE = 1024
# Fraction of the canvas the artwork occupies in the adaptive foreground. 0.62
# keeps it inside the 66% safe zone with a little slack for aggressive masks.
FOREGROUND_SCALE = 0.62


def background_colour(im: Image.Image) -> tuple[int, int, int]:
    """The artwork's own ground, sampled just inside the centre of each edge.

    Sampling the very corner would pick up the rounding or the shadow, which is
    exactly what we are trying to remove.
    """
    w, h = im.size
    inset = max(2, min(w, h) // 12)
    samples = [
        im.getpixel((w // 2, inset)),
        im.getpixel((w // 2, h - inset - 1)),
        im.getpixel((inset, h // 2)),
        im.getpixel((w - inset - 1, h // 2)),
    ]
    opaque = [s for s in samples if len(s) < 4 or s[3] > 200]
    if not opaque:
        return (255, 255, 255)
    return tuple(sum(s[i] for s in opaque) // len(opaque) for i in range(3))


def main() -> int:
    if not SOURCE.exists():
        print(f"error: put the 1024x1024 artwork at {SOURCE}", file=sys.stderr)
        return 1

    art = Image.open(SOURCE).convert("RGBA")
    if art.width != art.height:
        side = min(art.size)
        left = (art.width - side) // 2
        top = (art.height - side) // 2
        art = art.crop((left, top, left + side, top + side))
    art = art.resize((SIZE, SIZE), Image.LANCZOS)

    ground = background_colour(art)

    # Full-bleed square: artwork flattened onto its own ground so the rounded
    # corners and shadow disappear into a solid edge.
    square = Image.new("RGB", (SIZE, SIZE), ground)
    square.paste(art, (0, 0), art)
    square.save(SQUARE)

    # Adaptive foreground: same artwork, inset, transparent around it.
    inner = int(SIZE * FOREGROUND_SCALE)
    fg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    fg.paste(art.resize((inner, inner), Image.LANCZOS), ((SIZE - inner) // 2,) * 2)
    fg.save(FOREGROUND)

    print(f"ground colour  {'#%02X%02X%02X' % ground}")
    print(f"wrote          {SQUARE.relative_to(ICONS.parent.parent)}  {SIZE}x{SIZE}")
    print(f"wrote          {FOREGROUND.relative_to(ICONS.parent.parent)}  {SIZE}x{SIZE} (artwork at {int(FOREGROUND_SCALE*100)}%)")
    print()
    print("If the ground colour above is not white, set adaptive_icon_background")
    print("in flutter_launcher_icons.yaml to match it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
