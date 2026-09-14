"""degistirilemez kayit ve KVKK bildirim kayitlari

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_consents",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("auth.users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("document_type", sa.Text(), nullable=False),
        sa.Column("document_version", sa.Text(), nullable=False),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.statement_timestamp(),
        ),
        sa.Column("source", sa.Text(), nullable=False, server_default="signup"),
        sa.CheckConstraint(
            "document_type in ('terms', 'kvkk_notice')",
            name="user_consents_document_type",
        ),
        sa.UniqueConstraint(
            "user_id",
            "document_type",
            "document_version",
            name="user_consents_user_document_version_key",
        ),
    )
    op.create_index("user_consents_user_id_idx", "user_consents", ["user_id"])
    op.execute("alter table public.user_consents enable row level security")
    op.execute("revoke all on table public.user_consents from anon, authenticated")
    op.execute(
        "revoke all on sequence public.user_consents_id_seq from anon, authenticated"
    )

    # Yerel uyumluluk tablosu onceki surumde bu Supabase kolonunu icermiyordu.
    # Hosted Supabase'de auth.users, supabase_auth_admin'e aittir; postgres rolu
    # kolon zaten var olsa bile ALTER TABLE icin sahiplik kontrolunde reddedilir.
    # Bu nedenle ALTER yalnizca 0002'nin yorumla isaretledigi yerel shim'de kosar.
    op.execute(
        """
        do $$
        begin
          if exists (
            select 1
            from pg_namespace n
            where n.nspname = 'auth'
              and obj_description(n.oid, 'pg_namespace') =
                'vitrin-ai yerel Supabase uyumluluk katmani'
          ) then
            alter table auth.users add column if not exists
              raw_user_meta_data jsonb not null default '{}'::jsonb;
          end if;
        end
        $$
        """
    )
    op.execute(
        """
        create or replace function public.record_signup_consents()
        returns trigger
        language plpgsql
        security definer
        set search_path = public, pg_temp
        as $$
        declare
          accepted_version text;
        begin
          accepted_version := nullif(new.raw_user_meta_data ->> 'terms_version', '');
          if accepted_version is null
             or new.raw_user_meta_data ->> 'terms_accepted' <> 'true' then
            return new;
          end if;

          insert into public.user_consents (user_id, document_type, document_version)
          values
            (new.id, 'terms', accepted_version),
            (new.id, 'kvkk_notice', accepted_version)
          on conflict (user_id, document_type, document_version) do nothing;
          return new;
        end;
        $$
        """
    )
    op.execute(
        """
        create trigger record_signup_consents_after_user_write
        after insert or update of raw_user_meta_data on auth.users
        for each row execute function public.record_signup_consents()
        """
    )
    # Migration'dan once kaydolmus kullanicilarin kabul surumleri yalnizca
    # degistirilebilir metadata'da kalmasin. Gercek kabul zamani istemci
    # kaynakli oldugu icin guvenilir bir sunucu zamani gibi sunulmuyor;
    # `recorded_at` bu aktarimin sunucuda yapildigi ani, `source` ise kaynagin
    # metadata backfill'i oldugunu acikca kaydeder.
    op.execute(
        """
        insert into public.user_consents
          (user_id, document_type, document_version, source)
        select
          users.id,
          documents.document_type,
          nullif(users.raw_user_meta_data ->> 'terms_version', ''),
          'metadata_backfill'
        from auth.users as users
        cross join (
          values ('terms'::text), ('kvkk_notice'::text)
        ) as documents(document_type)
        where users.raw_user_meta_data ->> 'terms_accepted' = 'true'
          and nullif(users.raw_user_meta_data ->> 'terms_version', '') is not null
        on conflict (user_id, document_type, document_version) do nothing
        """
    )


def downgrade() -> None:
    op.execute(
        "drop trigger if exists record_signup_consents_after_user_write on auth.users"
    )
    op.execute("drop function if exists public.record_signup_consents()")
    op.drop_index("user_consents_user_id_idx", table_name="user_consents")
    op.drop_table("user_consents")
