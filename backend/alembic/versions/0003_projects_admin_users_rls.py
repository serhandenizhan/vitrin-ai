"""kullanıcı projeleri, yönetici listesi ve tüm tablolarda RLS

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-10

Kök `CLAUDE.md` kural 7 ve `SECURITY.md` 3.1: RLS'siz tablo oluşturulmaz,
tablo ve politikası aynı migration'da gider.

ERİŞİM MODELİ — bu migration'daki her kararın dayanağı:

Tarayıcı veritabanına doğrudan gitmiyor; her istek Next.js vekilinden FastAPI'ye
geçiyor ve FastAPI veritabanına tablo SAHİBİ olarak bağlanıyor (RLS sahibi
etkilemez). Dolayısıyla kullanıcı verisinin asıl koruması backend'deki
sahiplik filtresi (IDOR, `SECURITY.md` 3.2). RLS ikinci katman: Supabase'in
`anon` anahtarı tasarım gereği herkese açık ve Data API (PostgREST) üzerinden
tablolara ulaşılabiliyor — RLS ve grant'ler o kapıyı kapatıyor.

Bu yüzden `anon` ve `authenticated` rollerinin HİÇBİR tabloda yetkisi yok
(`revoke all`). Supabase 28.04.2026'dan beri yeni tabloları Data API'ye
otomatik açmıyor, ama eski projelerde varsayılan grant'ler hâlâ var; proje ne
zaman oluşturulursa oluşturulsun sonuç aynı olsun diye açıkça geri alınıyor.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- projects: kullanıcının geçmiş çalışmaları ---------------------------
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            # Kullanıcı Supabase'den silinince projeleri de gider (KVKK: silme
            # hakkı). R2'deki görseller bu zincirin dışında — bkz. backend/README.
            sa.ForeignKey("auth.users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("file_name", sa.Text(), nullable=False),
        sa.Column("is_mocked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("result_r2_key", sa.Text(), nullable=False, unique=True),
        sa.Column("thumbnail_r2_key", sa.Text(), nullable=False, unique=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "char_length(file_name) between 1 and 255", name="projects_file_name_length"
        ),
        # `>= 0` tek başına yetmiyor: Postgres'te `'NaN' >= 0` ve
        # `'Infinity' >= 0` ikisi de DOĞRU. Sonsuz bir süre JSON'a çevrilemez;
        # kaydedilseydi kullanıcının proje listesi her istekte 500 dönerdi.
        # Postgres NaN'ı her sayıdan (Infinity dahil) büyük sıraladığı için
        # `< 'Infinity'` ikisini birden eliyor.
        sa.CheckConstraint(
            "duration_seconds is null or "
            "(duration_seconds >= 0 and duration_seconds < 'Infinity'::float8)",
            name="projects_duration_finite_non_negative",
        ),
    )
    # Tek indeks üç işi birden karşılıyor: listeleme sorgusu (kullanıcının
    # projeleri, en yeni önce), RLS politikasındaki `user_id` karşılaştırması
    # ve FK'nin ON DELETE CASCADE taraması (Postgres FK kolonlarını otomatik
    # indekslemiyor).
    op.create_index(
        "projects_user_id_created_at_idx",
        "projects",
        ["user_id", sa.text("created_at desc")],
    )
    op.execute("alter table public.projects enable row level security")
    op.execute("revoke all on table public.projects from anon, authenticated")
    # Politikalar, Data API bu tabloya AÇILIRSA geçerli olacak kurallar; şu an
    # yukarıdaki revoke nedeniyle kimse bu kapıdan giremiyor. Yazılı olmaları,
    # ileride biri `grant select` eklediğinde tablonun sessizce herkese
    # açılmasını engelliyor.
    #
    # `(select auth.uid())`: fonksiyon satır başına değil sorgu başına bir kez
    # çalışsın diye alt sorguya sarılı (Supabase RLS performans önerisi).
    op.execute(
        """
        create policy projects_select_own on public.projects
          for select to authenticated
          using ((select auth.uid()) = user_id)
        """
    )
    op.execute(
        """
        create policy projects_delete_own on public.projects
          for delete to authenticated
          using ((select auth.uid()) = user_id)
        """
    )
    # INSERT ve UPDATE politikası BİLİNÇLİ OLARAK YOK. Bir kullanıcının kendi
    # adına satır ekleyebilmesi, `result_r2_key` alanına BAŞKA bir kullanıcının
    # nesne anahtarını yazabilmesi demek olurdu — backend o anahtar için imzalı
    # URL ürettiğinde görsel yabancıya açılırdı. Anahtarları yalnızca backend
    # üretiyor (`projects/<user_id>/<uuid>/...`).

    # --- admin_users: X-Admin-Secret'ın yerini alan rol listesi --------------
    op.create_table(
        "admin_users",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("auth.users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.execute("alter table public.admin_users enable row level security")
    op.execute("revoke all on table public.admin_users from anon, authenticated")
    # Politika YOK = anon/authenticated için tam ret. Yetki verisi kullanıcının
    # kendi değiştirebileceği bir yerde durmuyor (Supabase uyarısı:
    # `user_metadata` kullanıcı tarafından düzenlenebilir, yetki kararında
    # kullanılmaz). JWT içindeki `app_metadata` da bilinçli olarak
    # kullanılmadı: token yenilenene kadar bayat kalıyor, yetkisi alınan bir
    # yönetici token süresince yönetici kalırdı. Backend her istekte bu
    # tabloya bakıyor.

    # --- backgrounds: Faz 3 tablosu, RLS'i ROADMAP Faz 4 notuyla ekleniyor ---
    op.execute("alter table public.backgrounds enable row level security")
    op.execute("revoke all on table public.backgrounds from anon, authenticated")
    # Politika yok: zeminleri yalnızca backend okuyor ve istemciye imzalı URL
    # olarak veriyor. `r2_key` ve pasif zeminler Data API'den görünmemeli.

    # --- alembic_version: gözden kaçan tablo ---------------------------------
    # Alembic kendi sürüm tablosunu `public` şemasına koyuyor. Varsayılan
    # grant'lerin olduğu bir Supabase projesinde `anon` bu tabloya YAZABİLİRDİ
    # ve migration geçmişini bozabilirdi. Alembic sahibi olarak bağlandığı için
    # RLS onu etkilemiyor.
    op.execute("alter table public.alembic_version enable row level security")
    op.execute("revoke all on table public.alembic_version from anon, authenticated")


def downgrade() -> None:
    op.execute("alter table public.alembic_version disable row level security")
    op.execute("alter table public.backgrounds disable row level security")
    op.drop_table("admin_users")
    op.drop_index("projects_user_id_created_at_idx", table_name="projects")
    op.drop_table("projects")
