"""Stüdyo taslağını projeye bağla."""

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("alter table projects add column editor_state jsonb")


def downgrade():
    op.execute("alter table projects drop column if exists editor_state")
