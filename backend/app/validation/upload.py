import io
import struct
import warnings

import filetype
import pillow_heif
from PIL import Image

# HEIC/HEIF olmadan PIL bu formatı açamaz (CLAUDE.md notu).
pillow_heif.register_heif_opener()

MAGIC_BYTES_TO_CONTENT_TYPE = {
    "jpg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "heic": "image/heic",
    "heif": "image/heif",
}

# `filetype` kütüphanesi HEIC ve HEIF konteynerlerini ayırt etmiyor, ikisi için de
# her zaman "heic" uzantısını döndürüyor. Tarayıcılar/cihazlar aynı dosya için
# tutarsız şekilde "image/heic" ya da "image/heif" bildirebiliyor — bu yüzden
# magic-byte eşleşmesinde bu ikisi birbirinin yerine kabul edilir.
EQUIVALENT_CONTENT_TYPES = {
    "image/heic": {"image/heic", "image/heif"},
    "image/heif": {"image/heic", "image/heif"},
}


class UploadValidationError(Exception):
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


def validate_upload(
    content: bytes,
    *,
    declared_content_type: str,
    max_file_size_mb: int,
    allowed_content_types: set[str],
    max_image_pixels: int,
) -> None:
    max_size_bytes = max_file_size_mb * 1024 * 1024
    if len(content) > max_size_bytes:
        raise UploadValidationError(f"Dosya boyutu {max_file_size_mb}MB sınırını aşıyor.")

    if declared_content_type not in allowed_content_types:
        raise UploadValidationError(
            f"content-type '{declared_content_type}' desteklenmiyor."
        )

    kind = filetype.guess(content)
    detected_content_type = (
        MAGIC_BYTES_TO_CONTENT_TYPE.get(kind.extension) if kind else None
    )
    allowed_for_detected = EQUIVALENT_CONTENT_TYPES.get(
        detected_content_type, {detected_content_type}
    )
    if detected_content_type is None or declared_content_type not in allowed_for_detected:
        raise UploadValidationError(
            "Dosya içeriği, beyan edilen content-type ile eşleşmiyor."
        )

    # PIL'in varsayılan `Image.MAX_IMAGE_PIXELS` global'i, limit ile 2×limit
    # arasındaki piksel sayımlarında sadece bir `DecompressionBombWarning` üretir
    # (varsayılan uyarı filtresiyle işlemi durdurmaz) ve sadece 2×limit üzerinde
    # `DecompressionBombError` fırlatır. Bu uyarıyı burada hataya çevirerek o
    # ara bölgeyi de kapatıyoruz — ayrıca `max_image_pixels` ile kendi açık
    # sınırımızı kontrol ediyoruz çünkü PIL'in global'i başka bir kütüphane
    # tarafından değiştirilebilir/devre dışı bırakılabilir (bkz. app/core/config.py).
    #
    # `image.verify()` TEK BAŞINA yeterli değil: sadece yapısal/bütünlük
    # kontrolü yapar (ör. PNG chunk CRC'leri), gerçek piksel decode'unu TAM
    # olarak tetiklemez — bozuk zlib akışı veya kesilmiş JPEG entropy verisi
    # gibi hatalar `verify()`'den sessizce geçebilir (empirik olarak
    # doğrulandı). Bu yüzden `verify()`'den SONRA, PIL'in "verify() sonrası
    # aynı nesne yeniden kullanılamaz" sözleşmesi gereği TAZE bir
    # `Image.open()` nesnesiyle `image.load()` çağrılarak tam decode
    # doğrulaması ayrıca yapılır.
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)

            with Image.open(io.BytesIO(content)) as image:
                width, height = image.size
                if width * height > max_image_pixels:
                    raise UploadValidationError(
                        "Görüntü çözünürlüğü izin verilen sınırı aşıyor."
                    )
                image.verify()

            with Image.open(io.BytesIO(content)) as image:
                image.load()
    except UploadValidationError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise UploadValidationError(
            "Görüntü çözünürlüğü izin verilen sınırı aşıyor."
        ) from exc
    except (OSError, SyntaxError, ValueError, struct.error) as exc:
        # Bu blok, saldırgan kontrolündeki baytları decode eden bir güven
        # sınırıdır — ama kasıtlı olarak DAR tutuluyor. PIL/pillow_heif,
        # kasıtlı olarak bozulmuş dosyalar için `UnidentifiedImageError`
        # (bir `OSError` alt sınıfı), düz `OSError` (ör. "Truncated File
        # Read", "image file is truncated"), `SyntaxError` (ör. bozuk PNG
        # chunk CRC'si) veya bazı format parser'larının header alanlarını
        # `struct.unpack` ile çözerken fırlattığı `struct.error` (kendi
        # başına bir `Exception` alt sınıfı, `OSError`/`ValueError`'dan
        # TÜREMEZ) fırlatabiliyor. `ValueError` bazı format'a özgü ayrıştırma
        # hatalarında görülüyor. Bunların hepsi 500 yerine 400 üretmeli.
        # `MemoryError` ve beklenmeyen programlama/altyapı hataları (ör.
        # `AttributeError`, `RecursionError`) KASITLI OLARAK bu tuple'a dahil
        # değil — bunlar burada yutulmamalı, çağırana sızıp gözlemlenebilir
        # kalmalı (bkz. testler: MemoryError yutulmuyor).
        raise UploadValidationError("Dosya içeriği geçerli bir görüntü değil.") from exc
