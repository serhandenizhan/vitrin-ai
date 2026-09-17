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

    def _headers(self) -> dict[str, str]:
        key = settings.supabase_secret_key
        headers = {"apikey": key}
        # Eski `service_role` anahtarı bir JWT; `Authorization` başlığı da
        # isteniyor. Yeni `sb_secret_...` anahtarları JWT değil ve yalnızca
        # `apikey` başlığıyla gönderiliyor (Supabase API anahtarları dokümanı).
        if key.startswith("eyJ"):
            headers["Authorization"] = f"Bearer {key}"
        return headers

    async def get_user_email(self, user_id: uuid.UUID) -> str | None:
        """Bildirim göndermek için kullanıcının e-postası.

        `auth.users` doğrudan SORGULANMIYOR: şema Supabase'e ait ve sürümden
        sürüme değişebiliyor (bkz. modül açıklaması). Silme hangi yoldan
        yapılıyorsa okuma da aynı yoldan yapılıyor.
        """
        self.ensure_configured()
        url = f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}"
        try:
            async with httpx.AsyncClient(timeout=ADMIN_TIMEOUT_SECONDS) as client:
                response = await client.get(url, headers=self._headers())
        except httpx.HTTPError as exc:
            raise SupabaseAdminError("Kimlik doğrulama sunucusuna ulaşılamadı.") from exc
        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            raise SupabaseAdminError(
                f"Kullanıcı okunamadı (Supabase yanıtı: {response.status_code})."
            )
        email = response.json().get("email")
        return email if isinstance(email, str) and email else None

    async def get_user(self, user_id: uuid.UUID) -> dict | None:
        """Yönetici ekleme ve hesap silme onayı için kullanıcının kendi kaydı."""
        self.ensure_configured()
        url = f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}"
        try:
            async with httpx.AsyncClient(timeout=ADMIN_TIMEOUT_SECONDS) as client:
                response = await client.get(url, headers=self._headers())
        except httpx.HTTPError as exc:
            raise SupabaseAdminError("Kimlik doğrulama sunucusuna ulaşılamadı.") from exc
        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            raise SupabaseAdminError(
                f"Kullanıcı okunamadı (Supabase yanıtı: {response.status_code})."
            )
        return response.json()

    async def list_users(
        self, page: int, per_page: int, query: str | None = None
    ) -> list[dict]:
        """Admin panelinin kullanıcı listesi (Faz 6).

        `auth.users` DOĞRUDAN SORGULANMIYOR — gerekçe modül açıklamasında.

        ARAMA — davranış `supabase/auth` kaynağından doğrulandı (17.09.2026,
        `internal/api/admin.go` + `internal/models/user.go`). Üç somut sonuç ve
        her birinin buradaki karşılığı:

        1. `filter` şu koşula çevriliyor:
           `email LIKE '%f%' OR raw_user_meta_data->>'full_name' ILIKE '%f%'`.
           E-posta tarafı `ILIKE` DEĞİL `LIKE`, yani **büyük/küçük harfe
           duyarlı**. GoTrue e-postaları `strings.ToLower` ile saklıyor
           (`internal/api/mail.go`, `validateEmail`), bu yüzden sorgu buradan
           küçük harfe çevrilerek gönderiliyor — aksi hâlde "Musteri" yazan
           yönetici hiçbir sonuç görmezdi.
        2. `full_name` dalı BİZDE hiç çalışmıyor: uygulama profili
           `first_name` / `last_name` / `business_name` anahtarlarıyla yazıyor
           (`frontend/src/lib/profile.ts`), `full_name` diye bir alan yok.
           Yani arama fiilen **e-posta (ya da tam kullanıcı kimliği)** aramasıdır
           ve arayüzdeki etiket bunu söylemeli.
        3. Barındırılan projenin `auth` sürümü bu kaynaktan eski olabilir. Bu
           yüzden dönen sayfa burada bir kez daha süzülüyor: sürüm `filter`'ı
           yok sayarsa sonuç EKSİK olabilir ama asla YANLIŞ olmaz — arama
           kutusuna yazılanla eşleşmeyen bir kullanıcı listeye giremez.
        """
        self.ensure_configured()
        url = f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users"
        params: dict[str, str | int] = {"page": page, "per_page": per_page}
        if query:
            params["filter"] = query.strip().casefold()
        try:
            async with httpx.AsyncClient(timeout=ADMIN_TIMEOUT_SECONDS) as client:
                response = await client.get(url, headers=self._headers(), params=params)
        except httpx.HTTPError as exc:
            raise SupabaseAdminError("Kimlik doğrulama sunucusuna ulaşılamadı.") from exc
        if response.status_code >= 400:
            raise SupabaseAdminError(
                f"Kullanıcılar listelenemedi (Supabase yanıtı: {response.status_code})."
            )
        users = response.json().get("users") or []
        if query:
            needle = query.strip().casefold()
            users = [
                user
                for user in users
                if needle in str(user.get("email") or "").casefold()
                or needle == str(user.get("id") or "").casefold()
            ]
        return users

    async def delete_user(self, user_id: uuid.UUID) -> None:
        self.ensure_configured()
        headers = self._headers()

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
