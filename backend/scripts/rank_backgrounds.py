"""Zeminleri görsel karmaşıklığa göre sıralar ve frontend sıra dosyasını üretir.

Serhan, 19.09.2026: "zeminlerin sıralaması basic'ten complex'e gitsin, düz
zeminler en altta olmasın". Sunucu listesi `created_at` sırasıyla geliyor ve
bu, görselle hiçbir ilişkisi olmayan yükleme sırası; düz zeminler listenin
sonuna düşüyordu.

NE YAPAR: `backgrounds` tablosundaki her zeminin küçük önizlemesini
(`backgrounds/thumbs/<id>.jpg`) R2'den okur, 128 px'e indirip bir karmaşıklık
puanı hesaplar ve kimlikleri puana göre (düzden karmaşığa) sıralayıp
`frontend/src/lib/background-order.ts` dosyasına yazar. SALT OKUMA: R2'ye ve
veritabanına hiçbir şey yazmaz.

PUAN: gri tonda ortalama kenar şiddeti (komşu piksel farkı) — düz renk ~0,
yumuşak geçiş düşük, doku/desen/fotoğraf yüksek — artı renk çeşitliliği için
küçük bir pay (kanal standart sapması). Ağırlıklar kaba; amaç kesin bir ölçü
değil, "düz → sade geçiş → doku → fotoğraf" eğilimi.

VERİTABANI YAPISI DEĞİŞMEZ (kategori kataloğuyla aynı karar, Kaan): sıra
tabloya değil üretilen dosyaya yazılır. Yeni zemin yüklendiğinde betik yeniden
çalıştırılır; sıra dosyasında olmayan zemin kendi kategorisinin SONUNA gider.

Kullanım (backend klasöründen, gerçek `.env` ile):
  python scripts/rank_backgrounds.py --out ../frontend/src/lib/background-order.ts
"""

import argparse
import asyncio
import io
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from PIL import Image, ImageChops, ImageStat  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker  # noqa: E402

from app.core.db import engine  # noqa: E402
from app.models.background import Background  # noqa: E402
from app.services.background_images import thumbnail_key  # noqa: E402
from app.services.storage import get_storage_service  # noqa: E402

DEFAULT_OUT = BACKEND_DIR.parent / "frontend" / "src" / "lib" / "background-order.ts"
SAMPLE_SIZE = 128

HEADER = """/**
 * BU DOSYA BETIKLE URETILIR, ELLE DUZENLEMEYIN.
 *
 * Kaynak: `backend/scripts/rank_backgrounds.py`. Zemin kimlikleri gorsel
 * karmasikliga gore, DUZDEN KARMASIGA. Aciklama: lib/background-categories.ts
 * `compareBackgroundOrder`.
 */
export const BACKGROUND_ORDER: readonly string[] = [
"""


def complexity(content: bytes) -> float:
    with Image.open(io.BytesIO(content)) as image:
        rgb = image.convert("RGB").resize((SAMPLE_SIZE, SAMPLE_SIZE), Image.Resampling.BILINEAR)
    gray = rgb.convert("L")
    # Komsu piksel farki: yatay + dikey kaydirilmis kopya ile mutlak fark.
    shifted_x = gray.transform(gray.size, Image.Transform.AFFINE, (1, 0, 1, 0, 1, 0))
    shifted_y = gray.transform(gray.size, Image.Transform.AFFINE, (1, 0, 0, 0, 1, 1))
    edge = (
        ImageStat.Stat(ImageChops.difference(gray, shifted_x)).mean[0]
        + ImageStat.Stat(ImageChops.difference(gray, shifted_y)).mean[0]
    )
    color_spread = sum(ImageStat.Stat(rgb).stddev) / 3
    return edge + 0.05 * color_spread


async def rank() -> list[tuple[str, float]]:
    storage = get_storage_service()
    storage.ensure_configured()
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        rows = (await session.execute(select(Background.id, Background.r2_key))).all()
    scores: list[tuple[str, float]] = []
    for background_id, r2_key in rows:
        content = await storage.download(thumbnail_key(r2_key))
        scores.append((str(background_id), complexity(content)))
    await engine.dispose()
    # Esit puanda kimlik sirasi: betik her calismada ayni dosyayi uretsin.
    return sorted(scores, key=lambda item: (item[1], item[0]))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--show", action="store_true", help="Puanları da yazdır.")
    args = parser.parse_args()
    ranked = asyncio.run(rank())
    lines = [HEADER]
    for background_id, score in ranked:
        lines.append(f'  "{background_id}",\n')
        if args.show:
            print(f"{score:8.2f}  {background_id}")
    lines.append("];\n")
    args.out.write_text("".join(lines), encoding="utf-8")
    print(f"Sıra yazıldı: {args.out} ({len(ranked)} zemin)")


if __name__ == "__main__":
    main()
