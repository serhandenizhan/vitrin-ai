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

3. Bağlanmadan önce, `execute.sh`'ın GELİŞTİRME veritabanı mı: yerel sunucu +
   port 5432 + ad `vitrin_ai` (`docker-compose.yml` varsayılanları) ise oturum
   durur ve doğru komutu (`backend/scripts/test.sh`) söyler. 27.09.2026'da
   `DATABASE_URL` verilmeden koşturulan `pytest`, `execute.sh` açıkken onun
   veritabanını sildi: adres yereldi ve şema 0002 işaretini taşıyordu, yani
   ilk iki kontrol ona "atılabilir" diyordu. Bilerek geçmek için
   `VITRIN_ALLOW_DEV_DB_RESET=1`. CI'ın `vitrin_ai_test`'i ve `test.sh`'ın
   5434'teki veritabanı bu kurala takılmaz.
4. Bağlandıktan sonra, oturum boyunca bir danışma kilidi (`SESSION_LOCK_KEY`):
   aynı veritabanında ikinci bir test oturumu kilidi alamaz ve hiçbir şeye
   dokunmadan durur. 27.09.2026'da iki oturum aynı test veritabanında
   çakıştı ve birbirinin tablolarını düşürdü.

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

#: `execute.sh`'ın geliştirme veritabanını bilinçli olarak sıfırlamak için.
ALLOW_DEV_DB_RESET_ENV = "VITRIN_ALLOW_DEV_DB_RESET"

#: `execute.sh`/`docker-compose.yml`'in geliştirme veritabanı: varsayılan port
#: ve ad. (`POSTGRES_PORT`/`POSTGRES_DB` ile değiştirilmiş bir geliştirme
#: veritabanını bu kural tanımaz; o kurulumda testler `test.sh` ile koşulur.)
DEV_DATABASE_PORT = 5432
DEV_DATABASE_NAME = "vitrin_ai"

#: Testleri doğru veritabanında koşturan tek komut.
TEST_COMMAND = "backend/scripts/test.sh"

#: Test oturumunun veritabanında tuttuğu danışma kilidi (`pg_try_advisory_lock`).
#: Sabit, projeye özgü bir sayı: aynı veritabanında iki test oturumu aynı anda
#: koşamaz (ikincisi birincinin tablolarını oturum sonunda düşürürdü).
SESSION_LOCK_KEY = 7_411_020_260_927


def concurrent_session_message() -> str:
    return (
        "Testler durduruldu: bu test veritabanını şu an BAŞKA bir test oturumu "
        "kullanıyor (kilit alınamadı). İkisi aynı anda koşsaydı biri diğerinin "
        "tablolarını silerdi. Hiçbir şeye dokunulmadı. Diğer oturumun bitmesini "
        "bekleyin ya da ayrı bir test veritabanı kullanın, örn. "
        f"VITRIN_TEST_DB_PORT=5435 VITRIN_TEST_REDIS_PORT=6381 VITRIN_TEST_PROJECT=vitrin-ai-test-2 {TEST_COMMAND}"
    )

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


def ensure_not_dev_database(database_url: str, environ: dict[str, str] | None = None) -> None:
    """Veritabanına HİÇ bağlanmadan önce, `execute.sh`'ın geliştirme
    veritabanı olmadığını doğrular (bkz. modül açıklaması, kural 3)."""
    env = os.environ if environ is None else environ
    if env.get(ALLOW_DEV_DB_RESET_ENV) == "1":
        return
    url = make_url(database_url)
    is_dev = (
        (url.host or "").lower() in LOCAL_DATABASE_HOSTS
        and (url.port or DEV_DATABASE_PORT) == DEV_DATABASE_PORT
        and url.database == DEV_DATABASE_NAME
    )
    if is_dev:
        raise UnsafeTestDatabaseError(
            "Testler durduruldu: DATABASE_URL `execute.sh`'ın geliştirme veritabanını "
            f"gösteriyor (yerel, port {DEV_DATABASE_PORT}, ad `{DEV_DATABASE_NAME}`). Test "
            "paketi bağlandığı veritabanını siliyor; eşitlenmiş kullanıcılar, zeminler ve "
            "yerel çalışmalar giderdi. Hiçbir şeye dokunulmadı.\n"
            f"Doğru komut (repo kökünden): {TEST_COMMAND}  — ayrı bir test Postgres'i "
            "(5434) açıp testleri orada koşar; pytest argümanları aynen geçer.\n"
            f"Geliştirme veritabanı BİLEREK sıfırlanacaksa: {ALLOW_DEV_DB_RESET_ENV}=1."
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
