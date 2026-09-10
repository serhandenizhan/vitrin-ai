import io
import os
import uuid
from unittest.mock import ANY, AsyncMock, MagicMock

import pytest
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app.core.config import settings
from app.core.db import get_db_session
from app.main import app
from app.models.project import Project
from app.services import storage as storage_module
from app.services.storage import get_storage_service


def _png(size=(12, 12)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGBA", size, color=(200, 160, 90, 255)).save(buf, format="PNG")
    return buf.getvalue()


def _noisy_png(side: int) -> bytes:
    # Rastgele piksel sıkıştırılamaz; küçük resim sınırını aşan bir PNG üretir.
    buf = io.BytesIO()
    Image.frombytes("RGB", (side, side), os.urandom(side * side * 3)).save(buf, format="PNG")
    return buf.getvalue()


def _jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (12, 12), color="green").save(buf, format="JPEG")
    return buf.getvalue()


def _storage_mock() -> AsyncMock:
    mock = AsyncMock()
    mock.generate_presigned_url = MagicMock(
        side_effect=lambda key, expires_in=None: f"https://signed.example/{key}"
    )
    return mock


def _client(db_session, storage_mock, *, raise_server_exceptions: bool = True) -> TestClient:
    async def _override_db_session():
        try:
            yield db_session
        finally:
            # bkz. test_backgrounds_endpoint.py: bağlantı istek loop'unda
            # serbest bırakılmalı; commit nesneleri expire etmiyor.
            await db_session.commit()

    app.dependency_overrides[get_db_session] = _override_db_session
    app.dependency_overrides[get_storage_service] = lambda: storage_mock
    return TestClient(app, raise_server_exceptions=raise_server_exceptions)


def teardown_function():
    app.dependency_overrides.clear()
    storage_module._get_client.cache_clear()


def _files(result: bytes | None = None, thumbnail: bytes | None = None, result_type="image/png"):
    return {
        "result": ("sonuc.png", result if result is not None else _png(), result_type),
        "thumbnail": ("kucuk.png", thumbnail if thumbnail is not None else _png((4, 4)), "image/png"),
    }


async def _insert_project(db_session, user_id: uuid.UUID, file_name="yuzuk.jpg") -> Project:
    project_id = uuid.uuid4()
    project = Project(
        id=project_id,
        user_id=user_id,
        file_name=file_name,
        result_r2_key=f"projects/{user_id}/{project_id}/result.png",
        thumbnail_r2_key=f"projects/{user_id}/{project_id}/thumbnail.png",
    )
    db_session.add(project)
    # Her satır ayrı commit: `created_at` = transaction başlangıcı, sıralama
    # testleri farklı zamanlara ihtiyaç duyuyor.
    await db_session.commit()
    return project


async def _project_ids(db_session) -> set[uuid.UUID]:
    result = await db_session.execute(select(Project.id))
    return set(result.scalars().all())


async def test_requires_authentication(db_session, tokens):
    client = _client(db_session, _storage_mock())

    assert client.get("/api/projects").status_code == 401
    assert client.post("/api/projects", files=_files(), data={"file_name": "a.jpg"}).status_code == 401
    assert client.delete("/api/projects").status_code == 401


async def test_create_stores_files_under_user_prefix_never_using_file_name(
    db_session, tokens, create_user
):
    user_id = await create_user()
    storage = _storage_mock()
    client = _client(db_session, storage)

    response = client.post(
        "/api/projects",
        files=_files(),
        data={"file_name": "../../yuzuk.heic", "is_mocked": "false", "duration_seconds": "14.5"},
        headers=tokens.headers(user_id),
    )

    assert response.status_code == 201, response.text
    body = response.json()
    project_id = uuid.UUID(body["id"])
    result_key = f"projects/{user_id}/{project_id}/result.png"
    thumbnail_key = f"projects/{user_id}/{project_id}/thumbnail.png"

    storage.upload.assert_any_await(result_key, ANY, "image/png")
    storage.upload.assert_any_await(thumbnail_key, ANY, "image/png")
    for call in storage.upload.await_args_list:
        assert "yuzuk" not in call.args[0]
        assert ".." not in call.args[0]

    row = await db_session.scalar(select(Project).where(Project.id == project_id))
    assert row.user_id == user_id
    # Dosya adı yalnızca görüntüleme metni olarak, olduğu gibi saklanıyor.
    assert row.file_name == "../../yuzuk.heic"
    assert row.duration_seconds == 14.5
    assert row.is_mocked is False

    assert body["file_name"] == "../../yuzuk.heic"
    assert body["result_url"] == f"https://signed.example/{result_key}"
    assert body["thumbnail_url"] == f"https://signed.example/{thumbnail_key}"
    assert body["expires_in"] == settings.project_url_expiry_seconds
    assert body["created_at"]


async def test_create_rejects_non_png_result(db_session, tokens, create_user):
    user_id = await create_user()
    storage = _storage_mock()
    client = _client(db_session, storage)

    response = client.post(
        "/api/projects",
        files=_files(result=_jpeg(), result_type="image/jpeg"),
        data={"file_name": "a.jpg"},
        headers=tokens.headers(user_id),
    )

    assert response.status_code == 400
    storage.upload.assert_not_called()
    assert await _project_ids(db_session) == set()


async def test_create_rejects_content_that_does_not_match_declared_type(
    db_session, tokens, create_user
):
    user_id = await create_user()
    storage = _storage_mock()
    client = _client(db_session, storage)

    response = client.post(
        "/api/projects",
        files=_files(result=b"<script>alert(1)</script>"),
        data={"file_name": "a.jpg"},
        headers=tokens.headers(user_id),
    )

    assert response.status_code == 400
    storage.upload.assert_not_called()


async def test_create_rejects_oversized_thumbnail(db_session, tokens, create_user):
    user_id = await create_user()
    storage = _storage_mock()
    client = _client(db_session, storage)
    big_thumbnail = _noisy_png(600)
    assert len(big_thumbnail) > 512 * 1024

    response = client.post(
        "/api/projects",
        files=_files(thumbnail=big_thumbnail),
        data={"file_name": "a.jpg"},
        headers=tokens.headers(user_id),
    )

    assert response.status_code == 400
    storage.upload.assert_not_called()


async def test_create_rejects_blank_file_name(db_session, tokens, create_user):
    user_id = await create_user()
    storage = _storage_mock()
    client = _client(db_session, storage)

    response = client.post(
        "/api/projects",
        files=_files(),
        data={"file_name": "   "},
        headers=tokens.headers(user_id),
    )

    assert response.status_code == 400
    storage.upload.assert_not_called()


async def test_upload_failure_rolls_back_first_object_and_creates_no_row(
    db_session, tokens, create_user
):
    user_id = await create_user()
    storage = _storage_mock()
    storage.upload.side_effect = [
        None,
        ClientError({"Error": {"Code": "InternalError", "Message": "boom"}}, "PutObject"),
    ]
    client = _client(db_session, storage)

    response = client.post(
        "/api/projects", files=_files(), data={"file_name": "a.jpg"}, headers=tokens.headers(user_id)
    )

    assert response.status_code == 502
    first_key = storage.upload.await_args_list[0].args[0]
    storage.delete.assert_awaited_once_with(first_key)
    assert await _project_ids(db_session) == set()


async def test_list_returns_only_own_projects_newest_first(db_session, tokens, create_user):
    owner = await create_user()
    stranger = await create_user()
    older = await _insert_project(db_session, owner, "eski.jpg")
    newer = await _insert_project(db_session, owner, "yeni.jpg")
    await _insert_project(db_session, stranger, "yabanci.jpg")
    client = _client(db_session, _storage_mock())

    response = client.get("/api/projects", headers=tokens.headers(owner))

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [str(newer.id), str(older.id)]


async def test_list_respects_limit(db_session, tokens, create_user):
    owner = await create_user()
    for index in range(3):
        await _insert_project(db_session, owner, f"{index}.jpg")
    client = _client(db_session, _storage_mock())

    response = client.get("/api/projects?limit=2", headers=tokens.headers(owner))

    assert len(response.json()) == 2
    assert client.get("/api/projects?limit=101", headers=tokens.headers(owner)).status_code == 422


async def test_get_own_project(db_session, tokens, create_user):
    owner = await create_user()
    project = await _insert_project(db_session, owner)
    client = _client(db_session, _storage_mock())

    response = client.get(f"/api/projects/{project.id}", headers=tokens.headers(owner))

    assert response.status_code == 200
    assert response.json()["id"] == str(project.id)


async def test_get_other_users_project_returns_404(db_session, tokens, create_user):
    # IDOR: başkasının projesinin id'sini bilmek yetmemeli; 403 değil 404,
    # çünkü 403 o id'nin var olduğunu doğrulardı.
    owner = await create_user()
    attacker = await create_user()
    project = await _insert_project(db_session, owner)
    storage = _storage_mock()
    client = _client(db_session, storage)

    response = client.get(f"/api/projects/{project.id}", headers=tokens.headers(attacker))

    assert response.status_code == 404
    storage.generate_presigned_url.assert_not_called()


async def test_delete_other_users_project_returns_404_and_keeps_it(db_session, tokens, create_user):
    owner = await create_user()
    attacker = await create_user()
    project = await _insert_project(db_session, owner)
    storage = _storage_mock()
    client = _client(db_session, storage)

    response = client.delete(f"/api/projects/{project.id}", headers=tokens.headers(attacker))

    assert response.status_code == 404
    assert await _project_ids(db_session) == {project.id}
    storage.delete.assert_not_called()


async def test_delete_own_project_removes_row_and_objects(db_session, tokens, create_user):
    owner = await create_user()
    project = await _insert_project(db_session, owner)
    storage = _storage_mock()
    client = _client(db_session, storage)

    response = client.delete(f"/api/projects/{project.id}", headers=tokens.headers(owner))

    assert response.status_code == 204
    assert await _project_ids(db_session) == set()
    deleted_keys = {call.args[0] for call in storage.delete.await_args_list}
    assert deleted_keys == {project.result_r2_key, project.thumbnail_r2_key}


async def test_r2_delete_failure_still_removes_row(db_session, tokens, create_user):
    owner = await create_user()
    project = await _insert_project(db_session, owner)
    storage = _storage_mock()
    storage.delete.side_effect = ClientError(
        {"Error": {"Code": "InternalError", "Message": "boom"}}, "DeleteObject"
    )
    client = _client(db_session, storage)

    response = client.delete(f"/api/projects/{project.id}", headers=tokens.headers(owner))

    assert response.status_code == 204
    assert await _project_ids(db_session) == set()


async def test_delete_all_removes_only_own_projects(db_session, tokens, create_user):
    owner = await create_user()
    stranger = await create_user()
    await _insert_project(db_session, owner)
    await _insert_project(db_session, owner)
    kept = await _insert_project(db_session, stranger)
    storage = _storage_mock()
    client = _client(db_session, storage)

    response = client.delete("/api/projects", headers=tokens.headers(owner))

    assert response.status_code == 204
    assert await _project_ids(db_session) == {kept.id}
    assert storage.delete.await_count == 4
    for call in storage.delete.await_args_list:
        assert call.args[0].startswith(f"projects/{owner}/")


@pytest.mark.parametrize("value", ["inf", "Infinity", "1e309", "nan"])
async def test_create_rejects_non_finite_duration(db_session, tokens, create_user, value):
    # `inf` JSON'a çevrilemiyor: kaydedilseydi hem bu istek hem de o
    # kullanıcının sonraki TÜM liste istekleri 500 dönerdi.
    user_id = await create_user()
    storage = _storage_mock()
    client = _client(db_session, storage, raise_server_exceptions=False)

    response = client.post(
        "/api/projects",
        files=_files(),
        data={"file_name": "a.jpg", "duration_seconds": value},
        headers=tokens.headers(user_id),
    )

    assert response.status_code == 422
    storage.upload.assert_not_called()
    assert await _project_ids(db_session) == set()


async def test_deleted_users_session_gets_401_and_uploaded_objects_are_removed(
    db_session, tokens
):
    # Supabase bir kullanıcıyı silince access token'ını iptal etmiyor; token
    # süresi dolana kadar geçerli kalıyor. Kullanıcı `auth.users`'ta yokken
    # görseller R2'ye yüklenip veritabanı FK'ye takılıyor — yüklenenler geri
    # silinmeli, istemci 500 değil 401 almalı.
    deleted_user = uuid.uuid4()
    storage = _storage_mock()
    client = _client(db_session, storage, raise_server_exceptions=False)

    response = client.post(
        "/api/projects",
        files=_files(),
        data={"file_name": "a.jpg"},
        headers=tokens.headers(deleted_user),
    )

    assert response.status_code == 401
    uploaded = {call.args[0] for call in storage.upload.await_args_list}
    removed = {call.args[0] for call in storage.delete.await_args_list}
    assert len(uploaded) == 2
    assert removed == uploaded
    assert await _project_ids(db_session) == set()
