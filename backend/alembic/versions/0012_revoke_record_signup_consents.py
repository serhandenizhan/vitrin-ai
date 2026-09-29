"""record_signup_consents fonksiyonunun istemci yetkilerini geri al.

27.09.2026'da production yedeğinin yetki manifestinde
`public.record_signup_consents()` için PUBLIC ve `anon` EXECUTE görüldü.
Diğer bütün SECURITY DEFINER fonksiyonlarının yetkisi (0005, 0006, 0007)
tanımlandıkları migration'da geri alınmıştı; 0004'te bu adım unutulmuş.
Postgres yeni bir fonksiyona varsayılan olarak PUBLIC'e EXECUTE verir,
Supabase de varsayılan yetkilerle `anon`/`authenticated`'a ekler.

Fonksiyon `returns trigger` olduğu için doğrudan çağrılamaz; pratik risk
düşük. Yine de SECURITY DEFINER bir fonksiyonun istemci rollerine açık
kalması kuralın istisnası olmamalı (bkz. tests/test_rls.py).

0004 uygulanmış ortamlarda o dosya bir daha çalışmadığı için düzeltme
yeni bir revizyonda. (İlk olarak 0011 numarasıyla yazıldı; aynı anda başka bir
dalda `0011_cutout_result_attempts` açıldığı için 0012'ye taşındı — bkz.
`tests/test_migration_chain.py`.)
"""

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "revoke all on function public.record_signup_consents() "
        "from public, anon, authenticated"
    )


def downgrade():
    # Bilinçli olarak boş: yetkiyi geri vermek, hiç istenmemiş bir açığı
    # yeniden açmak olur. Postgres tetikleyici fonksiyonunun EXECUTE yetkisini
    # yalnız CREATE TRIGGER anında denetler, tetikleme anında değil; 0011'e
    # inen bir veritabanında kayıt tetikleyicisi yetkisiz de çalışır.
    # Fonksiyonun kendisini 0004'ün downgrade'i siler.
    pass
