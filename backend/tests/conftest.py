import json
import os
import subprocess
import sys
import time
import uuid
from collections.abc import AsyncGenerator
from pathlib import Path
from urllib.parse import urlsplit

# Test oturumu hiçbir koşulda gerçek bir hata izleme servisine yazmaz:
# geliştiricinin `backend/.env`'sinde SENTRY_DSN olsa bile. Testler bilerek
# yüzlerce hata üretiyor; `app.main` yüklenirken izleme başlasaydı hepsi
# gerçek projeye gönderilirdi. Ortam değişkeni `.env`'den önce gelir ve
# ayarlar bu satırdan SONRA ilk kez okunur (aşağıdaki `app.*` içe aktarmaları).
os.environ["SENTRY_DSN"] = ""

import jwt
import pytest
import pytest_asyncio
from cryptography.hazmat.primitives.asymmetric import ec
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core import auth as auth_module
from app.core.config import settings
from app.core.db import Base
from app.models.admin_user import AdminUser
from app.models.background import Background  # noqa: F401 - Base.metadata'ya kaydolması için
from app.models.project import Project  # noqa: F401 - Base.metadata'ya kaydolması için
from app.models.user_consent import UserConsent  # noqa: F401 - Base.metadata'ya kaydolması için
from tests.db_safety import (
    AUTH_SCHEMA_COMMENT_SQL,
    UnsafeTestDatabaseError,
    ensure_disposable_database,
    ensure_local_database_host,
    ensure_not_dev_database,
    SESSION_LOCK_KEY,
    concurrent_session_message,
)

BACKEND_DIR = Path(__file__).resolve().parent.parent

TEST_SUPABASE_URL = "https://test-projesi.supabase.co"
TEST_KEY_ID = "test-imza-anahtari"

# NullPool: pytest-asyncio her test fonksiyonu için ayrı bir event loop açıyor,
# ama bu engine modül seviyesinde (import anında, henüz hiçbir loop yokken)
# oluşturuluyor. Varsayılan pooling ile bir bağlantı bir testin loop'unda açılıp
# sonraki testin (farklı) loop'unda yeniden kullanılmaya çalışılıyor ve asyncpg
# "attached to a different loop" hatası veriyor. NullPool her checkout'ta taze
# bağlantı açıp kapattığı için bağlantılar asla loop sınırları arasında paylaşılmıyor.
_engine = create_async_engine(settings.database_url, poolclass=NullPool)
_session_factory = async_sessionmaker(_engine, expire_on_commit=False)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _apply_migrations():
    # ÖNCE koruma: bu paket bağlandığı veritabanını sıfırlıyor. Hedef yerel
    # test veritabanı değilse (ör. .env'deki Supabase) migration'lar dahil
    # hiçbir şeye dokunulmadan oturum durduruluyor (bkz. tests/db_safety.py).
    # Adres kontrolü bağlanmadan ÖNCE: uzak bir sunucuya bağlantı bile açılmıyor.
    try:
        ensure_local_database_host(settings.database_url)
        ensure_not_dev_database(settings.database_url)
    except UnsafeTestDatabaseError as exc:
        pytest.exit(str(exc), returncode=3)

    async with _engine.connect() as connection:
        row = (await connection.execute(text(AUTH_SCHEMA_COMMENT_SQL))).first()
    try:
        ensure_disposable_database(
            has_auth_schema=row is not None,
            auth_schema_comment=row[0] if row is not None else None,
        )
    except UnsafeTestDatabaseError as exc:
        pytest.exit(str(exc), returncode=3)

    # Aynı veritabanında ikinci bir test oturumu birincinin tablolarını
    # oturum sonunda düşürür (27.09.2026'da iki oturum çakıştı: 393 geçen,
    # 393 kırmızı). Oturum boyunca açık tutulan bir bağlantıda kilit alınır;
    # alınamıyorsa hiçbir şeye dokunmadan durulur. Kilit bağlantı kapanınca
    # (süreç ölse bile) kendiliğinden bırakılır.
    lock_connection = await _engine.connect()
    locked = await lock_connection.scalar(text("select pg_try_advisory_lock(:key)"), {"key": SESSION_LOCK_KEY})
    await lock_connection.commit()
    if not locked:
        await lock_connection.close()
        pytest.exit(concurrent_session_message(), returncode=3)

    # Testler gerçek Alembic migration'larına karşı çalışır (Base.metadata.create_all
    # DEĞİL) — migration dosyasındaki bir hata bu sayede testlerde de yakalanır.
    # `check=True` migration başarısız olursa test session'ını hemen durdurur.
    # `sys.executable -m alembic` kullanılıyor (bare "alembic" değil) — pytest
    # hangi yoldan çağrılırsa çağrılsın (aktif venv olsun olmasın) her zaman
    # pytest'i çalıştıran aynı Python/venv'in alembic'ini kullanılır.
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"], cwd=BACKEND_DIR, check=True
    )
    yield
    try:
        subprocess.run(
            [sys.executable, "-m", "alembic", "downgrade", "base"], cwd=BACKEND_DIR, check=True
        )
    finally:
        await lock_connection.close()  # kilit burada bırakılır
        await _engine.dispose()


#: Redis testleri Postgres'inki gibi bir "sıfırlama" korumasına ihtiyaç
#: duymuyor — her test kendi rastgele anahtarını kullanıyor ve yazılan tek
#: şey birkaç saniyelik TTL'li sayaç anahtarları (bkz. backend/README.md
#: "Testler"). Yine de yanlışlıkla paylaşılan/uzak bir Redis'e bağlanıp
#: gereksiz trafik üretmemek için adres burada da yerelle sınırlanıyor.
LOCAL_REDIS_HOSTS = frozenset({"localhost", "127.0.0.1", "::1", "redis"})


@pytest.fixture(scope="session", autouse=True)
def redis_without_persistence():
    """Kesim kuyruğu, Redis diske yazıyorsa özgün fotoğrafı kabul etmez
    (`CutoutQueue.ensure_ephemeral`, KVKK). Test Redis'i de production'ın
    olması gerektiği gibi yapılandırılır: CI'daki servis kapsayıcısına komut
    satırı argümanı verilemiyor, yerel Redis ise `docker compose` ile yeniden
    oluşturulana kadar eski (diske yazan) ayarla çalışıyor olabilir."""
    import redis as sync_redis

    if (urlsplit(settings.redis_url).hostname or "").lower() not in LOCAL_REDIS_HOSTS:
        return  # `redis_client` fixture'ı bu durumda okunur bir mesajla durdurur
    client = sync_redis.Redis.from_url(settings.redis_url)
    try:
        client.config_set("save", "")
        client.config_set("appendonly", "no")
    except sync_redis.RedisError:
        pass  # Redis'e ulaşılamıyorsa asıl hata onu kullanan testte okunur
    finally:
        client.close()


@pytest_asyncio.fixture(scope="session")
async def redis_client() -> AsyncGenerator[Redis, None]:
    host = (urlsplit(settings.redis_url).hostname or "").lower()
    if host not in LOCAL_REDIS_HOSTS:
        pytest.exit(
            "Testler durduruldu: REDIS_URL yerel bir Redis'i göstermiyor. "
            "Yerel bir Redis'e yönlendirin, örn. "
            "REDIS_URL=redis://localhost:6380/0 (bkz. backend/README.md 'Testler').",
            returncode=3,
        )
    client = Redis.from_url(settings.redis_url)
    try:
        await client.ping()
    except Exception as exc:  # noqa: BLE001 - baglanti hatasini okunur mesaja cevir
        pytest.exit(
            f"Testler durduruldu: Redis'e bağlanılamadı ({settings.redis_url}). "
            "`docker compose up -d redis` çalıştırıldı mı? "
            f"Ayrıntı: {exc}",
            returncode=3,
        )
    yield client
    await client.aclose()


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with _session_factory() as session:
        yield session
        # Test beklenen bir IntegrityError vb. fırlatıp session'ı commit/flush
        # sonrası "rolled back" durumda bırakmış olabilir (bkz.
        # test_r2_key_must_be_unique) — temizlik öncesi güvenli rollback,
        # hata yoksa no-op. RLS testlerinin `set local role`'ünü de geri alır.
        await session.rollback()
        # Testler birbirinden bağımsız kalsın diye her testten sonra temizle
        # (ayrı bir test-DB'si kurmak yerine aynı yerel Postgres kullanılıyor —
        # 2 kişilik ekip için bu, getirisi düşük bir ek altyapı olurdu).
        await session.execute(text("TRUNCATE billing_alerts,billing_runs,storage_deletion_jobs,provider_actions,webhook_events,billing_transactions,checkout_sessions,usage_events,usage_reservations,credit_grants,admin_audit_log,support_requests,subscription_periods,subscriptions CASCADE"))
        await session.execute(text("DELETE FROM plan_versions WHERE plan_id <> 'deneme' OR version > 1"))
        await session.execute(text("UPDATE plan_versions SET retired_at=NULL WHERE plan_id='deneme' AND version=1"))
        for table in reversed(Base.metadata.sorted_tables):
            await session.execute(table.delete())
        # `auth.users` uygulamanın metadata'sında yok (Supabase'e ait); yerelde
        # migration 0002'nin uyumluluk katmanı. Testlerin eklediği kullanıcılar
        # burada temizleniyor.
        await session.execute(text("delete from auth.users"))
        await session.commit()


@pytest_asyncio.fixture
async def create_user(db_session):
    """`auth.users`'a bir kullanıcı ekler ve kimliğini döndürür.

    Gerçekte bu satırı Supabase Auth oluşturuyor; projects/admin_users
    tablolarının FK'si nedeniyle testlerin de önce kullanıcıyı eklemesi gerekiyor.
    """

    async def _create(email: str | None = None) -> uuid.UUID:
        user_id = uuid.uuid4()
        await db_session.execute(
            text("insert into auth.users (id, email) values (:id, :email)"),
            {"id": user_id, "email": email or f"{user_id}@test.example"},
        )
        await db_session.commit()
        return user_id

    return _create


@pytest_asyncio.fixture
async def grant_admin(db_session):
    async def _grant(user_id: uuid.UUID) -> None:
        db_session.add(AdminUser(user_id=user_id))
        await db_session.commit()

    return _grant


class TokenFactory:
    """Supabase'in yerine, test anahtarıyla imzalı access token üretir."""

    def __init__(self, private_key: ec.EllipticCurvePrivateKey):
        self.private_key = private_key

    def claims(
        self,
        user_id: uuid.UUID,
        *,
        expires_in: int = 3600,
        claims: dict | None = None,
        remove: tuple[str, ...] = (),
    ) -> dict:
        now = int(time.time())
        payload = {
            "iss": f"{TEST_SUPABASE_URL}/auth/v1",
            "aud": "authenticated",
            "sub": str(user_id),
            "role": "authenticated",
            "iat": now,
            "exp": now + expires_in,
            "email": f"{user_id}@test.example",
            "session_id": str(uuid.uuid4()),
            "is_anonymous": False,
            "aal": "aal1",
        }
        payload.update(claims or {})
        for name in remove:
            payload.pop(name, None)
        return payload

    def token(
        self,
        user_id: uuid.UUID,
        *,
        key: ec.EllipticCurvePrivateKey | None = None,
        kid: str = TEST_KEY_ID,
        **claim_options,
    ) -> str:
        return jwt.encode(
            self.claims(user_id, **claim_options),
            key or self.private_key,
            algorithm="ES256",
            headers={"kid": kid},
        )

    def headers(self, user_id: uuid.UUID, **token_options) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token(user_id, **token_options)}",
            "X-Expected-User-Id": str(user_id),
        }


@pytest.fixture
def tokens(monkeypatch) -> TokenFactory:
    """Kimlik doğrulamayı sahte bir Supabase projesine yönlendirir.

    Gerçek `PyJWKClient` kullanılıyor (kid eşleştirme, JWK ayrıştırma ve anahtar
    seçimi gerçek kodla sınanıyor); yalnızca ağdan JWKS çeken `fetch_data`
    yerine test anahtarının genel yarısı veriliyor.
    """
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(private_key.public_key()))
    public_jwk.update({"kid": TEST_KEY_ID, "alg": "ES256", "use": "sig"})

    monkeypatch.setattr(settings, "supabase_url", TEST_SUPABASE_URL)
    monkeypatch.setattr(settings, "supabase_legacy_jwt_secret", "")
    monkeypatch.setattr(jwt.PyJWKClient, "fetch_data", lambda self: {"keys": [public_jwk]})
    auth_module.get_jwks_client.cache_clear()
    yield TokenFactory(private_key)
    auth_module.get_jwks_client.cache_clear()
