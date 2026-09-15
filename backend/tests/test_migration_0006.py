"""`0006` yalnız boş DB'de değil, `0005` UYGULANMIŞ bir DB'de de doğru çalışmalı.

Gerçek ortamın izlediği yol budur: production'daki Alembic `0005`'i çoktan
çalıştırmış, `alembic_version` o revizyonda. Yalnızca sıfırdan `upgrade head`
test etmek, bu yolu hiç sınamaz — bu yüzden `0005`'e inip tekrar `head`e çıkan
ayrı bir test var.

Testin sonunda veritabanı `head`de bırakılır; diğer testler bunu varsayıyor.
"""

import subprocess
import sys

import pytest
from sqlalchemy import text

from tests.conftest import BACKEND_DIR

COLUMN_SQL = """
SELECT count(*) FROM information_schema.columns
WHERE table_schema='public' AND table_name=:table AND column_name=:column
"""

TRIGGER_SQL = """
SELECT count(*) FROM pg_trigger
WHERE NOT tgisinternal AND tgname=:name
"""


def alembic(*args: str) -> None:
    subprocess.run(
        [sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR, check=True
    )


async def scalar(db, sql, **params):
    return await db.scalar(text(sql), params)


@pytest.fixture
async def at_revision_0005(db_session):
    """Veritabanını `0005`'e indirir, test bitince `head`e geri çıkarır."""
    await db_session.rollback()
    alembic("downgrade", "0005")
    yield
    alembic("upgrade", "head")


async def test_0006_upgrades_a_database_that_already_has_0005(
    db_session, at_revision_0005
):
    # 0005 uygulanmış hâlde yeni alanların HİÇBİRİ yok.
    assert await scalar(
        db_session, COLUMN_SQL, table="subscriptions", column="past_due_access_until"
    ) == 0
    assert await scalar(
        db_session, COLUMN_SQL, table="usage_reservations", column="result_r2_key"
    ) == 0
    assert await scalar(db_session, TRIGGER_SQL, name="period_snapshot") == 0
    assert await scalar(db_session, TRIGGER_SQL, name="plan_versions_free_available") == 0

    alembic("upgrade", "head")

    assert await scalar(
        db_session, COLUMN_SQL, table="subscriptions", column="past_due_access_until"
    ) == 1
    for column in ("result_r2_key", "result_expires_at"):
        assert await scalar(
            db_session, COLUMN_SQL, table="usage_reservations", column=column
        ) == 1
    assert await scalar(db_session, TRIGGER_SQL, name="period_snapshot") == 1
    assert await scalar(db_session, TRIGGER_SQL, name="plan_versions_free_available") == 1
    # 0005'te var olan iki fonksiyon CREATE OR REPLACE ile güncellendi.
    assert "initialization_started" in await scalar(
        db_session,
        "SELECT prosrc FROM pg_proc WHERE proname='billing_delete_guard'",
    )
    assert "subscription period is immutable" in await scalar(
        db_session,
        "SELECT prosrc FROM pg_proc WHERE proname='billing_immutable_snapshot'",
    )
    # Yeni eylem türü 0005'in CHECK kısıtına takılmıyor.
    assert await scalar(
        db_session,
        """SELECT count(*) FROM pg_constraint
        WHERE conname='provider_actions_kind_check'
        AND pg_get_constraintdef(oid) LIKE '%dunning_email%'""",
    ) == 1
