from functools import lru_cache

import boto3
from fastapi.concurrency import run_in_threadpool

from app.core.config import settings


@lru_cache(maxsize=1)
def _get_client():
    # R2, S3-uyumlu bir API sunuyor; `region_name="auto"` ve hesaba özel
    # `endpoint_url` R2'nin kendi konvansiyonu (bkz. Cloudflare R2 S3 API dokümanı).
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
