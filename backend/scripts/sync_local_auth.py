"""
Yerel geliştirme veritabanına gerçek Supabase kullanıcılarını aktarır.

Neden gerekli: `./execute.sh` Postgres için yerel Docker kullanıyor. Girişi
yine gerçek Supabase Auth yapıyor, ama backend'in baktığı `auth.users` bu
veritabanında 0002'nin yerel uyumluluk katmanı (şim) ve BOŞ. Sonuç: gerçek bir
hesapla giriş yapılınca `/api/subscriptions/me` 401 dönüyor ve admin paneli hiç
görünmüyor. Bu betik kullanıcıları Supabase'in yönetici API'sinden (HTTPS)
okuyup yerel `auth.users`'a yazar. Satır eklenince `billing_signup` trigger'ı
abonelik satırını kendisi açar; bu, production'daki kayıt yoluyla aynıdır.

Yönetici yetkisi Supabase API'sinde yok (`admin_users` bizim tablomuz). Yerelde
kimin yönetici olacağı `backend/.env` içindeki `LOCAL_ADMIN_EMAILS`
(virgülle ayrılmış e-postalar) ile verilir. Betik yalnızca EKLER: listeden
çıkarılan bir e-postanın yerel yetkisi kendiliğinden geri alınmaz, Supabase'de
silinen bir kullanıcı da yerelde kalır.

GÜVENLİK: betik yalnızca 0002'nin işaretlediği YEREL şimde yazar. Bağlandığı
veritabanı gerçek Supabase ise (`auth` şeması şim işaretini taşımıyorsa) hiçbir
şeye dokunmadan çıkar — production `auth.users`'ına elle satır yazmak Supabase
Auth'un tablosunu bozardı.

Kullanım (execute.sh bunu her açılışta kendisi çağırır):
  .venv/bin/python scripts/sync_local_auth.py

Çıkış kodu: 0 = tamam, 1 = Supabase'e ulaşılamadı / yapılandırma eksik,
2 = hedef veritabanı yerel şim değil (hiçbir şey yazılmadı).
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pydantic_settings import BaseSettings, SettingsConfigDict  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from app.core.config import BACKEND_ENV_FILE, settings  # noqa: E402
from app.services.supabase_admin import (  # noqa: E402
    SupabaseAdminConfigurationError,
    SupabaseAdminError,
    SupabaseAdminService,
)

# 0002_local_supabase_auth_shim.py'deki SHIM_MARKER ile aynı olmalı.
SHIM_MARKER = "vitrin-ai yerel Supabase uyumluluk katmani"
PER_PAGE = 1000


class SyncSettings(BaseSettings):
    # Yalnız bu betiğin ayarı; uygulamanın Settings'ine bilinçli olarak
    # eklenmedi (geliştirme aracı, üretimde anlamı yok).
    model_config = SettingsConfigDict(env_file=BACKEND_ENV_FILE, extra="ignore")
    local_admin_emails: str = ""


async def fetch_all_users(admin: SupabaseAdminService) -> list[dict]:
    users: list[dict] = []
    page = 1
    while True:
        batch = await admin.list_users(page=page, per_page=PER_PAGE)
        users.extend(batch)
        if len(batch) < PER_PAGE:
            return users
        page += 1


async def main() -> int:
    engine = create_async_engine(settings.database_url)
    try:
        async with engine.connect() as conn:
            marker = (
                await conn.execute(
                    text(
                        "select obj_description(oid, 'pg_namespace') "
                        "from pg_namespace where nspname = 'auth'"
                    )
                )
            ).scalar()
        if marker != SHIM_MARKER:
            print(
                "atlandı: hedef veritabanının auth şeması yerel şim değil "
                "(gerçek Supabase olabilir) — hiçbir şey yazılmadı.",
                file=sys.stderr,
            )
            return 2

        admin = SupabaseAdminService()
        try:
            users = await fetch_all_users(admin)
        except SupabaseAdminConfigurationError as exc:
            print(f"atlandı: {exc}", file=sys.stderr)
            return 1
        except SupabaseAdminError as exc:
            print(f"atlandı: {exc}", file=sys.stderr)
            return 1

        admin_emails = {
            e.strip().casefold()
            for e in SyncSettings().local_admin_emails.split(",")
            if e.strip()
        }

        added = 0
        async with engine.begin() as conn:
            for user in users:
                result = await conn.execute(
                    text(
                        "insert into auth.users (id, email, raw_user_meta_data) "
                        "values (:id, :email, cast(:meta as jsonb)) "
                        "on conflict (id) do update set "
                        "email = excluded.email, "
                        "raw_user_meta_data = excluded.raw_user_meta_data "
                        "returning (xmax = 0) as inserted"
                    ),
                    {
                        "id": user["id"],
                        "email": user.get("email"),
                        "meta": json.dumps(user.get("user_metadata") or {}),
                    },
                )
                added += int(bool(result.scalar()))

            admins = [
                u for u in users if str(u.get("email") or "").casefold() in admin_emails
            ]
            for user in admins:
                await conn.execute(
                    text(
                        "insert into public.admin_users (user_id) values (:id) "
                        "on conflict (user_id) do nothing"
                    ),
                    {"id": user["id"]},
                )

        missing = admin_emails - {str(u.get("email") or "").casefold() for u in admins}
        print(
            f"  {len(users)} kullanıcı eşitlendi ({added} yeni), "
            f"{len(admins)} yerel yönetici."
        )
        if missing:
            print(
                "  UYARI: LOCAL_ADMIN_EMAILS içindeki şu adresler Supabase'de yok: "
                + ", ".join(sorted(missing)),
                file=sys.stderr,
            )
        return 0
    finally:
        await engine.dispose()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
