"""Test oturumunun bağlandığı veritabanının atılabilir olduğunu doğrular.

NEDEN: test paketi bağlandığı veritabanını SIFIRLIYOR — her testten sonra
tablolarla birlikte `auth.users`'ı siliyor, oturum sonunda `alembic downgrade
base` çalıştırıyor. Bağlantı `backend/.env`'deki `DATABASE_URL`'den geliyor ve
Faz 4 kurulumunda o dosyaya Supabase'in adresi yazılıyor. Bu koruma olmadan
`pytest` çalıştırmak Supabase'deki gerçek kullanıcıların hepsini silerdi — code
review'da bulundu ve sahte bir Supabase veritabanında birebir gösterildi
("gerçek müşteri" satırı tek bir test dosyasıyla silindi).

KURAL, İKİ AŞAMA:
1. BAĞLANMADAN ÖNCE adres: `DATABASE_URL`'in sunucusu yerel değilse (localhost,
   127.0.0.1, ::1 ya da docker-compose servis adı `postgres`) oturum durdurulur.
   Açıkça istenirse `VITRIN_ALLOW_REMOTE_TEST_DB=1` ile geçilebilir (ör. CI'daki
   ayrı bir test veritabanı).
2. Bağlandıktan sonra şema: `auth` şeması yoksa (yeni kurulmuş düz Postgres —
   migration 0002 uyumluluk katmanını kuracak) ya da varsa ama 0002'nin
   işaretini taşıyorsa testler çalışır. `auth` şeması başka birine aitse
   (Supabase) test oturumu, veritabanına tek bir değişiklik yapılmadan durdurulur.

Neden adres kontrolü de var (PR #12 incelemesi, 13.09.2026): yalnızca şema
kontrolü, `auth` şeması OLMAYAN uzak bir veritabanını (Supabase dışı bir
sunucu, başka bir projenin Postgres'i) "yeni kurulmuş düz Postgres" sanıp
sıfırlardı. Adres, yıkıcı bir işlemden önce bakılabilecek en ucuz ve en kesin
işaret.
"""

import importlib.util
import os
from pathlib import Path

from sqlalchemy.engine import make_url

#: Test veritabanı olarak kabul edilen sunucular. `postgres`: docker-compose
#: içinden bağlanan bir konteynerde servisin adı.
LOCAL_DATABASE_HOSTS = frozenset({"localhost", "127.0.0.1", "::1", "postgres"})

#: Uzak bir test veritabanını bilinçli olarak kabul etmek için.
ALLOW_REMOTE_ENV = "VITRIN_ALLOW_REMOTE_TEST_DB"

_SHIM_MIGRATION = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "0002_local_supabase_auth_shim.py"
)

AUTH_SCHEMA_COMMENT_SQL = (
    "select obj_description(oid, 'pg_namespace') from pg_namespace where nspname = 'auth'"
)


def _load_shim_marker() -> str:
    # İşaret migration'dan okunuyor, kopyalanmıyor: iki kopya ayrışsaydı
    # koruma ya her veritabanını reddeder ya da hiçbirini tanımazdı.
    spec = importlib.util.spec_from_file_location("_local_auth_shim_migration", _SHIM_MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.SHIM_MARKER


LOCAL_AUTH_SHIM_MARKER = _load_shim_marker()


class UnsafeTestDatabaseError(RuntimeError):
    pass


def ensure_local_database_host(database_url: str, environ: dict[str, str] | None = None) -> None:
    """Veritabanına HİÇ bağlanmadan önce adresin yerel olduğunu doğrular.

    Hata mesajı adresi yazmıyor: bağlantı dizesi parola içeriyor ve test
    çıktısı CI loglarına düşebilir.
    """
    env = os.environ if environ is None else environ
    if env.get(ALLOW_REMOTE_ENV) == "1":
        return
    host = (make_url(database_url).host or "").lower()
    if host not in LOCAL_DATABASE_HOSTS:
        raise UnsafeTestDatabaseError(
            "Testler durduruldu: DATABASE_URL yerel bir veritabanını göstermiyor "
            f"(sunucu yerel değil). Test paketi bağlandığı veritabanını siliyor. "
            "Yerel bir Postgres'e yönlendirin, örn. "
            "DATABASE_URL=postgresql+asyncpg://vitrin_ai:change_me_locally@localhost:5434/vitrin_ai "
            f"— uzak bir TEST veritabanı bilinçli olarak kullanılacaksa {ALLOW_REMOTE_ENV}=1."
        )


def ensure_disposable_database(*, has_auth_schema: bool, auth_schema_comment: str | None) -> None:
    if has_auth_schema and auth_schema_comment != LOCAL_AUTH_SHIM_MARKER:
        raise UnsafeTestDatabaseError(
            "Testler durduruldu: DATABASE_URL yerel test veritabanını göstermiyor — "
            "`auth` şeması var ama yerel uyumluluk katmanına ait değil (büyük olasılıkla "
            "Supabase). Test paketi bağlandığı veritabanındaki tabloları ve auth.users'ı "
            "siliyor. Testleri yerel bir Postgres'e yönlendirin, örn. "
            "DATABASE_URL=postgresql+asyncpg://vitrin_ai:change_me_locally@localhost:5434/vitrin_ai"
        )
