import io
import uuid
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app.api.routes.backgrounds import get_storage_service
from app.core.config import settings
from app.core.db import get_db_session
from app.main import app
from app.models.background import Background


def _jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color="green").save(buf, format="JPEG")
    return buf.getvalue()


def _client(db_session, storage_mock) -> TestClient:
    async def _override_db_session():
        yield db_session

    app.dependency_overrides[get_db_session] = _override_db_session
    app.dependency_overrides[get_storage_service] = lambda: storage_mock
    return TestClient(app)


async def test_missing_admin_secret_returns_401(db_session):
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.jpg", _jpeg_bytes(), "image/jpeg")},
    )

    assert response.status_code == 401
    storage_mock.upload.assert_not_called()


async def test_wrong_admin_secret_returns_401(db_session):
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.jpg", _jpeg_bytes(), "image/jpeg")},
        headers={"X-Admin-Secret": "wrong-secret"},
    )

    assert response.status_code == 401
    storage_mock.upload.assert_not_called()


async def test_invalid_file_returns_400(db_session):
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.txt", b"not-an-image", "image/jpeg")},
        headers={"X-Admin-Secret": settings.admin_secret},
    )

    assert response.status_code == 400
    storage_mock.upload.assert_not_called()


async def test_happy_path_uploads_and_creates_row(db_session):
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)
    content = _jpeg_bytes()

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.jpg", content, "image/jpeg")},
        headers={"X-Admin-Secret": settings.admin_secret},
    )

    assert response.status_code == 201
    background_id = uuid.UUID(response.json()["id"])

    storage_mock.upload.assert_called_once_with(
        f"backgrounds/{background_id}.jpg", content, "image/jpeg"
    )

    result = await db_session.execute(
        select(Background).where(Background.id == background_id)
    )
    row = result.scalar_one()
    assert row.r2_key == f"backgrounds/{background_id}.jpg"
    assert row.is_active is True


async def test_list_backgrounds_returns_empty_list_when_none_exist(db_session):
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)

    response = client.get("/api/backgrounds")

    assert response.status_code == 200
    assert response.json() == []


async def test_list_backgrounds_returns_only_active_with_presigned_urls(db_session):
    from unittest.mock import MagicMock

    active = Background(id=uuid.uuid4(), r2_key="backgrounds/active.jpg", is_active=True)
    inactive = Background(id=uuid.uuid4(), r2_key="backgrounds/inactive.jpg", is_active=False)
    db_session.add_all([active, inactive])
    await db_session.commit()

    storage_mock = AsyncMock()
    storage_mock.generate_presigned_url = MagicMock(
        side_effect=lambda key: f"https://signed.example/{key}"
    )
    client = _client(db_session, storage_mock)

    response = client.get("/api/backgrounds")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == str(active.id)
    assert body[0]["url"] == f"https://signed.example/{active.r2_key}"
