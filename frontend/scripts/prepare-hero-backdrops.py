"""
Acilis vitrininin yakinlasmasindaki "bir zemine koyun" ornekleri.

Kutuphaneden secilmis birkac zemini R2'den YALNIZCA OKUR ve kucultulmus
kopyalarini `public/hero/zemin/` altina yazar. Neden kopya: acilisi oturum
acmamis ziyaretci de goruyor; kutuphane ise oturumlu bir uctan, suresi dolan
imzali adreslerle geliyor. Gosterilen zeminler kutuphanedeki zeminlerin
KENDISI (ayni kimlik) — ziyaretci studyoda karsilasacagi zemini goruyor.

Ana sayfanin "Zeminler" bolumu icin ayrica her kategoriden birkac ornek
(`GALLERY`) `public/hero/zemin/galeri/` altina kopyalanir ve secim
`src/lib/home-gallery.json`'a yazilir (bolum listeyi oradan okur).

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
import json
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


# Kategori -> kutuphanedeki zemin kimlikleri (ana sayfa galerisi). Kategori
# adlari `background-categories.ts` ile ayni. Secim elle: her kategorinin
# karakterini gosteren, birbirine benzemeyen uc zemin.
GALLERY: dict[str, list[str]] = {
    "sade": [
        "7495e364-2f8a-455f-9ca8-876f4e8e6542",
        "c8ca1cb2-d794-4b54-ad9c-fb02d0e310df",
        "d65d5116-809b-40b3-8901-a8e2ec84eac0",
    ],
    "doku": [
        "32fa076b-aa55-4eed-8c29-962730a00636",
        "a39d53e7-aa72-4c1c-9861-5452971961b4",
        "587fb7d7-71f9-4f19-a9e4-72c832d63c91",
    ],
    "dogal": [
        "b1ac846a-3af8-4a43-9d3e-cebb37618ce2",
        "58ece62e-2a21-4ea1-841b-ce26021c6eaf",
        "47088b9f-f9ff-47a1-a292-67c3b2c49567",
    ],
    "luks": [
        "107a2840-21b1-4fe7-8bd3-e0f13eb10d06",
        "2af248d8-c407-47d9-b3fc-4327afa0861d",
        "4e559403-b505-4086-a1de-483ef6403033",
    ],
}
GALLERY_SIZE = 900


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

    gallery_dir = OUTPUT_DIR / "galeri"
    gallery_dir.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, list[str]] = {}
    for category, ids in GALLERY.items():
        manifest[category] = ids
        for background_id in ids:
            data = await storage.download(f"backgrounds/{background_id}.jpg")
            image = Image.open(io.BytesIO(data)).convert("RGB")
            # Kart kare-yakin (4:3); kaynak yatay ya da dikey olabilir.
            card = ImageOps.fit(image, (GALLERY_SIZE, round(GALLERY_SIZE * 3 / 4)), Image.LANCZOS)
            card.save(gallery_dir / f"{background_id}.webp", "WEBP", quality=QUALITY, method=6)
    (FRONTEND / "src" / "lib" / "home-gallery.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"- galeri: {sum(len(v) for v in GALLERY.values())} zemin")


if __name__ == "__main__":
    asyncio.run(main())
