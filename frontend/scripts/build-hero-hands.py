"""
Vitrinin el katmanini (`public/hero/<sahne>-el.webp`) YAPAY ZEKAYLA uretilmis
TAKISIZ el fotografindan kurar. Bu tek dosya hem sayfada hem yakinlasmada
kullanilir (`hero-scenes.ts`: `handSrc` = `pageHandSrc`).

NEDEN (30.09.2026, Kaan): eski el katmani, takinin bolgesi zeminle doldurularak
uretiliyordu (`prepare-hero-scenes.py` -> `erase_product`); takinin onunden
gectigi parmak uclari fotografta olmadigi icin yuzuk kalkinca parmaklar yay
seklinde "isirilmis" gorunuyordu. 2B onarim (poligon + Telea) denendi ve geri
alindi. Ilk yapay zeka surumunde yalniz yakinlasma eli degistirilip takinin
bolgesi bir maskeyle gizlenmisti; gecis anlarinda (yakinlasmanin basi, sahne
degisimi) sayfadaki eski kesik el ve maske gecisi yine gorunuyordu. Simdi
sayfadaki el de ayni takisiz el: yuzuk kesimi (`<sahne>-kesim.webp`) onun
ustunde durur, orijinal fotografta da yuzuk parmak uclarinin onunden gecer.

Girdi: `photo-source/hero-el/<sahne>-temiz-el.png` (bir goruntu modeline takili
fotografi verip "yalniz takiyi sil, parmaklarin gizli kalan ic yuzunu tamamla,
baska hicbir seye dokunma" dedirterek uretilir) ya da `sahneN=<yol>`
argumanlari. Uretilen gorsel takili fotografla AYNI kadraji (4:5) tasimali;
tam piksel esleşmesi gerekmez: betik SIFT + benzerlik donusumu (olcek, kayma,
donus) ile hizalar ve istatistigi basar (olcek ~1, kayma birkac piksel olmali;
disina cikarsa durur).

Hizalama referansi: `photo-source/hero-el/<sahne>-referans-sayfa.webp` (eski
sayfa eli, metali onarilmis) + `public/hero/<sahne>-kesim.webp` bilesimi = takili
orijinal fotograf.

Cikti: `<sahne>-el.webp` (opak RGB, 1600x2000). Ardindan `npm run hero:versions`.

Kullanim (repo kokunden):
  backend/.venv/Scripts/python frontend/scripts/build-hero-hands.py
  backend/.venv/Scripts/python frontend/scripts/build-hero-hands.py sahne1=<yol> ...
  cd frontend && npm run hero:versions
"""

import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

FRONTEND = Path(__file__).resolve().parents[1]
HERO_DIR = FRONTEND / "public" / "hero"
SOURCE_DIR = FRONTEND / "photo-source" / "hero-el"
WIDTH, HEIGHT = 1600, 2000
QUALITY = 82


def original_photo(scene: str) -> np.ndarray:
    """Takili orijinal fotograf: eski sayfa eli + yuzuk kesimi (ayni kadraj)."""
    hand = Image.open(SOURCE_DIR / f"{scene}-referans-sayfa.webp").convert("RGBA")
    cutout = Image.open(HERO_DIR / f"{scene}-kesim.webp").convert("RGBA")
    return np.asarray(Image.alpha_composite(hand, cutout).convert("RGB"))


def align(generated: Image.Image, reference: np.ndarray) -> tuple[np.ndarray, dict]:
    ai = np.asarray(generated.convert("RGB").resize((WIDTH, HEIGHT), Image.LANCZOS))
    sift = cv2.SIFT_create(4000)
    ka, da = sift.detectAndCompute(cv2.cvtColor(reference, cv2.COLOR_RGB2GRAY), None)
    kb, db = sift.detectAndCompute(cv2.cvtColor(ai, cv2.COLOR_RGB2GRAY), None)
    matches = cv2.BFMatcher().knnMatch(db, da, k=2)
    good = [m for m, n in matches if m.distance < 0.75 * n.distance]
    if len(good) < 12:
        sys.exit(f"hizalama icin yeterli eslesme yok ({len(good)}): gorsel farkli kadrajda")
    src = np.float32([kb[g.queryIdx].pt for g in good])
    dst = np.float32([ka[g.trainIdx].pt for g in good])
    matrix, inliers = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=4)
    scale = float(np.hypot(matrix[0, 0], matrix[0, 1]))
    stats = {
        "eslesme": len(good),
        "ic": int(inliers.sum()),
        "olcek": round(scale, 4),
        "kayma": (round(float(matrix[0, 2]), 1), round(float(matrix[1, 2]), 1)),
        "donus_derece": round(float(np.degrees(np.arctan2(matrix[1, 0], matrix[0, 0]))), 2),
    }
    if not 0.97 < scale < 1.03 or abs(stats["donus_derece"]) > 2:
        sys.exit(f"hizalama guvenilmez {stats}: gorsel kaymis/olceklenmis, tekrar uretin")
    warped = cv2.warpAffine(ai, matrix, (WIDTH, HEIGHT), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
    return warped, stats


def build(scene: str, generated_path: Path) -> None:
    warped, stats = align(Image.open(generated_path), original_photo(scene))
    target = HERO_DIR / f"{scene}-el.webp"
    Image.fromarray(warped).save(target, "WEBP", quality=QUALITY, method=6)
    print(f"{scene}: {generated_path.name} -> {target.relative_to(FRONTEND)}  hizalama {stats}")


def main(args: list[str]) -> None:
    if not args:
        found = sorted(SOURCE_DIR.glob("*-temiz-el.png"))
        if not found:
            sys.exit(__doc__)
        args = [f"{p.name.removesuffix('-temiz-el.png')}={p}" for p in found]
    for arg in args:
        scene, _, path = arg.partition("=")
        if not path or not Path(path).is_file():
            sys.exit(f"gecersiz arguman '{arg}' (beklenen: sahneN=<dosya yolu>)")
        build(scene, Path(path))


if __name__ == "__main__":
    main(sys.argv[1:])
