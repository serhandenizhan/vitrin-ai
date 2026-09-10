from functools import lru_cache

import boto3
from fastapi.concurrency import run_in_threadpool

from app.core.config import settings


# Boş bırakılmış R2 ayarları boto3'ü hata vermeye ZORLAMAZ: `r2_account_id`
# boşken `endpoint_url` sessizce `https://.r2.cloudflarestorage.com` olur ve
# `generate_presigned_url` "geçerli görünen ama hiçbir zaman çalışmayan" bir URL
# üretir. Yanlış yapılandırma o zaman sunucuda değil, KULLANICININ tarayıcısında
# kırık bir görsel olarak ortaya çıkar — teşhis edilmesi en zor yer. Bu yüzden
# ayarlar client oluşturulurken burada doğrulanıyor.
#
# Doğrulamanın `Settings` içinde değil BURADA olması bilinçli: R2 ayarları
# yalnızca arka plan kütüphanesi için gerekli. `Settings` seviyesinde zorunlu
# kılmak, yalnızca `/api/remove-background` kullanan bir geliştiricinin
# (ve Faz 0-2 kurulumunun) uygulamayı hiç başlatamamasına yol açardı.
# Ayrıca `GET /api/backgrounds` boş bir veritabanında hiç client oluşturmaz,
# dolayısıyla R2'siz yerel geliştirme çalışmaya devam eder.
REQUIRED_R2_SETTINGS = (
    "r2_account_id",
    "r2_access_key_id",
    "r2_secret_access_key",
    "r2_bucket_name",
)


class R2ConfigurationError(RuntimeError):
    pass


def _require_r2_settings() -> None:
    missing = [name for name in REQUIRED_R2_SETTINGS if not getattr(settings, name)]
    if missing:
        raise R2ConfigurationError(
            "R2 depolama yapılandırılmamış; eksik ayar(lar): "
            + ", ".join(name.upper() for name in missing)
        )


@lru_cache(maxsize=1)
def _get_client():
    # R2, S3-uyumlu bir API sunuyor; `region_name="auto"` ve hesaba özel
    # `endpoint_url` R2'nin kendi konvansiyonu (bkz. Cloudflare R2 S3 API dokümanı).
    _require_r2_settings()
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
    )


class R2StorageService:
    def __init__(self, bucket_name: str):
        self._bucket_name = bucket_name

    async def upload(self, key: str, content: bytes, content_type: str) -> None:
        # `put_object` gerçek bir ağ çağrısı — event loop'u bloklamaması için
        # threadpool'a taşınıyor (bkz. kök CLAUDE.md, mevcut BiRefNet/validate_upload
        # deseniyle tutarlı).
        client = _get_client()
        await run_in_threadpool(
            client.put_object,
            Bucket=self._bucket_name,
            Key=key,
            Body=content,
            ContentType=content_type,
        )

    def generate_presigned_url(self, key: str) -> str:
        # Yerel bir imzalama işlemi, ağ çağrısı yapmıyor — threadpool gerekmiyor.
        client = _get_client()
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket_name, "Key": key},
            ExpiresIn=settings.background_url_expiry_seconds,
        )
