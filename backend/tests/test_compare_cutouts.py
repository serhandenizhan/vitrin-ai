"""`scripts/compare_cutouts.py` — model kalite kapısının kendisinin testleri.

NEDEN (PR #29 Codex incelemesi): araç eksik örnek setini "atlandı" deyip
geçiyor, sıfır eşleşmede bile boş raporla başarı dönüyordu. Model
değişikliklerinin kanıtı bu araç olduğu için sessizce yeşil olması, kalite
kaybını gizleyebilirdi. Testler hem RED (geçersiz karşılaştırma) hem KABUL
(geçerli karşılaştırma ve yönün doğruluğu) yolunu ayrı ayrı sınar (ders 15).
"""

import importlib.util
import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

import app.services.background_removal as removal_module

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "compare_cutouts.py"
_spec = importlib.util.spec_from_file_location("compare_cutouts", _SCRIPT)
compare_cutouts = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(compare_cutouts)


def _write_cutout(path: Path, alpha: np.ndarray) -> None:
    rgba = np.zeros((*alpha.shape, 4), dtype=np.uint8)
    rgba[:, :, 3] = alpha
    Image.fromarray(rgba, "RGBA").save(path)


def _ring(size: int = 64, thickness: int = 6) -> np.ndarray:
    """Ortasında ince bir halka: zincir gibi ince yapının küçük bir modeli."""
    yy, xx = np.mgrid[:size, :size]
    radius = np.hypot(yy - size / 2, xx - size / 2)
    return np.where(np.abs(radius - size / 4) < thickness / 2, 255, 0).astype(np.uint8)


def test_rejects_when_candidate_misses_a_sample(tmp_path):
    base, cand = tmp_path / "base", tmp_path / "cand"
    base.mkdir(), cand.mkdir()
    _write_cutout(base / "a.jpg.png", _ring())
    _write_cutout(base / "b.jpg.png", _ring())
    _write_cutout(cand / "a.jpg.png", _ring())

    with pytest.raises(compare_cutouts.ComparisonError, match="b.jpg.png"):
        compare_cutouts.compare(base, cand, tmp_path / "out")


def test_rejects_samples_only_in_candidate(tmp_path):
    base, cand = tmp_path / "base", tmp_path / "cand"
    base.mkdir(), cand.mkdir()
    _write_cutout(base / "a.jpg.png", _ring())
    _write_cutout(cand / "a.jpg.png", _ring())
    _write_cutout(cand / "extra.jpg.png", _ring())

    with pytest.raises(compare_cutouts.ComparisonError, match="extra.jpg.png"):
        compare_cutouts.compare(base, cand, tmp_path / "out")


def test_rejects_disjoint_sets_that_used_to_produce_an_empty_success(tmp_path):
    # Codex'in birebir örneği: A = {only-in-a}, B = {only-in-b} → eskiden
    # boş rapor ve exit 0.
    base, cand = tmp_path / "base", tmp_path / "cand"
    base.mkdir(), cand.mkdir()
    _write_cutout(base / "only-in-a.png", _ring())
    _write_cutout(cand / "only-in-b.png", _ring())

    with pytest.raises(compare_cutouts.ComparisonError):
        compare_cutouts.compare(base, cand, tmp_path / "out")
    assert not (tmp_path / "out" / "report.json").exists()


def test_rejects_empty_sample_set(tmp_path):
    base, cand = tmp_path / "base", tmp_path / "cand"
    base.mkdir(), cand.mkdir()

    with pytest.raises(compare_cutouts.ComparisonError, match="kesim yok"):
        compare_cutouts.compare(base, cand, tmp_path / "out")


def test_rejects_size_mismatch(tmp_path):
    base, cand = tmp_path / "base", tmp_path / "cand"
    base.mkdir(), cand.mkdir()
    _write_cutout(base / "a.jpg.png", _ring(64))
    _write_cutout(cand / "a.jpg.png", _ring(32))

    with pytest.raises(compare_cutouts.ComparisonError, match="boyut"):
        compare_cutouts.compare(base, cand, tmp_path / "out")


def test_size_mismatch_leaves_no_partial_artifacts(tmp_path):
    """Geçersizliği geç bulunan bir örnek, önceki heatmap'i de bırakmaz."""
    base, cand, out = tmp_path / "base", tmp_path / "cand", tmp_path / "out"
    base.mkdir(), cand.mkdir()
    _write_cutout(base / "a.jpg.png", _ring(64))
    _write_cutout(cand / "a.jpg.png", _ring(64))
    _write_cutout(base / "z.jpg.png", _ring(64))
    _write_cutout(cand / "z.jpg.png", _ring(32))

    with pytest.raises(compare_cutouts.ComparisonError, match="z.jpg.png"):
        compare_cutouts.compare(base, cand, out)

    assert not out.exists()


def test_compare_refuses_non_empty_output_dir_without_overwriting_it(tmp_path):
    base, cand, out = tmp_path / "base", tmp_path / "cand", tmp_path / "out"
    base.mkdir(), cand.mkdir(), out.mkdir()
    _write_cutout(base / "a.jpg.png", _ring())
    _write_cutout(cand / "a.jpg.png", _ring())
    stale_report = out / "report.json"
    stale_report.write_text('[{"image": "old.jpg.png"}]')

    with pytest.raises(compare_cutouts.ComparisonError, match="boş değil"):
        compare_cutouts.compare(base, cand, out)

    assert stale_report.read_text() == '[{"image": "old.jpg.png"}]'
    assert {p.name for p in out.iterdir()} == {"report.json"}


def test_command_line_exits_non_zero_on_invalid_comparison(tmp_path, monkeypatch):
    base, cand = tmp_path / "base", tmp_path / "cand"
    base.mkdir(), cand.mkdir()
    _write_cutout(base / "only-in-a.png", _ring())
    _write_cutout(cand / "only-in-b.png", _ring())
    monkeypatch.setattr(
        "sys.argv",
        ["compare_cutouts.py", "compare", str(base), str(cand), "--out", str(tmp_path / "out")],
    )

    with pytest.raises(SystemExit) as exit_info:
        compare_cutouts.main()
    assert exit_info.value.code not in (0, None)


def test_identical_sets_report_no_difference(tmp_path):
    base, cand = tmp_path / "base", tmp_path / "cand"
    base.mkdir(), cand.mkdir()
    _write_cutout(base / "a.jpg.png", _ring())
    _write_cutout(cand / "a.jpg.png", _ring())

    [row] = compare_cutouts.compare(base, cand, tmp_path / "out")

    assert row["iou"] == 1.0
    assert row["lost_px"] == 0 and row["gained_px"] == 0
    assert json.loads((tmp_path / "out" / "report.json").read_text()) == [row]


def test_direction_lost_is_measured_against_baseline(tmp_path):
    # Aday halkanın yarısını kaybetti: "kopan" > 0, "sızan" 0. Argümanlar
    # ters verildiğinde aynı fark "sızan" olarak görünür — yön anlamlı.
    full = _ring()
    broken = full.copy()
    broken[:, : full.shape[1] // 2] = 0
    base, cand = tmp_path / "base", tmp_path / "cand"
    base.mkdir(), cand.mkdir()
    _write_cutout(base / "a.jpg.png", full)
    _write_cutout(cand / "a.jpg.png", broken)

    [forward] = compare_cutouts.compare(base, cand, tmp_path / "out1")
    [backward] = compare_cutouts.compare(cand, base, tmp_path / "out2")

    assert forward["lost_px"] > 0 and forward["gained_px"] == 0
    assert backward["gained_px"] == forward["lost_px"] and backward["lost_px"] == 0
    # Fark haritasında kayıp kırmızı çizilir.
    heat = np.asarray(Image.open(tmp_path / "out1" / "a.jpg-fark.png"))
    assert (heat == [255, 40, 40]).all(axis=-1).any()


class _FakeService:
    def __init__(self, model_name):
        pass

    def remove(self, image_bytes):
        return b"png"


def test_render_refuses_non_empty_output_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(removal_module, "BackgroundRemovalService", _FakeService)
    photos, out = tmp_path / "photos", tmp_path / "out"
    photos.mkdir(), out.mkdir()
    (photos / "ring.jpg").write_bytes(b"x")
    (out / "stale.png").write_bytes(b"eski")

    with pytest.raises(SystemExit, match="boş değil"):
        compare_cutouts.render(photos, out, "birefnet-general")


def test_render_keeps_same_stem_inputs_apart(tmp_path, monkeypatch):
    monkeypatch.setattr(removal_module, "BackgroundRemovalService", _FakeService)
    photos, out = tmp_path / "photos", tmp_path / "out"
    photos.mkdir()
    (photos / "ring.jpg").write_bytes(b"x")
    (photos / "ring.heic").write_bytes(b"y")

    compare_cutouts.render(photos, out, "birefnet-general")

    assert {p.name for p in out.glob("*.png")} == {"ring.jpg.png", "ring.heic.png"}


def test_render_single_photo_has_no_warm_mean(tmp_path, monkeypatch):
    monkeypatch.setattr(removal_module, "BackgroundRemovalService", _FakeService)
    photos, out = tmp_path / "photos", tmp_path / "out"
    photos.mkdir()
    (photos / "ring.jpg").write_bytes(b"x")

    compare_cutouts.render(photos, out, "birefnet-general")

    assert json.loads((out / "meta.json").read_text())["mean_seconds_warm"] is None
