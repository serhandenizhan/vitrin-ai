"""Supabase Auth yönetici API'si (Faz 4) — şu an yalnızca kullanıcı silme.

NEDEN veritabanından `delete from auth.users` DEĞİL: `auth` şeması Supabase'e
ait ve iç tabloları (oturumlar, kimlikler, yenileme token'ları) sürümden sürüme
değişebiliyor. Supabase kullanıcıyı kendi API'siyle silmeyi öneriyor; o yol
oturumları ve ilişkili kayıtları da tutarlı biçimde kaldırıyor.
`public.projects` ve `public.admin_users` satırları `ON DELETE CASCADE` ile
gidiyor (migration 0003).

Gizli anahtar (`SUPABASE_SECRET_KEY`) RLS'i atlayan tam yetkili bir anahtar:
hiçbir hata mesajına ya da log satırına yazılmıyor.
"""

import uuid

import httpx

from app.core.config import settings

ADMIN_TIMEOUT_SECONDS = 10


class SupabaseAdminConfigurationError(RuntimeError):
    """Gizli anahtar ya da proje adresi ayarlanmamış."""


class SupabaseAdminError(RuntimeError):
    """Supabase isteği reddetti ya da ulaşılamadı."""


class SupabaseAdminService:
    def ensure_configured(self) -> None:
        # Hesap silme akışı HİÇBİR şeye dokunmadan önce bunu çağırıyor: anahtar
        # yokken R2 görselleri silinip hesap silinemeseydi kullanıcı yarım
        # silinmiş bir hesapla kalırdı.
        if not settings.supabase_url or not settings.supabase_secret_key:
            raise SupabaseAdminConfigurationError(
                "Hesap silme yapılandırılmamış; sunucuda SUPABASE_SECRET_KEY ayarlanmalı."
            )

    async def delete_user(self, user_id: uuid.UUID) -> None:
        self.ensure_configured()
        key = settings.supabase_secret_key
        headers = {"apikey": key}
        # Eski `service_role` anahtarı bir JWT; `Authorization` başlığı da
        # isteniyor. Yeni `sb_secret_...` anahtarları JWT değil ve yalnızca
        # `apikey` başlığıyla gönderiliyor (Supabase API anahtarları dokümanı).
        if key.startswith("eyJ"):
            headers["Authorization"] = f"Bearer {key}"

        url = f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}"
        try:
            async with httpx.AsyncClient(timeout=ADMIN_TIMEOUT_SECONDS) as client:
                response = await client.delete(url, headers=headers)
        except httpx.HTTPError as exc:
            raise SupabaseAdminError("Kimlik doğrulama sunucusuna ulaşılamadı.") from exc

        # 404: kullanıcı zaten yok (yarım kalmış bir silmenin tekrarı) — sonuç aynı.
        if response.status_code == 404:
            return
        if response.status_code >= 400:
            # Yanıt gövdesi hata mesajına konmuyor: içinde istek ayrıntıları olabilir.
            raise SupabaseAdminError(
                f"Kullanıcı silinemedi (Supabase yanıtı: {response.status_code})."
            )


def get_supabase_admin() -> SupabaseAdminService:
    return SupabaseAdminService()
