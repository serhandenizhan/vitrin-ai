"""Faz 5: dönemler, rezervasyonlar, mali defter ve kalıcı iş kuyrukları."""

from pathlib import Path
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    # Ayrı ifadeler asyncpg'nin tek prepared statement kuralını korur.
    sql = Path(__file__).with_suffix(".sql").read_text()
    for statement in sql.split("\n-- statement\n"):
        if statement.strip():
            op.execute(statement)


def downgrade():
    op.execute("drop trigger if exists consent_snapshot on user_consents")
    op.execute("drop function if exists public.billing_immutable_snapshot() cascade")
    op.execute("drop trigger if exists billing_signup on auth.users")
    op.execute("drop function if exists public.billing_signup()")
    op.execute("drop trigger if exists billing_delete_guard on auth.users")
    op.execute("drop function if exists public.billing_delete_guard()")
    op.execute(
        "alter table user_consents drop constraint if exists user_consents_checkout_session_id_fkey"
    )
    for table in (
        "billing_alerts",
        "billing_runs",
        "storage_deletion_jobs",
        "provider_actions",
        "webhook_events",
        "billing_transactions",
        "checkout_sessions",
        "usage_events",
        "usage_reservations",
        "subscription_periods",
        "subscriptions",
        "plan_versions",
        "plans",
    ):
        op.execute(f"drop table {table} cascade")
    for column in (
        "document_hash",
        "locale",
        "plan_version_id",
        "checkout_session_id",
        "retention_subject",
    ):
        op.execute(f"alter table user_consents drop column {column}")
    op.execute("alter table backgrounds drop column tier")
    op.execute("alter table projects drop column background_id")
    op.execute("alter table user_consents drop constraint user_consents_document_type")
    op.execute(
        "delete from user_consents where document_type not in ('terms', 'kvkk_notice') or user_id is null"
    )
    op.execute(
        "alter table user_consents add constraint user_consents_document_type check (document_type in ('terms', 'kvkk_notice'))"
    )
    op.execute("alter table user_consents drop constraint user_consents_user_id_fkey")
    op.execute(
        "alter table user_consents add foreign key (user_id) references auth.users(id) on delete cascade"
    )
    op.execute("alter table user_consents alter column user_id set not null")
    op.execute("drop index if exists user_consents_signup_unique")
    op.execute("drop index if exists user_consents_checkout_unique")
    op.execute(
        "alter table user_consents add constraint user_consents_user_document_version_key unique(user_id, document_type, document_version)"
    )

    # 0004 sürümünde kayıt tetikleyicisi eski unique constraint ile çalışmalı.
    op.execute("""
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
    """)
