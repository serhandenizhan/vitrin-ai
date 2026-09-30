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
# karakterini gosteren, birbirine benzemeyen uc zemin. Sade/Desen/Luks 30.09.2026'da
# Kaan'in istegiyle degistirildi (eski secim: duz siyah/kahve/bej, daire lekesi,
# gri gurultu); Dogal ayni kaldi.
GALLERY: dict[str, list[str]] = {
    "sade": [
        "3c5876cc-6afc-4e48-81ac-a1e6faa5e295",  # seftali gecis
        "9ffb70ea-7dae-46fa-b5dc-41469f5233d6",  # buzlu isik
        "d12b6dfb-8ad0-431a-8e64-b44cb7e7dc49",  # celik mavisi gecis
    ],
    "doku": [
        "bea88b0c-f35b-40f7-9aa6-c1355eec16ab",  # su yansimasi
        "d5776764-b116-436d-925b-da5464eab4be",  # gumus su dokusu
        "7db6267c-1112-4fcd-b16e-ea3b6164df8e",  # koyu petrol dokusu
    ],
    "dogal": [
        "b1ac846a-3af8-4a43-9d3e-cebb37618ce2",
        "58ece62e-2a21-4ea1-841b-ce26021c6eaf",
        "47088b9f-f9ff-47a1-a292-67c3b2c49567",
    ],
    "luks": [
        "5e71ba27-584d-483e-a554-9bab6093de14",  # inci damlali kaide
        "097444cb-a3a3-48cc-858a-b4f282f82813",  # yesil zeminde altin toz
        "5ea9e356-49be-403b-84d4-e41099cccab5",  # siyah su dalgalari
    ],
}
GALLERY_SIZE = 1200
GALLERY_QUALITY = 86


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
            card.save(gallery_dir / f"{background_id}.webp", "WEBP", quality=GALLERY_QUALITY, method=6)
    (FRONTEND / "src" / "lib" / "home-gallery.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"- galeri: {sum(len(v) for v in GALLERY.values())} zemin")


if __name__ == "__main__":
    asyncio.run(main())
