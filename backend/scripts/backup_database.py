"""Veritabanı yedeği ve geri yükleme testi (Faz 7, `SECURITY.md` 3.4–3.5).

NEDEN: Supabase otomatik günlük yedeği yalnız Pro ve üstü paketlerde alıyor;
proje ücretsiz pakette (Serhan, 27.09.2026) — yani bu betiğin ürettiği yedek
TEK yedek. Supabase de ücretsiz projelere "verinizi düzenli dışa aktarıp başka
yerde saklayın" diyor (docs/guides/platform/backups).

ÜÇ KOMUT (backend klasöründen):
  keygen        Şifreleme anahtarı üretir. `backend/.env`'e
                `BACKUP_ENCRYPTION_KEY=` olarak yazılır VE bir parola
                yöneticisinde ayrıca saklanır: anahtar kaybolursa bütün
                yedekler açılamaz.
  backup        `--source-env-file`'daki DATABASE_URL'in `public` ve `auth`
                şemalarını `pg_dump` (Docker'da, sunucuyla aynı ana sürüm) ile
                alır, BELLEKTE şifreler ve `--out-dir`'e yazar. Yanına satır
                sayılarını tutan bir kayıt (manifest) koyar.
  restore-test  Şifreli yedeği bellekte açar, ATILABİLİR bir Postgres'e
                (Docker, veri tmpfs'te — kapanınca iz kalmaz) geri yükler ve
                satır sayılarını kayıtla karşılaştırır; süreyi ölçer.

TUTARLILIK (Codex incelemesi, 27.09.2026):
  - Satır sayıları, şema parmak izi ve `pg_dump` AYNI anlık görüntüden
    (`pg_export_snapshot` + `pg_dump --snapshot`) alınır. Eskiden sayılar
    dökümden önce ayrı sorgularla alınıyordu; araya giren tek bir yazma
    (her oturum yenilemesi `auth.sessions`'a yazar) sağlam bir yedeği
    "başarısız" gösteriyordu.
  - Yetkiler (GRANT/REVOKE) dökümde VE geri yüklemede korunur, geri yükleme
    testi de onları karşılaştırır. Eskiden `--no-privileges` bunları
    tamamen atıyordu: tetikleyici fonksiyonlarındaki `REVOKE ... FROM PUBLIC`
    ve `auth` şema izinleri geri gelmiyor, test yine "birebir" diyordu.
  - Dosya adı rastgele bir ek taşır ve dosya yalnız YOKSA oluşturulur
    (O_EXCL): aynı saniyede biten iki yedek birbirini ezmez.

GÜVENLİK:
  - Şifresiz döküm diske HİÇ yazılmaz (bellekte şifrelenir; geri yüklemede
    stdin'den verilir). Şifre: `cryptography` Fernet (AES + HMAC, bütünlük
    denetimli — yanlış anahtar ya da bozuk dosya sessizce geçmez).
  - Bağlantı adresi (parola içerir) komut satırına değil, yalnız sahibinin
    okuyabildiği geçici bir env dosyasına yazılır; `ps`'te görünmez.
  - `--out-dir` depo içinde olamaz: yedek yanlışlıkla commit edilmesin.
  - Dosyalar baştan 600 izniyle oluşturulur (önce açık yazıp sonra chmod
    etmek, kısa bir an başkalarının okuyabileceği bir dosya bırakırdı).
  - Yalnız OKUMA yapılır; kaynak veritabanına hiçbir şey yazılmaz.
Günlük otomatik çalıştırma ve ayrı R2 bucket'ına yükleme Faz 7.5'te
(sunucu ve bucket belli olunca).
"""

import argparse
import asyncio
import hashlib
import json
import os
import re
import secrets
import stat
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent
PG_IMAGE = os.environ.get("BACKUP_PG_IMAGE", "postgres:17-alpine")
SCHEMAS = ("public", "auth")

#: Supabase'in RLS politikalarında ve grant'lerde adı geçen roller. Düz
#: Postgres'te yoklar; geri yüklemeden önce (giriş yetkisiz) oluşturulur ki
#: `CREATE POLICY ... TO authenticated` gibi satırlar düşmesin.
SUPABASE_ROLES = (
    "anon", "authenticated", "service_role", "authenticator",
    "supabase_admin", "supabase_auth_admin", "dashboard_user",
)


def _env_value(path: Path, name: str) -> str | None:
    if not path.exists():
        return None
    for line in path.read_text().splitlines():
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def _libpq_dsn(url: str) -> str:
    return re.sub(r"^postgresql\+asyncpg://", "postgresql://", url)


LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _docker_dsn(dsn: str) -> tuple[str, list[str]]:
    """`pg_dump` Docker içinde koşar; oradan `localhost` kapsayıcının kendisidir.
    Yerel bir veritabanı (testler, yerel deneme) ana makineye yönlendirilir."""
    parts = urlsplit(dsn)
    if (parts.hostname or "") not in LOCAL_HOSTS:
        return dsn, []
    # Ana makine kısmı baştan kurulur: `[::1]` gibi köşeli ayraçlı bir IPv6
    # adresinde yalnız adı değiştirmek `[host.docker.internal]` gibi geçersiz
    # bir adres üretiyordu (Codex incelemesi, 2. tur).
    userinfo = parts.netloc.rsplit("@", 1)[0] + "@" if "@" in parts.netloc else ""
    port = f":{parts.port}" if parts.port else ""
    netloc = f"{userinfo}host.docker.internal{port}"
    return urlunsplit(parts._replace(netloc=netloc)), ["--add-host=host.docker.internal:host-gateway"]


def _write_private(path: Path, data: bytes) -> None:
    """Dosyayı 600 izniyle ve YALNIZ YOKSA oluşturur; var olanın üzerine yazmaz."""
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as file:
        file.write(data)


def _backup_target(out_dir: Path, now: datetime) -> Path:
    # Rastgele ek: aynı saniyede başlayan iki yedek aynı adı üretmesin.
    stamp = now.strftime("%Y%m%dT%H%M%SZ")
    return out_dir / f"vitrin-db-{stamp}-{secrets.token_hex(3)}.dump.fernet"


def _fernet():
    from cryptography.fernet import Fernet

    key = os.environ.get("BACKUP_ENCRYPTION_KEY") or _env_value(
        BACKEND_DIR / ".env", "BACKUP_ENCRYPTION_KEY"
    )
    if not key:
        sys.exit("BACKUP_ENCRYPTION_KEY yok. Önce `keygen`, sonra backend/.env'e yazın.")
    return Fernet(key.encode())


def _outside_repo(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    if resolved == REPO_DIR or REPO_DIR in resolved.parents:
        sys.exit(f"{resolved} depo içinde; yedek depo DIŞINDA saklanır (yanlışlıkla commit edilmesin).")
    return resolved


def _secret_env_file(values: dict) -> str:
    handle, path = tempfile.mkstemp(prefix="vitrin-backup-", suffix=".env")
    os.fchmod(handle, stat.S_IRUSR | stat.S_IWUSR)
    with os.fdopen(handle, "w") as file:
        for key, value in values.items():
            file.write(f"{key}={value}\n")
    return path


#: Satır sayısı tutsa bile geri yüklenen sistem SESSİZCE korumasız kalabilir:
#: bu projede güvenlik ve iş kuralları veritabanının kendisinde (RLS,
#: `period_snapshot` ve `admin_audit_log` değişmezlik tetikleyicileri,
#: fonksiyonlar, kısıtlar). Geri yüklemede bunların da birebir geldiği sayılır.
SCHEMA_FINGERPRINT = {
    "rls_enabled_tables": """SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relkind='r' AND c.relrowsecurity AND n.nspname = ANY($1::text[])""",
    "policies": "SELECT count(*) FROM pg_policies WHERE schemaname = ANY($1::text[])",
    "triggers": """SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname = ANY($1::text[])""",
    "functions": """SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname = ANY($1::text[])""",
    "indexes": """SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relkind='i' AND n.nspname = ANY($1::text[])""",
    "constraints": """SELECT count(*) FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace
        WHERE n.nspname = ANY($1::text[])""",
}

#: Boş bir Postgres'te `public` şeması baştan var; bu uyarı zararsızdır.
BENIGN_RESTORE_ERRORS = ('schema "public" already exists',)


#: Şemalardaki tablo/dizi/görünüm, fonksiyon ve şemanın kendisi üzerindeki
#: yetkiler, satır satır. Sahibin kendi yetkileri ve `postgres` dışarıda
#: bırakılır: geri yükleme `--no-owner` ile yapıldığı için orada her nesnenin
#: sahibi `postgres` olur; bu fark yedeğin eksik olduğunu göstermez.
#: `acldefault`: hiç GRANT/REVOKE almamış bir nesnenin gerçek (varsayılan)
#: yetkisi — ör. fonksiyonlarda PUBLIC'e EXECUTE. Kaybolan bir
#: `REVOKE ... FROM PUBLIC` tam olarak burada görünür.
PRIVILEGES_SQL = """
WITH objs AS (
  SELECT 'table' AS kind, format('%I.%I', n.nspname, c.relname) AS name, c.relowner AS owner,
         coalesce(c.relacl, acldefault(CASE WHEN c.relkind='S' THEN 's' ELSE 'r' END::"char", c.relowner)) AS acl
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p','v','m','S','f') AND n.nspname = ANY($1::text[])
  UNION ALL
  SELECT 'function', format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
         p.proowner, coalesce(p.proacl, acldefault('f', p.proowner))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname = ANY($1::text[])
  UNION ALL
  SELECT 'schema', format('%I', n.nspname), n.nspowner, coalesce(n.nspacl, acldefault('n', n.nspowner))
  FROM pg_namespace n WHERE n.nspname = ANY($1::text[])
)
SELECT kind || ' ' || name || ' ' ||
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END || ' ' ||
       a.privilege_type AS entry
FROM objs CROSS JOIN LATERAL aclexplode(objs.acl) a
WHERE a.grantee <> objs.owner AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) <> 'postgres')
ORDER BY 1
"""


async def _schema_fingerprint_on(conn) -> dict[str, int]:
    return {name: await conn.fetchval(sql, list(SCHEMAS)) for name, sql in SCHEMA_FINGERPRINT.items()}


async def _privileges_on(conn) -> list[str]:
    return [row["entry"] for row in await conn.fetch(PRIVILEGES_SQL, list(SCHEMAS))]


async def _row_counts_on(conn) -> dict[str, int]:
    tables = await conn.fetch(
        """SELECT n.nspname AS s, c.relname AS t FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relkind='r' AND n.nspname = ANY($1::text[]) ORDER BY 1,2""",
        list(SCHEMAS),
    )
    counts = {}
    for row in tables:
        name = f'{row["s"]}.{row["t"]}'
        counts[name] = await conn.fetchval(f'SELECT count(*) FROM "{row["s"]}"."{row["t"]}"')
    return counts


async def _describe(dsn: str) -> tuple[dict[str, int], dict[str, int], list[str]]:
    """Geri yüklenen veritabanının satır sayıları, parmak izi ve yetkileri."""
    import asyncpg

    conn = await asyncpg.connect(dsn, statement_cache_size=0)
    try:
        return await _row_counts_on(conn), await _schema_fingerprint_on(conn), await _privileges_on(conn)
    finally:
        await conn.close()


def _run_pg_dump(dsn: str, snapshot: str) -> subprocess.CompletedProcess:
    docker_dsn, docker_args = _docker_dsn(dsn)
    env_file = _secret_env_file({"PG_DSN": docker_dsn})
    try:
        return subprocess.run(
            ["docker", "run", "--rm", *docker_args, "--env-file", env_file, PG_IMAGE, "sh", "-c",
             f"pg_dump --format=custom --no-owner --snapshot={snapshot} "
             + " ".join(f"--schema={s}" for s in SCHEMAS) + ' "$PG_DSN"'],
            capture_output=True, check=False,
        )
    finally:
        os.unlink(env_file)


async def _dump_in_one_snapshot(dsn: str):
    """Sayılar, parmak izi, yetkiler ve döküm AYNI anlık görüntüden alınır.

    `pg_export_snapshot()` bu işlemin gördüğü anı dışa verir; `pg_dump
    --snapshot` o anı içe alır. İşlem açık kaldığı sürece araya giren
    yazmalar ne sayılara ne döküme girer. (Supabase'in havuzu oturum
    kipinde, 5432, bunu destekler; işlem kipi, 6543, desteklemez.)
    """
    import asyncpg

    conn = await asyncpg.connect(dsn, statement_cache_size=0)
    try:
        async with conn.transaction(isolation="repeatable_read", readonly=True):
            snapshot = await conn.fetchval("SELECT pg_export_snapshot()")
            counts = await _row_counts_on(conn)
            fingerprint = await _schema_fingerprint_on(conn)
            privileges = await _privileges_on(conn)
            dump = await asyncio.to_thread(_run_pg_dump, dsn, snapshot)
    finally:
        await conn.close()
    return counts, fingerprint, privileges, dump


def keygen(_args) -> None:
    from cryptography.fernet import Fernet

    print(Fernet.generate_key().decode())
    print(
        "Bu anahtarı backend/.env'e BACKUP_ENCRYPTION_KEY= olarak yazın VE bir parola "
        "yöneticisinde saklayın: kaybolursa yedekler açılamaz.",
        file=sys.stderr,
    )


def backup(args) -> None:
    out_dir = _outside_repo(Path(args.out_dir))
    out_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    url = os.environ.get("BACKUP_SOURCE_DATABASE_URL") or _env_value(
        Path(args.source_env_file), "DATABASE_URL"
    )
    if not url:
        sys.exit(f"{args.source_env_file} içinde DATABASE_URL yok")
    dsn = _libpq_dsn(url)
    fernet = _fernet()

    started = time.monotonic()
    counts, fingerprint, privileges, dump = asyncio.run(_dump_in_one_snapshot(dsn))
    if dump.returncode != 0:
        sys.exit("pg_dump başarısız:\n" + dump.stderr.decode(errors="replace")[-2000:])
    token = fernet.encrypt(dump.stdout)
    elapsed = round(time.monotonic() - started, 1)

    now = datetime.now(timezone.utc)
    target = _backup_target(out_dir, now)
    _write_private(target, token)
    manifest = {
        "file": target.name,
        "created_at": now.strftime("%Y%m%dT%H%M%SZ"),
        "schemas": list(SCHEMAS),
        "pg_image": PG_IMAGE,
        "dump_bytes": len(dump.stdout),
        "encrypted_bytes": len(token),
        "sha256_encrypted": hashlib.sha256(token).hexdigest(),
        "seconds": elapsed,
        "row_counts": counts,
        "schema_fingerprint": fingerprint,
        "privileges": privileges,
    }
    _write_private(target.with_suffix(".manifest.json"), json.dumps(manifest, indent=2).encode())
    print(json.dumps(
        {k: v for k, v in manifest.items() if k not in ("row_counts", "privileges")}, indent=2
    ))
    print(f"{len(counts)} tablo, {sum(counts.values())} satır, {len(privileges)} yetki kaydedildi → {target}")


RESTORE_DB = "restore_test"
MISSING_ROLE = re.compile(r'role "([^"]+)" does not exist')


def _psql(container: str, sql: str, database: str = "postgres") -> None:
    subprocess.run(
        ["docker", "exec", container, "psql", "-U", "postgres", "-d", database,
         "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True, check=True,
    )


def _restore_with_roles(container: str, dump: bytes) -> subprocess.CompletedProcess:
    """Yetkileri de geri yükler. Yetkiler, boş bir Postgres'te olmayan rollere
    (Supabase'in `supabase_auth_admin`, `service_role`…) verilmiş olabilir; yok
    olan rol `role "x" does not exist` ile o GRANT'i düşürür. Bilinen roller
    baştan, dökümde karşılaşılan başka roller ise görüldükçe (giriş yetkisiz)
    oluşturulur ve geri yükleme temiz bir veritabanında yinelenir."""
    roles = set(SUPABASE_ROLES)
    created: set[str] = set()
    for _ in range(5):
        for role in sorted(roles - created):
            _psql(container, f'CREATE ROLE "{role}" NOLOGIN')
        created |= roles
        _psql(container, f'DROP DATABASE IF EXISTS "{RESTORE_DB}"')
        _psql(container, f'CREATE DATABASE "{RESTORE_DB}"')
        restore = subprocess.run(
            ["docker", "exec", "-i", container, "pg_restore", "-U", "postgres",
             "--no-owner", "-d", RESTORE_DB],
            input=dump, capture_output=True, check=False,
        )
        missing = set(MISSING_ROLE.findall(restore.stderr.decode(errors="replace"))) - created
        if not missing:
            return restore
        roles |= missing
    return restore


def restore_test(args) -> None:
    target = Path(args.file).expanduser().resolve()
    manifest = json.loads(target.with_suffix(".manifest.json").read_text())
    token = target.read_bytes()
    if hashlib.sha256(token).hexdigest() != manifest["sha256_encrypted"]:
        sys.exit("Yedek dosyası kayıttakiyle aynı değil (bozulmuş ya da değiştirilmiş).")
    fernet = _fernet()
    started = time.monotonic()
    from cryptography.fernet import InvalidToken

    try:
        dump = fernet.decrypt(token)
    except InvalidToken:
        sys.exit("Yedek açılamadı: BACKUP_ENCRYPTION_KEY bu yedeği şifreleyen anahtar değil.")

    password = secrets.token_urlsafe(24)
    container = subprocess.run(
        ["docker", "run", "-d", "--rm", "--tmpfs", "/var/lib/postgresql/data",
         "-e", f"POSTGRES_PASSWORD={password}", "-p", "127.0.0.1::5432", PG_IMAGE],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    try:
        for _ in range(60):
            ready = subprocess.run(
                ["docker", "exec", container, "pg_isready", "-U", "postgres"], capture_output=True
            )
            if ready.returncode == 0:
                break
            time.sleep(0.5)
        time.sleep(1)  # ilk başlatma betiği sunucuyu bir kez yeniden başlatıyor
        restore = _restore_with_roles(container, dump)
        errors = [
            line for line in restore.stderr.decode(errors="replace").splitlines()
            if "error:" in line and not any(benign in line for benign in BENIGN_RESTORE_ERRORS)
        ]
        port = subprocess.run(
            ["docker", "port", container, "5432/tcp"], capture_output=True, text=True, check=True
        ).stdout.strip().rsplit(":", 1)[-1]
        restored_dsn = f"postgresql://postgres:{password}@127.0.0.1:{port}/{RESTORE_DB}"
        restored, restored_fingerprint, restored_privileges = asyncio.run(_describe(restored_dsn))
        elapsed = round(time.monotonic() - started, 1)
    finally:
        subprocess.run(["docker", "stop", container], capture_output=True)

    expected = manifest["row_counts"]
    mismatched = {
        table: (expected.get(table), restored.get(table))
        for table in sorted(set(expected) | set(restored))
        if expected.get(table) != restored.get(table)
    }
    expected_fingerprint = manifest.get("schema_fingerprint", {})
    fingerprint_diff = {
        key: (expected_fingerprint.get(key), restored_fingerprint.get(key))
        for key in SCHEMA_FINGERPRINT
        if expected_fingerprint.get(key) != restored_fingerprint.get(key)
    }
    expected_privileges = manifest.get("privileges")
    if expected_privileges is None:
        # 27.09.2026 öncesi yedekler yetkisiz (`--no-privileges`) alındı ve
        # kayıtlarında yetki listesi yok: bu yedekler yetkileri GERİ GETİREMEZ.
        missing_privileges, extra_privileges = ["(bu yedek yetki içermiyor — yeni yedek alın)"], []
    else:
        missing_privileges = sorted(set(expected_privileges) - set(restored_privileges))
        extra_privileges = sorted(set(restored_privileges) - set(expected_privileges))
    report = {
        "backup": manifest["file"],
        "restore_seconds": elapsed,
        "tables_expected": len(expected),
        "tables_restored": len(restored),
        "rows_expected": sum(expected.values()),
        "rows_restored": sum(restored.values()),
        "mismatched_tables": mismatched,
        "schema_fingerprint": restored_fingerprint,
        "schema_mismatches": fingerprint_diff,
        "privileges_restored": len(restored_privileges),
        "privileges_missing": missing_privileges[:20],
        "privileges_extra": extra_privileges[:20],
        "pg_restore_errors": len(errors),
        "pg_restore_error_samples": errors[:10],
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if mismatched or fingerprint_diff or missing_privileges or extra_privileges or errors:
        sys.exit(
            "GERİ YÜKLEME TESTİ BAŞARISIZ: satır sayıları, şema parçaları (RLS/politika/"
            "tetikleyici/fonksiyon/indeks/kısıt), yetkiler ya da pg_restore hataları tutmuyor."
        )
    print(
        "Geri yükleme testi BAŞARILI: tablolar, satırlar, RLS, politikalar, tetikleyiciler "
        "ve yetkiler birebir."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("keygen")
    backup_parser = sub.add_parser("backup")
    backup_parser.add_argument("--source-env-file", default=str(BACKEND_DIR / ".env.supabase"))
    backup_parser.add_argument("--out-dir", default=os.environ.get("BACKUP_DIR"), required="BACKUP_DIR" not in os.environ)
    restore_parser = sub.add_parser("restore-test")
    restore_parser.add_argument("file")
    args = parser.parse_args()
    {"keygen": keygen, "backup": backup, "restore-test": restore_test}[args.command](args)


if __name__ == "__main__":
    main()
