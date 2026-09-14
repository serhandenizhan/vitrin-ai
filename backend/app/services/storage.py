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

    async def delete(self, key: str) -> None:
        # S3/R2'de olmayan bir anahtarı silmek hata değil (idempotent) —
        # yarım kalmış bir silmeyi tekrar denemek güvenli.
        client = _get_client()
        await run_in_threadpool(client.delete_object, Bucket=self._bucket_name, Key=key)

    async def delete_prefix(self, prefix: str) -> int:
        """Önekle başlayan tüm nesneleri siler; silinen nesne sayısını döner.

        Hesap silmede kullanıcının tüm proje görsellerini (`projects/<user_id>/`)
        temizlemek için (KVKK silme hakkı). Boş önek kabul edilmiyor: bir hata
        sonucu `""` gelirse bucket'ın tamamı silinirdi.
        """
        if not prefix or not prefix.endswith("/"):
            raise ValueError("Önek boş olamaz ve '/' ile bitmeli.")

        client = _get_client()

        def _delete_all() -> int:
            deleted = 0
            paginator = client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self._bucket_name, Prefix=prefix):
                keys = [{"Key": item["Key"]} for item in page.get("Contents", [])]
                # `list_objects_v2` sayfa başına en fazla 1000 anahtar döner;
                # `delete_objects` da istek başına 1000 kabul ediyor.
                if keys:
                    response = client.delete_objects(
                        Bucket=self._bucket_name, Delete={"Objects": keys, "Quiet": True}
                    )
                    # Quiet modda yalnızca SİLİNEMEYENLER dönüyor; sessizce
                    # geçilirse kullanıcı "silindi" sanır ama görseller kalırdı.
                    if response.get("Errors"):
                        raise RuntimeError(
                            f"{len(response['Errors'])} R2 nesnesi silinemedi."
                        )
                    deleted += len(keys)
            return deleted

        return await run_in_threadpool(_delete_all)

    def generate_presigned_url(self, key: str, expires_in: int | None = None) -> str:
        # Yerel bir imzalama işlemi, ağ çağrısı yapmıyor — threadpool gerekmiyor.
        # Süre verilmezse zeminlerin süresi (Faz 3 davranışı değişmesin diye).
        client = _get_client()
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket_name, "Key": key},
            ExpiresIn=(
                expires_in if expires_in is not None else settings.background_url_expiry_seconds
            ),
        )


def get_storage_service() -> R2StorageService:
    # FastAPI bağımlılığı; testler bunu `app.dependency_overrides` ile
    # değiştiriyor. Tüm route'lar AYNI fonksiyonu kullanıyor ki tek bir
    # override hepsini kapsasın.
    return R2StorageService(bucket_name=settings.r2_bucket_name)
