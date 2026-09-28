"""
Acilis vitrininin yakinlasmasindaki "bir zemine koyun" ornekleri.

Kutuphaneden secilmis birkac zemini R2'den YALNIZCA OKUR ve kucultulmus
kopyalarini `public/hero/zemin/` altina yazar. Neden kopya: acilisi oturum
acmamis ziyaretci de goruyor; kutuphane ise oturumlu bir uctan, suresi dolan
imzali adreslerle geliyor. Gosterilen zeminler kutuphanedeki zeminlerin
KENDISI (ayni kimlik) — ziyaretci studyoda karsilasacagi zemini goruyor.

Uretilenler (zemin basina):
  public/hero/zemin/<ad>.webp        genis kenari 2400 px (yakinlasmanin arkasi)
  public/hero/zemin/<ad>-kucuk.webp  96 px kare (secim dugmesi)

R2 ayarlari backend'in `.env`'inden okunur. Worktree'de calisirken backend
klasoru ortam degiskeniyle verilir (kok CLAUDE.md ders 11):
  HERO_BACKEND_DIR=../vitrin-ai/backend \\
    ../vitrin-ai/backend/.venv/bin/python frontend/scripts/prepare-hero-backdrops.py
"""

import asyncio
import io
import os
import sys
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1]
BACKEND = Path(os.environ.get("HERO_BACKEND_DIR", FRONTEND.parent / "backend")).resolve()
sys.path.insert(0, str(BACKEND))

from PIL import Image, ImageOps  # noqa: E402

OUTPUT_DIR = FRONTEND / "public" / "hero" / "zemin"
LARGE = 2400
SWATCH = 96
QUALITY = 80

# ad -> kutuphanedeki zemin kimligi. `hero-backdrops.ts` ile AYNI adlar.
BACKDROPS: dict[str, str] = {
    "yesil-kadife": "14be434a-aa2c-48e1-8ac5-43dcaa62c8bb",
    "mermer": "ab305eca-972d-4298-abe0-c8190632ecf4",
    "kum-tas": "02656971-6011-4053-8189-ca264fe45981",
    "siyah-su": "f70bea97-c804-4f19-919a-171b6493627d",
    "saten": "da0c5523-d1e1-40ad-b2ac-5984edc6abd4",
}


async def main() -> None:
    from app.services.storage import get_storage_service

    storage = get_storage_service()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, background_id in BACKDROPS.items():
        data = await storage.download(f"backgrounds/{background_id}.jpg")
        image = Image.open(io.BytesIO(data)).convert("RGB")
        large = image.copy()
        large.thumbnail((LARGE, LARGE), Image.LANCZOS)
        large.save(OUTPUT_DIR / f"{name}.webp", "WEBP", quality=QUALITY, method=6)
        swatch = ImageOps.fit(image, (SWATCH * 2, SWATCH * 2), Image.LANCZOS)
        swatch.save(OUTPUT_DIR / f"{name}-kucuk.webp", "WEBP", quality=QUALITY, method=6)
        print(f"- {name}: {image.size} -> {large.size}")


if __name__ == "__main__":
    asyncio.run(main())
