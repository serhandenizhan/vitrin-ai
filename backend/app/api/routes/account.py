"""Hesap işlemleri (Faz 4) — kullanıcının kendi hesabını silmesi.

KVKK silme hakkı: kullanıcı hesabını sildiğinde kişisel verisi de gitmeli.
Veritabanı tarafı cascade ile kendiliğinden temizleniyor; R2'deki proje
görselleri ise o zincirin dışında (bkz. ROADMAP Faz 4 "Bilinen sınır") ve burada
ayrıca siliniyor.

SIRA — her adım yarıda kalırsa tekrar denemek güvenli olacak şekilde:
  1. Yapılandırma kontrolü: gizli anahtar yoksa HİÇBİR şey silinmiyor.
  2. R2 görselleri (`projects/<user_id>/`). Başarısızsa hesap duruyor; kullanıcı
     tekrar deneyebiliyor, silme idempotent.
  3. Supabase kullanıcısı. Başarısızsa görseller gitmiş ama hesap duruyor;
     tekrar denemede 2. adım boş önekle hızla geçip 3. adım yeniden deneniyor.
Ters sıra (önce hesap) daha kötü olurdu: hesap silindikten sonra R2 hatası
alınırsa görseller, sahibi artık giriş yapıp tekrar deneyemeyeceği için yetim
kalırdı.
"""

import logging

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.core.auth import CurrentUser, get_current_user
from app.services.storage import R2ConfigurationError, R2StorageService, get_storage_service
from app.services.supabase_admin import (
    SupabaseAdminConfigurationError,
    SupabaseAdminError,
    SupabaseAdminService,
    get_supabase_admin,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.delete("/api/account", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    user: CurrentUser = Depends(get_current_user),
    storage: R2StorageService = Depends(get_storage_service),
    admin: SupabaseAdminService = Depends(get_supabase_admin),
) -> Response:
    try:
        admin.ensure_configured()
    except SupabaseAdminConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    # Önek sunucudaki kullanıcı kimliğinden; istemciden gelen hiçbir değer
    # anahtara girmiyor (başkasının görsellerini silmek mümkün değil).
    try:
        deleted = await storage.delete_prefix(f"projects/{user.id}/")
    except R2ConfigurationError as exc:
        # `R2ConfigurationError` bir `RuntimeError`; aşağıdaki genel dala
        # düşseydi kullanıcı "görselleriniz silinemedi" gibi yanıltıcı bir
        # mesaj görürdü. Henüz hiçbir şey silinmedi, sorun sunucu yapılandırması.
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except (BotoCoreError, ClientError, RuntimeError) as exc:
        logger.warning("Hesap silme: R2 görselleri silinemedi (kullanıcı %s)", user.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Görselleriniz silinemedi, hesabınız silinmedi. Birkaç dakika sonra tekrar deneyin.",
        ) from exc

    try:
        await admin.delete_user(user.id)
    except SupabaseAdminError as exc:
        logger.warning(
            "Hesap silme: %d görsel silindi ama kullanıcı silinemedi (kullanıcı %s)",
            deleted,
            user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Hesabınız silinemedi. Birkaç dakika sonra tekrar deneyin.",
        ) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)
