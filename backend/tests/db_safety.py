"""Test oturumunun bağlandığı veritabanının atılabilir olduğunu doğrular.

NEDEN: test paketi bağlandığı veritabanını SIFIRLIYOR — her testten sonra
tablolarla birlikte `auth.users`'ı siliyor, oturum sonunda `alembic downgrade
base` çalıştırıyor. Bağlantı `backend/.env`'deki `DATABASE_URL`'den geliyor ve
Faz 4 kurulumunda o dosyaya Supabase'in adresi yazılıyor. Bu koruma olmadan
`pytest` çalıştırmak Supabase'deki gerçek kullanıcıların hepsini silerdi — code
review'da bulundu ve sahte bir Supabase veritabanında birebir gösterildi
("gerçek müşteri" satırı tek bir test dosyasıyla silindi).

KURAL: `auth` şeması yoksa (yeni kurulmuş düz Postgres — migration 0002
uyumluluk katmanını kuracak) ya da varsa ama 0002'nin işaretini taşıyorsa
testler çalışır. `auth` şeması başka birine aitse (Supabase) test oturumu,
veritabanına tek bir değişiklik yapılmadan durdurulur.
"""

import importlib.util
from pathlib import Path

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


def ensure_disposable_database(*, has_auth_schema: bool, auth_schema_comment: str | None) -> None:
    if has_auth_schema and auth_schema_comment != LOCAL_AUTH_SHIM_MARKER:
        raise UnsafeTestDatabaseError(
            "Testler durduruldu: DATABASE_URL yerel test veritabanını göstermiyor — "
            "`auth` şeması var ama yerel uyumluluk katmanına ait değil (büyük olasılıkla "
            "Supabase). Test paketi bağlandığı veritabanındaki tabloları ve auth.users'ı "
            "siliyor. Testleri yerel bir Postgres'e yönlendirin, örn. "
            "DATABASE_URL=postgresql+asyncpg://vitrin_ai:change_me_locally@localhost:5434/vitrin_ai"
        )
