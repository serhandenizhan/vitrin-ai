"""Bir kesimin süresinin hangi adıma gittiğini ölçer (Faz 7).

NEDEN: model optimizasyonunda kaliteye dokunan hiçbir seçenek kullanılmaz
(Serhan, 27.09.2026). Geriye kalan hızlandırma yolları model DIŞI adımlar ve
donanım (GPU). Hangisinin işe yarayacağını bilmek için önce sürenin model
hesabına mı, yoksa öncesi/sonrasına (fotoğrafı açma, 1024'e küçültme, maskeyi
tam boyuta büyütme, PNG kaydetme) mı gittiği ölçülür. GPU yalnız model
hesabını hızlandırır; diğer adımlar GPU'lu sunucuda da işlemcide kalır — bu
yüzden aynı betik GPU sunucusunda koşulunca tahmin gerçek ölçüme döner.

Betik rembg'nin `remove()` adımlarını AYNI SIRAYLA kendisi yapar ve sonunda
ürettiği PNG'nin rembg'nin kendi çıktısıyla bit düzeyinde aynı olduğunu
doğrular; aynı değilse ölçüm geçersizdir ve betik durur.

Kullanım (backend klasöründen, aynı anda başka model süreci AÇIK DEĞİLKEN —
kök CLAUDE.md ders 31):
  .venv/bin/python scripts/profile_cutout.py <foto> [<foto> ...] [--repeat 3]
"""

import argparse
import io
import statistics
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import numpy as np  # noqa: E402
import rembg  # noqa: E402
from PIL import Image, ImageOps  # noqa: E402

import app.validation.upload  # noqa: E402,F401 — HEIC açıcısını kaydeder
from app.services.background_removal import _get_session  # noqa: E402

MODEL = "birefnet-general"


def staged_cutout(session, photo: bytes) -> tuple[bytes, dict[str, float]]:
    times: dict[str, float] = {}

    def mark(name, started):
        times[name] = times.get(name, 0.0) + time.perf_counter() - started

    t = time.perf_counter()
    img = Image.open(io.BytesIO(photo))
    img = ImageOps.exif_transpose(img)
    img.load()
    mark("1_ac_ve_dondur", t)

    t = time.perf_counter()
    inputs = session.normalize(img, (0.485, 0.456, 0.406), (0.229, 0.224, 0.225), (1024, 1024))
    mark("2_1024e_kucult", t)

    t = time.perf_counter()
    outputs = session.inner_session.run(None, inputs)
    mark("3_MODEL", t)

    t = time.perf_counter()
    pred = 1 / (1 + np.exp(-outputs[0][:, 0, :, :]))
    pred = (pred - np.min(pred)) / (np.max(pred) - np.min(pred))
    mask = Image.fromarray((np.squeeze(pred) * 255).astype("uint8"), mode="L")
    mark("4_maske_hazirla", t)

    t = time.perf_counter()
    mask = mask.resize(img.size, Image.Resampling.LANCZOS)
    mark("5_maskeyi_tam_boyuta_buyut", t)

    t = time.perf_counter()
    cutout = Image.composite(img, Image.new("RGBA", img.size, 0), mask)
    mark("6_kesimi_olustur", t)

    t = time.perf_counter()
    buffer = io.BytesIO()
    cutout.save(buffer, "PNG")
    mark("7_PNG_kaydet", t)
    return buffer.getvalue(), times


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("photos", nargs="+", type=Path)
    parser.add_argument("--repeat", type=int, default=3)
    args = parser.parse_args()

    started = time.perf_counter()
    session = _get_session(MODEL)
    print(f"oturum açma: {time.perf_counter() - started:.1f} sn")

    for path in args.photos:
        photo = path.read_bytes()
        with Image.open(io.BytesIO(photo)) as probe:
            size = probe.size
        # Isınma + doğruluk: bizim adımlarımız rembg ile BİREBİR aynı çıktıyı vermeli.
        ours, _ = staged_cutout(session, photo)
        theirs = rembg.remove(photo, session=session)
        if ours != theirs:
            sys.exit(f"{path.name}: adım adım çıktı rembg'ninkiyle aynı değil — ölçüm geçersiz")

        runs = [staged_cutout(session, photo)[1] for _ in range(args.repeat)]
        stages = sorted(runs[0])
        total = statistics.median(sum(r.values()) for r in runs)
        print(f"\n{path.name}  {size[0]}×{size[1]} ({size[0] * size[1] / 1e6:.1f} MP), "
              f"{args.repeat} tekrarın ortancası — toplam {total:.2f} sn (çıktı rembg ile birebir ✓)")
        for stage in stages:
            value = statistics.median(r[stage] for r in runs)
            print(f"  {stage:30} {value:7.2f} sn  {value / total * 100:5.1f}%")


if __name__ == "__main__":
    main()
