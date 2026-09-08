from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Multipart zarfı (boundary delimiter'ları + her `part` için `Content-Disposition`/
# `Content-Type` header satırları + dosya adı + olası ek form alanları) dosya
# içeriğine ek bir overhead getirir. Bu, `max_request_body_bytes` ayarı için
# yalnızca VARSAYILAN payı belirler — tek/zorunlu sözleşme değildir; ayar
# `MAX_REQUEST_BODY_BYTES` env değişkeniyle doğrudan override edilebilir
# (ör. çok uzun dosya adı/ek form alanı kullanan istemciler için bu varsayılan
# payın yetersiz kaldığı durumlarda).
MULTIPART_OVERHEAD_ALLOWANCE_BYTES = 64 * 1024

# VARSAYILAN multipart metadata bütçesi — bir garanti değil, sadece
# `MULTIPART_OVERHEAD_ALLOWANCE_BYTES`'in içinde makul bir çalışma payı
# bırakmak için seçilmiş bir referans değeri. Bir yükleme isteğindeki dosya
# adı + `/api/remove-background`'a gönderilen ek form alanlarının (dosya
# hariç) toplam baytı bu değerin altında kaldığında, tam `max_file_size_mb`
# boyutundaki geçerli bir dosya VARSAYILAN `max_request_body_bytes` ile
# tipik olarak 413 almaz (bkz. tests/test_remove_background_endpoint.py —
# hem bu bütçenin altındaki hem de `MULTIPART_OVERHEAD_ALLOWANCE_BYTES`'i
# aşan davranış test ediliyor). Bu bir SÖZLEŞME/GARANTİ değildir — asıl
# operasyonel sınır her zaman `MAX_REQUEST_BODY_BYTES`'tir (env değişkeni):
# metadata boyutu bu varsayılan bütçeyi aşan bir istemci için, gerçek karar
# `MAX_REQUEST_BODY_BYTES`'in o an ne olduğuna bağlıdır — gerekiyorsa bu
# değer env üzerinden açıkça artırılmalıdır.
DEFAULT_METADATA_BUDGET_BYTES = 60 * 1024


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    max_file_size_mb: int = 20
    # BiRefNet'in ölçülen 12-14GB RAM bütçesi (bkz. kök CLAUDE.md "Bilinen kısıt")
    # tek bir süreçte aynı anda birden fazla inference'ı güvenle kaldırmıyor;
    # varsayılan olarak tek seferde bir inference'a izin verilir.
    max_concurrent_inferences: int = 1
    # 40 megapiksel: yaygın telefon kameralarının (ör. 48MP ana sensör, sıkıştırma
    # sonrası tipik olarak daha düşük efektif çözünürlük) üstünde, ama decompression-
    # bomb tarzı (küçük byte, devasa piksel sayımı) bir görüntüyü reddetmeye yetecek
    # kadar düşük bir sınır. PIL'in kendi `Image.MAX_IMAGE_PIXELS` global'ine
    # güvenilmiyor çünkü bu değer başka bir kütüphane tarafından değiştirilebilir/
    # devre dışı bırakılabilir.
    max_image_pixels: int = 40_000_000
    # `None` bırakılırsa `max_file_size_bytes + MULTIPART_OVERHEAD_ALLOWANCE_BYTES`
    # olarak otomatik hesaplanır (bkz. `_apply_default_max_request_body_bytes`).
    # Açıkça, ayrı bir ayar olarak da (`MAX_REQUEST_BODY_BYTES` env değişkeniyle)
    # yapılandırılabilir; `max_file_size_mb`'den türetilen bir hesaplamaya
    # bağımlı kalmak zorunlu değildir.
    max_request_body_bytes: int | None = None
    allowed_content_types: set[str] = {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
    }
    rembg_model_name: str = "birefnet-general"

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024

    @model_validator(mode="after")
    def _apply_default_max_request_body_bytes(self) -> "Settings":
        if self.max_request_body_bytes is None:
            self.max_request_body_bytes = (
                self.max_file_size_bytes + MULTIPART_OVERHEAD_ALLOWANCE_BYTES
            )
        return self


settings = Settings()
