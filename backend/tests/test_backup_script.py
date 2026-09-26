"""`scripts/backup_database.py` — Docker/production gerektirmeyen korumalar.

Asıl yedek + geri yükleme testi gerçek veritabanıyla elle koşulur
(backend/README.md → "Veritabanı yedeği"); burada sınanan, yanlış
kullanımda betiğin veriyi riske atmadan DURMASI.
"""

import importlib.util
from pathlib import Path

import pytest
from cryptography.fernet import Fernet

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "backup_database.py"
_spec = importlib.util.spec_from_file_location("backup_database", _SCRIPT)
backup_database = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(backup_database)


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


def test_secret_env_file_is_readable_only_by_its_owner():
    path = backup_database._secret_env_file({"PG_DSN": "postgresql://gizli"})
    try:
        assert Path(path).stat().st_mode & 0o777 == 0o600
    finally:
        Path(path).unlink()


def test_asyncpg_url_is_converted_for_pg_dump():
    assert backup_database._libpq_dsn("postgresql+asyncpg://u:p@h:5432/db") == "postgresql://u:p@h:5432/db"
