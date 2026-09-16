"""Faz 5 uygulama incelemesi: grace penceresi, sonuç idempotency'si ve DB kısıtları.

`0005` YERİNDE DÜZENLENMEDİ. O revizyon gerçek bir veritabanına uygulandıysa
Alembic onu bir daha çalıştırmaz; dosyadaki bir değişiklik yerelde görünür ama
production'da sessizce hiç uygulanmazdı. Bu yüzden inceleme düzeltmeleri ayrı
bir revizyon olarak geliyor ve `0005`'teki iki fonksiyonu `CREATE OR REPLACE`
ile güncelliyor.
"""

from pathlib import Path
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    # Ayrı ifadeler asyncpg'nin tek prepared statement kuralını korur.
    sql = Path(__file__).with_suffix(".sql").read_text()
    for statement in sql.split("\n-- statement\n"):
        if statement.strip():
            op.execute(statement)


def downgrade():
    op.execute("drop trigger if exists plan_versions_free_available on plan_versions")
    op.execute("drop function if exists public.billing_free_plan_available()")
    op.execute("drop trigger if exists period_snapshot on subscription_periods")
    # `billing_immutable_snapshot` ve `billing_delete_guard` 0005'e ait; burada
    # yalnızca 0006'nın eklediği dallar geri alınıyor, fonksiyonlar düşürülmüyor.
    op.execute("""
        create or replace function public.billing_immutable_snapshot()
        returns trigger language plpgsql set search_path=public,pg_temp as $$
        begin
         if tg_table_name='plan_versions' then
          if (to_jsonb(new)-'retired_at') is distinct from (to_jsonb(old)-'retired_at') then raise exception 'plan version is immutable'; end if;
         elsif tg_table_name='billing_transactions' then
          if (to_jsonb(new)-'user_id'-'invoice_reference') is distinct from (to_jsonb(old)-'user_id'-'invoice_reference')
           or (new.user_id is distinct from old.user_id and new.user_id is not null)
           or (old.invoice_reference is not null and new.invoice_reference is distinct from old.invoice_reference)
          then raise exception 'financial transaction is immutable'; end if;
         elsif tg_table_name='user_consents' then
          if (to_jsonb(new)-'user_id') is distinct from (to_jsonb(old)-'user_id')
           or (new.user_id is distinct from old.user_id and new.user_id is not null)
          then raise exception 'consent is immutable'; end if;
         end if;
         return new;
        end $$
    """)
    op.execute("""
        create or replace function public.billing_delete_guard()
        returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
        begin
         if exists(select 1 from public.subscriptions where user_id=old.id and provider_subscription_reference is not null and status not in ('canceled','expired'))
         or exists(select 1 from public.checkout_sessions where user_id=old.id and status='pending')
         or exists(select 1 from public.provider_actions where user_id=old.id and kind in ('cancel_subscription','refund_payment') and status<>'succeeded') then
         raise exception 'billing cancellation must complete before account deletion';
         end if;
         return old;
        end $$
    """)
    op.execute("delete from provider_actions where kind = 'dunning_email'")
    op.execute("alter table provider_actions drop constraint provider_actions_kind_check")
    op.execute(
        "alter table provider_actions add constraint provider_actions_kind_check "
        "check (kind in ('cancel_subscription','refund_payment','suspend_entitlement','delete_account'))"
    )
    op.execute("drop index if exists usage_reservations_result_expiry")
    op.execute(
        "alter table usage_reservations drop constraint usage_reservations_result_pairing"
    )
    op.execute(
        "alter table usage_reservations drop column result_r2_key, drop column result_expires_at"
    )
    op.execute("alter table subscriptions drop column past_due_access_until")
