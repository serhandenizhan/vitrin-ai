"""`0012` yalnız boş DB'de değil, `0011` UYGULANMIŞ bir DB'de de doğru çalışmalı.

Production'daki Alembic `0011`'i çoktan çalıştırmış; `record_signup_consents`
orada PUBLIC ve `anon` yetkisiyle duruyor. Test, o durumu yerelde kurup
(Supabase'in varsayılan yetkisini taklit eden açık `anon` grant'i dahil)
yükseltmenin yetkileri gerçekten kapattığını ve kayıt tetikleyicisinin
yetkisiz de çalışmaya devam ettiğini doğrular.

Testin sonunda veritabanı `head`de bırakılır; diğer testler bunu varsayıyor.
"""

import json
import uuid

import pytest
from sqlalchemy import text

from tests.test_migration_0006 import alembic, scalar
from tests.test_rls import CLIENT_ROLES, _security_definer_functions_callable_by_clients


@pytest.fixture
async def at_revision_0011(db_session):
    """Veritabanını `0011`'e indirir, test bitince `head`e geri çıkarır."""
    await db_session.rollback()
    alembic("downgrade", "0011")
    yield
    alembic("upgrade", "head")


async def test_0012_revokes_client_execute_on_a_database_that_has_0011(
    db_session, at_revision_0011
):
    # Production'daki durum (yedek manifesti): PUBLIC Postgres'in varsayılanından,
    # anon Supabase'in varsayılan yetkilerinden. 0012'nin downgrade'i bilinçli
    # olarak yetkiyi geri vermediği için ikisini de burada açıkça kuruyoruz.
    await db_session.execute(
        text("grant execute on function public.record_signup_consents() to public, anon")
    )
    await db_session.commit()
    assert await _security_definer_functions_callable_by_clients(db_session) == [
        ("record_signup_consents()", "PUBLIC"),
        ("record_signup_consents()", "anon"),
    ]

    alembic("upgrade", "head")
    # Yukarıdaki sorgu bu oturumda bir transaction açtı. `has_function_privilege`
    # katalog önbelleğinden okur ve açık bir transaction, başka bağlantının
    # (Alembic) commit ettiği yetki değişikliğini görmez; yeni transaction şart.
    await db_session.rollback()

    assert await _security_definer_functions_callable_by_clients(db_session) == []
    for role in CLIENT_ROLES:
        assert not await scalar(
            db_session,
            "select has_function_privilege(:role, "
            "'public.record_signup_consents()', 'EXECUTE')",
            role=role,
        )

    # Tetikleyici EXECUTE yetkisini tetikleme anında denetlemez; kayıt onayı
    # REVOKE'tan sonra da yazılmalı.
    user_id = uuid.uuid4()
    await db_session.execute(
        text(
            "insert into auth.users (id, email, raw_user_meta_data) "
            "values (:id, 'revoke@test.example', cast(:metadata as jsonb))"
        ),
        {
            "id": user_id,
            "metadata": json.dumps({"terms_accepted": True, "terms_version": "2026-09-14"}),
        },
    )
    await db_session.commit()
    assert await scalar(
        db_session, "select count(*) from public.user_consents where user_id = :id", id=user_id
    ) == 2
