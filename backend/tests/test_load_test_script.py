"""`scripts/load_test.py` — yük testinin hangi veritabanına yazabileceği.

Yük testi hedef veritabanına onlarca sahte kullanıcı ekler. Uzak bir
veritabanı (ör. Supabase = production) ya da `execute.sh`'ın günlük
geliştirme veritabanı (`vitrin_ai`) kirlenmemeli; betik ikisini de açılışta
reddeder. Kabul yolu da ayrıca sınanır (ders 15).
"""

import importlib.util
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "load_test.py"
_spec = importlib.util.spec_from_file_location("load_test", _SCRIPT)
load_test = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(load_test)


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+asyncpg://u:p@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
        "postgresql+asyncpg://u:p@10.0.0.5:5432/vitrin_ai_test",
    ],
)
def test_refuses_remote_database(url):
    with pytest.raises(SystemExit, match="YEREL"):
        load_test._check_database_url(url)


def test_refuses_the_daily_development_database():
    with pytest.raises(SystemExit, match="vitrin_ai"):
        load_test._check_database_url("postgresql+asyncpg://u:p@localhost:5432/vitrin_ai")


def test_accepts_a_local_test_database():
    load_test._check_database_url("postgresql+asyncpg://u:p@localhost:5432/vitrin_ai_test")
