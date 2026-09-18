"""Sorun bildirimleri ve geliştirme önerileri."""

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        create table support_requests (
          id uuid primary key default gen_random_uuid(),
          user_id uuid references auth.users(id) on delete set null,
          kind text not null check (kind in ('issue','suggestion')),
          email text,
          message text not null check (length(message) between 10 and 4000),
          status text not null default 'new' check (status in ('new','reviewing','resolved')),
          created_at timestamptz not null default now()
        )
    """)
    op.execute("create index support_requests_recent on support_requests(created_at desc)")
    op.execute("alter table support_requests enable row level security")
    op.execute("revoke all on table support_requests from anon, authenticated")


def downgrade():
    op.execute("drop table if exists support_requests")
