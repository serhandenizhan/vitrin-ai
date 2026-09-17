"""Hesap silme talebi: worker uzak iptali, ardından R2 ve Auth temizliğini tamamlar."""
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db_session
from app.services.billing.db import one, execute, enqueue
from fastapi.responses import JSONResponse
import secrets

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.core.auth import CurrentUser, get_current_user
from app.services.storage import R2StorageService, get_storage_service
from app.services.supabase_admin import (
    SupabaseAdminConfigurationError,
    SupabaseAdminService,
    get_supabase_admin,
)

router = APIRouter()


class AccountDeletionConfirmation(BaseModel):
    """Geri dondurulemez silme icin kullanicinin yazdigi e-posta."""

    email: str = Field(min_length=1, max_length=254)


def same_email(left: str, right: str) -> bool:
    return secrets.compare_digest(
        left.strip().casefold().encode("utf-8"),
        right.strip().casefold().encode("utf-8"),
    )


@router.delete("/api/account", status_code=status.HTTP_202_ACCEPTED)
async def delete_account(
    confirmation: AccountDeletionConfirmation,
    user: CurrentUser = Depends(get_current_user),
    storage: R2StorageService = Depends(get_storage_service),
    admin: SupabaseAdminService = Depends(get_supabase_admin),
    db: AsyncSession = Depends(get_db_session),
) -> Response:
    # Arayuzdeki e-posta yazma adimi yalnizca bir gorunum engeli degil:
    # dogrudan API istegi de ayni geri dondurulemez onayi kanitlamali.
    if not user.email or not same_email(confirmation.email, user.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hesabı silmek için oturumdaki e-posta adresini doğru yazın.",
        )

    try:
        admin.ensure_configured()
    except SupabaseAdminConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    subscription = await one(db, "SELECT * FROM subscriptions WHERE user_id=:uid FOR UPDATE", uid=user.id)
    if not subscription:
        raise HTTPException(status_code=401, detail="Hesap bulunamadı.")
    await execute(db, "UPDATE subscriptions SET deletion_requested_at=COALESCE(deletion_requested_at,now()) WHERE user_id=:uid", uid=user.id)
    action = await enqueue(db, user.id, "delete_account", user.id, "delete:" + str(user.id))
    await db.commit()
    return JSONResponse(status_code=202, content={"action_id": str(action["id"]), "status": action["status"]})
