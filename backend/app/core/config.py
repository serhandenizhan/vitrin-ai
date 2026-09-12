from pathlib import Path
from urllib.parse import urlsplit

from pydantic import field_validator, model_validator
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


# `backend/.env` — çalışılan klasörden BAĞIMSIZ. Önceden `env_file=".env"`
# göreliydi ve uvicorn başka bir klasörden başlatıldığında (ör. repo kökünden
# `--app-dir backend` ile) dosya hiç okunmuyordu: uygulama hatasız açılıyor,
# ama her oturum uç noktası "SUPABASE_URL ayarlanmalı" diye 503 dönüyordu
# (13.09.2026'da tam olarak böyle görüldü). Kök CLAUDE.md ders 11: yol, repo
# yapısından türetilir. Gerçek ortam değişkenleri yine `.env`'nin önüne geçer.
BACKEND_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


def _split_origins(value: str) -> list[str]:
    return [origin.strip() for origin in value.split(",") if origin.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_ENV_FILE, extra="ignore")

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
    # Faz 3: arka plan kütüphanesi. Varsayılan değer `docker-compose.yml`'deki
    # yerel Postgres'e işaret ediyor; production'da Supabase Postgres bağlantı
    # dizesiyle env üzerinden override edilir.
    database_url: str = (
        "postgresql+asyncpg://vitrin_ai:change_me_locally@localhost:5432/vitrin_ai"
    )
    # Faz 4: Supabase Auth. Proje kök adresi (https://<ref>.supabase.co);
    # token'ların `iss` değeri ve JWKS adresi buradan türetiliyor. Boşsa
    # kimlik doğrulama gerektiren her endpoint açık bir 503 döner — sessizce
    # herkese açık kalmaz (bkz. app/core/auth.py). Faz 3'teki geçici
    # `ADMIN_SECRET` bununla birlikte kaldırıldı; yönetici yetkisi artık
    # `admin_users` tablosundan geliyor.
    supabase_url: str = ""
    # Supabase'in oturum açmış kullanıcılara verdiği token'daki `aud`.
    supabase_jwt_audience: str = "authenticated"
    # ESKİ (legacy) HS256 JWT secret'ı. Yeni projeler asimetrik imzalama
    # anahtarı (ES256/RS256, JWKS) kullanıyor ve bu alan BOŞ kalmalı; yalnızca
    # henüz imzalama anahtarlarına geçmemiş bir proje için doldurulur.
    supabase_legacy_jwt_secret: str = ""
    # Supabase'in GİZLİ sunucu anahtarı (`sb_secret_...` ya da eski
    # `service_role`). Yalnızca yönetici işlemleri için: şu an tek kullanımı
    # hesap silme (`DELETE /api/account`). RLS'i atlayan, tam yetkili bir
    # anahtar — frontend'e, loglara ya da hata mesajlarına asla girmez. Boşsa
    # hesap silme hiçbir şeye dokunmadan 503 döner.
    supabase_secret_key: str = ""
    # Virgülle ayrılmış tarayıcı origin'leri (SECURITY.md 2.2). `*` ve yol
    # içeren değerler başlangıçta reddedilir (bkz. `_validate_cors_origins`).
    cors_allowed_origins: str = "http://localhost:3000"
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = ""
    # GET /api/backgrounds içindeki presigned URL'lerin geçerlilik süresi.
    background_url_expiry_seconds: int = 3600
    # Proje (geçmiş çalışma) görsellerinin imzalı URL geçerlilik süresi.
    project_url_expiry_seconds: int = 3600

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024

    @property
    def cors_allowed_origin_list(self) -> list[str]:
        return _split_origins(self.cors_allowed_origins)

    @field_validator("cors_allowed_origins")
    @classmethod
    def _validate_cors_origins(cls, value: str) -> str:
        # `*` reddediliyor (SECURITY.md 2.2). Yol/sondaki `/` da reddediliyor:
        # tarayıcının gönderdiği Origin hiçbir zaman yol içermez; öyle yazılmış
        # bir değer hiçbir isteğe uymaz ve CORS "açık" sanılırken sessizce
        # her şeyi reddederdi.
        for origin in _split_origins(value):
            parts = urlsplit(origin)
            if (
                parts.scheme not in ("http", "https")
                or not parts.netloc
                or parts.path
                or parts.query
                or parts.fragment
            ):
                raise ValueError(
                    f"Geçersiz CORS origin'i: {origin!r}. Beklenen biçim: "
                    "https://alan-adi (yolsuz, sonda '/' olmadan); '*' kabul edilmez."
                )
        return value

    @model_validator(mode="after")
    def _apply_default_max_request_body_bytes(self) -> "Settings":
        if self.max_request_body_bytes is None:
            self.max_request_body_bytes = (
                self.max_file_size_bytes + MULTIPART_OVERHEAD_ALLOWANCE_BYTES
            )
        return self


settings = Settings()
