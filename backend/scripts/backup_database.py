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

GÜVENLİK:
  - Şifresiz döküm diske HİÇ yazılmaz (bellekte şifrelenir; geri yüklemede
    stdin'den verilir). Şifre: `cryptography` Fernet (AES + HMAC, bütünlük
    denetimli — yanlış anahtar ya da bozuk dosya sessizce geçmez).
  - Bağlantı adresi (parola içerir) komut satırına değil, yalnız sahibinin
    okuyabildiği geçici bir env dosyasına yazılır; `ps`'te görünmez.
  - `--out-dir` depo içinde olamaz: yedek yanlışlıkla commit edilmesin.
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


async def _schema_fingerprint(dsn: str) -> dict[str, int]:
    import asyncpg

    conn = await asyncpg.connect(dsn, statement_cache_size=0)
    try:
        return {name: await conn.fetchval(sql, list(SCHEMAS)) for name, sql in SCHEMA_FINGERPRINT.items()}
    finally:
        await conn.close()


async def _row_counts(dsn: str) -> dict[str, int]:
    import asyncpg

    conn = await asyncpg.connect(dsn, statement_cache_size=0)
    try:
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
    finally:
        await conn.close()


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

    counts = asyncio.run(_row_counts(dsn))
    fingerprint = asyncio.run(_schema_fingerprint(dsn))
    env_file = _secret_env_file({"PG_DSN": dsn})
    started = time.monotonic()
    try:
        dump = subprocess.run(
            ["docker", "run", "--rm", "--env-file", env_file, PG_IMAGE, "sh", "-c",
             'pg_dump --format=custom --no-owner --no-privileges '
             + " ".join(f"--schema={s}" for s in SCHEMAS) + ' "$PG_DSN"'],
            capture_output=True, check=False,
        )
    finally:
        os.unlink(env_file)
    if dump.returncode != 0:
        sys.exit("pg_dump başarısız:\n" + dump.stderr.decode(errors="replace")[-2000:])
    token = fernet.encrypt(dump.stdout)
    elapsed = round(time.monotonic() - started, 1)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = out_dir / f"vitrin-db-{stamp}.dump.fernet"
    target.write_bytes(token)
    target.chmod(0o600)
    manifest = {
        "file": target.name,
        "created_at": stamp,
        "schemas": list(SCHEMAS),
        "pg_image": PG_IMAGE,
        "dump_bytes": len(dump.stdout),
        "encrypted_bytes": len(token),
        "sha256_encrypted": hashlib.sha256(token).hexdigest(),
        "seconds": elapsed,
        "row_counts": counts,
        "schema_fingerprint": fingerprint,
    }
    manifest_path = target.with_suffix(".manifest.json")
    manifest_path.write_text(json.dumps(manifest, indent=2))
    manifest_path.chmod(0o600)
    print(json.dumps({k: v for k, v in manifest.items() if k != "row_counts"}, indent=2))
    print(f"{len(counts)} tablo, {sum(counts.values())} satır kaydedildi → {target}")


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
        roles = "; ".join(f"CREATE ROLE {r} NOLOGIN" for r in SUPABASE_ROLES)
        subprocess.run(
            ["docker", "exec", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", roles],
            capture_output=True, check=True,
        )
        restore = subprocess.run(
            ["docker", "exec", "-i", container, "pg_restore", "-U", "postgres",
             "--no-owner", "--no-privileges", "-d", "postgres"],
            input=dump, capture_output=True, check=False,
        )
        errors = [
            line for line in restore.stderr.decode(errors="replace").splitlines()
            if "error:" in line and not any(benign in line for benign in BENIGN_RESTORE_ERRORS)
        ]
        port = subprocess.run(
            ["docker", "port", container, "5432/tcp"], capture_output=True, text=True, check=True
        ).stdout.strip().rsplit(":", 1)[-1]
        restored_dsn = f"postgresql://postgres:{password}@127.0.0.1:{port}/postgres"
        restored = asyncio.run(_row_counts(restored_dsn))
        restored_fingerprint = asyncio.run(_schema_fingerprint(restored_dsn))
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
        "pg_restore_errors": len(errors),
        "pg_restore_error_samples": errors[:10],
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if mismatched or fingerprint_diff or errors:
        sys.exit(
            "GERİ YÜKLEME TESTİ BAŞARISIZ: satır sayıları, şema parçaları (RLS/politika/"
            "tetikleyici/fonksiyon/indeks/kısıt) ya da pg_restore hataları tutmuyor."
        )
    print("Geri yükleme testi BAŞARILI: tablolar, satırlar, RLS, politikalar, tetikleyiciler birebir.")


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
