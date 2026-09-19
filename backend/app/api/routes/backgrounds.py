from typing import Literal

from pydantic import BaseModel, ConfigDict
from fastapi import Form, Request
from app.core.auth import get_current_user
from fastapi.security import HTTPAuthorizationCredentials
from app.services.billing.entitlements import background_tier
from app.services.billing.limits import limit_admin, limit_scoped
from app.services.billing.provider import get_provider
import uuid

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, require_admin
from app.core.config import settings
from app.core.db import get_db_session
from app.services import admin_audit
from app.models.background import Background
from app.services.background_images import make_thumbnail, thumbnail_key
from app.services.storage import (
    R2StorageService,
    delete_objects_quietly,
    get_storage_service,
)
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
    tier: Literal["basic", "full"] = Form("basic"),
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
    # Stüdyodaki zemin seçici için küçük önizleme (bkz. services/background_images.py).
    # Anahtar zeminin anahtarından türetiliyor; veritabanına yeni sütun yok.
    thumbnail = await run_in_threadpool(make_thumbnail, content)

    # İki ayrı yükleme var ve YETİMLİK İKİ YÖNE de işliyor: ikinci yükleme
    # (küçük önizleme) ya da DB satırı başarısız olduğunda ilk nesne R2'ye
    # çoktan yazılmış olur, ama anahtarını bilen hiçbir kayıt kalmaz — nesne
    # erişilemez biçimde yer tutmaya devam eder. (PR #18 incelemesinde
    # bucket'ta gerçek bir örneği bulundu.) Bu yüzden başarıyla yüklenen her
    # anahtar takip ediliyor ve hata yolunda geri siliniyor.
    uploaded: list[str] = []
    try:
        await storage.upload(r2_key, content, file.content_type)
        uploaded.append(r2_key)
        await storage.upload(thumbnail_key(r2_key), thumbnail, "image/jpeg")
        uploaded.append(thumbnail_key(r2_key))
    except (BotoCoreError, ClientError) as exc:
        await delete_objects_quietly(storage, uploaded)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Arka plan depolamaya yüklenemedi.",
        ) from exc

    try:
        db.add(Background(id=background_id, r2_key=r2_key, tier=tier))
        await db.commit()
    except Exception:
        await delete_objects_quietly(storage, uploaded)
        raise

    return {"id": str(background_id)}


@router.get(
    "/api/admin/backgrounds",
    dependencies=[Depends(require_admin)],
)
async def list_admin_backgrounds(
    request: Request,
    admin: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    storage: R2StorageService = Depends(get_storage_service),
) -> list[dict[str, object]]:
    """Zemin yönetim paneli (Faz 6, Kaan) — kütüphanenin TAMAMI.

    `GET /api/backgrounds`ten iki farkı var ve ikisi de bilinçli: kotaya/pakete
    hiç bakmıyor (yönetici her iki `tier`ı da görmeli) ve **pasif zeminleri de
    döndürüyor** — panelin asıl işi, kullanıcıya gitmeyen bir zeminin neden
    gitmediğini gösterebilmek. Hız sınırı okuma ucu olduğu için fail-open
    (`limit_scoped`); Redis arızası paneli karartmasın (modül başlığındaki
    fail-open/fail-closed kuralı).
    """
    await limit_scoped(request, "admin", admin.id)
    result = await db.execute(select(Background).order_by(Background.created_at.desc()))
    return [
        {
            "id": str(bg.id),
            "tier": bg.tier,
            "is_active": bg.is_active,
            "created_at": bg.created_at.isoformat(),
            "url": storage.generate_presigned_url(bg.r2_key),
            "thumbnail_url": storage.generate_presigned_url(thumbnail_key(bg.r2_key)),
            "expires_in": settings.background_url_expiry_seconds,
        }
        for bg in result.scalars().all()
    ]


class BackgroundUpdate(BaseModel):
    """`PATCH /api/admin/backgrounds/{id}` gövdesi — iki alan da isteğe bağlı."""

    model_config = ConfigDict(extra="forbid")

    tier: Literal["basic", "full"] | None = None
    is_active: bool | None = None


@router.patch(
    "/api/admin/backgrounds/{background_id}",
    dependencies=[Depends(require_admin), Depends(limit_admin)],
)
async def update_background(
    background_id: uuid.UUID,
    payload: BackgroundUpdate,
    admin: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, object]:
    """Zeminin paketini ve yayın durumunu değiştirir (Faz 6, Kaan).

    PASİF = SİLİNMİŞ DEĞİL: satır ve R2 nesneleri yerinde kalır, zemin yalnızca
    kullanıcıya giden listeden çıkar. Kaan'ın kararı (19.09.2026): bir zemini
    kütüphaneden çekmenin normal yolu bu; silme geri alınamaz olduğu için ayrı
    bir iş.

    Hız sınırı **fail-closed** (`limit_admin`): burası yazan bir uç, okuma
    tarafındaki fail-open gerekçesi burada geçerli değil.
    """
    fields = payload.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Değiştirilecek bir alan gönderin.",
        )

    result = await db.execute(select(Background).where(Background.id == background_id))
    background = result.scalar_one_or_none()
    if background is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zemin bulunamadı.")

    # Denetim satırı YALNIZ durumu gerçekten değiştiren istekte yazılır (Faz 6
    # kuralı 5): aynı değeri ikinci kez göndermek günlükte olmamış bir eylem
    # göstermemeli.
    changed = {
        name: value
        for name, value in fields.items()
        if getattr(background, name) != value
    }
    if changed:
        before = {name: getattr(background, name) for name in changed}
        for name, value in changed.items():
            setattr(background, name, value)
        await admin_audit.record(
            db,
            admin.id,
            "background_update",
            "background",
            str(background_id),
            {"before": before, "after": changed},
        )
        await db.commit()

    return {
        "id": str(background.id),
        "tier": background.tier,
        "is_active": background.is_active,
    }


@router.delete(
    "/api/admin/backgrounds/{background_id}",
    dependencies=[Depends(require_admin), Depends(limit_admin)],
)
async def delete_background(
    background_id: uuid.UUID,
    admin: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    storage: R2StorageService = Depends(get_storage_service),
) -> dict[str, str]:
    """Zemini kalıcı olarak siler — geri alınamaz (Faz 6, Kaan).

    SIRA BİLİNÇLİ: önce veritabanı satırı, sonra R2 nesneleri. Ters sırada bir
    hata, "satır duruyor ama gösterdiği dosya yok" durumunu üretirdi; bu,
    sahipsiz bir nesneden daha kötüdür (ders 25) çünkü kullanıcıya kırık bir
    zemin gösterilir. Nesne silme patlarsa yalnızca yer tutan bir dosya kalır
    ve bu log'lanır.

    Geçmiş çalışmalar bu zemini kullanmış olabilir; onlar sonucu kendi PNG'si
    olarak sakladığı için etkilenmez.
    """
    result = await db.execute(select(Background).where(Background.id == background_id))
    background = result.scalar_one_or_none()
    if background is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zemin bulunamadı.")

    r2_key = background.r2_key
    await db.delete(background)
    await admin_audit.record(
        db, admin.id, "background_delete", "background", str(background_id), {"r2_key": r2_key}
    )
    await db.commit()

    # Satır gitti; nesneler artık kimsenin ulaşamadığı yer tutuculardır.
    # `delete_objects_quietly` hatayı yutup log'luyor — bir depolama arızası,
    # kullanıcının gözünde zaten tamamlanmış olan silmeyi 500'e çevirmemeli.
    await delete_objects_quietly(storage, [r2_key, thumbnail_key(r2_key)])
    return {"id": str(background_id)}


@router.get("/api/backgrounds")
async def list_backgrounds(
    request: Request,
    provider=Depends(get_provider),
    db: AsyncSession = Depends(get_db_session),
    storage: R2StorageService = Depends(get_storage_service),
) -> list[dict[str, str | int]]:
    # LİSTELEME KOTA KAPISI DEĞİL. Asıl kapı `POST /api/remove-background`'daki
    # rezervasyon; burada `background_tier()` hatası yalnızca "full zeminleri
    # isteyemez" demektir, "hiç zemin yok" DEMEZ. Eskiden `background_tier`
    # 403/409 fırlattığında vekil boş liste dönüyor ve editör sessizce gradyan
    # yer tutucuya düşüyordu: ödemesi yenilenirken 60 saniyelik
    # `billing_renewal_pending` penceresine denk gelen müşteri hiçbir hata
    # mesajı görmeden zemin kütüphanesini kaybediyordu.
    tier = "basic"
    user = None
    authorization = request.headers.get("Authorization")
    if authorization:
        scheme, _, token = authorization.partition(" ")
        user = await get_current_user(HTTPAuthorizationCredentials(scheme=scheme, credentials=token), request)
    await limit_scoped(request, "backgrounds", user.id if user else None)
    if user:
        try:
            tier = await background_tier(db, user.id, provider)
        except HTTPException as exc:
            # Kimlik hatası (401) gerçek hatadır; kota/abonelik kararları
            # (402/403/409) listeyi `basic`e düşürür, boşaltmaz.
            if exc.status_code not in (402, 403, 409):
                raise
            await db.rollback()
            tier = "basic"
    result = await db.execute(
        select(Background)
        .where(Background.is_active.is_(True), Background.tier.in_(("basic", "full") if tier == "full" else ("basic",)))
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
            # Önizleme anahtarı zeminin anahtarından türetiliyor. Önizlemesi
            # olmayan eski bir kayıtta bu adres 404 verir; frontend o durumda
            # tam boyutlu `url`e düşüyor.
            "thumbnail_url": storage.generate_presigned_url(thumbnail_key(bg.r2_key)),
            "expires_in": settings.background_url_expiry_seconds,
        }
        for bg in backgrounds
    ]
