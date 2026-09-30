"""`scripts/backup_database.py` — Docker/production gerektirmeyen korumalar.

Asıl yedek + geri yükleme testi gerçek veritabanıyla elle koşulur
(backend/README.md → "Veritabanı yedeği"); burada sınanan, yanlış
kullanımda betiğin veriyi riske atmadan DURMASI.
"""

import importlib.util
import sys
from pathlib import Path

import pytest
from cryptography.fernet import Fernet

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "backup_database.py"
_spec = importlib.util.spec_from_file_location("backup_database", _SCRIPT)
backup_database = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(backup_database)

# Betik gizli dosyaları `os.fchmod` ile yalnız sahibine açık (0o600) yazar ve
# testler bu izni doğrular. Windows'ta ne `os.fchmod` ne Unix dosya izni var;
# orada izin taklit edilirse "yalnız sahibi okur" sözü sessizce zayıflar. Bu
# yüzden bu testler Windows'ta ATLANIR, gevşetilmez (30.09.2026, Kaan'ın ortamı).
# Yedek Mac/Linux'ta alınır; CI (Linux) bu testlerin hepsini koşar.
unix_only = pytest.mark.skipif(
    sys.platform == "win32", reason="Unix dosya izni (os.fchmod / 0o600) Windows'ta yok"
)


@pytest.mark.parametrize("inside", [".", "backend", "backend/yedekler"])
def test_refuses_to_write_backups_inside_the_repository(inside):
    with pytest.raises(SystemExit, match="depo içinde"):
        backup_database._outside_repo(backup_database.REPO_DIR / inside)


def test_accepts_a_directory_outside_the_repository(tmp_path):
    assert backup_database._outside_repo(tmp_path) == tmp_path.resolve()


def test_refuses_to_run_without_an_encryption_key(monkeypatch, tmp_path):
    monkeypatch.delenv("BACKUP_ENCRYPTION_KEY", raising=False)
    monkeypatch.setattr(backup_database, "BACKEND_DIR", tmp_path)  # .env yok
    with pytest.raises(SystemExit, match="BACKUP_ENCRYPTION_KEY yok"):
        backup_database._fernet()


def test_uses_the_key_from_the_environment(monkeypatch):
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("BACKUP_ENCRYPTION_KEY", key)
    token = backup_database._fernet().encrypt(b"dokum")
    assert Fernet(key.encode()).decrypt(token) == b"dokum"


@unix_only
def test_secret_env_file_is_readable_only_by_its_owner():
    path = backup_database._secret_env_file({"PG_DSN": "postgresql://gizli"})
    try:
        assert Path(path).stat().st_mode & 0o777 == 0o600
    finally:
        Path(path).unlink()


def test_asyncpg_url_is_converted_for_pg_dump():
    assert backup_database._libpq_dsn("postgresql+asyncpg://u:p@h:5432/db") == "postgresql://u:p@h:5432/db"


# --- Gerçek pg_dump / pg_restore ile (Docker gerekir) -----------------------
# Codex incelemesi (27.09.2026) üç kusur buldu; üçü de yalnız gerçek bir
# döküm/geri yüklemede görünür. Testler yerel test veritabanına karşı koşar
# (conftest yerel olmayanı reddeder) ve Docker yoksa atlanır.

import argparse  # noqa: E402
import asyncio  # noqa: E402
import json  # noqa: E402
import subprocess  # noqa: E402
from datetime import datetime, timezone  # noqa: E402

import asyncpg  # noqa: E402
from urllib.parse import urlsplit  # noqa: E402

from app.core.config import settings  # noqa: E402


def _docker_available() -> bool:
    try:
        return subprocess.run(["docker", "info"], capture_output=True, timeout=30).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


needs_docker = pytest.mark.skipif(not _docker_available(), reason="Docker çalışmıyor")
PROBE = "public.backup_race_probe"


def _dsn() -> str:
    return backup_database._libpq_dsn(settings.database_url)


def _sql(statement: str) -> None:
    async def run():
        conn = await asyncpg.connect(_dsn())
        try:
            await conn.execute(statement)
        finally:
            await conn.close()

    asyncio.run(run())


@pytest.fixture
def backup_env(monkeypatch, tmp_path):
    monkeypatch.setenv("BACKUP_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("BACKUP_SOURCE_DATABASE_URL", settings.database_url)
    _sql(f"CREATE TABLE {PROBE} (id int); ALTER TABLE {PROBE} ENABLE ROW LEVEL SECURITY")
    yield tmp_path
    _sql(f"DROP TABLE IF EXISTS {PROBE}")


def _backup(out_dir):
    backup_database.backup(argparse.Namespace(out_dir=str(out_dir), source_env_file="/yok"))
    return sorted(out_dir.glob("*.dump.fernet"))


def _restore_test(path):
    backup_database.restore_test(argparse.Namespace(file=str(path)))


def _dump_sql(path) -> str:
    dump = backup_database._fernet().decrypt(path.read_bytes())
    return subprocess.run(
        ["docker", "run", "--rm", "-i", backup_database.PG_IMAGE, "pg_restore", "-f", "-"],
        input=dump, capture_output=True, check=True,
    ).stdout.decode()


@needs_docker
@unix_only
def test_write_between_counting_and_dumping_does_not_fail_a_sound_backup(backup_env, monkeypatch):
    # Satır sayıları dökümden ÖNCE ayrı sorgularla alınıyordu: araya giren tek
    # bir yazma sağlam yedeği "başarısız" gösteriyordu. Yazma, `pg_dump`
    # başlamadan hemen önce yapılır — sayılar ile döküm arasındaki pencere.
    real_run = subprocess.run

    def run(args, *rest, **kwargs):
        if any("pg_dump" in str(arg) for arg in args):
            _sql(f"INSERT INTO {PROBE} VALUES (1), (2), (3)")
        return real_run(args, *rest, **kwargs)

    monkeypatch.setattr(backup_database.subprocess, "run", run)
    [path] = _backup(backup_env)
    monkeypatch.setattr(backup_database.subprocess, "run", real_run)

    manifest = json.loads(path.with_suffix(".manifest.json").read_text())
    assert manifest["row_counts"][PROBE] == 0  # anlık görüntü yazmadan önce alındı
    _restore_test(path)  # döküm de aynı anı taşıyor: sayılar tutar


@needs_docker
@unix_only
def test_privileges_survive_backup_and_restore(backup_env):
    # `--no-privileges` bütün GRANT/REVOKE'ları atıyordu; geri yükleme testi
    # de yetkilere bakmadığı için yine "birebir" diyordu.
    [path] = _backup(backup_env)
    sql = _dump_sql(path)
    assert "REVOKE ALL ON FUNCTION public.billing_signup() FROM PUBLIC;" in sql
    assert "GRANT USAGE ON SCHEMA auth TO anon;" in sql

    manifest = json.loads(path.with_suffix(".manifest.json").read_text())
    assert "schema auth anon USAGE" in manifest["privileges"]
    # REVOKE'lu tetikleyici fonksiyonunda PUBLIC'e EXECUTE YOK.
    assert not any(
        entry.startswith("function public.billing_signup() PUBLIC") for entry in manifest["privileges"]
    )
    _restore_test(path)


@needs_docker
@unix_only
def test_restore_test_fails_when_a_privilege_did_not_come_back(backup_env):
    [path] = _backup(backup_env)
    manifest_path = path.with_suffix(".manifest.json")
    manifest = json.loads(manifest_path.read_text())
    # Geri yüklenen veritabanında olmayan bir yetki beklensin.
    manifest["privileges"].append("table public.projects anon SELECT")
    manifest_path.chmod(0o600)
    manifest_path.write_text(json.dumps(manifest))
    with pytest.raises(SystemExit, match="yetkiler"):
        _restore_test(path)


@needs_docker
@unix_only
def test_two_backups_finishing_in_the_same_second_both_survive(backup_env, monkeypatch):
    frozen = datetime(2026, 9, 27, 12, 0, 0, tzinfo=timezone.utc)

    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return frozen

    monkeypatch.setattr(backup_database, "datetime", FrozenDatetime)
    _backup(backup_env)
    paths = _backup(backup_env)
    assert len(paths) == 2
    assert len(list(backup_env.glob("*.manifest.json"))) == 2
    for path in paths:
        assert path.stat().st_mode & 0o777 == 0o600


@unix_only
def test_backup_files_are_never_overwritten(tmp_path):
    target = tmp_path / "yedek.dump.fernet"
    backup_database._write_private(target, b"ilk")
    with pytest.raises(FileExistsError):
        backup_database._write_private(target, b"ikinci")
    assert target.read_bytes() == b"ilk" and target.stat().st_mode & 0o777 == 0o600


@pytest.mark.parametrize(
    "dsn,expected",
    [
        ("postgresql://u:p@localhost:5434/db", "postgresql://u:p@host.docker.internal:5434/db"),
        ("postgresql://u:p@127.0.0.1/db", "postgresql://u:p@host.docker.internal/db"),
        ("postgresql://u:p@[::1]:5432/db", "postgresql://u:p@host.docker.internal:5432/db"),
        ("postgresql://u@localhost/db", "postgresql://u@host.docker.internal/db"),
        ("postgresql://u:p%40x@localhost:5432/db", "postgresql://u:p%40x@host.docker.internal:5432/db"),
        ("postgresql://u:p@db.example.com:5432/db", "postgresql://u:p@db.example.com:5432/db"),
    ],
)
def test_local_database_is_reached_from_inside_docker(dsn, expected):
    rewritten = backup_database._docker_dsn(dsn)[0]
    assert rewritten == expected
    urlsplit(rewritten).port  # geçerli bir adres: ayrıştırma ValueError vermez
