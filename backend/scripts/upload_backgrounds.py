"""Zemin kütüphanesini toplu yükler ve frontend kataloğunu üretir.

Öne alınan iş (Kaan'ın onayı, 17.09.2026): zemin yönetim paneli Faz 6'da;
ilk kütüphane o panel olmadan, bu betikle yükleniyor.

NE YAPAR (her görsel için, sırayla):
  1. `validate_upload` — yönetici yükleme ucuyla AYNI kontroller (magic byte,
     20 MB, 40 MP).
  2. Aynı çözünürlükte JPEG %92 olarak yeniden kaydeder ve tekrar doğrular.
  3. Küçük önizleme üretir (`backgrounds/thumbs/<id>.jpg`).
  4. Önce R2'ye yükler, ancak başarılıysa `backgrounds` tablosuna satır yazar
     (yükleme ucuyla aynı sıra). Veritabanı yazılamazsa R2 nesneleri geri silinir.
  5. Manifeste yazar. Manifestte olan dosya tekrar yüklenmez (yarıda kalırsa
     aynı komut güvenle yeniden çalıştırılabilir).

VERİTABANI YAPISI DEĞİŞMEZ: kategori ve baskı uyarısı tabloya değil,
`frontend/src/lib/background-catalog.ts` dosyasına yazılır (Kaan'ın kararı).

Kullanım (backend klasöründen, gerçek `.env` ile):
  # 1) Kontrol — hiçbir şey yüklenmez:
  python scripts/upload_backgrounds.py --source "<klasör>" --plan plan.json --manifest manifest.json --dry-run
  # 2) Gerçek yükleme — `--yes` olmadan çalışmaz:
  python scripts/upload_backgrounds.py --source "<klasör>" --plan plan.json --manifest manifest.json --yes
  # 3) Katalog:
  python scripts/upload_backgrounds.py --manifest manifest.json --catalog-out ../frontend/src/lib/background-catalog.ts

plan.json biçimi:
  {"files": {"dosya.jpg": {"category": "sade", "print_warning": false}, ...}}
Klasördeki her görsel planda tam bir kez bulunmalı; eksik ya da fazla varsa
betik hiçbir şey yapmadan durur.
"""

import argparse
import asyncio
import io
import json
import sys
import uuid
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from PIL import Image  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.db import engine  # noqa: E402
from app.models.background import Background  # noqa: E402
from app.services.background_images import (  # noqa: E402
    encode_background,
    make_thumbnail,
    thumbnail_key,
)
from app.services.storage import R2StorageService  # noqa: E402
from app.validation.upload import UploadValidationError, validate_upload  # noqa: E402

CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}
CATEGORIES = ("sade", "doku", "dogal", "luks")
CATALOG_HEADER = """/**
 * BU DOSYA BETIKLE URETILIR, ELLE DUZENLEMEYIN.
 *
 * Kaynak: `backend/scripts/upload_backgrounds.py --catalog-out`. Zemin
 * kimligi -> kategori ve baski uyarisi. Aciklama: lib/background-categories.ts.
 */
import type { BackgroundCatalogEntry } from "@/lib/background-categories";

"""


def _validate(content: bytes, content_type: str) -> None:
    validate_upload(
        content,
        declared_content_type=content_type,
        max_file_size_mb=settings.max_file_size_mb,
        allowed_content_types=settings.allowed_content_types,
        max_image_pixels=settings.max_image_pixels,
    )


def load_plan(source: Path, plan_path: Path) -> dict[str, dict]:
    plan = json.loads(plan_path.read_text(encoding="utf-8"))["files"]
    files = {p.name for p in source.iterdir() if p.is_file()}
    missing = sorted(files - plan.keys())
    extra = sorted(plan.keys() - files)
    bad = sorted(name for name, entry in plan.items() if entry.get("category") not in CATEGORIES)
    if missing or extra or bad:
        raise SystemExit(
            f"Plan klasörle uyuşmuyor. Planda olmayan: {missing} | klasörde olmayan: {extra} "
            f"| geçersiz kategori: {bad}"
        )
    return plan


def load_manifest(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def write_manifest(path: Path, manifest: list[dict]) -> None:
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def prepare(path: Path) -> tuple[bytes, bytes]:
    content_type = CONTENT_TYPES.get(path.suffix.lower())
    if content_type is None:
        raise UploadValidationError(f"Desteklenmeyen uzantı: {path.suffix}")
    original = path.read_bytes()
    _validate(original, content_type)
    encoded = encode_background(original)
    _validate(encoded, "image/jpeg")
    return encoded, make_thumbnail(encoded)


async def upload(source: Path, plan: dict[str, dict], manifest_path: Path, *, dry_run: bool) -> None:
    manifest = load_manifest(manifest_path)
    done = {entry["file"] for entry in manifest}
    storage = R2StorageService(bucket_name=settings.r2_bucket_name)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    if not dry_run:
        storage.ensure_configured()
        print(f"Hedef: veritabanı {make_url(settings.database_url).host}, R2 bucket {settings.r2_bucket_name}")

    total_before = total_after = 0
    for name in sorted(plan):
        if name in done:
            print(f"atlandı (manifestte var): {name}")
            continue
        path = source / name
        encoded, thumbnail = prepare(path)
        total_before += path.stat().st_size
        total_after += len(encoded)
        if dry_run:
            print(f"uygun: {name} | {path.stat().st_size / 1e6:.2f} MB -> {len(encoded) / 1e6:.2f} MB, önizleme {len(thumbnail) / 1e3:.0f} KB")
            continue

        background_id = uuid.uuid4()
        key = f"backgrounds/{background_id}.jpg"
        await storage.upload(key, encoded, "image/jpeg")
        await storage.upload(thumbnail_key(key), thumbnail, "image/jpeg")
        try:
            async with sessions() as session:
                session.add(Background(id=background_id, r2_key=key, tier="basic"))
                await session.commit()
        except Exception:
            # Yetim nesne kalmasın: satır yazılamadıysa yüklenenler geri alınıyor.
            await storage.delete(key)
            await storage.delete(thumbnail_key(key))
            raise

        entry = plan[name]
        with Image.open(io.BytesIO(encoded)) as image:
            width, height = image.size
        manifest.append(
            {
                "file": name,
                "id": str(background_id),
                "r2_key": key,
                "category": entry["category"],
                "print_warning": bool(entry.get("print_warning")),
                # Zemin yönü (dikey/yatay) frontend kataloğunda bundan türetiliyor.
                "width": width,
                "height": height,
            }
        )
        write_manifest(manifest_path, manifest)
        print(f"yüklendi: {name} -> {background_id}")

    print(f"Toplam: {total_before / 1e6:.1f} MB -> {total_after / 1e6:.1f} MB")
    await engine.dispose()


def backfill_dimensions(manifest_path: Path, source: Path) -> None:
    """Eski manifest kayıtlarına kaynak dosyadan genişlik/yükseklik ekler.

    Yeniden kaydetme çözünürlüğü değiştirmediği için kaynak dosyanın ölçüleri
    R2'deki zeminle aynı.
    """
    from PIL import Image, ImageOps

    manifest = load_manifest(manifest_path)
    for entry in manifest:
        if "width" in entry:
            continue
        with Image.open(source / entry["file"]) as image:
            width, height = ImageOps.exif_transpose(image).size
        entry["width"], entry["height"] = width, height
    write_manifest(manifest_path, manifest)


def write_catalog(manifest_path: Path, out: Path) -> None:
    manifest = load_manifest(manifest_path)
    lines = [CATALOG_HEADER, "export const BACKGROUND_CATALOG: Record<string, BackgroundCatalogEntry> = {\n"]
    for entry in manifest:
        orientation = ""
        if "width" in entry:
            # Kare zemin "landscape": kare bicimlerle (gönderi, pazaryeri) eşleşsin.
            kind = "portrait" if entry["height"] > entry["width"] else "landscape"
            orientation = f', orientation: "{kind}"'
        warning = ", printWarning: true" if entry["print_warning"] else ""
        lines.append(f'  "{entry["id"]}": {{ category: "{entry["category"]}"{orientation}{warning} }},\n')
    lines.append("};\n")
    out.write_text("".join(lines), encoding="utf-8")
    print(f"Katalog yazıldı: {out} ({len(manifest)} zemin)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--plan", type=Path)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--catalog-out", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--yes", action="store_true", help="Gerçek yükleme için zorunlu onay.")
    args = parser.parse_args()

    if args.catalog_out:
        # Ölçüleri olmayan eski manifest kayıtları, --source verilmişse kaynaktan tamamlanır.
        if args.source:
            backfill_dimensions(args.manifest, args.source)
        write_catalog(args.manifest, args.catalog_out)
        return
    if not (args.source and args.plan):
        parser.error("--source ve --plan gerekli (ya da yalnızca --catalog-out).")
    if not args.dry_run and not args.yes:
        parser.error("Gerçek yükleme için --yes verin; önce --dry-run ile kontrol edin.")
    plan = load_plan(args.source, args.plan)
    asyncio.run(upload(args.source, plan, args.manifest, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
