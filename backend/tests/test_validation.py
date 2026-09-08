import io
import math
import struct
import zlib
from pathlib import Path

import pytest
from PIL import Image

from app.validation import upload as upload_module
from app.validation.upload import UploadValidationError, validate_upload

MAX_SIZE_MB = 1
MAX_IMAGE_PIXELS = 1_000_000
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


def _validate(content: bytes, *, declared_content_type: str, max_image_pixels: int = MAX_IMAGE_PIXELS) -> None:
    validate_upload(
        content,
        declared_content_type=declared_content_type,
        max_file_size_mb=MAX_SIZE_MB,
        allowed_content_types=ALLOWED_TYPES,
        max_image_pixels=max_image_pixels,
    )


def _jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color="red").save(buf, format="JPEG")
    return buf.getvalue()


def _png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color="blue").save(buf, format="PNG")
    return buf.getvalue()


def _png_with_ihdr_dimensions(width: int, height: int) -> bytes:
    # Küçük gerçek bir PNG üretip IHDR chunk'ındaki genişlik/yükseklik alanlarını
    # (ve CRC'sini) manipüle ederek, byte boyutu küçük ama beyan edilen çözünürlüğü
    # devasa olan bir "decompression bomb" görüntüsü simüle eder.
    buf = io.BytesIO()
    Image.new("RGB", (1, 1)).save(buf, format="PNG")
    data = bytearray(buf.getvalue())

    ihdr_data_start = 16
    new_ihdr_data = bytearray(13)
    new_ihdr_data[0:4] = struct.pack(">I", width)
    new_ihdr_data[4:8] = struct.pack(">I", height)
    new_ihdr_data[8:13] = data[ihdr_data_start + 8 : ihdr_data_start + 13]
    crc = zlib.crc32(b"IHDR" + bytes(new_ihdr_data)) & 0xFFFFFFFF

    data[ihdr_data_start : ihdr_data_start + 13] = new_ihdr_data
    data[ihdr_data_start + 13 : ihdr_data_start + 17] = struct.pack(">I", crc)
    return bytes(data)


def test_accepts_valid_jpeg():
    _validate(_jpeg_bytes(), declared_content_type="image/jpeg")


def test_accepts_valid_png():
    _validate(_png_bytes(), declared_content_type="image/png")


def test_rejects_file_exceeding_max_size():
    oversized = _jpeg_bytes() + b"\x00" * (MAX_SIZE_MB * 1024 * 1024)

    with pytest.raises(UploadValidationError, match="boyut"):
        _validate(oversized, declared_content_type="image/jpeg")


def test_rejects_disallowed_declared_content_type():
    with pytest.raises(UploadValidationError, match="content-type"):
        _validate(_jpeg_bytes(), declared_content_type="application/pdf")


def test_rejects_content_that_is_not_actually_an_image():
    fake_jpeg = b"<script>alert(1)</script>" + b"\x00" * 100

    with pytest.raises(UploadValidationError, match="eşleşmiyor"):
        _validate(fake_jpeg, declared_content_type="image/jpeg")


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
        max_image_pixels=MAX_IMAGE_PIXELS,
    )


def test_accepts_heic_content_declared_as_heic():
    validate_upload(
        _heic_bytes(),
        declared_content_type="image/heic",
        max_file_size_mb=MAX_SIZE_MB,
        allowed_content_types={"image/heic", "image/heif"},
        max_image_pixels=MAX_IMAGE_PIXELS,
    )


def test_rejects_magic_bytes_mismatched_with_declared_content_type():
    # Gerçek bir PNG dosyası ama content-type olarak jpeg iddia ediliyor.
    with pytest.raises(UploadValidationError, match="eşleşmiyor"):
        _validate(_png_bytes(), declared_content_type="image/jpeg")


def test_rejects_corrupted_image_with_valid_signature():
    # Geçerli bir JPEG magic-byte imzasıyla başlayıp gövdesi bozuk/truncated
    # olan bir dosya: filetype/magic-byte aşamasını geçer ama `image.verify()`
    # sırasında reddedilmelidir.
    valid_jpeg = _jpeg_bytes()
    truncated = valid_jpeg[: len(valid_jpeg) // 2]

    with pytest.raises(UploadValidationError, match="geçerli bir görüntü değil"):
        _validate(truncated, declared_content_type="image/jpeg")


def _png_with_corrupted_idat_crc() -> bytes:
    # Geçerli PNG imzası + IHDR (piksel sınırı içinde kalan, makul bir
    # çözünürlük) ama IDAT chunk'ının CRC'si bozulmuş. `Image.open()`/`.size`
    # başlık aşamasında başarıyla çalışır; hata yalnızca `image.verify()`
    # gerçek decode'u tetiklediğinde ortaya çıkar (PIL bunun için
    # `UnidentifiedImageError`/`OSError` değil `SyntaxError` fırlatıyor).
    buf = io.BytesIO()
    Image.new("RGB", (50, 50), color="red").save(buf, format="PNG")
    data = bytearray(buf.getvalue())

    idat_type_index = data.find(b"IDAT")
    length = struct.unpack(">I", bytes(data[idat_type_index - 4 : idat_type_index]))[0]
    crc_start = idat_type_index + 4 + length
    data[crc_start : crc_start + 4] = b"\x00\x00\x00\x00"
    return bytes(data)


def test_rejects_png_with_corrupted_idat_crc_without_500():
    # Header/piksel sınırı kontrolünü geçen ama decode aşamasında (`verify()`)
    # bozuk çıkan bir PNG: 500'e yol açan yakalanmamış bir `SyntaxError`
    # üretmemeli, `UploadValidationError` üretmeli.
    with pytest.raises(UploadValidationError, match="geçerli bir görüntü değil"):
        _validate(_png_with_corrupted_idat_crc(), declared_content_type="image/png")


def test_rejects_jpeg_truncated_immediately_after_header_without_500():
    # JPEG imzası + SOI/APP0 header'ı geçerli, ama gövde verisi hiç yok
    # (header'dan hemen sonra kesilmiş). `Image.open()` başlığı ayrıştırabilir
    # ama `image.verify()` decode sırasında patlar; 500 yerine 400 üretilmeli.
    valid_jpeg = _jpeg_bytes()
    truncated_after_header = valid_jpeg[:30]

    with pytest.raises(UploadValidationError, match="geçerli bir görüntü değil"):
        _validate(truncated_after_header, declared_content_type="image/jpeg")


def _png_with_corrupted_zlib_stream() -> bytes:
    # IDAT'ın sıkıştırılmış (zlib) verisinin ortasındaki baytları bozup CRC'yi
    # buna göre YENİDEN hesaplıyor — yani PNG chunk seviyesinde "geçerli"
    # görünüyor (CRC tutarlı) ama zlib decompression'ı gerçek pikselleri
    # decode ederken patlıyor. `image.verify()` bunu YAKALAMAZ (sadece chunk
    # bütünlüğüne bakar); yalnızca ayrı bir `Image.open()` + `image.load()`
    # tam decode'u bunu tespit edebiliyor — bu, `verify()`'in tek başına
    # yeterli olmadığının somut kanıtıdır.
    buf = io.BytesIO()
    Image.new("RGB", (50, 50), color="red").save(buf, format="PNG")
    data = bytearray(buf.getvalue())

    idat_type_index = data.find(b"IDAT")
    length = struct.unpack(">I", bytes(data[idat_type_index - 4 : idat_type_index]))[0]
    data_start = idat_type_index + 4
    mid = data_start + length // 2
    for i in range(mid, min(mid + 10, data_start + length)):
        data[i] ^= 0xFF
    crc = zlib.crc32(bytes(data[idat_type_index : idat_type_index + 4 + length])) & 0xFFFFFFFF
    data[idat_type_index + 4 + length : idat_type_index + 4 + length + 4] = struct.pack(">I", crc)
    return bytes(data)


def test_rejects_png_with_corrupted_zlib_stream_that_verify_alone_misses():
    with pytest.raises(UploadValidationError, match="geçerli bir görüntü değil"):
        _validate(_png_with_corrupted_zlib_stream(), declared_content_type="image/png")


def _jpeg_bytes_larger() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (100, 100), color="green").save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def _jpeg_truncated_after_sos_entropy() -> bytes:
    # Gerçek SOF (Start Of Frame) ve SOS (Start Of Scan) marker'ları mevcut ve
    # sağlam; entropy-coded taramanın (asıl piksel verisi) sadece birkaç baytı
    # var, gerisi kesilmiş. `image.verify()` bunu YAKALAMAZ (empirik olarak
    # doğrulandı — sadece marker yapısına bakar, entropy verisinin tamlığını
    # kontrol etmez); yalnızca `image.load()` gerçek decode sırasında
    # "image file is truncated" hatasını üretir.
    jpeg = _jpeg_bytes_larger()
    sos_index = jpeg.find(b"\xff\xda")
    sos_len = struct.unpack(">H", jpeg[sos_index + 2 : sos_index + 4])[0]
    cut_point = sos_index + 2 + sos_len + 5
    return jpeg[:cut_point]


def test_rejects_jpeg_truncated_after_sos_entropy_data_that_verify_alone_misses():
    with pytest.raises(UploadValidationError, match="geçerli bir görüntü değil"):
        _validate(_jpeg_truncated_after_sos_entropy(), declared_content_type="image/jpeg")


def test_memory_error_during_decode_is_not_swallowed(monkeypatch):
    # `MemoryError`, `validate_upload`'ın dar `except (OSError, SyntaxError,
    # ValueError)` bloğuna KASITLI OLARAK dahil değil: bu, gerçek bir
    # belleğin tükendiği/altyapısal bir durumu temsil eder ve sessizce
    # 400'e çevrilip yutulmamalı, çağırana sızmalı.
    def raise_memory_error(*args, **kwargs):
        raise MemoryError("simulated out-of-memory during decode")

    monkeypatch.setattr(upload_module.Image, "open", raise_memory_error)

    with pytest.raises(MemoryError):
        _validate(_jpeg_bytes(), declared_content_type="image/jpeg")


def test_attribute_error_during_decode_is_not_swallowed(monkeypatch):
    # `AttributeError` de aynı şekilde KASITLI OLARAK dar tuple'a dahil değil:
    # bu, gerçek bir programlama hatasını temsil eder ve sessizce 400'e
    # çevrilip yutulmamalı, çağırana sızmalı.
    def raise_attribute_error(*args, **kwargs):
        raise AttributeError("simulated programming error during decode")

    monkeypatch.setattr(upload_module.Image, "open", raise_attribute_error)

    with pytest.raises(AttributeError):
        _validate(_jpeg_bytes(), declared_content_type="image/jpeg")


def test_struct_error_during_decode_is_converted_to_upload_validation_error(monkeypatch):
    # `struct.error`, `OSError`/`ValueError`'dan TÜREMEYEN, kendi başına bir
    # `Exception` alt sınıfı (bkz. app/validation/upload.py yorumu) — bazı
    # format parser'ları header alanlarını `struct.unpack` ile çözerken bunu
    # fırlatabiliyor. Dar `except` tuple'ına AÇIKÇA eklendi; bu test bunun
    # 400/`UploadValidationError`'a çevrildiğini (yutulmadığını/500'e
    # sızmadığını) kanıtlıyor.
    def raise_struct_error(*args, **kwargs):
        raise struct.error("simulated struct.unpack failure during header decode")

    monkeypatch.setattr(upload_module.Image, "open", raise_struct_error)

    with pytest.raises(UploadValidationError, match="geçerli bir görüntü değil"):
        _validate(_jpeg_bytes(), declared_content_type="image/jpeg")


def test_rejects_image_exceeding_pixel_limit():
    # Küçük byte boyutlu ama IHDR'de devasa çözünürlük beyan eden bir PNG —
    # klasik decompression-bomb şekli. `max_image_pixels` sınırını (2× PIL'in
    # varsayılan `Image.MAX_IMAGE_PIXELS`'inin de üzerinde) net şekilde aşıyor.
    huge_pixels_png = _png_with_ihdr_dimensions(width=200_000, height=200_000)

    with pytest.raises(UploadValidationError, match="çözünürlüğü"):
        _validate(huge_pixels_png, declared_content_type="image/png")


def test_rejects_image_exceeding_app_limit_but_under_pil_default():
    # 2000x2000 = 4_000_000 piksel: uygulamanın kendi `max_image_pixels` sınırını
    # (test sabiti: 1_000_000) aşıyor ama PIL'in kendi varsayılan
    # `Image.MAX_IMAGE_PIXELS` eşiğinin (89_478_485) çok altında — yani PIL'in
    # kendi decompression-bomb kontrolü bunu hiç yakalamaz. Bu test, `max_image_pixels`
    # kontrolünün PIL'in global'inden bağımsız çalıştığını kanıtlıyor.
    png = _png_with_ihdr_dimensions(width=2000, height=2000)

    with pytest.raises(UploadValidationError, match="çözünürlüğü"):
        _validate(png, declared_content_type="image/png")


def test_rejects_image_in_pil_decompression_bomb_warning_range():
    # PIL'in varsayılan `Image.MAX_IMAGE_PIXELS` (89_478_485) ile 2×'i arasında
    # kalan bir çözünürlük: PIL'in kendi varsayılan davranışı bunun için sadece
    # bir `DecompressionBombWarning` üretir ve sessizce devam eder (işlemi
    # durdurmaz). `validate_upload` bu uyarıyı hataya çevirip reddetmeli.
    default_pil_limit = Image.MAX_IMAGE_PIXELS
    side = int(math.isqrt(int(default_pil_limit * 1.5)))
    warning_range_png = _png_with_ihdr_dimensions(width=side, height=side)

    # Bu çözünürlük, testin kendi (düşük) `max_image_pixels` sınırını da aşıyor,
    # ama amaç PIL'in varsayılan aralığındaki davranışını doğrulamak olduğu için
    # sınırı PIL'in kendi eşiğinin hemen üzerine, testin `MAX_IMAGE_PIXELS`
    # sabitinden çok daha yükseğe çekiyoruz.
    with pytest.raises(UploadValidationError, match="çözünürlüğü"):
        _validate(
            warning_range_png,
            declared_content_type="image/png",
            max_image_pixels=default_pil_limit * 3,
        )
