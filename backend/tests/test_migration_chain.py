"""Migration zinciri tek ve tutarlı olmalı — veritabanına bağlanmadan, dosyalardan.

NEDEN (27.09.2026): iki dal aynı anda `0011` numaralı birer migration açtı
(`0011_cutout_result_attempts` ve `0011_revoke_record_signup_consents`).
Alembic bunu dosyaları okurken yalnız bir UYARIYLA ("Revision 0011 is present
more than once") geçiyor; hata ancak `alembic upgrade head` çalıştığında
("Multiple head revisions") çıkıyor — yani ilk kez bütün test oturumu
açılamadığında ya da production'a migration uygulanırken, ve hangi dosyaların
çakıştığını söylemeden. Bu testler çakışmayı birleştirmeden önce, dosya
adlarıyla gösterir. Veritabanı ve `conftest` gerektirmez.
"""

import ast
import warnings
from collections import Counter
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

BACKEND_DIR = Path(__file__).resolve().parents[1]
VERSIONS_DIR = BACKEND_DIR / "alembic" / "versions"


def _declared(path: Path) -> tuple[str, str | None]:
    """Dosyadaki `revision` ve `down_revision` değerleri (içe aktarmadan)."""
    values = {}
    for node in ast.parse(path.read_text(encoding="utf-8")).body:
        targets = []
        if isinstance(node, ast.Assign):
            targets, value = node.targets, node.value
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            targets, value = [node.target], node.value
        for target in targets:
            if isinstance(target, ast.Name) and target.id in ("revision", "down_revision"):
                values[target.id] = ast.literal_eval(value)
    return values["revision"], values.get("down_revision")


def _migration_files() -> list[Path]:
    return sorted(VERSIONS_DIR.glob("[0-9]*.py"))


def test_every_revision_id_is_unique():
    counts = Counter(_declared(path)[0] for path in _migration_files())
    duplicates = {rev: n for rev, n in counts.items() if n > 1}
    assert not duplicates, (
        f"Aynı revizyon numarası birden fazla dosyada: {duplicates}. Alembic bunu "
        "okurken yalnız uyarır; `upgrade head` ise 'Multiple head revisions' ile "
        "durur. Sonra gelen dosyayı bir sonraki numaraya taşıyın (dosya adı + "
        "revision + down_revision)."
    )


def test_file_name_matches_its_revision_id():
    # Numarası değiştirilip adı unutulan (ya da tersi) bir dosya, bir sonraki
    # çakışmayı gözden kaçırtır.
    for path in _migration_files():
        revision, _ = _declared(path)
        assert path.name.startswith(f"{revision}_"), f"{path.name}: revision = {revision!r}"


def test_chain_has_a_single_head_and_no_gaps():
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    with warnings.catch_warnings():
        warnings.simplefilter("error")  # "present more than once" uyarısı hata sayılır
        script = ScriptDirectory.from_config(config)
        heads = script.get_heads()
        chain = list(script.walk_revisions())
    assert len(heads) == 1, f"Birden fazla uç (head): {heads} — iki dal aynı revizyondan ayrılmış."
    # Her dosya zincirde ve her down_revision gerçekten var olan bir revizyon.
    assert len(chain) == len(_migration_files())
    declared = {rev for rev, _ in map(_declared, _migration_files())}
    for path in _migration_files():
        _, down = _declared(path)
        assert down is None or down in declared, f"{path.name}: down_revision {down!r} yok"
