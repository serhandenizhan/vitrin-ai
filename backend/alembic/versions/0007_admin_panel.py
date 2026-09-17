"""Faz 6 admin paneli: bonus krediler, denetim günlüğü, rezervasyonun kredi kaynağı.

`0006` YERİNDE DÜZENLENMEDİ. O revizyon gerçek bir veritabanına uygulandıysa
Alembic onu bir daha çalıştırmaz; dosyadaki bir değişiklik yerelde görünür ama
production'da sessizce hiç uygulanmazdı. Bu yüzden Faz 6'nın şeması ayrı bir
revizyon olarak geliyor ve `0006`'daki `billing_immutable_snapshot`'ı
`CREATE OR REPLACE` ile genişletiyor.
"""

from pathlib import Path
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    # Ayrı ifadeler asyncpg'nin tek prepared statement kuralını korur.
    sql = Path(__file__).with_suffix(".sql").read_text()
    for statement in sql.split("\n-- statement\n"):
        if statement.strip():
            op.execute(statement)


def downgrade():
    op.execute("drop trigger if exists credit_grant_snapshot on credit_grants")
    # `billing_immutable_snapshot` 0005/0006'ya ait; burada yalnızca 0007'nin
    # eklediği `credit_grants` dalı geri alınıyor, fonksiyon düşürülmüyor.
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
         elsif tg_table_name='subscription_periods' then
          if (to_jsonb(new)-'status'-'closed_at'-'used_this_period'-'user_id') is distinct from (to_jsonb(old)-'status'-'closed_at'-'used_this_period'-'user_id')
           or (new.user_id is distinct from old.user_id and new.user_id is not null)
          then raise exception 'subscription period is immutable'; end if;
         elsif tg_table_name='user_consents' then
          if (to_jsonb(new)-'user_id') is distinct from (to_jsonb(old)-'user_id')
           or (new.user_id is distinct from old.user_id and new.user_id is not null)
          then raise exception 'consent is immutable'; end if;
         end if;
         return new;
        end $$
    """)
    op.execute("drop trigger if exists admin_audit_append_only on admin_audit_log")
    op.execute("drop function if exists public.admin_audit_append_only()")
    op.execute("drop table if exists admin_audit_log")
    op.execute("alter table usage_reservations drop column grant_id")
    op.execute("drop table if exists credit_grants")
