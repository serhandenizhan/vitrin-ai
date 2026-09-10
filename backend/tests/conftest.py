import subprocess
import sys
from collections.abc import AsyncGenerator
from pathlib import Path

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.db import Base
from app.models.background import Background  # noqa: F401 - Base.metadata'ya kaydolması için

BACKEND_DIR = Path(__file__).resolve().parent.parent

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
    subprocess.run(
        [sys.executable, "-m", "alembic", "downgrade", "base"], cwd=BACKEND_DIR, check=True
    )
    await _engine.dispose()


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with _session_factory() as session:
        yield session
        # Test beklenen bir IntegrityError vb. fırlatıp session'ı commit/flush
        # sonrası "rolled back" durumda bırakmış olabilir (bkz.
        # test_r2_key_must_be_unique) — temizlik öncesi güvenli rollback,
        # hata yoksa no-op.
        await session.rollback()
        # Testler birbirinden bağımsız kalsın diye her testten sonra temizle
        # (ayrı bir test-DB'si kurmak yerine aynı yerel Postgres kullanılıyor —
        # 2 kişilik ekip için bu, getirisi düşük bir ek altyapı olurdu).
        for table in reversed(Base.metadata.sorted_tables):
            await session.execute(table.delete())
        await session.commit()
