"""
Production'daki zemin kütüphanesini (`backgrounds` satırları) yerel geliştirme
veritabanına kopyalar.

Neden gerekli: zemin GÖRSELLERİ R2'de ve R2 yerelde de production'la ortak;
ama hangi zeminlerin var olduğu `backgrounds` tablosunda. `./execute.sh`'ın
yerel Postgres'inde bu tablo boş olduğu için stüdyo yalnız sade zeminleri,
admin panelinin Zeminler sekmesi boş liste gösteriyordu.

Kaynak: `backend/.env.supabase` içindeki `DATABASE_URL` (execute-supabase.sh ile
aynı dosya). Kaynaktan YALNIZCA OKUNUR. Hedef: `backend/.env`'deki yerel
veritabanı; yalnız 0002'nin işaretlediği yerel şim ise yazılır.

Yerelde silme/yükleme bu satırları production'la ayrıştırabilir; her açılışta
production'daki değer yeniden yazılır. Betik yalnız EKLER ve GÜNCELLER:
production'da silinen bir zemin yerelde kalır, yerelde yüklenen bir zemin de
silinmez.

Bucket ortak olduğu için yerelde zemin silmek R2 nesnesini SİLMEMELİ;
execute.sh bu yüzden backend'i `R2_SHARED_WITH_PRODUCTION=true` ile başlatır
(bkz. app/core/config.py).

Ağ Postgres portunu (5432) engelliyorsa bağlantı kısa bir zaman aşımıyla
düşer ve yerel tablo son eşitlemedeki hâliyle kalır; sistem yine açılır.

Kullanım (execute.sh her açılışta çağırır):
  .venv/bin/python scripts/sync_local_backgrounds.py

Çıkış kodu: 0 = tamam, 1 = kaynak yok / ulaşılamadı, 2 = hedef yerel şim
değil ya da kaynak production değil (hiçbir şey yazılmadı).
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import dotenv_values  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.exc import DBAPIError  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine  # noqa: E402

from app.core.config import BACKEND_ENV_FILE, settings  # noqa: E402

SUPABASE_ENV_FILE = BACKEND_ENV_FILE.parent / ".env.supabase"
# 0002_local_supabase_auth_shim.py'deki SHIM_MARKER ile aynı olmalı.
SHIM_MARKER = "vitrin-ai yerel Supabase uyumluluk katmani"
CONNECT_TIMEOUT_SECONDS = 10
COLUMNS = ("id", "r2_key", "tier", "is_active", "created_at")


async def auth_schema_marker(conn: AsyncConnection) -> str | None:
    return (
        await conn.execute(
            text(
                "select obj_description(oid, 'pg_namespace') "
                "from pg_namespace where nspname = 'auth'"
            )
        )
    ).scalar()


async def main() -> int:
    source_url = dotenv_values(SUPABASE_ENV_FILE).get("DATABASE_URL") if SUPABASE_ENV_FILE.exists() else None
    if not source_url:
        print(f"atlandı: {SUPABASE_ENV_FILE.name} ya da içindeki DATABASE_URL yok.", file=sys.stderr)
        return 1

    target = create_async_engine(settings.database_url)
    source = create_async_engine(
        source_url,
        connect_args={"timeout": CONNECT_TIMEOUT_SECONDS, "command_timeout": 30},
    )
    try:
        async with target.connect() as conn:
            if await auth_schema_marker(conn) != SHIM_MARKER:
                print(
                    "atlandı: hedef veritabanı yerel şim değil (gerçek Supabase olabilir) "
                    "— hiçbir şey yazılmadı.",
                    file=sys.stderr,
                )
                return 2

        try:
            async with source.connect() as conn:
                if await auth_schema_marker(conn) == SHIM_MARKER:
                    print(
                        "atlandı: kaynak veritabanı da yerel şim; .env.supabase "
                        "production'ı göstermiyor.",
                        file=sys.stderr,
                    )
                    return 2
                rows = (
                    await conn.execute(text(f"select {', '.join(COLUMNS)} from backgrounds"))
                ).mappings().all()
        except (OSError, asyncio.TimeoutError, DBAPIError) as exc:
            print(
                f"atlandı: Supabase veritabanına ulaşılamadı ({type(exc).__name__}); "
                "ağ 5432 portunu engelliyor olabilir. Yerel zeminler son eşitlemedeki hâliyle kalıyor.",
                file=sys.stderr,
            )
            return 1

        async with target.begin() as conn:
            added = 0
            for row in rows:
                result = await conn.execute(
                    text(
                        "insert into backgrounds (id, r2_key, tier, is_active, created_at) "
                        "values (:id, :r2_key, :tier, :is_active, :created_at) "
                        "on conflict (id) do update set "
                        "r2_key = excluded.r2_key, tier = excluded.tier, "
                        "is_active = excluded.is_active, created_at = excluded.created_at "
                        "returning (xmax = 0) as inserted"
                    ),
                    dict(row),
                )
                added += int(bool(result.scalar()))

        print(f"  {len(rows)} zemin eşitlendi ({added} yeni).")
        return 0
    finally:
        await source.dispose()
        await target.dispose()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
