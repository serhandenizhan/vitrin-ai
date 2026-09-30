"""
Kolye sahnesinin (`sahne2`) kesiminde zincirin iki ucunu duzeltir.

SORUN (30.09.2026, Kaan): el katmani yapay zekayla uretilmis TAKISIZ el
(`build-hero-hands.py`); orada basparmak tam ve zincirin altinda kalan kisim yok.
Kesimdeki (`sahne2-kesim.webp`) zincir ise iki ucunda havada/derinin ustunde
kesik bitiyordu: sol serit basparmagin yaninda bosluktan basliyor, sag serit
deriye oturup duzensiz kesiliyordu.

DUZELTME (ozgun kesim `photo-source/hero-el/sahne2-kesim.original.webp`e
yedeklenir; betik HER ZAMAN yedekten okur, idempotent):
  - SOL serit: halka deseni (periyot ~42 px, iki halka = 84 px) tekrarlanarak
    yukari uzatilir ve el parlaksa (basparmak) zincir silinir — zincir
    basparmagin ARKASINDAN cikiyor gibi gorunur.
  - SAG serit: uzatma baska bir yone (bosluga) gittigi icin UZATILMAZ; ucu 70 px
    boyunca deri kivrimina dogru eritilir.

Kullanim (repo kokunden):
  backend/.venv/Scripts/python frontend/scripts/fix-necklace-chain.py
  cd frontend && npm run hero:versions
`prepare-hero-scenes.py` kesimi yeniden uretirse yedek silinip bu betik yeniden calistirilir.
"""

import shutil
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

FRONTEND = Path(__file__).resolve().parents[1]
TARGET = FRONTEND / "public" / "hero" / "sahne2-kesim.webp"
BACKUP = FRONTEND / "photo-source" / "hero-el" / "sahne2-kesim.original.webp"
HAND = FRONTEND / "public" / "hero" / "sahne2-el.webp"

LINK_PITCH_PX = 42  # olculdu (otokorelasyon)
SEGMENT = 2 * LINK_PITCH_PX
STRAND_WIDTH = 44
REPEATS = 2
THUMB_LUMA = 55  # el piksellerinin parlakligi: arka plan ~19, ten ~150
RIGHT_FADE_PX = 70


def strand(cut, x0, x1, y0, y1):
    alpha = cut[..., 3]
    ys, xs = np.nonzero(alpha[y0:y1, x0:x1] > 60)
    ys, xs = ys + y0, xs + x0
    top = ys.min()
    sel = ys < top + 140
    pts = np.stack([xs[sel], ys[sel]], 1).astype(np.float32)
    center = pts.mean(0)
    direction = np.linalg.svd(pts - center, full_matrices=False)[2][0]
    if direction[1] < 0:
        direction = -direction
    return pts[pts[:, 1].argmin()], direction


def extend(cut, top, direction):
    h, w = cut.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    t = (xx - top[0]) * direction[0] + (yy - top[1]) * direction[1]
    normal = np.array([-direction[1], direction[0]])
    s = (xx - top[0]) * normal[0] + (yy - top[1]) * normal[1]
    band = (t >= 0) & (t < SEGMENT) & (np.abs(s) <= STRAND_WIDTH / 2) & (cut[..., 3] > 0)
    patch = np.zeros_like(cut)
    patch[band] = cut[band]
    out = cut.copy()
    for k in range(1, REPEATS + 1):
        shift = np.float32([[1, 0, -direction[0] * SEGMENT * k], [0, 1, -direction[1] * SEGMENT * k]])
        moved = cv2.warpAffine(patch, shift, (w, h), flags=cv2.INTER_LINEAR)
        a, base = moved[..., 3:4] / 255, out[..., 3:4] / 255
        add = a * (1 - base)
        out[..., :3] = np.where(add > 0, (out[..., :3] * base + moved[..., :3] * add) / np.maximum(base + add, 1e-6), out[..., :3])
        out[..., 3:4] = np.clip((base + add) * 255, 0, 255)
    return out


def main() -> None:
    BACKUP.parent.mkdir(parents=True, exist_ok=True)
    if not BACKUP.exists():
        shutil.copyfile(TARGET, BACKUP)
        print(f"ozgun yedeklendi -> {BACKUP.relative_to(FRONTEND)}")
    cut = np.asarray(Image.open(BACKUP).convert("RGBA")).astype(np.float32)
    hand = np.asarray(Image.open(HAND).convert("RGB")).astype(np.float32)
    original_alpha = cut[..., 3].copy()

    left_top, left_dir = strand(cut, 440, 520, 590, 760)
    right_top, right_dir = strand(cut, 820, 930, 630, 800)

    out = extend(cut, left_top, left_dir)
    luma = hand @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    thumb = cv2.GaussianBlur((luma > THUMB_LUMA).astype(np.float32), (0, 0), 1.3)
    new_pixels = original_alpha < 8
    out[..., 3] = np.where(new_pixels, out[..., 3] * (1 - thumb), out[..., 3])

    h, w = out.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    t = (xx - right_top[0]) * right_dir[0] + (yy - right_top[1]) * right_dir[1]
    normal = np.array([-right_dir[1], right_dir[0]])
    s = (xx - right_top[0]) * normal[0] + (yy - right_top[1]) * normal[1]
    fade = np.clip(t / RIGHT_FADE_PX, 0, 1)
    fade = fade * fade * (3 - 2 * fade)
    zone = (t < RIGHT_FADE_PX) & (np.abs(s) < 60) & (yy > 560)
    out[..., 3] = np.where(zone, out[..., 3] * np.where(t < 0, 0, fade), out[..., 3])

    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA").save(
        TARGET, "WEBP", quality=90, method=6, exact=True
    )
    print(f"{TARGET.relative_to(FRONTEND)} duzeltildi")


if __name__ == "__main__":
    main()
