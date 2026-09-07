import io

from fastapi.testclient import TestClient
from PIL import Image

from app.api.routes.remove_background import get_background_removal_service
from app.main import app


class FakeBackgroundRemovalService:
    def __init__(self, result: bytes = b"fake-png-bytes"):
        self.result = result
        self.received_content: bytes | None = None

    def remove(self, image_bytes: bytes) -> bytes:
        self.received_content = image_bytes
        return self.result


def _jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color="green").save(buf, format="JPEG")
    return buf.getvalue()


def _client_with_fake_service(fake_service: FakeBackgroundRemovalService) -> TestClient:
    app.dependency_overrides[get_background_removal_service] = lambda: fake_service
    client = TestClient(app)
    return client


def teardown_function():
    app.dependency_overrides.clear()


def test_returns_png_for_valid_jpeg_upload():
    fake_service = FakeBackgroundRemovalService(result=b"cutout-png-bytes")
    client = _client_with_fake_service(fake_service)

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.jpg", _jpeg_bytes(), "image/jpeg")},
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == b"cutout-png-bytes"
    assert fake_service.received_content == _jpeg_bytes()


def test_rejects_disallowed_content_type_with_400():
    fake_service = FakeBackgroundRemovalService()
    client = _client_with_fake_service(fake_service)

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )

    assert response.status_code == 400
    assert "content-type" in response.json()["detail"]
    assert fake_service.received_content is None


def test_rejects_oversized_upload_with_400():
    fake_service = FakeBackgroundRemovalService()
    client = _client_with_fake_service(fake_service)

    oversized = _jpeg_bytes() + b"\x00" * (25 * 1024 * 1024)
    response = client.post(
        "/api/remove-background",
        files={"file": ("product.jpg", oversized, "image/jpeg")},
    )

    assert response.status_code == 400
    assert "boyut" in response.json()["detail"]
