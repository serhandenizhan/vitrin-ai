"""`0007` yalnız boş DB'de değil, `0006` UYGULANMIŞ bir DB'de de doğru çalışmalı.

Gerçek ortamın izlediği yol budur: production'daki Alembic `0006`'yı çoktan
çalıştırmış, `alembic_version` o revizyonda. Yalnızca sıfırdan `upgrade head`
test etmek bu yolu hiç sınamaz.

Testin sonunda veritabanı `head`de bırakılır; diğer testler bunu varsayıyor.
"""

import pytest

from tests.test_migration_0006 import COLUMN_SQL, TRIGGER_SQL, alembic, scalar

TABLE_SQL = """
SELECT count(*) FROM information_schema.tables
WHERE table_schema='public' AND table_name=:table
"""

RLS_SQL = """
SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname=:table
"""


@pytest.fixture
async def at_revision_0006(db_session):
    """Veritabanını `0006`'ya indirir, test bitince `head`e geri çıkarır."""
    await db_session.rollback()
    alembic("downgrade", "0006")
    yield
    alembic("upgrade", "head")


async def test_0007_upgrades_a_database_that_already_has_0006(
    db_session, at_revision_0006
):
    for table in ("credit_grants", "admin_audit_log"):
        assert await scalar(db_session, TABLE_SQL, table=table) == 0
    assert await scalar(
        db_session, COLUMN_SQL, table="usage_reservations", column="grant_id"
    ) == 0
    assert await scalar(db_session, TRIGGER_SQL, name="credit_grant_snapshot") == 0

    alembic("upgrade", "head")

    for table in ("credit_grants", "admin_audit_log"):
        assert await scalar(db_session, TABLE_SQL, table=table) == 1
        # RLS'siz bir tablo, `anon` anahtarıyla PostgREST üzerinden internete
        # açık demektir (kök CLAUDE.md kural 7).
        assert await scalar(db_session, RLS_SQL, table=table) is True
    assert await scalar(
        db_session, COLUMN_SQL, table="usage_reservations", column="grant_id"
    ) == 1
    assert await scalar(db_session, TRIGGER_SQL, name="credit_grant_snapshot") == 1
    assert await scalar(db_session, TRIGGER_SQL, name="admin_audit_append_only") == 1
    # 0006'daki fonksiyon CREATE OR REPLACE ile genişletildi; eski dalları
    # kaybetmeden yeni dal eklenmiş olmalı.
    source = await scalar(
        db_session, "SELECT prosrc FROM pg_proc WHERE proname='billing_immutable_snapshot'"
    )
    assert "credit grant is immutable" in source
    assert "subscription period is immutable" in source
