"""Kesim denemelerinin R2 anahtarlarını kalıcı olarak izle."""

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE cutout_result_attempts (
            key text PRIMARY KEY,
            reservation_id uuid NOT NULL REFERENCES usage_reservations(id) ON DELETE CASCADE,
            created_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX cutout_result_attempts_created ON cutout_result_attempts(created_at)")
    op.execute("ALTER TABLE cutout_result_attempts ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON TABLE cutout_result_attempts FROM anon, authenticated")


def downgrade():
    op.execute("DROP TABLE IF EXISTS cutout_result_attempts")
