"""Çalışmaları yarım kalan ve tamamlanan olarak ayır.

Bir kesim oluşturulduğunda proje taslak başlar. Kullanıcı stüdyodan bir çıktı
indirdiğinde tamamlanır; böylece çalışma listesi tahmine değil gerçek olaya
dayanır.
"""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("alter table projects add column workflow_status text not null default 'draft'")
    op.execute("alter table projects add column downloaded_at timestamptz")
    op.execute("alter table projects add constraint projects_workflow_status_check check (workflow_status in ('draft','completed'))")


def downgrade():
    op.execute("alter table projects drop constraint if exists projects_workflow_status_check")
    op.execute("alter table projects drop column if exists downloaded_at")
    op.execute("alter table projects drop column if exists workflow_status")
