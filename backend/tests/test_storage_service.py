from unittest.mock import MagicMock

from app.services import storage


def teardown_function():
    # `_get_client` süreç ömrü boyunca `lru_cache`'lendiği için testler arası
    # sızıntıyı önlemek adına her testten sonra temizle (bkz.
    # test_background_removal_service.py'deki aynı desen).
    storage._get_client.cache_clear()


async def test_upload_calls_put_object_with_bucket_key_content_and_type(monkeypatch):
    client_mock = MagicMock()
    monkeypatch.setattr(storage.boto3, "client", MagicMock(return_value=client_mock))

    service = storage.R2StorageService(bucket_name="test-bucket")
    await service.upload("backgrounds/key.jpg", b"content", "image/jpeg")

    client_mock.put_object.assert_called_once_with(
        Bucket="test-bucket",
        Key="backgrounds/key.jpg",
        Body=b"content",
        ContentType="image/jpeg",
    )


def test_generate_presigned_url_uses_bucket_key_and_configured_expiry(monkeypatch):
    client_mock = MagicMock()
    client_mock.generate_presigned_url = MagicMock(return_value="https://signed.example/url")
    monkeypatch.setattr(storage.boto3, "client", MagicMock(return_value=client_mock))

    service = storage.R2StorageService(bucket_name="test-bucket")
    url = service.generate_presigned_url("backgrounds/key.jpg")

    client_mock.generate_presigned_url.assert_called_once_with(
        "get_object",
        Params={"Bucket": "test-bucket", "Key": "backgrounds/key.jpg"},
        ExpiresIn=storage.settings.background_url_expiry_seconds,
    )
    assert url == "https://signed.example/url"
