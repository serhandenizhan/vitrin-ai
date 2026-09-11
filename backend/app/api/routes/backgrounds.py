import uuid

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_admin
from app.core.config import settings
from app.core.db import get_db_session
from app.models.background import Background
from app.services.storage import R2StorageService, get_storage_service
from app.validation.upload import UploadValidationError, validate_upload

router = APIRouter()

CONTENT_TYPE_TO_EXTENSION = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
}


@router.post(
    "/api/admin/backgrounds",
    status_code=status.HTTP_201_CREATED,
    # Faz 3'teki geçici `X-Admin-Secret` paylaşılan secret'ı Faz 4'te kaldırıldı
    # (kök CLAUDE.md ders 8'deki geçici çözüm kapandı). Artık geçerli bir
    # Supabase oturumu VE `admin_users` tablosunda kayıt gerekiyor.
    dependencies=[Depends(require_admin)],
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
    # `.get(..., "bin")`: `validate_upload` sadece `file.content_type`'ın
    # `settings.allowed_content_types` içinde olduğunu garanti eder — bu iki
    # küme (`allowed_content_types` ve `CONTENT_TYPE_TO_EXTENSION`) birbirinden
    # BAĞIMSIZ tanımlı. Biri env üzerinden genişletilip diğeri güncellenmezse
    # bare `[...]` erişimi `KeyError` ile 500'e sızardı; `.get` bunun yerine
    # genel bir `.bin` uzantısına düşerek savunmacı davranır.
    extension = CONTENT_TYPE_TO_EXTENSION.get(file.content_type, "bin")
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
) -> list[dict[str, str | int]]:
    result = await db.execute(
        select(Background)
        .where(Background.is_active.is_(True))
        .order_by(Background.created_at)
    )
    backgrounds = result.scalars().all()
    # `expires_in` (saniye) bilinçli olarak yanıtın parçası: dönen URL'ler
    # süreli imzalı R2 URL'leri ve süre `BACKGROUND_URL_EXPIRY_SECONDS` ile
    # sunucu tarafında yapılandırılabiliyor. Bu alan olmadan istemcinin tek
    # seçeneği süreyi kendi tarafına sabitlemek olurdu; sunucudaki ayar
    # değiştiği anda editör, süresi dolmuş URL'lerle SESSİZCE kırılırdı.
    # `ROADMAP.md` Faz 3 bunu açıkça uyarıyor ("önceki iterasyonda bu atlanıp
    # sessiz bir hata haline gelmişti, bu sefer baştan tasarlanmalı") — yenileme
    # zamanlamasının tek doğru kaynağı sunucu.
    #
    # Saniye cinsinden göreli süre tercih edildi (mutlak zaman damgası değil):
    # istemci saatinin sunucu saatiyle uyumlu olmasını gerektirmiyor.
    return [
        {
            "id": str(bg.id),
            "url": storage.generate_presigned_url(bg.r2_key),
            "expires_in": settings.background_url_expiry_seconds,
        }
        for bg in backgrounds
    ]
