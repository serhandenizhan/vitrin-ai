import pytest
from sqlalchemy import text

from tests.db_safety import (
    ALLOW_REMOTE_ENV,
    LOCAL_AUTH_SHIM_MARKER,
    UnsafeTestDatabaseError,
    ensure_disposable_database,
    ensure_local_database_host,
)


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+asyncpg://vitrin_ai:change_me_locally@localhost:5432/vitrin_ai",
        "postgresql+asyncpg://vitrin_ai:x@127.0.0.1:5434/vitrin_ai",
        "postgresql+asyncpg://vitrin_ai:x@[::1]:5432/vitrin_ai",
        "postgresql+asyncpg://vitrin_ai:x@postgres:5432/vitrin_ai",
    ],
)
def test_local_database_hosts_are_allowed(url):
    ensure_local_database_host(url, environ={})


@pytest.mark.parametrize(
    "url",
    [
        # Supabase session pooler — `auth` şeması kontrolüne gelmeden durmalı.
        "postgresql+asyncpg://postgres.ref:parola@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
        # `auth` şeması OLMAYAN uzak bir Postgres: şema kontrolü bunu "yeni
        # kurulmuş düz Postgres" sanıp sıfırlardı (PR #12 incelemesi bulgusu).
        "postgresql+asyncpg://app:parola@db.example.com:5432/app",
        "postgresql+asyncpg://app:parola@10.0.0.12:5432/app",
    ],
)
def test_remote_database_hosts_are_refused_before_connecting(url):
    with pytest.raises(UnsafeTestDatabaseError) as info:
        ensure_local_database_host(url, environ={})
    # Bağlantı dizesi (parola) hata mesajına girmiyor.
    assert "parola" not in str(info.value)


def test_remote_database_can_be_allowed_explicitly():
    ensure_local_database_host(
        "postgresql+asyncpg://ci:x@test-db.internal:5432/ci", environ={ALLOW_REMOTE_ENV: "1"}
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
