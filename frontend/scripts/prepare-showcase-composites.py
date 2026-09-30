"""
Katalog sablon onizlemeleri ve bulten icin kare (900x900) tanitim kareleri:
acilis vitrinindeki dort urunun (aracin kesimi) kutuphane zeminlerinin
uzerinde. Eski kolyeli `vitrin-*.webp` kareleri kutuphane kurulmadan once
uretilmisti (30.09.2026'da yerini bunlar aldi).

Girdi: public/hero/<sahne>-yakin-kesim.webp ve public/hero/zemin/<ad>.webp
(ikisi de diger betiklerin ciktisi). Cikti: public/showcase/vitrin-<ad>.webp.

Kullanim: ../vitrin-ai/backend/.venv/bin/python frontend/scripts/prepare-showcase-composites.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

FRONTEND = Path(__file__).resolve().parents[1]
HERO = FRONTEND / "public" / "hero"
OUT = FRONTEND / "public" / "showcase"
SIZE = 900

# cikti adi -> (sahne, zemin, urun boyu [karenin kesri], urunun alt ucu [karenin kesri], golge)
COMPOSITES = {
    "yuzuk": ("sahne1", "yesil-kadife", 0.5, 0.74, True),
    "kutu": ("sahne3", "mermer", 0.66, 0.84, False),
    "kolye": ("sahne2", "saten", 0.8, 0.9, False),
    "alyans": ("sahne4", "siyah-su", 0.5, 0.72, False),
}


def compose(scene: str, backdrop: str, height: float, bottom: float, shadow: bool) -> Image.Image:
    base = ImageOps.fit(Image.open(HERO / "zemin" / f"{backdrop}.webp").convert("RGB"), (SIZE, SIZE), Image.LANCZOS)
    product = Image.open(HERO / f"{scene}-yakin-kesim.webp").convert("RGBA")
    target_h = round(SIZE * height)
    product = product.resize((round(product.width * target_h / product.height), target_h), Image.LANCZOS)
    x = (SIZE - product.width) // 2
    y = round(SIZE * bottom) - product.height
    canvas = base.convert("RGBA")
    if shadow:
        blob = Image.new("L", (round(product.width * 0.7), round(product.height * 0.07)), 0)
        ImageDraw.Draw(blob).ellipse((0, 0, blob.width - 1, blob.height - 1), fill=150)
        blob = blob.filter(ImageFilter.GaussianBlur(9))
        shade = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        shade.paste((0, 0, 0, 255), (x + (product.width - blob.width) // 2, y + product.height - blob.height // 2), blob)
        canvas.alpha_composite(shade)
    canvas.alpha_composite(product, (x, y))
    return canvas.convert("RGB")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, args in COMPOSITES.items():
        compose(*args).save(OUT / f"vitrin-{name}.webp", "WEBP", quality=84, method=6)
        print("-", name)
