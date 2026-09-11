"""Veritabanı seviyesindeki erişim kuralları (RLS + grant'ler).

Backend tablo sahibi olarak bağlanıyor ve RLS'ten etkilenmiyor; bu testler
Supabase'in Data API'si (PostgREST) üzerinden gelecek `anon`/`authenticated`
isteklerini, rolleri `set local role` ile taklit ederek sınıyor. Yerel
`auth.uid()` migration 0002'deki uyumluluk katmanından geliyor.
"""

import json
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.models.project import Project

CLIENT_ROLES = ("anon", "authenticated")
TABLE_PRIVILEGES = ("SELECT", "INSERT", "UPDATE", "DELETE")


async def _public_tables(db_session) -> dict[str, bool]:
    result = await db_session.execute(
        text(
            """
            select c.relname, c.relrowsecurity
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p')
            """
        )
    )
    return dict(result.all())


async def _act_as(db_session, role: str, user_id: uuid.UUID | None) -> None:
    # `set local` yalnızca bu transaction için geçerli; test sonundaki
    # rollback rolü ve geçici grant'leri geri alıyor.
    await db_session.execute(text(f"set local role {role}"))
    if user_id is not None:
        await db_session.execute(
            text("select set_config('request.jwt.claims', :claims, true)"),
            {"claims": json.dumps({"sub": str(user_id), "role": role})},
        )


async def _insert_project(db_session, user_id: uuid.UUID) -> Project:
    project_id = uuid.uuid4()
    project = Project(
        id=project_id,
        user_id=user_id,
        file_name="a.jpg",
        result_r2_key=f"projects/{user_id}/{project_id}/result.png",
        thumbnail_r2_key=f"projects/{user_id}/{project_id}/thumbnail.png",
    )
    db_session.add(project)
    await db_session.commit()
    return project


async def test_every_public_table_has_rls_enabled(db_session):
    # Kök CLAUDE.md kural 7'nin koruması: ileride RLS'siz bir tablo eklenirse
    # bu test kırmızı yanar. `alembic_version` da dahil — varsayılan
    # grant'lerin olduğu bir projede anon ona yazabilirdi.
    tables = await _public_tables(db_session)

    assert {"projects", "admin_users", "backgrounds", "alembic_version"} <= set(tables)
    assert [name for name, has_rls in tables.items() if not has_rls] == []


async def test_client_roles_have_no_privileges_on_any_public_table(db_session):
    tables = await _public_tables(db_session)
    granted = []
    for table in tables:
        for role in CLIENT_ROLES:
            for privilege in TABLE_PRIVILEGES:
                allowed = await db_session.scalar(
                    text("select has_table_privilege(:role, :table, :privilege)"),
                    {"role": role, "table": f"public.{table}", "privilege": privilege},
                )
                if allowed:
                    granted.append((role, table, privilege))

    assert granted == []


async def test_policies_exist_only_where_intended(db_session):
    result = await db_session.execute(
        text("select tablename, cmd from pg_policies where schemaname = 'public'")
    )
    policies = {(table, cmd) for table, cmd in result.all()}

    # projects: yalnızca kendi satırını okuma ve silme. INSERT/UPDATE
    # politikası yok — bkz. migration 0003 (başkasının R2 anahtarını yazma).
    assert policies == {("projects", "SELECT"), ("projects", "DELETE")}


async def test_projects_select_policy_shows_only_own_rows(db_session, create_user):
    owner = await create_user()
    stranger = await create_user()
    await _insert_project(db_session, owner)
    await _insert_project(db_session, stranger)

    # Politika yalnızca grant verilince devreye giriyor (şu an kimsenin yetkisi
    # yok); tablo ileride Data API'ye açılırsa ne olacağını sınıyoruz.
    await db_session.execute(text("grant select, delete on public.projects to authenticated"))
    await _act_as(db_session, "authenticated", owner)

    visible = (await db_session.execute(text("select user_id from public.projects"))).scalars().all()
    assert visible == [owner]

    deleted = await db_session.execute(
        text("delete from public.projects where user_id = :stranger"), {"stranger": stranger}
    )
    assert deleted.rowcount == 0

    await db_session.rollback()


async def test_projects_reject_client_inserts_even_if_granted(db_session, create_user):
    owner = await create_user()
    await db_session.execute(text("grant insert on public.projects to authenticated"))
    await _act_as(db_session, "authenticated", owner)

    with pytest.raises(DBAPIError, match="row-level security"):
        await db_session.execute(
            text(
                """
                insert into public.projects (id, user_id, file_name, result_r2_key, thumbnail_r2_key)
                values (:id, :owner, 'x', 'projects/baskasi/result.png', 'projects/baskasi/t.png')
                """
            ),
            {"id": uuid.uuid4(), "owner": owner},
        )

    await db_session.rollback()


async def test_users_cannot_see_admin_list_even_if_granted(db_session, create_user, grant_admin):
    admin = await create_user()
    await grant_admin(admin)
    await db_session.execute(text("grant select on public.admin_users to authenticated"))
    await _act_as(db_session, "authenticated", admin)

    # Yönetici bile kendi satırını göremiyor: politika yok, tam ret.
    rows = (await db_session.execute(text("select user_id from public.admin_users"))).all()
    assert rows == []

    await db_session.rollback()


async def test_anon_cannot_read_projects_without_grant(db_session, create_user):
    owner = await create_user()
    await _insert_project(db_session, owner)
    await _act_as(db_session, "anon", None)

    with pytest.raises(DBAPIError, match="permission denied"):
        await db_session.execute(text("select * from public.projects"))

    await db_session.rollback()


async def test_deleting_user_cascades_to_projects_and_admin_role(
    db_session, create_user, grant_admin
):
    # KVKK silme hakkı: kullanıcı Supabase'den silindiğinde veritabanında
    # kaydı kalmamalı. (R2 nesneleri ayrı — bkz. backend/README.)
    user_id = await create_user()
    await _insert_project(db_session, user_id)
    await grant_admin(user_id)

    await db_session.execute(text("delete from auth.users where id = :id"), {"id": user_id})
    await db_session.commit()

    assert await db_session.scalar(text("select count(*) from public.projects")) == 0
    assert await db_session.scalar(text("select count(*) from public.admin_users")) == 0
