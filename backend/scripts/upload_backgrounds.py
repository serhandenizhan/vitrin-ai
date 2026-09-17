"""Zemin kütüphanesini toplu yükler ve frontend kataloğunu üretir.

Öne alınan iş (Kaan'ın onayı, 17.09.2026): zemin yönetim paneli Faz 6'da;
ilk kütüphane o panel olmadan, bu betikle yükleniyor.

NE YAPAR (her görsel için, sırayla):
  1. `validate_upload` — yönetici yükleme ucuyla AYNI kontroller (magic byte,
     20 MB, 40 MP).
  2. Aynı çözünürlükte JPEG %92 olarak yeniden kaydeder ve tekrar doğrular.
  3. Küçük önizleme üretir (`backgrounds/thumbs/<id>.jpg`).
  4. Önce R2'ye yükler, ancak başarılıysa `backgrounds` tablosuna satır yazar
     (yükleme ucuyla aynı sıra). Yükleme ya da veritabanı yazma yarıda
     kalırsa o ana kadar yüklenen R2 nesneleri geri silinir.
  5. Manifeste yazar. Manifestte olan dosya tekrar yüklenmez.

YARIDA KALIRSA: aynı komut güvenle yeniden çalıştırılabilir. Bu garanti
manifestten DEĞİL, zemin kimliğinin kaynak dosya adından TÜRETİLMESİNDEN
geliyor (`background_id`, UUIDv5). Manifest ile veritabanı commit'i arasında
süreç ölse bile yeniden çalıştırma aynı kimliği, aynı R2 anahtarını üretir:
içerik aynıysa yükleme HİÇ tekrarlanmaz, yalnızca manifest tamamlanır ve var
olan satır tekrar eklenmez. Rastgele UUID ile bu pencerede kalan bir çökme,
aynı görsel için İKİNCİ bir kayıt ve ikinci bir R2 nesne çifti üretiyordu
(PR #18 incelemesi).

AYNI ADI TAŞIYAN FARKLI GÖRSEL: yalnız dosya adı KALICI bir kimlik değildir —
başka bir klasördeki aynı adlı farklı bir görsel aynı anahtarı üretir. Bu
durumda betik DURUR (fail-closed) ve mevcut zeminin içeriğini sessizce
değiştirmez; kategori/baskı uyarısı eski görsele ait kalacağı için sessiz
üzerine yazma en kötü sonuçtu. Yeni bir parti yüklerken `--batch` ile kalıcı
bir ad alanı verin; bilinçli değiştirme için `--allow-overwrite`
(PR #18 ikinci inceleme turu).

VERİTABANI YAPISI DEĞİŞMEZ: kategori ve baskı uyarısı tabloya değil,
`frontend/src/lib/background-catalog.ts` dosyasına yazılır (Kaan'ın kararı).

Kullanım (backend klasöründen, gerçek `.env` ile):
  # 1) Kontrol — hiçbir şey yüklenmez:
  python scripts/upload_backgrounds.py --source "<klasör>" --plan plan.json --manifest manifest.json --dry-run
  # 2) Gerçek yükleme — `--yes` olmadan çalışmaz:
  python scripts/upload_backgrounds.py --source "<klasör>" --plan plan.json --manifest manifest.json --yes
  # 2b) YENİ BİR PARTİ yüklerken kalıcı bir ad alanı verin (ad çakışmasını önler):
  python scripts/upload_backgrounds.py --source "<klasör>" --plan plan.json --manifest manifest.json --batch 2026-10-sonbahar --yes
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

# Zemin kimliği kaynak dosya adından TÜRETİLİYOR (UUIDv5): betik yeniden
# çalıştırıldığında aynı dosya aynı kimliği ve aynı R2 anahtarını alır, yani
# yükleme idempotent olur. Namespace sabiti bu betiğe özel ve DEĞİŞMEZ —
# değişirse var olan kütüphanenin kimlikleri de değişir, kataloğu kırar.
# (Kimlik hâlâ sunucuda üretiliyor; kullanıcı dosya adı R2 anahtarına hiç
# girmiyor — path traversal koruması sürüyor, bkz. SECURITY.md böl. 4.)
BACKGROUND_ID_NAMESPACE = uuid.UUID("6f5f3a1e-4d0b-5c7a-9e21-8a3b4c5d6e7f")


def background_id_for(file_name: str, batch: str = "") -> uuid.UUID:
    """Dosya adından (ve varsa parti adından) determinist kimlik.

    `batch` BOŞKEN kimlik yalnız dosya adına dayanır ve bu, ilk kütüphanenin
    kimlikleriyle bire bir uyumlu kalır (yarıda kalmış bir çalıştırma güvenle
    sürdürülebilsin diye bilinçli). Ama yalnız dosya adı KALICI bir kimlik
    değildir: başka bir klasörde aynı adı taşıyan farklı bir görsel aynı
    anahtarı üretir. Yeni bir parti yüklenirken `--batch` ile kalıcı bir ad
    alanı verilir (ör. `--batch 2026-10-sonbahar`); böylece ad çakışması
    farklı kimlik üretir. Ad alanı verilmese bile aşağıdaki içerik kontrolü
    sessiz üzerine yazmayı engelliyor (PR #18 ikinci inceleme turu).
    """
    return uuid.uuid5(BACKGROUND_ID_NAMESPACE, f"{batch}/{file_name}" if batch else file_name)


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


def _manifest_entry(
    name: str, background_id: uuid.UUID, key: str, encoded: bytes, entry: dict
) -> dict:
    with Image.open(io.BytesIO(encoded)) as image:
        width, height = image.size
    return {
        "file": name,
        "id": str(background_id),
        "r2_key": key,
        "category": entry["category"],
        "print_warning": bool(entry.get("print_warning")),
        # Zemin yönü (dikey/yatay) frontend kataloğunda bundan türetiliyor.
        "width": width,
        "height": height,
    }


def prepare(path: Path) -> tuple[bytes, bytes]:
    content_type = CONTENT_TYPES.get(path.suffix.lower())
    if content_type is None:
        raise UploadValidationError(f"Desteklenmeyen uzantı: {path.suffix}")
    original = path.read_bytes()
    _validate(original, content_type)
    encoded = encode_background(original)
    _validate(encoded, "image/jpeg")
    return encoded, make_thumbnail(encoded)


async def upload(
    source: Path,
    plan: dict[str, dict],
    manifest_path: Path,
    *,
    dry_run: bool,
    batch: str = "",
    allow_overwrite: bool = False,
) -> None:
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

        background_id = background_id_for(name, batch)
        key = f"backgrounds/{background_id}.jpg"
        # Kimlik deterministik olduğu için satır, manifest yazılmadan ölmüş bir
        # önceki çalıştırmadan KALMIŞ olabilir. Bu YÜKLEMEDEN ÖNCE sorulmalı:
        # aşağıdaki temizlik, var olan bir zeminin nesnelerini silip onu
        # kırmasın (satır kalır, gösterdiği nesne gider).
        async with sessions() as session:
            row_existed = await session.get(Background, background_id) is not None

        # KİMLİK ÇAKIŞMASI KONTROLÜ. Satır zaten varsa iki ayrı durum mümkün:
        # (a) yarıda kalmış bir çalıştırmanın AYNI dosyası — sürdürülmeli;
        # (b) başka bir partide aynı adı taşıyan FARKLI bir görsel — bu
        #     durumda yükleme, veritabanındaki zeminin içeriğini sessizce
        #     değiştirirdi (kategori ve baskı uyarısı eski görsele ait kalır).
        # İkisini ayırt etmenin yolu R2'deki mevcut içeriğe bakmak. Aynıysa
        # yükleme hiç tekrarlanmıyor; farklıysa betik DURUYOR (fail-closed).
        if row_existed and not allow_overwrite:
            try:
                existing = await storage.download(key)
            except Exception:
                # Nesne yok (ör. önceki hata yolunda silinmiş): yükleme normal
                # şekilde sürer, üzerine yazılacak bir içerik yok.
                existing = None
            if existing is not None and existing != encoded:
                raise SystemExit(
                    f"DURDURULDU: '{name}' için üretilen kimlik ({background_id}) "
                    f"veritabanında zaten var ama R2'deki içerik FARKLI. Aynı adı "
                    f"taşıyan başka bir görselin mevcut zemini sessizce ezmesini "
                    f"engellemek için hiçbir şey yapılmadı.\n"
                    f"  - Yeni bir parti yüklüyorsanız: --batch <kalıcı-parti-adı> verin.\n"
                    f"  - Bu zemini bilerek değiştirmek istiyorsanız: --allow-overwrite verin."
                )
            if existing is not None:
                # Bire bir aynı içerik: yükleme tekrarlanmıyor, yalnızca
                # manifest tamamlanıyor (yarıda kalmış çalıştırmanın sürdürülmesi).
                print(f"atlandı (R2'de aynı içerikle zaten var): {name}")
                manifest.append(_manifest_entry(name, background_id, key, encoded, plan[name]))
                write_manifest(manifest_path, manifest)
                continue

        # Başarıyla yüklenen anahtarlar tek tek toplanıyor: İKİNCİ yükleme
        # (küçük önizleme) patladığında ilki R2'de kalırdı ve DB satırı hiç
        # yazılmadığı için ona bir daha kimse ulaşamazdı (yetim nesne).
        uploaded: list[str] = []
        try:
            await storage.upload(key, encoded, "image/jpeg")
            uploaded.append(key)
            await storage.upload(thumbnail_key(key), thumbnail, "image/jpeg")
            uploaded.append(thumbnail_key(key))
            if not row_existed:
                async with sessions() as session:
                    session.add(Background(id=background_id, r2_key=key, tier="basic"))
                    await session.commit()
        except Exception:
            if not row_existed:
                for uploaded_key in uploaded:
                    await storage.delete(uploaded_key)
            raise

        manifest.append(_manifest_entry(name, background_id, key, encoded, plan[name]))
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
    parser.add_argument(
        "--batch",
        default="",
        help="Kalıcı parti adı: kimlik bundan ve dosya adından türetilir. Yeni bir "
        "parti yüklerken verin, aksi halde aynı adı taşıyan farklı bir görsel var "
        "olan zeminle aynı kimliği üretir. İlk kütüphane parti adı OLMADAN yüklendi.",
    )
    parser.add_argument(
        "--allow-overwrite",
        action="store_true",
        help="Var olan bir zeminin içeriğini bilerek değiştirmek için. Varsayılan "
        "olarak içerik uyuşmazlığında betik durur.",
    )
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
    asyncio.run(
        upload(
            args.source,
            plan,
            args.manifest,
            dry_run=args.dry_run,
            batch=args.batch,
            allow_overwrite=args.allow_overwrite,
        )
    )


if __name__ == "__main__":
    main()
