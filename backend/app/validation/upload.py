import io

import filetype
import pillow_heif
from PIL import Image, UnidentifiedImageError

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

    try:
        with Image.open(io.BytesIO(content)) as image:
            image.verify()
    except (UnidentifiedImageError, OSError) as exc:
        raise UploadValidationError("Dosya içeriği geçerli bir görüntü değil.") from exc
