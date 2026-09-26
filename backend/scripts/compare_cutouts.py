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
  compare  TABAN (baseline, mevcut hâl) ile ADAY (candidate, denenen
           değişiklik) render klasörlerinin alfa maskelerini karşılaştırır,
           sayısal rapor ve fark haritaları üretir (kırmızı = adayda kaybolan
           ürün pikseli, mavi = adayda sızan zemin pikseli). Yön önemlidir:
           "kopan" ve "sızan" hep tabana göre ölçülür.

FAIL-CLOSED (PR #29 Codex incelemesi): iki klasörün dosya kümesi birebir
aynı değilse, hiç eşleşme yoksa ya da bir çiftin boyutu farklıysa betik
sıfırdan farklı kodla çıkar. Önceden eksik örneği "atlandı" deyip geçiyor,
sıfır eşleşmede bile boş raporla başarı dönüyordu — en kötü örnek eksikken
"kalite değişmedi" sonucuna dayanak olabilirdi. `render` de dolu bir çıktı
klasörünü reddeder (bayat PNG rapora karışmasın) ve çıktıyı dosyanın TAM
adıyla yazar (`ring.jpg` ile `ring.heic` aynı `ring.png`'ye düşmesin).

Kullanım (backend klasöründen):
  <venv>/bin/python scripts/compare_cutouts.py render --input <foto-klasörü> --out <taban>
  <venv>/bin/python scripts/compare_cutouts.py compare <taban> <aday> --out <rapor-klasörü>

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

    if out_dir.exists() and any(out_dir.iterdir()):
        sys.exit(f"{out_dir} boş değil; bayat kesimler rapora karışmasın diye boş bir klasör verin")
    photos = sorted(p for p in input_dir.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)
    if not photos:
        sys.exit(f"{input_dir} içinde fotoğraf yok")
    out_dir.mkdir(parents=True, exist_ok=True)
    service = BackgroundRemovalService(model_name=model_name)

    timings = {}
    for photo in photos:
        start = time.monotonic()
        result = service.remove(photo.read_bytes())
        timings[photo.name] = round(time.monotonic() - start, 2)
        (out_dir / _cutout_name(photo)).write_bytes(result)
        print(f"{photo.name}: {timings[photo.name]} sn")

    warm = list(timings.values())[1:]
    meta = {
        "model": model_name,
        "python": sys.version.split()[0],
        "packages": _package_versions(),
        "seconds": timings,
        # İlk fotoğraf model yüklemesini de içerir; ortalamaya katılmaz. Tek
        # fotoğrafta ısınmış ölçüm yoktur: 0.0 değil, "ölçülemedi" (null).
        "mean_seconds_warm": round(sum(warm) / len(warm), 2) if warm else None,
        "peak_rss_mb": round(_peak_rss_mb()),
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    print(json.dumps(meta, indent=2, ensure_ascii=False))


def _cutout_name(photo: Path) -> str:
    # Uzantı adda kalır: aynı gövdeli iki girdi (`ring.jpg`, `ring.heic`)
    # birbirinin üzerine yazılmasın.
    return f"{photo.name}.png"


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


class ComparisonError(Exception):
    """Karşılaştırma güvenilir bir sonuç veremiyor (eksik/fazla örnek, boyut farkı)."""


def compare(baseline_dir: Path, candidate_dir: Path, out_dir: Path) -> list[dict]:
    baseline_names = {p.name for p in baseline_dir.glob("*.png")}
    candidate_names = {p.name for p in candidate_dir.glob("*.png")}
    missing = sorted(baseline_names - candidate_names)
    extra = sorted(candidate_names - baseline_names)
    if missing or extra:
        raise ComparisonError(
            f"örnek kümeleri aynı değil — adayda eksik: {missing or '-'}; yalnız adayda: {extra or '-'}"
        )
    if not baseline_names:
        raise ComparisonError(f"{baseline_dir} içinde karşılaştırılacak kesim yok")

    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for name in sorted(baseline_names):
        base, cand = _alpha(baseline_dir / name), _alpha(candidate_dir / name)
        if base.shape != cand.shape:
            raise ComparisonError(f"{name}: boyut farklı {base.shape} / {cand.shape}")

        diff = np.abs(base - cand)
        product_base = base >= OPAQUE
        # Kenar bandı: iki çıktıdan birinde yarı saydam olan pikseller —
        # ince zincir ve yansıtıcı kenar tam burada yaşıyor.
        edge = ((base > TRANSPARENT) & (base < OPAQUE)) | ((cand > TRANSPARENT) & (cand < OPAQUE))
        lost = (base >= OPAQUE) & (cand <= TRANSPARENT)  # üründen kopan
        gained = (base <= TRANSPARENT) & (cand >= OPAQUE)  # zeminden sızan
        bin_base, bin_cand = base >= 128, cand >= 128
        union = (bin_base | bin_cand).sum()

        rows.append({
            "image": name,
            "mean_abs_diff": round(float(diff.mean()), 3),
            "max_abs_diff": int(diff.max()),
            "changed_pct": round(float((diff >= CHANGED).mean() * 100), 3),
            "edge_mean_abs_diff": round(float(diff[edge].mean()), 3) if edge.any() else 0.0,
            "iou": round(float((bin_base & bin_cand).sum() / union), 5) if union else 1.0,
            "lost_px": int(lost.sum()),
            "lost_pct_of_product": round(float(lost.sum() / max(product_base.sum(), 1) * 100), 4),
            "gained_px": int(gained.sum()),
            "largest_lost_blob_px": _largest_blob(lost),
            "largest_gained_blob_px": _largest_blob(gained),
        })

        # Fark haritası: gri ürün silueti üzerinde kırmızı kayıp, mavi kazanç.
        shade = (base.clip(0, 255) * 0.35).astype(np.uint8)
        heat = np.stack([shade, shade, shade], axis=-1)
        heat[lost | ((base - cand) >= 64)] = [255, 40, 40]
        heat[gained | ((cand - base) >= 64)] = [40, 120, 255]
        Image.fromarray(heat).save(out_dir / f"{Path(name).stem}-fark.png")

    report = out_dir / "report.json"
    report.write_text(json.dumps(rows, indent=2, ensure_ascii=False))
    for row in rows:
        print(json.dumps(row, ensure_ascii=False))
    print(f"Rapor: {report}")
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    render_parser = sub.add_parser("render")
    render_parser.add_argument("--input", type=Path, required=True)
    render_parser.add_argument("--out", type=Path, required=True)
    render_parser.add_argument("--model", default=os.environ.get("MODEL_NAME", "birefnet-general"))

    compare_parser = sub.add_parser("compare")
    compare_parser.add_argument("baseline", type=Path, help="taban: mevcut hâlin render klasörü")
    compare_parser.add_argument("candidate", type=Path, help="aday: denenen değişikliğin render klasörü")
    compare_parser.add_argument("--out", type=Path, required=True)

    args = parser.parse_args()
    if args.command == "render":
        render(args.input, args.out, args.model)
    else:
        try:
            compare(args.baseline, args.candidate, args.out)
        except ComparisonError as error:
            sys.exit(f"KARŞILAŞTIRMA GEÇERSİZ: {error}")


if __name__ == "__main__":
    main()
