"""yerel Postgres için Supabase auth uyumluluk katmanı

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-10

Faz 4'ün RLS politikaları Supabase'in `auth.uid()` fonksiyonuna, `auth.users`
tablosuna ve `anon` / `authenticated` rollerine dayanıyor. Bunlar gerçek bir
Supabase veritabanında zaten var; `docker-compose.yml`'deki düz Postgres'te YOK.
Bu migration olmasaydı 0003 yerelde (ve dolayısıyla testlerde) hiç
çalışmazdı — RLS politikaları yalnızca üretimde denenmiş olurdu.

Her adım VARLIK KONTROLÜYLE yapılıyor: Supabase'de bu nesneler zaten olduğu
için migration orada hiçbir şey yapmıyor (no-op). Supabase ayrıca 2025'ten beri
`auth` şemasında tablo/fonksiyon oluşturmayı engelliyor; kontrol olmasaydı
migration orada hata verirdi.

Yerel `auth.uid()`, Supabase'in kendi tanımıyla aynı mantıkla
`request.jwt.claim.sub` / `request.jwt.claims` ayarlarından okuyor — testler
bir kullanıcıyı `set_config('request.jwt.claims', '{"sub": "..."}', true)` ile
taklit edebiliyor.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Downgrade'in YALNIZCA bu migration'ın oluşturduğu şemayı silmesi için
# işaret. Supabase'in gerçek `auth` şemasında bu yorum yok; downgrade orada
# yanlışlıkla çalıştırılsa bile `auth` şemasına dokunmaz.
SHIM_MARKER = "vitrin-ai yerel Supabase uyumluluk katmani"


def upgrade() -> None:
    op.execute(
        f"""
        do $$
        begin
          if not exists (select 1 from pg_roles where rolname = 'anon') then
            create role anon nologin noinherit;
          end if;
          if not exists (select 1 from pg_roles where rolname = 'authenticated') then
            create role authenticated nologin noinherit;
          end if;

          if not exists (select 1 from pg_namespace where nspname = 'auth') then
            create schema auth;
            comment on schema auth is '{SHIM_MARKER}';

            create table auth.users (
              id uuid primary key,
              email text
            );

            create function auth.uid() returns uuid
              language sql stable
              as $fn$
                select coalesce(
                  nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
                )::uuid
              $fn$;

            grant usage on schema auth to anon, authenticated;
            grant execute on function auth.uid() to anon, authenticated;
          end if;
        end
        $$;
        """
    )


def downgrade() -> None:
    # Roller bilinçli olarak SİLİNMİYOR: roller veritabanına değil tüm
    # Postgres kümesine ait; başka bir veritabanında yetkileri varsa
    # `drop role` başarısız olur ve downgrade'i (ve test oturumunun
    # temizliğini) kırar. Yerelde kalmaları zararsız, yeniden upgrade'de
    # varlık kontrolü onları atlıyor.
    op.execute(
        f"""
        do $$
        begin
          if exists (
            select 1 from pg_namespace n
            where n.nspname = 'auth'
              and obj_description(n.oid, 'pg_namespace') = '{SHIM_MARKER}'
          ) then
            drop schema auth cascade;
          end if;
        end
        $$;
        """
    )
