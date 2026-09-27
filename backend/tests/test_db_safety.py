import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import text

from tests.db_safety import (
    ALLOW_DEV_DB_RESET_ENV,
    ALLOW_REMOTE_ENV,
    LOCAL_AUTH_SHIM_MARKER,
    TEST_COMMAND,
    concurrent_session_message,
    UnsafeTestDatabaseError,
    ensure_disposable_database,
    ensure_local_database_host,
    ensure_not_dev_database,
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


# --- `execute.sh`'ın geliştirme veritabanı (27.09.2026) ----------------------
# `DATABASE_URL` verilmeden koşturulan `pytest`, execute.sh açıkken onun
# veritabanını sildi: adres yereldi, şema 0002 işaretini taşıyordu — yukarıdaki
# iki kontrol ona "atılabilir" diyordu.


@pytest.mark.parametrize(
    "url",
    [
        # backend/.env.example'daki ve execute.sh'ın kullandığı adres.
        "postgresql+asyncpg://vitrin_ai:change_me_locally@localhost:5432/vitrin_ai",
        "postgresql+asyncpg://vitrin_ai:parola@127.0.0.1/vitrin_ai",  # port yok = 5432
        "postgresql+asyncpg://vitrin_ai:parola@[::1]:5432/vitrin_ai",
        "postgresql+asyncpg://vitrin_ai:parola@postgres:5432/vitrin_ai",
        "postgresql+asyncpg://vitrin_ai:parola@LOCALHOST:5432/vitrin_ai",
    ],
)
def test_dev_database_is_refused_before_connecting(url):
    with pytest.raises(UnsafeTestDatabaseError) as info:
        ensure_not_dev_database(url, environ={})
    message = str(info.value)
    assert TEST_COMMAND in message and ALLOW_DEV_DB_RESET_ENV in message
    assert "parola" not in message  # bağlantı dizesi mesaja girmez


@pytest.mark.parametrize(
    "url",
    [
        # backend/scripts/test.sh'ın açtığı ayrı test veritabanı.
        "postgresql+asyncpg://vitrin_ai:change_me_locally@localhost:5434/vitrin_ai",
        # CI (.github/workflows/ci.yml): aynı port, farklı ad.
        "postgresql+asyncpg://vitrin_ai:change_me_locally@localhost:5432/vitrin_ai_test",
        # Aynı kapsayıcıda elle açılmış ayrı bir veritabanı.
        "postgresql+asyncpg://vitrin_ai:x@localhost:5432/vitrin_ai_test2",
    ],
)
def test_separate_test_databases_are_allowed(url):
    ensure_not_dev_database(url, environ={})


def test_dev_database_reset_can_be_allowed_explicitly():
    ensure_not_dev_database(
        "postgresql+asyncpg://vitrin_ai:x@localhost:5432/vitrin_ai",
        environ={ALLOW_DEV_DB_RESET_ENV: "1"},
    )
    with pytest.raises(UnsafeTestDatabaseError):  # yalnız "1" geçer, "true" değil
        ensure_not_dev_database(
            "postgresql+asyncpg://vitrin_ai:x@localhost:5432/vitrin_ai",
            environ={ALLOW_DEV_DB_RESET_ENV: "true"},
        )


def test_plain_pytest_on_the_dev_database_stops_before_touching_it():
    # Korumanın conftest'e gerçekten BAĞLI olduğunu uçtan uca gösterir: ayrı
    # bir pytest süreci geliştirme veritabanı adresiyle başlatılır ve çıkış
    # kodu 3 ile durmalıdır. Sunucu adı `postgres` bilerek seçildi: kural onu
    # geliştirme veritabanı sayar ama ana makinede çözülmez — koruma
    # kaldırılsa bile bu test hiçbir veritabanına dokunamaz, yalnız bağlantı
    # hatasıyla (3 dışı bir kodla) kırmızı yanar.
    env = {
        key: value
        for key, value in os.environ.items()
        if key not in (ALLOW_DEV_DB_RESET_ENV, ALLOW_REMOTE_ENV)
    }
    env["DATABASE_URL"] = "postgresql+asyncpg://vitrin_ai:change_me_locally@postgres:5432/vitrin_ai"
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider",
         "tests/test_db_safety.py::test_plain_postgres_without_auth_schema_is_allowed"],
        cwd=Path(__file__).resolve().parent.parent,
        env=env, capture_output=True, text=True, timeout=180,
    )
    output = result.stdout + result.stderr
    assert result.returncode == 3, output
    assert TEST_COMMAND in output


async def test_second_session_on_the_same_database_stops_before_touching_it(db_session):
    # Bu oturum kilidi tutuyor. Aynı veritabanına ikinci bir pytest başlatılır:
    # kilidi alamayıp 3 ile durmalı. Kilit olmasaydı ikinci oturum kendi
    # sonunda `alembic downgrade base` çalıştırıp BU oturumun tablolarını
    # düşürürdü (27.09.2026'da yaşandı).
    from app.core.config import settings

    env = {key: value for key, value in os.environ.items()}
    env["DATABASE_URL"] = settings.database_url
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider",
         "tests/test_db_safety.py::test_plain_postgres_without_auth_schema_is_allowed"],
        cwd=Path(__file__).resolve().parent.parent,
        env=env, capture_output=True, text=True, timeout=180,
    )
    output = result.stdout + result.stderr
    assert result.returncode == 3, output
    assert "BAŞKA bir test oturumu" in output
    assert concurrent_session_message().split(".")[0] in output
    # Tablolar yerinde: ikinci oturum hiçbir şeye dokunmadı.
    assert await db_session.scalar(text("select to_regclass('public.usage_reservations') is not null"))
