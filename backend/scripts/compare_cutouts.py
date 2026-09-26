"""Kesim kalitesini iki çalıştırma arasında karşılaştırır (Faz 7).

NEDEN: Faz 7'de iki iş modelin çıktısını değiştirebilir — bağımlılık
yükseltmesi (rembg 2.0.61 → 2.0.85, onnxruntime, Pillow) ve model hız
optimizasyonu (grafik optimizasyonu, niceleme, çözünürlük). Kural (Serhan,
26.09.2026): "gözle fark edilmeyen kayıp kabul, ama seviyesi önemli ve farklı
bir yerden açık oluyor mu o da önemli". Yani yalnız ortalama fark yetmez;
kaybın NEREDE olduğu (ince zincir kopuyor mu, zemin sızıyor mu) ayrıca
ölçülmeli.

İKİ ADIM:
  render   Bir klasördeki fotoğrafları uygulamanın GERÇEK servis yoluyla
           (`BackgroundRemovalService`) keser; her kesimi ve süre/bellek
           ölçümünü çıktı klasörüne yazar. Karşılaştırılacak her ortam
           (eski/yeni sanal ortam, optimize model) için ayrı çalıştırılır —
           iki model aynı süreçte açılmaz, 16 GB'lık makinede ikisi sığmaz.
  compare  İki render klasörünün alfa maskelerini karşılaştırır, sayısal
           rapor ve fark haritaları üretir (kırmızı = kaybolan ürün pikseli,
           mavi = eklenen zemin pikseli).

Kullanım (backend klasöründen):
  <venv>/bin/python scripts/compare_cutouts.py render --input <foto-klasörü> --out <klasör-a>
  <venv>/bin/python scripts/compare_cutouts.py compare <klasör-a> <klasör-b> --out <rapor-klasörü>

Yollar koda yazılmaz (kök CLAUDE.md ders 11); fotoğraflar kişisel veri
olabileceği için depoya konmaz, klasör argümanla verilir.
"""

import argparse
import json
import os
import resource
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}

# Alfa eşikleri (0-255). "Opak" ve "saydam" arası yarı saydam kenar bölgesi.
OPAQUE = 200
TRANSPARENT = 55
# Bir pikselin "değişti" sayılması için gereken alfa farkı: 8/255 ≈ %3, gözün
# yumuşak kenarda ayırt edemeyeceği seviye.
CHANGED = 8


def _peak_rss_mb() -> float:
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    # macOS bayt, Linux kilobayt döndürüyor.
    return peak / 1024 / 1024 if sys.platform == "darwin" else peak / 1024


def render(input_dir: Path, out_dir: Path, model_name: str) -> None:
    from app.services.background_removal import BackgroundRemovalService
    import app.validation.upload  # noqa: F401  — pillow-heif kaydını tetikler

    out_dir.mkdir(parents=True, exist_ok=True)
    service = BackgroundRemovalService(model_name=model_name)
    photos = sorted(p for p in input_dir.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)
    if not photos:
        sys.exit(f"{input_dir} içinde fotoğraf yok")

    timings = {}
    for photo in photos:
        start = time.monotonic()
        result = service.remove(photo.read_bytes())
        timings[photo.name] = round(time.monotonic() - start, 2)
        (out_dir / f"{photo.stem}.png").write_bytes(result)
        print(f"{photo.name}: {timings[photo.name]} sn")

    meta = {
        "model": model_name,
        "python": sys.version.split()[0],
        "packages": _package_versions(),
        "seconds": timings,
        # İlk fotoğraf model yüklemesini de içerir; ortalamaya katılmaz.
        "mean_seconds_warm": round(sum(list(timings.values())[1:]) / max(len(timings) - 1, 1), 2),
        "peak_rss_mb": round(_peak_rss_mb()),
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    print(json.dumps(meta, indent=2, ensure_ascii=False))


def _package_versions() -> dict:
    from importlib.metadata import PackageNotFoundError, version

    names = ["rembg", "onnxruntime", "pillow", "pillow-heif", "numpy"]
    found = {}
    for name in names:
        try:
            found[name] = version(name)
        except PackageNotFoundError:
            found[name] = None
    return found


def _alpha(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"))[:, :, 3].astype(np.int16)


def _largest_blob(mask: np.ndarray) -> int:
    """En büyük bağlı bölgenin piksel sayısı: fark dağınık gürültü mü, tek bir
    yerde toplanmış bir kopma/sızıntı mı? Toplanmış fark gözle görülür."""
    from scipy import ndimage

    labels, count = ndimage.label(mask)
    if count == 0:
        return 0
    return int(np.bincount(labels.ravel())[1:].max())


def compare(dir_a: Path, dir_b: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for path_a in sorted(dir_a.glob("*.png")):
        path_b = dir_b / path_a.name
        if not path_b.exists():
            print(f"{path_a.name}: {dir_b} içinde yok, atlandı")
            continue
        a, b = _alpha(path_a), _alpha(path_b)
        if a.shape != b.shape:
            rows.append({"image": path_a.name, "error": f"boyut farklı {a.shape} / {b.shape}"})
            continue

        diff = np.abs(a - b)
        product_a = a >= OPAQUE
        # Kenar bandı: iki çıktıdan birinde yarı saydam olan pikseller —
        # ince zincir ve yansıtıcı kenar tam burada yaşıyor.
        edge = ((a > TRANSPARENT) & (a < OPAQUE)) | ((b > TRANSPARENT) & (b < OPAQUE))
        lost = (a >= OPAQUE) & (b <= TRANSPARENT)  # üründen kopan
        gained = (a <= TRANSPARENT) & (b >= OPAQUE)  # zeminden sızan
        bin_a, bin_b = a >= 128, b >= 128
        union = (bin_a | bin_b).sum()

        rows.append({
            "image": path_a.name,
            "mean_abs_diff": round(float(diff.mean()), 3),
            "max_abs_diff": int(diff.max()),
            "changed_pct": round(float((diff >= CHANGED).mean() * 100), 3),
            "edge_mean_abs_diff": round(float(diff[edge].mean()), 3) if edge.any() else 0.0,
            "iou": round(float((bin_a & bin_b).sum() / union), 5) if union else 1.0,
            "lost_px": int(lost.sum()),
            "lost_pct_of_product": round(float(lost.sum() / max(product_a.sum(), 1) * 100), 4),
            "gained_px": int(gained.sum()),
            "largest_lost_blob_px": _largest_blob(lost),
            "largest_gained_blob_px": _largest_blob(gained),
        })

        # Fark haritası: gri ürün silueti üzerinde kırmızı kayıp, mavi kazanç.
        base = (a.clip(0, 255) * 0.35).astype(np.uint8)
        heat = np.stack([base, base, base], axis=-1)
        heat[lost | ((a - b) >= 64)] = [255, 40, 40]
        heat[gained | ((b - a) >= 64)] = [40, 120, 255]
        Image.fromarray(heat).save(out_dir / f"{path_a.stem}-fark.png")

    report = out_dir / "report.json"
    report.write_text(json.dumps(rows, indent=2, ensure_ascii=False))
    for row in rows:
        print(json.dumps(row, ensure_ascii=False))
    print(f"Rapor: {report}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    render_parser = sub.add_parser("render")
    render_parser.add_argument("--input", type=Path, required=True)
    render_parser.add_argument("--out", type=Path, required=True)
    render_parser.add_argument("--model", default=os.environ.get("MODEL_NAME", "birefnet-general"))

    compare_parser = sub.add_parser("compare")
    compare_parser.add_argument("dir_a", type=Path)
    compare_parser.add_argument("dir_b", type=Path)
    compare_parser.add_argument("--out", type=Path, required=True)

    args = parser.parse_args()
    if args.command == "render":
        render(args.input, args.out, args.model)
    else:
        compare(args.dir_a, args.dir_b, args.out)


if __name__ == "__main__":
    main()
