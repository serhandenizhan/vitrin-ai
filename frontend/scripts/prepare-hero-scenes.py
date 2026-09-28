"""
Acilis vitrininin sahne gorsellerini hazirlar: el + taki fotografi, aracin
GERCEK kesimi ve takinin fotograftaki kutusu.

Girdi: $HERO_SOURCE_DIR/el/<sahne>.png|jpg|jpeg|webp (depo disinda; ham
dosyalar public/'e girmez — SECURITY.md 7).

URUN BOLGESI (28.09.2026, olculdu): model TUM fotografa uygulandiginda
parmaklar ile yuzugu tek bir nesne sayiyor — eli kismen koruyor ve halkanin
icini dolduruyor (kok CLAUDE.md, gecmis 5'teki bilinen sinirlama). Ayni
fotografin YALNIZ URUN BOLGESI verildiginde halkanin ici temiz kesiliyor,
parmaklar gidiyor. Bu yuzden model her sahnede `PRODUCT_REGIONS`'daki
bolgeye uygulanir — kullanicinin araci kullanirken yapacagi sey (urunu
kadraja almak). Maske ELLE DUZELTILMEZ: gosterilen kesim modelin ciktisi.

YAKIN PLAN KESIMININ ONARIMI (Serhan'in karari, 28.09.2026): elli
fotograftan alinan kesimde parmaklarin ortugu yerler halkada bosluk/cikinti
olarak kaliyor; ana sayfada hatali bir gorsel olmamali. `RING_BAND_REPAIR`
sahnelerinde halkanin dis ve ic kenarina elips oturtulur, bant icindeki
eksik pikseller bandin kendi metalinden doldurulur, bandin disinda kalan
parmak artiklari silinir. Bu, ELLE yapilmis bir duzeltmedir — panelin metni
bu yuzden kesimin ham model ciktisi oldugunu ya da hangi fotograftan
geldigini soylemez. (Gemini'den elsiz bir kopya istemek denendi: yuzugu
farkli bir aciyla yeniden cizdi, once/sonra ust uste oturmadi.)
Cozulme/isik maskesi ve el katmani ham kesimi kullanmaya devam eder.

Uretilenler (sahne basina):
  public/hero/<sahne>.webp             fotograf, 1600x2000 (4:5)
  public/hero/<sahne>-kesim.webp       ayni kadrajda kesim (bolge disi saydam);
                                       yuzugu elden one cikaran parlak kopya
  public/hero/<sahne>-el.webp          yuzugu SILINMIS fotograf (yakinlasmada el
                                       yuzugu birakip inerken bu katman iner)
  public/hero/<sahne>-yakin.webp       urun bolgesi, kaynak cozunurlugunde
  public/hero/<sahne>-yakin-kesim.webp ayni bolgenin kesimi (once/sonra cifti)
  src/lib/hero-scene-geometry.json     takinin kutusu + bolgenin olculeri

BELLEK: model ~12 GB RAM ister; calistirmadan once kesim iscisi kapali olmali
ve baska model sureci olmamali (ders 31). Butun sahneler TEK surecte islenir.

Kullanim (repo kokunden):
  ../vitrin-ai/backend/.venv/bin/python frontend/scripts/prepare-hero-scenes.py [sahne ...]
"""

import io
import json
import os
import sys
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1]
REPO = FRONTEND.parent
sys.path.insert(0, str(REPO / "backend"))

import cv2  # noqa: E402  (rembg'nin bagimliligi; backend ortaminda hazir)
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

SOURCE_DIR = Path(os.environ.get("HERO_SOURCE_DIR", Path.home() / "vitrin-ai-hero-kaynak")) / "el"
OUTPUT_DIR = FRONTEND / "public" / "hero"
GEOMETRY = FRONTEND / "src" / "lib" / "hero-scene-geometry.json"
WIDTH, HEIGHT = 1600, 2000
# Yakinlasmadaki once/sonra ~15rem genisliginde; 2x ekran icin 560 px.
CLOSE_WIDTH = 560
QUALITY = 82
ALPHA_THRESHOLD = 16
EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")

# Yakin plan kesiminde halka bandi onarilan sahneler (yalniz duz halkali
# yuzukler; kolye/bileklikte elips varsayimi gecersiz).
RING_BAND_REPAIR = {"sahne1"}

# El katmaninda silinen alan, kesimin bu kadar piksel (kaynak cozunurlugu)
# disina tasar: kesimin yari saydam kenarindaki parlak metal pikselleri aksi
# halde elin uzerinde sicak bir hale olarak kaliyordu (olculdu).
ERASE_GROW_PX = 9

# Urun bolgesi, 4:5 kadrajin KESRI olarak (x0, y0, x1, y1). Takiyi ve
# tutan parmak uclarini kapsar, elin geri kalanini disarida birakir.
PRODUCT_REGIONS: dict[str, tuple[float, float, float, float]] = {
    "sahne1": (0.385, 0.255, 0.625, 0.495),
}


def frame_box(size: tuple[int, int]) -> tuple[int, int, int, int]:
    """Kaynakta 4:5 kadrajin kutusu: ortadan, alt kenar korunarak."""
    w, h = size
    target = WIDTH / HEIGHT
    if w / h > target:
        new_w = round(h * target)
        left = (w - new_w) // 2
        return left, 0, left + new_w, h
    new_h = round(w / target)
    return 0, h - new_h, w, h


def erase_product(source: Image.Image, close_cut: Image.Image, crop_box: tuple[int, int, int, int]) -> Image.Image:
    """
    El katmani: takiyi fotograftan silip yerini ZEMINLE doldurur.

    Uc deneme olculdu:
      - duz renkle doldurmak zeminin isik gecisini tutturamadi, el inerken
        yuzugun silueti seciliyordu;
      - yalniz metali onarmak (Telea) halkanin icini koyu bir disk birakti:
        uretilen fotografta yuzugun cevresine isik yayilmis, ici koyu;
      - takinin butun bolgesini Telea ile onarmak parmak uclarinin tenini
        bosluga cekti (onarim kenarlardan dolduruyor, parmak da kenar).
    Simdiki yol: bosluk YALNIZCA zemin piksellerinden kestirilen puruzsuz bir
    zemin modeliyle dolar (normalize bulaniklastirma: el ve metal agirliksiz).
    Bosluk = metal + takinin dis bukey zarfindaki koyu zemin; zarfin icindeki
    parmaklar (parlak) oldugu gibi kalir.
    """
    rgb = np.asarray(source).astype(np.float32)
    metal = np.zeros(rgb.shape[:2], np.uint8)
    alpha = np.asarray(close_cut.getchannel("A"))
    x0, y0 = crop_box[:2]
    metal[y0 : y0 + alpha.shape[0], x0 : x0 + alpha.shape[1]] = (alpha > 8) * 255
    metal = cv2.dilate(metal, np.ones((3, 3), np.uint8), iterations=ERASE_GROW_PX)

    hull = np.zeros_like(metal)
    cv2.fillConvexPoly(hull, cv2.convexHull(cv2.findNonZero(metal)), 255)
    hull = cv2.dilate(hull, np.ones((3, 3), np.uint8), iterations=ERASE_GROW_PX * 3)
    luma = rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    # Zemin esigi: bu fotograflarda zemin ~20-30, golgedeki ten ~45-60.
    # 55 golgedeki teni de zemin saydi ve dolguya kirmizimsi bir iz tasidi.
    dark = luma < 38
    hole = (metal > 0) | ((hull > 0) & dark)

    # Zemin modeli: yalnizca bosluk DISINDAKI koyu (zemin) piksellerin
    # agirlikli ortalamasi — genis bir cekirdekle isik gecisini tasir.
    weight = (dark & ~hole).astype(np.float32)

    def estimate(sigma: float) -> tuple[np.ndarray, np.ndarray]:
        numerator = cv2.GaussianBlur(rgb * weight[..., None], (0, 0), sigma)
        denominator = cv2.GaussianBlur(weight, (0, 0), sigma)[..., None]
        return numerator / np.maximum(denominator, 1e-6), denominator

    # Iki olcek: yakin zemin isik gecisini tasir, ama boslugun ortasi zemin
    # piksellerine cok uzak kalinca agirlik sifira yaklasip koyu bir leke
    # birakiyordu (tasin yeri, olculdu); oralar genis olcekten dolar.
    near, near_weight = estimate(40)
    far, _ = estimate(160)
    trust = np.clip(near_weight / 0.15, 0, 1)
    backdrop = near * trust + far * (1 - trust)

    blend = cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 5)[..., None]
    # Parmaklar (zarf icindeki parlak, metal olmayan pikseller) ozgun kalir.
    keep = (~dark & (metal == 0))[..., None]
    out = np.where(keep, rgb, rgb * (1 - blend) + backdrop * blend)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def repair_ring_band(cut: Image.Image, head_bottom: float = 0.36, repair_from: float = 0.5) -> Image.Image:
    """
    Halka yuzugun kesiminde parmaklarin ortugu yerleri onarir.

    Tasin yuvasinin altindan (kesimin ust %36'si disarida) halkanin dis ve
    ic kenar noktalarina birer elips oturtulur; iki elips arasindaki bant
    halkanin olmasi gereken yeridir. Bant icinde eksik (yari saydam) kalan
    pikseller komsu metalden onarilir (Telea), bandin disinda kalan parmak
    artiklari silinir. Kenarlar 4x ornekleme ile yumusak.

    Onarim yalnizca kesimin ALT yarisinda (`repair_from`) yapilir: parmaklar
    halkayi alttan tutuyor; ust omuzlarda elips gercek halkadan biraz disari
    tasiyor ve orayi opak yapmak koyu kamalar birakiyordu (olculdu).
    """
    rgba = np.asarray(cut.convert("RGBA")).copy()
    alpha = rgba[..., 3]
    h, w = alpha.shape
    solid = alpha > 128
    top = int(h * head_bottom)
    outer: list[tuple[int, int]] = []
    inner: list[tuple[int, int]] = []
    for y in range(top, h):
        xs = np.nonzero(solid[y])[0]
        if len(xs) < 2:
            continue
        outer += [(xs[0], y), (xs[-1], y)]
        gaps = np.nonzero(np.diff(xs) > 3)[0]
        if len(gaps):
            inner += [(xs[gaps[0]] + 1, y), (xs[gaps[-1] + 1] - 1, y)]
    for x in range(w):
        ys = np.nonzero(solid[top:, x])[0]
        if len(ys):
            outer.append((x, top + ys[-1]))
    outer_ellipse = cv2.fitEllipse(np.array(outer, np.float32))
    inner_ellipse = cv2.fitEllipse(np.array(inner, np.float32))

    scale = 4
    big = np.zeros((h * scale, w * scale), np.uint8)
    for ellipse, value in ((outer_ellipse, 255), (inner_ellipse, 0)):
        (cx, cy), (ma, mb), angle = ellipse
        cv2.ellipse(big, ((cx * scale, cy * scale), (ma * scale, mb * scale), angle), value, -1, cv2.LINE_AA)
    band = cv2.resize(big, (w, h), interpolation=cv2.INTER_AREA)
    band[: int(h * repair_from)] = 0

    hole = ((band > 40) & (alpha < 200)).astype(np.uint8) * 255
    bgr = cv2.cvtColor(rgba[..., :3], cv2.COLOR_RGB2BGR)
    filled = cv2.cvtColor(cv2.inpaint(bgr, hole, 5, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB)
    out = rgba.copy()
    out[..., :3] = np.where(hole[..., None] > 0, filled, rgba[..., :3])
    below = np.zeros_like(alpha, bool)
    below[int(h * repair_from) :] = True
    grown = cv2.dilate(band, np.ones((3, 3), np.uint8))
    out[..., 3] = np.where(below, np.maximum(np.minimum(alpha, grown), band), alpha)
    return Image.fromarray(out)


def find_source(scene: str) -> Path | None:
    for ext in EXTENSIONS:
        path = SOURCE_DIR / f"{scene}{ext}"
        if path.exists():
            return path
    return None


def main(scenes: list[str]) -> None:
    from app.core.config import settings
    from app.services.background_removal import BackgroundRemovalService

    if not scenes:
        scenes = sorted({p.stem for p in SOURCE_DIR.glob("*") if p.suffix.lower() in EXTENSIONS})
    geometry = json.loads(GEOMETRY.read_text()) if GEOMETRY.exists() else {}
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print("Model yukleniyor (BiRefNet, ~12 GB RAM)...")
    service = BackgroundRemovalService(model_name=settings.rembg_model_name)

    for scene in scenes:
        source_path = find_source(scene)
        region = PRODUCT_REGIONS.get(scene)
        if source_path is None or region is None:
            print(f"- {scene}: kaynak ya da urun bolgesi yok, atlandi")
            continue
        source = Image.open(source_path).convert("RGB")
        fx0, fy0, fx1, fy1 = frame_box(source.size)
        fw, fh = fx1 - fx0, fy1 - fy0
        photo = source.crop((fx0, fy0, fx1, fy1)).resize((WIDTH, HEIGHT), Image.LANCZOS)

        # Bolge KAYNAK cozunurlugunde kesilir: modelin girdisi keskin olsun.
        rx0, ry0, rx1, ry1 = region
        crop_box = (
            fx0 + round(rx0 * fw),
            fy0 + round(ry0 * fh),
            fx0 + round(rx1 * fw),
            fy0 + round(ry1 * fh),
        )
        close = source.crop(crop_box)
        buffer = io.BytesIO()
        close.save(buffer, "PNG")
        close_cut = Image.open(io.BytesIO(service.remove(buffer.getvalue()))).convert("RGBA")
        if close_cut.size != close.size:
            raise SystemExit(f"{scene}: kesim olcusu farkli {close_cut.size} != {close.size}")

        # Kadrajdaki kesim: bolge disi saydam, bolge kesimin kucultulmus hali.
        px0, py0 = round(rx0 * WIDTH), round(ry0 * HEIGHT)
        px1, py1 = round(rx1 * WIDTH), round(ry1 * HEIGHT)
        cutout = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        cutout.paste(close_cut.resize((px1 - px0, py1 - py0), Image.LANCZOS), (px0, py0))

        mask = cutout.getchannel("A").point(lambda a: 255 if a > ALPHA_THRESHOLD else 0)
        bbox = mask.getbbox()
        if bbox is None:
            print(f"- {scene}: kesimde urun yok, atlandi")
            continue

        hand = erase_product(source, close_cut, crop_box)
        hand = hand.crop((fx0, fy0, fx1, fy1)).resize((WIDTH, HEIGHT), Image.LANCZOS)

        # Yakin plan kesimi: halka yuzukte parmak izleri onarilir.
        close_after = repair_ring_band(close_cut) if scene in RING_BAND_REPAIR else close_cut

        close_h = round(CLOSE_WIDTH * close.height / close.width)
        photo.save(OUTPUT_DIR / f"{scene}.webp", "WEBP", quality=QUALITY, method=6)
        hand.save(OUTPUT_DIR / f"{scene}-el.webp", "WEBP", quality=QUALITY, method=6)
        cutout.save(OUTPUT_DIR / f"{scene}-kesim.webp", "WEBP", quality=QUALITY, method=6, exact=True)
        close.resize((CLOSE_WIDTH, close_h), Image.LANCZOS).save(
            OUTPUT_DIR / f"{scene}-yakin.webp", "WEBP", quality=QUALITY, method=6
        )
        close_after.resize((CLOSE_WIDTH, close_h), Image.LANCZOS).save(
            OUTPUT_DIR / f"{scene}-yakin-kesim.webp", "WEBP", quality=QUALITY, method=6, exact=True
        )
        geometry[scene] = {
            "product": {
                "x": round(bbox[0] / WIDTH, 4),
                "y": round(bbox[1] / HEIGHT, 4),
                "w": round((bbox[2] - bbox[0]) / WIDTH, 4),
                "h": round((bbox[3] - bbox[1]) / HEIGHT, 4),
            },
            "close": {"width": CLOSE_WIDTH, "height": close_h},
        }
        note = ", halka bandi onarildi" if scene in RING_BAND_REPAIR else ""
        print(f"- {scene}: bolge {crop_box} (kaynak), urun kutusu {bbox}{note}")

    GEOMETRY.write_text(json.dumps(geometry, indent=2, sort_keys=True) + "\n")
    print(f"Geometri: {GEOMETRY.relative_to(REPO)}")


if __name__ == "__main__":
    main(sys.argv[1:])
