"""Generate per-brand favicon sets for the demo landing skins.

For each brand: a rounded tile in the brand accent + a bold white mark, written to
public/{key}-icon.svg (crisp vector), {key}-icon.png (512), {key}-apple-icon.png
(180) and {key}-favicon.ico (16-64). Recreated brand cues for a demo, not official
trademarked logos. Run: uv run --no-project --with pillow python scripts/gen-brand-favicons.py
"""

from PIL import Image, ImageDraw, ImageFont

BRANDS = {
    "ford": ("#0668E1", "F"),
    "gm": ("#0072CE", "GM"),
    "honda": ("#E40521", "H"),
    "toyota": ("#EB0A1E", "T"),
    "bmw": ("#0066B1", "BMW"),
    "volvo": ("#3D7AB8", "V"),
}

FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
PUB = "public"
S = 512
RADIUS = int(S * 0.22)


def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def fit_font(draw, text, max_w):
    size = 360
    while size > 24:
        f = ImageFont.truetype(FONT_PATH, size)
        bbox = draw.textbbox((0, 0), text, font=f)
        if (bbox[2] - bbox[0]) <= max_w:
            return f
        size -= 6
    return ImageFont.truetype(FONT_PATH, 24)


def draw_tile(accent, mark):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=RADIUS, fill=hex2rgb(accent))
    f = fit_font(d, mark, int(S * 0.74))
    bbox = d.textbbox((0, 0), mark, font=f)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (S - w) // 2 - bbox[0]
    y = (S - h) // 2 - bbox[1]
    d.text((x, y), mark, font=f, fill=(255, 255, 255, 255))
    return img


def svg(accent, mark):
    fs = {1: 300, 2: 210, 3: 150}.get(len(mark), 150)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
        f'<rect width="512" height="512" rx="112" fill="{accent}"/>'
        f'<text x="256" y="256" font-family="Arial, Helvetica, sans-serif" '
        f'font-weight="700" font-size="{fs}" fill="#fff" text-anchor="middle" '
        f'dominant-baseline="central">{mark}</text></svg>\n'
    )


for key, (accent, mark) in BRANDS.items():
    img = draw_tile(accent, mark)
    img.save(f"{PUB}/{key}-icon.png")
    img.resize((180, 180), Image.LANCZOS).save(f"{PUB}/{key}-apple-icon.png")
    img.save(
        f"{PUB}/{key}-favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)]
    )
    with open(f"{PUB}/{key}-icon.svg", "w") as fp:
        fp.write(svg(accent, mark))
    print(f"{key}: {accent} '{mark}' -> svg/png/ico")
