import secrets
import uuid

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db_session
from app.models.background import Background
from app.services.storage import R2StorageService
from app.validation.upload import UploadValidationError, validate_upload

router = APIRouter()

CONTENT_TYPE_TO_EXTENSION = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
}


def get_storage_service() -> R2StorageService:
    return R2StorageService(bucket_name=settings.r2_bucket_name)


def _require_admin_secret(x_admin_secret: str = Header(default="")) -> None:
    # GEÇİCİ: Faz 4'te gerçek Supabase Auth + rol kontrolü gelene kadar bu
    # paylaşılan secret kullanılıyor (bkz. kök CLAUDE.md ders 8). Zamanlama
    # saldırılarına karşı `secrets.compare_digest` ile sabit-zamanlı karşılaştırma.
    if not secrets.compare_digest(x_admin_secret, settings.admin_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Geçersiz admin secret."
        )


@router.post(
    "/api/admin/backgrounds",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_require_admin_secret)],
)
async def create_background(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    storage: R2StorageService = Depends(get_storage_service),
) -> dict[str, str]:
    content = await file.read()

    # Arka plan görselleri de ürün fotoğraflarıyla aynı doğrulama kısıtlarına
    # tabi (magic-byte + boyut + piksel sınırı) — ayrı bir doğrulama yolu
    # yazmak yerine mevcut `validate_upload` yeniden kullanılıyor.
    try:
        await run_in_threadpool(
            validate_upload,
            content,
            declared_content_type=file.content_type or "",
            max_file_size_mb=settings.max_file_size_mb,
            allowed_content_types=settings.allowed_content_types,
            max_image_pixels=settings.max_image_pixels,
        )
    except UploadValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=exc.reason
        ) from exc

    background_id = uuid.uuid4()
    extension = CONTENT_TYPE_TO_EXTENSION[file.content_type]
    r2_key = f"backgrounds/{background_id}.{extension}"

    # Önce R2'ye yükle, DB satırı YALNIZCA yükleme başarılıysa yazılır — R2
    # başarısız olursa yetim bir DB kaydı oluşmasın diye sıra bilinçli.
    try:
        await storage.upload(r2_key, content, file.content_type)
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Arka plan depolamaya yüklenemedi.",
        ) from exc

    db.add(Background(id=background_id, r2_key=r2_key))
    await db.commit()

    return {"id": str(background_id)}


@router.get("/api/backgrounds")
async def list_backgrounds(
    db: AsyncSession = Depends(get_db_session),
    storage: R2StorageService = Depends(get_storage_service),
) -> list[dict[str, str]]:
    result = await db.execute(
        select(Background)
        .where(Background.is_active.is_(True))
        .order_by(Background.created_at)
    )
    backgrounds = result.scalars().all()
    return [
        {"id": str(bg.id), "url": storage.generate_presigned_url(bg.r2_key)}
        for bg in backgrounds
    ]
