"""Toplu zemin yükleme betiğinin yarıda kalma davranışı.

Betik `scripts/` altında ve bir paket değil (manuel altyapı işleri); modül
dosya yolundan yükleniyor — `test_check_r2_cors.py` ile aynı yöntem.
"""

import importlib.util
import io
import json
from pathlib import Path

import pytest
from PIL import Image
from sqlalchemy import select

from app.core.db import engine as app_engine
from app.models.background import Background

_SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "upload_backgrounds.py"
_spec = importlib.util.spec_from_file_location("upload_backgrounds", _SCRIPT)
upload_backgrounds = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(upload_backgrounds)


class FakeStorage:
    """R2 yerine bellekte bir sözlük; `delete` çağrıları ayrıca kaydediliyor."""

    def __init__(self, fail_on_call: int | None = None):
        self.objects: dict[str, bytes] = {}
        self.deleted: list[str] = []
        self.upload_calls = 0
        self._fail_on_call = fail_on_call

    async def upload(self, key: str, content: bytes, content_type: str) -> None:
        self.upload_calls += 1
        if self.upload_calls == self._fail_on_call:
            raise RuntimeError("R2 patladı")
        self.objects[key] = content

    async def delete(self, key: str) -> None:
        self.deleted.append(key)
        self.objects.pop(key, None)

    def ensure_configured(self) -> None:
        pass


@pytest.fixture(autouse=True)
async def dispose_app_engine():
    """Her testten sonra uygulama engine'inin havuzunu boşaltır.

    Betik `app.core.db.engine`'i (modül seviyesi, havuzlu) kullanıyor ve her
    test kendi event loop'unda çalışıyor. Bir çalıştırma hata fırlatıp
    betiğin sonundaki `engine.dispose()`'a hiç ulaşmazsa havuzda ÖLMÜŞ bir
    loop'a bağlı bağlantı kalıyor ve bir sonraki test "attached to a
    different loop" ile patlıyor. Üretimde tek loop olduğu için bu yalnızca
    test koşumuna ait bir kısıt.
    """
    yield
    await app_engine.dispose()


@pytest.fixture
def source(tmp_path: Path) -> Path:
    folder = tmp_path / "zeminler"
    folder.mkdir()
    buf = io.BytesIO()
    Image.new("RGB", (40, 40), color="beige").save(buf, format="JPEG")
    (folder / "zemin-bir.jpg").write_bytes(buf.getvalue())
    return folder


@pytest.fixture
def plan() -> dict[str, dict]:
    return {"zemin-bir.jpg": {"category": "sade", "print_warning": False}}


@pytest.fixture
def install_storage(monkeypatch):
    def _install(storage: FakeStorage) -> FakeStorage:
        monkeypatch.setattr(
            upload_backgrounds, "R2StorageService", lambda bucket_name: storage
        )
        return storage

    return _install


async def _run(source: Path, plan: dict, manifest: Path) -> None:
    await upload_backgrounds.upload(source, plan, manifest, dry_run=False)


def test_background_id_is_derived_from_the_source_file_name():
    # Asıl garanti bu: aynı dosya adı her çalıştırmada AYNI kimliği veriyor.
    # Rastgele UUID ile "yarıda kalırsa güvenle yeniden çalıştırılabilir"
    # sözü tutulamıyordu (PR #18 incelemesi).
    first = upload_backgrounds.background_id_for("zemin-bir.jpg")
    assert first == upload_backgrounds.background_id_for("zemin-bir.jpg")
    assert first != upload_backgrounds.background_id_for("zemin-iki.jpg")


async def test_uploads_once_and_writes_a_row(db_session, tmp_path, source, plan, install_storage):
    storage = install_storage(FakeStorage())
    manifest = tmp_path / "manifest.json"

    await _run(source, plan, manifest)

    background_id = upload_backgrounds.background_id_for("zemin-bir.jpg")
    key = f"backgrounds/{background_id}.jpg"
    assert set(storage.objects) == {key, f"backgrounds/thumbs/{background_id}.jpg"}
    rows = (await db_session.execute(select(Background))).scalars().all()
    assert [row.r2_key for row in rows] == [key]
    assert [entry["file"] for entry in json.loads(manifest.read_text())] == ["zemin-bir.jpg"]


async def test_rerun_after_a_crash_between_commit_and_manifest_creates_no_duplicate(
    db_session, tmp_path, source, plan, install_storage
):
    # Çökme penceresi: DB satırı yazıldı, manifest YAZILMADI. Betik yeniden
    # çalıştığında dosyayı "yapılmış" saymaz (manifestte yok) ve baştan işler.
    # Eskiden bu ikinci bir UUID, ikinci bir DB satırı ve ikinci bir R2 nesne
    # çifti üretiyordu; kaynak dosya adı hiçbir yerde tutulmadığı için
    # otomatik toparlama da mümkün değildi.
    storage = install_storage(FakeStorage())
    manifest = tmp_path / "manifest.json"

    await _run(source, plan, manifest)
    manifest.unlink()  # manifest yazılmadan ölmüş bir çalıştırmayı taklit eder

    await _run(source, plan, manifest)

    rows = (await db_session.execute(select(Background))).scalars().all()
    assert len(rows) == 1
    assert len(storage.objects) == 2


async def test_thumbnail_upload_failure_removes_the_already_uploaded_original(
    db_session, tmp_path, source, plan, install_storage
):
    # İkinci yükleme (küçük önizleme) patlıyor: ilki R2'de kalırsa DB satırı
    # hiç yazılmadığı için erişilemez bir yetim nesne olur.
    storage = install_storage(FakeStorage(fail_on_call=2))
    manifest = tmp_path / "manifest.json"

    with pytest.raises(RuntimeError):
        await _run(source, plan, manifest)

    background_id = upload_backgrounds.background_id_for("zemin-bir.jpg")
    assert storage.deleted == [f"backgrounds/{background_id}.jpg"]
    assert storage.objects == {}
    assert (await db_session.execute(select(Background))).scalars().all() == []
    assert not manifest.exists()


async def test_cleanup_does_not_delete_objects_of_an_already_registered_background(
    db_session, tmp_path, source, plan, install_storage
):
    # Satır önceki çalıştırmadan KALMIŞsa temizlik çalışmamalı: nesneleri
    # silmek, veritabanında var olan ama gösterdiği dosya artık bulunmayan bir
    # zemin bırakırdı — yetim nesneden daha kötü, çünkü kullanıcıya kırık
    # zemin olarak görünür.
    manifest = tmp_path / "manifest.json"
    install_storage(FakeStorage())
    await _run(source, plan, manifest)

    rows = (await db_session.execute(select(Background))).scalars().all()
    assert len(rows) == 1

    # Manifest silinip ikinci çalıştırma yapılıyor; bu kez önizleme patlıyor.
    manifest.unlink()
    storage = install_storage(FakeStorage(fail_on_call=2))
    with pytest.raises(RuntimeError):
        await _run(source, plan, manifest)

    assert storage.deleted == []
