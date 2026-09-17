# Faz 3 — Arka Plan Kütüphanesi Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend'e arka plan tasarımı kütüphanesi ekle: Postgres'te meta veri tablosu, Cloudflare R2'de gerçek dosya depolama, ve iki endpoint (`POST /api/admin/backgrounds` yükleme, `GET /api/backgrounds` listeleme).

**Architecture:** Async SQLAlchemy (asyncpg) ile bir `Background` ORM modeli ve Alembic migration'ı; sync boto3 ile yazılmış, ağa çıkan çağrıları `run_in_threadpool` ile sarmalayan bir `R2StorageService`; mevcut `validate_upload` fonksiyonu yeniden kullanılarak dosya doğrulaması; yükleme endpoint'i Faz 4'e kadar geçici bir `X-Admin-Secret` header'ıyla korunuyor.

**Tech Stack:** FastAPI (mevcut), SQLAlchemy 2.0 (async) + asyncpg, Alembic, boto3, pytest + pytest-asyncio.

**Spec:** [docs/superpowers/specs/2026-09-09-faz3-arka-plan-kutuphanesi-backend-design.md](../specs/2026-09-09-faz3-arka-plan-kutuphanesi-backend-design.md)

## Global Constraints

- Kod İngilizce, kod içi yorumlar sadece Türkçe (kök `CLAUDE.md`).
- Gerçek bir Cloudflare R2 bucket'ına karşı geliştirilecek (yerel MinIO stub'ı kullanılmıyor).
- DB katmanı: async SQLAlchemy + asyncpg (sync + threadpool değil).
- R2 istemcisi: sync boto3 + `run_in_threadpool` (aioboto3 değil).
- `backgrounds` şeması minimal: yalnızca `id`, `r2_key`, `is_active`, `created_at` — kategori/etiket alanı yok.
- `POST /api/admin/backgrounds` bu fazda tamamlanır (bir sonraki faza ertelenmez), geçici `X-Admin-Secret` header koruması ile — Faz 4'te gerçek Supabase Auth'a geçirilecek.
- `settings.admin_secret` zorunlu bir alan (varsayılan değeri yok) — eksikse uygulama başlarken hata verir.
- R2 depolama anahtarı (`r2_key`) her zaman sunucuda üretilen bir UUID'den türetilir, kullanıcı dosya adından asla değil.
- Secrets `.env`'den okunur, koda asla sabit yazılmaz, `.env` commit edilmez.
- Yeni bağımlılıklar `backend/requirements.txt` / `requirements-dev.txt`'e exact-pin (`==`) olarak eklenir (mevcut dosyalardaki desen).

---

### Task 1: Bağımlılıklar, ayarlar ve async DB engine

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/requirements-dev.txt`
- Create: `backend/pytest.ini`
- Modify: `backend/app/core/config.py`
- Modify: `backend/.env.example`
- Create: `backend/app/core/db.py`
- Test: `backend/tests/test_db.py`

**Interfaces:**
- Produces: `app.core.db.Base` (SQLAlchemy `DeclarativeBase` alt sınıfı, sonraki task'lardaki ORM modelleri bundan türeyecek), `app.core.db.engine` (module-level `AsyncEngine`), `app.core.db.get_db_session() -> AsyncGenerator[AsyncSession, None]` (FastAPI `Depends` dependency'si).
- Produces: `app.core.config.settings` üzerinde yeni alanlar: `database_url: str`, `admin_secret: str` (zorunlu), `r2_account_id: str`, `r2_access_key_id: str`, `r2_secret_access_key: str`, `r2_bucket_name: str`, `background_url_expiry_seconds: int`.

- [ ] **Step 1: Yeni bağımlılıkları ekle**

`backend/requirements.txt`'in sonuna ekle:

```
sqlalchemy==2.0.36
asyncpg==0.30.0
alembic==1.14.0
boto3==1.34.162
```

`backend/requirements-dev.txt`'in sonuna ekle:

```
pytest-asyncio==0.24.0
```

Kur:

```bash
cd backend && .venv/bin/pip install -r requirements-dev.txt
```

- [ ] **Step 2: pytest-asyncio'yu auto mode'a al**

`backend/pytest.ini` oluştur:

```ini
[pytest]
asyncio_mode = auto
```

(Bu olmadan `async def test_...` fonksiyonları pytest tarafından atlanır/skip edilir — bkz. sonraki task'lardaki async testler.)

- [ ] **Step 3: `Settings`'e yeni alanları ekle**

`backend/app/core/config.py` içinde `rembg_model_name: str = "birefnet-general"` satırından hemen sonra, `@property max_file_size_bytes` tanımından önce ekle:

```python
    # Faz 3: arka plan kütüphanesi. Varsayılan değer `docker-compose.yml`'deki
    # yerel Postgres'e işaret ediyor; production'da Supabase Postgres bağlantı
    # dizesiyle env üzerinden override edilir.
    database_url: str = (
        "postgresql+asyncpg://vitrin_ai:change_me_locally@localhost:5432/vitrin_ai"
    )
    # Faz 4'te gerçek Supabase Auth + rol kontrolü gelene kadar
    # `POST /api/admin/backgrounds` bu paylaşılan secret ile korunuyor (bkz.
    # kök CLAUDE.md ders 8 — bilinçli geçici çözüm). Kasıtlı olarak varsayılan
    # değeri YOK: env'de yoksa uygulama başlarken hata verir, sessizce açık
    # bir admin endpoint'iyle üretime çıkılmaz.
    admin_secret: str
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = ""
    # GET /api/backgrounds içindeki presigned URL'lerin geçerlilik süresi.
    background_url_expiry_seconds: int = 3600
```

- [ ] **Step 4: `.env.example`'a yeni değişkenleri ekle**

`backend/.env.example`'ın sonuna ekle:

```
# Faz 3: arka plan kütüphanesi.
# Yerel Postgres için docker-compose.yml'deki varsayılanlarla eşleşir.
DATABASE_URL=postgresql+asyncpg://vitrin_ai:change_me_locally@localhost:5432/vitrin_ai
# POST /api/admin/backgrounds için geçici paylaşılan secret (Faz 4'te gerçek
# Supabase Auth ile değişecek, bkz. kök CLAUDE.md ders 8). Zorunlu — boş
# bırakılırsa uygulama başlamaz.
ADMIN_SECRET=change-me-before-deploy
# Cloudflare R2 kimlik bilgileri (R2 dashboard > Manage API tokens).
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
# GET /api/backgrounds içindeki presigned URL'lerin geçerlilik süresi (saniye).
BACKGROUND_URL_EXPIRY_SECONDS=3600
```

- [ ] **Step 5: Yerel `.env` dosyanı güncelle**

`backend/.env` (commit edilmeyen, yerel dosyan) içine en az şunu ekle — yoksa Step 3'teki zorunlu `admin_secret` alanı yüzünden uygulama hiç başlamaz:

```
ADMIN_SECRET=local-dev-secret
```

`DATABASE_URL` için varsayılan zaten `docker-compose.yml`'deki değerlerle eşleşiyor, `.env`'de tekrar yazmana gerek yok (yerelde Postgres varsayılan kullanıcı/şifreyle çalışıyorsa).

- [ ] **Step 6: Yerel Postgres'i başlat**

```bash
cd /Users/serhan/Desktop/Projects/vitrin-ai && docker compose up -d postgres
```

- [ ] **Step 7: `app/core/db.py` oluştur**

```python
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
```

- [ ] **Step 8: Bağlantı testini yaz**

`backend/tests/test_db.py`:

```python
from sqlalchemy import text

from app.core.db import get_db_session


async def test_get_db_session_yields_working_session():
    session_gen = get_db_session()
    session = await anext(session_gen)
    try:
        result = await session.execute(text("SELECT 1"))
        assert result.scalar_one() == 1
    finally:
        await session_gen.aclose()
```

- [ ] **Step 9: Testi çalıştır**

```bash
cd backend && .venv/bin/pytest tests/test_db.py -v
```

Beklenen: `PASS`. `FAIL` alırsan önce `docker compose ps` ile Postgres'in ayakta olduğunu, sonra `.env`'deki `ADMIN_SECRET`'in set olduğunu doğrula (Step 3'teki zorunlu alan yüzünden `app.core.config` import'u patlarsa test hiç toplanamaz).

- [ ] **Step 10: Commit**

```bash
git add backend/requirements.txt backend/requirements-dev.txt backend/pytest.ini backend/app/core/config.py backend/.env.example backend/app/core/db.py backend/tests/test_db.py
git commit -m "feat(backend): faz 3 için async DB engine ve ayarları ekle"
```

---

### Task 2: Background modeli + Alembic migration + test fixture altyapısı

**Files:**
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/background.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/script.py.mako`
- Create: `backend/alembic/versions/0001_create_backgrounds_table.py`
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/test_background_model.py`

**Interfaces:**
- Consumes: `app.core.db.Base`, `app.core.db.engine` (Task 1).
- Produces: `app.models.background.Background` ORM sınıfı (alanlar: `id: uuid.UUID`, `r2_key: str`, `is_active: bool`, `created_at: datetime`) — Task 4 ve Task 5 bunu kullanacak. Produces: `backend/tests/conftest.py` içindeki `db_session` pytest fixture'ı (async, her testten sonra `backgrounds` tablosunu temizler) — Task 4 ve Task 5'teki tüm testler bunu kullanacak.

- [ ] **Step 1: `app/models/__init__.py` oluştur (boş)**

```bash
touch backend/app/models/__init__.py
```

- [ ] **Step 2: `Background` modelini yaz**

`backend/app/models/background.py`:

```python
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Background(Base):
    __tablename__ = "backgrounds"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # R2'deki nesne anahtarı; kullanıcı dosya adından değil, sunucuda üretilen
    # UUID'den türetilir (path traversal koruması, bkz. kök SECURITY.md böl. 4).
    r2_key: Mapped[str] = mapped_column(unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

- [ ] **Step 3: Alembic'i başlat**

```bash
cd backend && .venv/bin/alembic init alembic
```

Bu, `alembic.ini` ve `alembic/` (env.py, script.py.mako, versions/) üretir — sonraki adımlarda üzerine yazacağız.

- [ ] **Step 4: `alembic.ini`'de script_location'ı doğrula**

`backend/alembic.ini` içinde `script_location = alembic` satırının olduğunu kontrol et (varsayılan zaten böyle olmalı, `alembic init alembic` bunu otomatik ayarlar).

- [ ] **Step 5: `alembic/env.py`'yi async çalışacak şekilde yeniden yaz**

`backend/alembic/env.py`'nin tamamını şununla değiştir:

```python
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import settings
from app.core.db import Base
from app.models.background import Background  # noqa: F401 - Base.metadata'ya kaydolması için import edilmesi yeterli

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    return settings.database_url


def run_migrations_offline() -> None:
    context.configure(
        url=get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_url()
    connectable = async_engine_from_config(
        configuration, prefix="sqlalchemy.", poolclass=pool.NullPool
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

- [ ] **Step 6: İlk migration'ı elle yaz**

`backend/alembic/versions/0001_create_backgrounds_table.py` (otomatik üretilen dosya adını silip bunu oluştur):

```python
"""arka plan kütüphanesi tablosu

Revision ID: 0001
Revises:
Create Date: 2026-09-09

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "backgrounds",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("r2_key", sa.String(), nullable=False, unique=True),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("backgrounds")
```

- [ ] **Step 7: Migration'ı manuel doğrula**

```bash
cd backend && .venv/bin/alembic upgrade head
.venv/bin/python -c "
import asyncio
from sqlalchemy import inspect
from app.core.db import engine

async def check():
    async with engine.connect() as conn:
        def _inspect(sync_conn):
            return inspect(sync_conn).get_table_names()
        print(await conn.run_sync(_inspect))

asyncio.run(check())
"
.venv/bin/alembic downgrade base
```

Beklenen: ilk komut çıktısında `backgrounds` listede görünür; downgrade hatasız tamamlanır.

- [ ] **Step 8: Test fixture altyapısını yaz**

`backend/tests/conftest.py`:

```python
import subprocess
import sys
from collections.abc import AsyncGenerator
from pathlib import Path

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.db import Base
from app.models.background import Background  # noqa: F401 - Base.metadata'ya kaydolması için

BACKEND_DIR = Path(__file__).resolve().parent.parent

_engine = create_async_engine(settings.database_url)
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
        # Testler birbirinden bağımsız kalsın diye her testten sonra temizle
        # (ayrı bir test-DB'si kurmak yerine aynı yerel Postgres kullanılıyor —
        # 2 kişilik ekip için bu, getirisi düşük bir ek altyapı olurdu).
        for table in reversed(Base.metadata.sorted_tables):
            await session.execute(table.delete())
        await session.commit()
```

- [ ] **Step 9: Model testini yaz**

`backend/tests/test_background_model.py`:

```python
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models.background import Background


async def test_create_and_query_background(db_session):
    background = Background(id=uuid.uuid4(), r2_key="backgrounds/test-key.jpg")
    db_session.add(background)
    await db_session.commit()

    result = await db_session.execute(
        select(Background).where(Background.r2_key == "backgrounds/test-key.jpg")
    )
    fetched = result.scalar_one()
    assert fetched.is_active is True
    assert fetched.created_at is not None


async def test_r2_key_must_be_unique(db_session):
    db_session.add(Background(id=uuid.uuid4(), r2_key="dup-key"))
    await db_session.commit()

    db_session.add(Background(id=uuid.uuid4(), r2_key="dup-key"))
    with pytest.raises(IntegrityError):
        await db_session.commit()
```

- [ ] **Step 10: Testleri çalıştır**

```bash
cd backend && .venv/bin/pytest tests/test_background_model.py -v
```

Beklenen: 2/2 `PASS`. (Bu çalıştırma sırasında `conftest.py`'deki session-scoped fixture zaten `alembic upgrade head` / `downgrade base`'i çalıştırıyor — migration'ın kendisi de böylece doğrulanmış olur.)

- [ ] **Step 11: Tüm test suite'ini çalıştır (regresyon kontrolü)**

```bash
.venv/bin/pytest tests/ -v
```

Beklenen: önceki tüm testler + yeni eklenenler yeşil.

- [ ] **Step 12: Commit**

```bash
git add backend/app/models backend/alembic.ini backend/alembic backend/tests/conftest.py backend/tests/test_background_model.py
git commit -m "feat(backend): Background modeli, Alembic migration ve test fixture altyapısı"
```

---

### Task 3: R2 depolama servisi

**Files:**
- Create: `backend/app/services/storage.py`
- Test: `backend/tests/test_storage_service.py`

**Interfaces:**
- Consumes: `app.core.config.settings` (`r2_account_id`, `r2_access_key_id`, `r2_secret_access_key`, `background_url_expiry_seconds` — Task 1).
- Produces: `app.services.storage.R2StorageService(bucket_name: str)` sınıfı — metodlar: `async def upload(self, key: str, content: bytes, content_type: str) -> None`, `def generate_presigned_url(self, key: str) -> str`. Task 4 ve Task 5 bu sınıfı kullanacak.

- [ ] **Step 1: `R2StorageService`'i yaz**

`backend/app/services/storage.py`:

```python
from functools import lru_cache

import boto3
from fastapi.concurrency import run_in_threadpool

from app.core.config import settings


@lru_cache(maxsize=1)
def _get_client():
    # R2, S3-uyumlu bir API sunuyor; `region_name="auto"` ve hesaba özel
    # `endpoint_url` R2'nin kendi konvansiyonu (bkz. Cloudflare R2 S3 API dokümanı).
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
    )


class R2StorageService:
    def __init__(self, bucket_name: str):
        self._bucket_name = bucket_name

    async def upload(self, key: str, content: bytes, content_type: str) -> None:
        # `put_object` gerçek bir ağ çağrısı — event loop'u bloklamaması için
        # threadpool'a taşınıyor (bkz. kök CLAUDE.md, mevcut BiRefNet/validate_upload
        # deseniyle tutarlı).
        client = _get_client()
        await run_in_threadpool(
            client.put_object,
            Bucket=self._bucket_name,
            Key=key,
            Body=content,
            ContentType=content_type,
        )

    def generate_presigned_url(self, key: str) -> str:
        # Yerel bir imzalama işlemi, ağ çağrısı yapmıyor — threadpool gerekmiyor.
        client = _get_client()
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket_name, "Key": key},
            ExpiresIn=settings.background_url_expiry_seconds,
        )
```

- [ ] **Step 2: Testleri yaz**

`backend/tests/test_storage_service.py`:

```python
from unittest.mock import MagicMock

from app.services import storage


def teardown_function():
    # `_get_client` süreç ömrü boyunca `lru_cache`'lendiği için testler arası
    # sızıntıyı önlemek adına her testten sonra temizle (bkz.
    # test_background_removal_service.py'deki aynı desen).
    storage._get_client.cache_clear()


async def test_upload_calls_put_object_with_bucket_key_content_and_type(monkeypatch):
    client_mock = MagicMock()
    monkeypatch.setattr(storage.boto3, "client", MagicMock(return_value=client_mock))

    service = storage.R2StorageService(bucket_name="test-bucket")
    await service.upload("backgrounds/key.jpg", b"content", "image/jpeg")

    client_mock.put_object.assert_called_once_with(
        Bucket="test-bucket",
        Key="backgrounds/key.jpg",
        Body=b"content",
        ContentType="image/jpeg",
    )


def test_generate_presigned_url_uses_bucket_key_and_configured_expiry(monkeypatch):
    client_mock = MagicMock()
    client_mock.generate_presigned_url = MagicMock(return_value="https://signed.example/url")
    monkeypatch.setattr(storage.boto3, "client", MagicMock(return_value=client_mock))

    service = storage.R2StorageService(bucket_name="test-bucket")
    url = service.generate_presigned_url("backgrounds/key.jpg")

    client_mock.generate_presigned_url.assert_called_once_with(
        "get_object",
        Params={"Bucket": "test-bucket", "Key": "backgrounds/key.jpg"},
        ExpiresIn=storage.settings.background_url_expiry_seconds,
    )
    assert url == "https://signed.example/url"
```

- [ ] **Step 3: Testleri çalıştır**

```bash
cd backend && .venv/bin/pytest tests/test_storage_service.py -v
```

Beklenen: 2/2 `PASS`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/storage.py backend/tests/test_storage_service.py
git commit -m "feat(backend): R2 depolama servisi (sync boto3 + threadpool)"
```

---

### Task 4: `POST /api/admin/backgrounds` endpoint'i

**Files:**
- Create: `backend/app/api/routes/backgrounds.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_backgrounds_endpoint.py`

**Interfaces:**
- Consumes: `app.core.db.get_db_session` (Task 1), `app.models.background.Background` (Task 2), `app.services.storage.R2StorageService` (Task 3), `app.validation.upload.validate_upload` / `UploadValidationError` (mevcut).
- Produces: `app.api.routes.backgrounds.router` (FastAPI `APIRouter`), `app.api.routes.backgrounds.get_storage_service() -> R2StorageService` (dependency provider fonksiyonu — Task 5 ve testler bunu override edecek).

- [ ] **Step 1: Route dosyasını oluştur**

`backend/app/api/routes/backgrounds.py`:

```python
import secrets
import uuid

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db_session
from app.models.background import Background
from app.services.storage import R2StorageService
from app.validation.upload import UploadValidationError, validate_upload

router = APIRouter()

CONTENT_TYPE_TO_EXTENSION = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
}


def get_storage_service() -> R2StorageService:
    return R2StorageService(bucket_name=settings.r2_bucket_name)


def _require_admin_secret(x_admin_secret: str = Header(default="")) -> None:
    # GEÇİCİ: Faz 4'te gerçek Supabase Auth + rol kontrolü gelene kadar bu
    # paylaşılan secret kullanılıyor (bkz. kök CLAUDE.md ders 8). Zamanlama
    # saldırılarına karşı `secrets.compare_digest` ile sabit-zamanlı karşılaştırma.
    if not secrets.compare_digest(x_admin_secret, settings.admin_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Geçersiz admin secret."
        )


@router.post(
    "/api/admin/backgrounds",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_require_admin_secret)],
)
async def create_background(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    storage: R2StorageService = Depends(get_storage_service),
) -> dict[str, str]:
    content = await file.read()

    # Arka plan görselleri de ürün fotoğraflarıyla aynı doğrulama kısıtlarına
    # tabi (magic-byte + boyut + piksel sınırı) — ayrı bir doğrulama yolu
    # yazmak yerine mevcut `validate_upload` yeniden kullanılıyor.
    try:
        await run_in_threadpool(
            validate_upload,
            content,
            declared_content_type=file.content_type or "",
            max_file_size_mb=settings.max_file_size_mb,
            allowed_content_types=settings.allowed_content_types,
            max_image_pixels=settings.max_image_pixels,
        )
    except UploadValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=exc.reason
        ) from exc

    background_id = uuid.uuid4()
    extension = CONTENT_TYPE_TO_EXTENSION[file.content_type]
    r2_key = f"backgrounds/{background_id}.{extension}"

    # Önce R2'ye yükle, DB satırı YALNIZCA yükleme başarılıysa yazılır — R2
    # başarısız olursa yetim bir DB kaydı oluşmasın diye sıra bilinçli.
    try:
        await storage.upload(r2_key, content, file.content_type)
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Arka plan depolamaya yüklenemedi.",
        ) from exc

    db.add(Background(id=background_id, r2_key=r2_key))
    await db.commit()

    return {"id": str(background_id)}
```

- [ ] **Step 2: Router'ı `main.py`'ye bağla**

`backend/app/main.py`'de import bloğuna ekle:

```python
from app.api.routes.backgrounds import router as backgrounds_router
```

`app.include_router(health_router)` satırından sonra ekle:

```python
app.include_router(backgrounds_router)
```

- [ ] **Step 3: Endpoint testlerini yaz**

`backend/tests/test_backgrounds_endpoint.py`:

```python
import io
import uuid
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app.api.routes.backgrounds import get_storage_service
from app.core.config import settings
from app.core.db import get_db_session
from app.main import app
from app.models.background import Background


def _jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color="green").save(buf, format="JPEG")
    return buf.getvalue()


def _client(db_session, storage_mock) -> TestClient:
    async def _override_db_session():
        yield db_session

    app.dependency_overrides[get_db_session] = _override_db_session
    app.dependency_overrides[get_storage_service] = lambda: storage_mock
    return TestClient(app)


async def test_missing_admin_secret_returns_401(db_session):
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.jpg", _jpeg_bytes(), "image/jpeg")},
    )

    assert response.status_code == 401
    storage_mock.upload.assert_not_called()


async def test_wrong_admin_secret_returns_401(db_session):
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.jpg", _jpeg_bytes(), "image/jpeg")},
        headers={"X-Admin-Secret": "wrong-secret"},
    )

    assert response.status_code == 401
    storage_mock.upload.assert_not_called()


async def test_invalid_file_returns_400(db_session):
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.txt", b"not-an-image", "image/jpeg")},
        headers={"X-Admin-Secret": settings.admin_secret},
    )

    assert response.status_code == 400
    storage_mock.upload.assert_not_called()


async def test_happy_path_uploads_and_creates_row(db_session):
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)
    content = _jpeg_bytes()

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.jpg", content, "image/jpeg")},
        headers={"X-Admin-Secret": settings.admin_secret},
    )

    assert response.status_code == 201
    background_id = uuid.UUID(response.json()["id"])

    storage_mock.upload.assert_called_once_with(
        f"backgrounds/{background_id}.jpg", content, "image/jpeg"
    )

    result = await db_session.execute(
        select(Background).where(Background.id == background_id)
    )
    row = result.scalar_one()
    assert row.r2_key == f"backgrounds/{background_id}.jpg"
    assert row.is_active is True
```

- [ ] **Step 4: Testleri çalıştır**

```bash
cd backend && .venv/bin/pytest tests/test_backgrounds_endpoint.py -v
```

Beklenen: 4/4 `PASS`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/backgrounds.py backend/app/main.py backend/tests/test_backgrounds_endpoint.py
git commit -m "feat(backend): POST /api/admin/backgrounds yükleme endpoint'i"
```

---

### Task 5: `GET /api/backgrounds` endpoint'i

**Files:**
- Modify: `backend/app/api/routes/backgrounds.py`
- Modify: `backend/tests/test_backgrounds_endpoint.py`

**Interfaces:**
- Consumes: `app.api.routes.backgrounds.get_storage_service`, `app.models.background.Background` (Task 2, Task 4).
- Produces: `GET /api/backgrounds` — `list[dict[str, str]]` döner, her öğe `{"id": str, "url": str}`.

- [ ] **Step 1: Endpoint'i ekle**

`backend/app/api/routes/backgrounds.py`'nin en üstündeki import'lara ekle:

```python
from sqlalchemy import select
```

Dosyanın sonuna ekle:

```python
@router.get("/api/backgrounds")
async def list_backgrounds(
    db: AsyncSession = Depends(get_db_session),
    storage: R2StorageService = Depends(get_storage_service),
) -> list[dict[str, str]]:
    result = await db.execute(
        select(Background)
        .where(Background.is_active.is_(True))
        .order_by(Background.created_at)
    )
    backgrounds = result.scalars().all()
    return [
        {"id": str(bg.id), "url": storage.generate_presigned_url(bg.r2_key)}
        for bg in backgrounds
    ]
```

- [ ] **Step 2: Testleri ekle**

`backend/tests/test_backgrounds_endpoint.py`'nin sonuna ekle:

```python
async def test_list_backgrounds_returns_empty_list_when_none_exist(db_session):
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)

    response = client.get("/api/backgrounds")

    assert response.status_code == 200
    assert response.json() == []


async def test_list_backgrounds_returns_only_active_with_presigned_urls(db_session):
    from unittest.mock import MagicMock

    active = Background(id=uuid.uuid4(), r2_key="backgrounds/active.jpg", is_active=True)
    inactive = Background(id=uuid.uuid4(), r2_key="backgrounds/inactive.jpg", is_active=False)
    db_session.add_all([active, inactive])
    await db_session.commit()

    storage_mock = AsyncMock()
    storage_mock.generate_presigned_url = MagicMock(
        side_effect=lambda key: f"https://signed.example/{key}"
    )
    client = _client(db_session, storage_mock)

    response = client.get("/api/backgrounds")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == str(active.id)
    assert body[0]["url"] == f"https://signed.example/{active.r2_key}"
```

- [ ] **Step 3: Testleri çalıştır**

```bash
cd backend && .venv/bin/pytest tests/test_backgrounds_endpoint.py -v
```

Beklenen: 6/6 `PASS` (Task 4'ün 4 testi + bu task'ın 2 testi).

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/routes/backgrounds.py backend/tests/test_backgrounds_endpoint.py
git commit -m "feat(backend): GET /api/backgrounds listeleme endpoint'i"
```

---

### Task 6: Dokümantasyon ve son regresyon

**Files:**
- Modify: `backend/README.md`
- Modify: `CLAUDE.md`
- Modify: `ROADMAP.md`
- Modify: `SECURITY.md`

**Interfaces:**
- Consumes: Task 1-5'te eklenen tüm endpoint'ler, ayarlar ve dosyalar.
- Produces: yok (yalnızca dokümantasyon).

- [ ] **Step 1: `backend/README.md`'yi güncelle**

"Ortam değişkenleri" tablosuna yeni satırlar ekle (mevcut tablo formatını koru):

```markdown
| `DATABASE_URL` | `postgresql+asyncpg://vitrin_ai:change_me_locally@localhost:5432/vitrin_ai` | Postgres bağlantı dizesi (yerelde `docker-compose.yml`'deki Postgres'e işaret eder) |
| `ADMIN_SECRET` | yok (zorunlu) | `POST /api/admin/backgrounds` için geçici paylaşılan secret — Faz 4'te gerçek Supabase Auth ile değişecek |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` | boş | Cloudflare R2 kimlik bilgileri |
| `BACKGROUND_URL_EXPIRY_SECONDS` | `3600` | `GET /api/backgrounds` presigned URL geçerlilik süresi |
```

"Durum" bölümüne (dosyanın başı) bir cümle ekle: Faz 3'ün backend kısmının (arka plan kütüphanesi: yükleme + listeleme + R2 depolama) tamamlandığını belirt.

- [ ] **Step 2: Kök `CLAUDE.md`'yi güncelle**

"Kalıcı proje kuralları" ve "Teknoloji yığını" bölümlerine dokunma (zaten doğru) — yalnızca varsa "Açık takip maddesi" bölümüne veya yeni bir nota şunu ekle: `POST /api/admin/backgrounds`'ın Faz 3'te geçici `X-Admin-Secret` header'ıyla korunduğu, Faz 4'te gerçek Supabase Auth + rol kontrolüyle değiştirileceği (ders 8 deseninin bu ikinci tekrarı).

- [ ] **Step 3: `ROADMAP.md`'yi güncelle**

Faz 3 bölümünün altına, Faz 2'deki "Sonuç" formatını takip eden bir "Sonuç (Serhan)" alt bölümü ekle: `backgrounds` tablosu + Alembic migration, `POST /api/admin/backgrounds` (geçici admin secret korumalı), `GET /api/backgrounds` (herkese açık, presigned URL'li), gerçek R2 bucket'ına karşı doğrulandığı (elle test edilecek, bkz. Step 5), minimal şema kararı (kategori/etiket yok).

- [ ] **Step 4: `SECURITY.md`'yi güncelle**

Bölüm 8'deki Faz 3 satırını güncelle:

```markdown
- **Faz 3:** R2 presigned URL, path traversal koruması (UUID tabanlı `r2_key`).
  `POST /api/admin/backgrounds` geçici bir `X-Admin-Secret` paylaşılan secret'ıyla
  korunuyor — bu bilinçli bir geçici çözüm (bkz. kök `CLAUDE.md` ders 8), Faz 4'te
  gerçek Supabase Auth + rol kontrolüyle değiştirilecek.
```

- [ ] **Step 5: Gerçek R2 bucket'ına karşı elle doğrula**

`.env`'e gerçek R2 kimlik bilgilerini gir (Cloudflare dashboard'dan), backend'i başlat:

```bash
cd backend && .venv/bin/uvicorn app.main:app --reload
```

Ayrı bir terminalde gerçek bir görselle yükleme yap:

```bash
curl -X POST http://localhost:8000/api/admin/backgrounds \
  -H "X-Admin-Secret: <yerel .env'deki ADMIN_SECRET>" \
  -F "file=@/path/to/test-image.jpg;type=image/jpeg"
```

Beklenen: `201` + `{"id": "..."}`. Sonra listele:

```bash
curl http://localhost:8000/api/backgrounds
```

Beklenen: yüklenen kayıt, çalışan bir presigned URL ile listede görünür (URL'yi tarayıcıda açıp görselin göründüğünü doğrula).

- [ ] **Step 6: Tüm test suite'ini çalıştır**

```bash
cd backend && .venv/bin/pytest tests/ -v
```

Beklenen: tüm testler (health, remove-background, validation, middleware, db, background model, storage, backgrounds endpoint) yeşil.

- [ ] **Step 7: Commit**

```bash
git add backend/README.md CLAUDE.md ROADMAP.md SECURITY.md
git commit -m "docs: faz 3 arka plan kütüphanesi backend dokümantasyonu"
```
