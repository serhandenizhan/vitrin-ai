"""
Acilistaki etkilesimli once/sonra karsilastirmasinin gorsellerini uretir.

Uretilenler (900x900, BIREBIR HIZALI):
  public/showcase/once.webp   - ozgun fotograf (vitrin karesi)
  public/showcase/sonra.webp  - AYNI kadrajdan aracin gercek kesimi (saydam)

NEDEN AYRI BETIK: sitedeki mevcut `kesim.webp` (prepare-showcase.mjs) kesimi
kirpip karenin ortasina buyutuyor; kaynak fotografla ayni kadrajda DEGIL.
Once/sonra surgusu iki gorseli UST USTE koydugu icin kadrajlar farkli olsa
kolye iki tarafta farkli yerde durur ve karsilastirma yaniltici olurdu.

Burada hizalama YAPILARAK degil, KURULUSTAN geliyor: BiRefNet'in ham ciktisi
kaynakla ayni piksel olcusunde (kesim kaynagin alfa maskelenmis hali). Ikisi
de AYNI pencereden kirpiliyor; yeniden olcekleme ya da kaydirma yok.

Kaynak `vitrin.webp` (prepare-photos.mjs), ham fotograf degil: hamda testere
ve serbest bir zincir de var ve model onlari da koruyor (bkz. prepare-showcase.mjs).

HTTP backend'i DEGIL modeli dogrudan cagiriyor: `/api/remove-background` Faz
4'ten beri oturum istiyor ve bir uretim betigine kullanici token'i
vermek anlamsiz. Model ilk calistirmada ~12 GB RAM kullanir (kok CLAUDE.md).

Kullanim (repo kokunden ya da herhangi bir yerden):
  backend/.venv/Scripts/python frontend/scripts/prepare-before-after.py   # Windows
  backend/.venv/bin/python frontend/scripts/prepare-before-after.py       # macOS/Linux
"""

import io
import sys
from pathlib import Path

# Yollar bu dosyanin konumundan turetiliyor (kok CLAUDE.md ders 11).
FRONTEND = Path(__file__).resolve().parents[1]
REPO = FRONTEND.parent
sys.path.insert(0, str(REPO / "backend"))

from PIL import Image  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.services.background_removal import BackgroundRemovalService  # noqa: E402

SOURCE = FRONTEND / "public" / "photos" / "vitrin.webp"
OUTPUT_DIR = FRONTEND / "public" / "showcase"
SIZE = 900
QUALITY = 82
# Alfa bu esigin altindaki yari saydam kenar pikselleri urun kutusuna katilmiyor;
# yoksa golge artigi kutuyu buyutup kadraji kaydirabilirdi.
ALPHA_THRESHOLD = 16


def centered_window(bbox: tuple[int, int, int, int], width: int, height: int, size: int) -> tuple[int, int, int, int]:
    """Urun kutusunun merkezine oturan, gorsel sinirlari icinde kalan kare pencere."""
    center_x = (bbox[0] + bbox[2]) / 2
    center_y = (bbox[1] + bbox[3]) / 2
    left = int(round(min(max(center_x - size / 2, 0), width - size)))
    top = int(round(min(max(center_y - size / 2, 0), height - size)))
    return left, top, left + size, top + size


def main() -> None:
    source_bytes = SOURCE.read_bytes()
    source = Image.open(io.BytesIO(source_bytes)).convert("RGB")

    print("Kesim uretiliyor (BiRefNet; ilk calistirmada model yuklenir)...")
    service = BackgroundRemovalService(model_name=settings.rembg_model_name)
    cutout = Image.open(io.BytesIO(service.remove(source_bytes))).convert("RGBA")

    if cutout.size != source.size:
        raise SystemExit(f"Kesim olcusu kaynaktan farkli: {cutout.size} != {source.size}")

    width, height = source.size
    window_size = min(SIZE, width, height)
    mask = cutout.getchannel("A").point(lambda alpha: 255 if alpha > ALPHA_THRESHOLD else 0)
    bbox = mask.getbbox()
    if bbox is None:
        raise SystemExit("Kesimde urun bulunamadi (alfa tamamen bos).")

    window = centered_window(bbox, width, height, window_size)
    before = source.crop(window)
    after = cutout.crop(window)
    if window_size != SIZE:
        before = before.resize((SIZE, SIZE), Image.LANCZOS)
        after = after.resize((SIZE, SIZE), Image.LANCZOS)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    before.save(OUTPUT_DIR / "once.webp", "WEBP", quality=QUALITY, method=6)
    # `exact`: tamamen saydam piksellerin RGB degeri korunuyor; sikistirma
    # kenarlarda renk sizmasi yapmasin.
    after.save(OUTPUT_DIR / "sonra.webp", "WEBP", quality=QUALITY, method=6, exact=True)
    print(f"Hazir: pencere {window}, urun kutusu {bbox} -> {OUTPUT_DIR.relative_to(REPO)}")


if __name__ == "__main__":
    main()
