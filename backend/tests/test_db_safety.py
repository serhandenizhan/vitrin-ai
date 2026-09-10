import pytest
from sqlalchemy import text

from tests.db_safety import (
    LOCAL_AUTH_SHIM_MARKER,
    UnsafeTestDatabaseError,
    ensure_disposable_database,
)


def test_plain_postgres_without_auth_schema_is_allowed():
    # Yeni kurulmuş düz Postgres: 0002 uyumluluk katmanını kuracak.
    ensure_disposable_database(has_auth_schema=False, auth_schema_comment=None)


def test_database_with_local_shim_is_allowed():
    ensure_disposable_database(has_auth_schema=True, auth_schema_comment=LOCAL_AUTH_SHIM_MARKER)


@pytest.mark.parametrize("comment", [None, "", "Auth: Supabase auth schema"])
def test_database_with_a_foreign_auth_schema_is_refused(comment):
    # Supabase'in kendi `auth` şeması: bizim işaretimiz yok. Testler orada
    # her testten sonra `auth.users`'ı silip oturum sonunda tabloları düşürürdü.
    with pytest.raises(UnsafeTestDatabaseError):
        ensure_disposable_database(has_auth_schema=True, auth_schema_comment=comment)


async def test_connected_test_database_carries_the_shim_marker(db_session):
    # İşaret migration 0002'den okunuyor; bu test, korumanın gerçekten
    # bağlanılan test veritabanını tanıdığını (ve tanımadığı her şeyi
    # reddedeceğini) canlı veritabanında doğruluyor.
    comment = await db_session.scalar(
        text("select obj_description(oid, 'pg_namespace') from pg_namespace where nspname = 'auth'")
    )

    assert comment == LOCAL_AUTH_SHIM_MARKER
