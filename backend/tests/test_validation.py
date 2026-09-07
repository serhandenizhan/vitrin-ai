import io
from pathlib import Path

import pytest
from PIL import Image

from app.validation.upload import UploadValidationError, validate_upload

MAX_SIZE_MB = 1
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


def _jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color="red").save(buf, format="JPEG")
    return buf.getvalue()


def _png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color="blue").save(buf, format="PNG")
    return buf.getvalue()


def test_accepts_valid_jpeg():
    validate_upload(
        _jpeg_bytes(),
        declared_content_type="image/jpeg",
        max_file_size_mb=MAX_SIZE_MB,
        allowed_content_types=ALLOWED_TYPES,
    )


def test_accepts_valid_png():
    validate_upload(
        _png_bytes(),
        declared_content_type="image/png",
        max_file_size_mb=MAX_SIZE_MB,
        allowed_content_types=ALLOWED_TYPES,
    )


def test_rejects_file_exceeding_max_size():
    oversized = _jpeg_bytes() + b"\x00" * (MAX_SIZE_MB * 1024 * 1024)

    with pytest.raises(UploadValidationError, match="boyut"):
        validate_upload(
            oversized,
            declared_content_type="image/jpeg",
            max_file_size_mb=MAX_SIZE_MB,
            allowed_content_types=ALLOWED_TYPES,
        )


def test_rejects_disallowed_declared_content_type():
    with pytest.raises(UploadValidationError, match="content-type"):
        validate_upload(
            _jpeg_bytes(),
            declared_content_type="application/pdf",
            max_file_size_mb=MAX_SIZE_MB,
            allowed_content_types=ALLOWED_TYPES,
        )


def test_rejects_content_that_is_not_actually_an_image():
    fake_jpeg = b"<script>alert(1)</script>" + b"\x00" * 100

    with pytest.raises(UploadValidationError, match="eşleşmiyor"):
        validate_upload(
            fake_jpeg,
            declared_content_type="image/jpeg",
            max_file_size_mb=MAX_SIZE_MB,
            allowed_content_types=ALLOWED_TYPES,
        )


def _heic_bytes() -> bytes:
    # Sabit bir fixture dosyasından okunuyor (HEIC encode etmiyoruz): libheif'in
    # pytest sürecinde scipy/numba/onnxruntime ile birlikte yüklendiğinde encode
    # sırasında segfault verdiği gözlemlendi — decode-only kullanım bu sorunu
    # yaşamıyor, üretim kod yolu zaten sadece decode yapıyor.
    return (FIXTURES_DIR / "tiny.heic").read_bytes()


def test_accepts_heic_content_declared_as_heif():
    # Bazı tarayıcılar/cihazlar aynı HEIC konteyneri için content-type olarak
    # "image/heif" bildirir; filetype kütüphanesi ikisini ayırt edemediği için
    # (her zaman "heic" tespit eder) magic-byte kontrolü bu ikisini birbirinin
    # yerine kabul etmeli.
    validate_upload(
        _heic_bytes(),
        declared_content_type="image/heif",
        max_file_size_mb=MAX_SIZE_MB,
        allowed_content_types={"image/heic", "image/heif"},
    )


def test_accepts_heic_content_declared_as_heic():
    validate_upload(
        _heic_bytes(),
        declared_content_type="image/heic",
        max_file_size_mb=MAX_SIZE_MB,
        allowed_content_types={"image/heic", "image/heif"},
    )


def test_rejects_magic_bytes_mismatched_with_declared_content_type():
    # Gerçek bir PNG dosyası ama content-type olarak jpeg iddia ediliyor.
    with pytest.raises(UploadValidationError, match="eşleşmiyor"):
        validate_upload(
            _png_bytes(),
            declared_content_type="image/jpeg",
            max_file_size_mb=MAX_SIZE_MB,
            allowed_content_types=ALLOWED_TYPES,
        )
