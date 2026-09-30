"""`0011` yalnız boş DB'de değil, `0010` UYGULANMIŞ ve içinde veri olan bir DB'de
de doğru çalışmalı (production'ın izlediği yol; bkz. `test_migration_0006.py`).

`0011` yeni bir tablo ekliyor: `cutout_result_attempts` (her kesim denemesinin
R2 anahtarı, yüklemeden ÖNCE yazılır; bakım işi sahipsiz dosyaları buradan
bulur). Yeni tablo aynı migration'da RLS'li ve istemci rollerine kapalı olmalı.
Testin sonunda veritabanı `head`de bırakılır.
"""

import uuid
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import text

from app.services.billing.entitlements import reserve
from app.services.billing.provider import Iyzico
from tests.test_migration_0006 import alembic, scalar as _scalar


async def scalar(db, sql, **params):
    # Her okuma yeni bir işlemde: alembic ayrı bir süreçte şemayı değiştiriyor,
    # açık kalan eski bir işlem o değişikliği görmeyebilir.
    await db.rollback()
    return await _scalar(db, sql, **params)

TABLE_EXISTS = "SELECT to_regclass('public.cutout_result_attempts') IS NOT NULL"


@pytest.fixture
async def reservation_at_0010(db_session, create_user):
    """Gerçek bir kredi ayırması oluşturur, DB'yi `0010`'a indirir; sonunda `head`."""
    provider = AsyncMock(spec=Iyzico)
    reservation = await reserve(db_session, await create_user(), uuid.uuid4(), provider)
    await db_session.commit()
    alembic("downgrade", "0010")
    yield reservation.id
    await db_session.rollback()
    alembic("upgrade", "head")


async def test_0011_upgrades_a_database_that_already_has_0010(db_session, reservation_at_0010):
    assert await scalar(db_session, TABLE_EXISTS) is False

    alembic("upgrade", "head")

    assert await scalar(db_session, TABLE_EXISTS) is True
    # Var olan veri yerinde.
    assert await scalar(
        db_session, "SELECT status FROM usage_reservations WHERE id=:id", id=reservation_at_0010
    ) == "pending"
    # Aynı migration'da RLS açık ve istemci rollerinin hiçbir yetkisi yok.
    assert await scalar(
        db_session, "SELECT relrowsecurity FROM pg_class WHERE oid='public.cutout_result_attempts'::regclass"
    ) is True
    for role in ("anon", "authenticated"):
        assert await scalar(
            db_session,
            "SELECT has_table_privilege(:role, 'public.cutout_result_attempts', 'SELECT,INSERT,UPDATE,DELETE')",
            role=role,
        ) is False
    # Var olan bir ayırmaya deneme kaydı bağlanabiliyor (yabancı anahtar çalışıyor).
    await db_session.execute(
        text("INSERT INTO cutout_result_attempts(key, reservation_id) VALUES (:key, :id)"),
        {"key": f"results/x/{uuid.uuid4()}.png", "id": reservation_at_0010},
    )
    await db_session.commit()


async def test_0011_downgrade_removes_only_its_table(db_session, reservation_at_0010):
    alembic("upgrade", "head")
    alembic("downgrade", "0010")
    assert await scalar(db_session, TABLE_EXISTS) is False
    assert await scalar(
        db_session, "SELECT count(*) FROM usage_reservations WHERE id=:id", id=reservation_at_0010
    ) == 1
