from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    # Tüm ORM modelleri bu sınıftan türer; Alembic `env.py` şema
    # karşılaştırması için `Base.metadata`'ya ihtiyaç duyuyor.
    pass


# Process başına tek engine — her istek için ayrı engine oluşturmak
# connection pool'unu boşa harcar.
engine = create_async_engine(settings.database_url)
_session_factory = async_sessionmaker(engine, expire_on_commit=False)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with _session_factory() as session:
        yield session
