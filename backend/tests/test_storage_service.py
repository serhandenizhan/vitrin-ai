from unittest.mock import MagicMock

import pytest

from app.core.config import settings
from app.services import storage


def teardown_function():
    # `_get_client` süreç ömrü boyunca `lru_cache`'lendiği için testler arası
    # sızıntıyı önlemek adına her testten sonra temizle (bkz.
    # test_background_removal_service.py'deki aynı desen).
    storage._get_client.cache_clear()


@pytest.fixture
def r2_yapilandirildi(monkeypatch):
    # `_get_client` artık eksik R2 ayarlarında fail-fast yapıyor (bkz.
    # `_require_r2_settings`). boto3'ü mock'layan testlerin de bu kapıdan
    # geçmesi gerekiyor — ayarları doldurmak, testi gerçek çalışma koşuluna
    # yaklaştırdığı için mock'u atlatmaktan daha doğru.
    monkeypatch.setattr(settings, "r2_account_id", "test-hesap")
    monkeypatch.setattr(settings, "r2_access_key_id", "test-anahtar")
    monkeypatch.setattr(settings, "r2_secret_access_key", "test-gizli")
    monkeypatch.setattr(settings, "r2_bucket_name", "test-bucket")


async def test_upload_calls_put_object_with_bucket_key_content_and_type(
    monkeypatch, r2_yapilandirildi
):
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


def test_generate_presigned_url_uses_bucket_key_and_configured_expiry(
    monkeypatch, r2_yapilandirildi
):
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


def test_get_client_fails_fast_when_r2_not_configured(monkeypatch):
    # Boş R2 ayarlarıyla boto3 hata VERMEZ: `endpoint_url` sessizce
    # `https://.r2.cloudflarestorage.com` olur ve `generate_presigned_url`
    # geçerli görünen ama hiç çalışmayan bir URL üretir. Yanlış yapılandırma
    # o zaman sunucuda değil, kullanıcının tarayıcısında kırık bir görsel
    # olarak ortaya çıkardı. Client oluşturulurken açıkça patlamalı.
    from app.services import storage as storage_module

    storage_module._get_client.cache_clear()
    monkeypatch.setattr(settings, "r2_account_id", "")
    monkeypatch.setattr(settings, "r2_bucket_name", "")

    with pytest.raises(storage_module.R2ConfigurationError) as exc_info:
        storage_module._get_client()

    # Hangi ayarların eksik olduğu mesajda geçmeli — aksi halde "yapılandırma
    # eksik" demek, hangisini düzelteceğini söylemeden hata vermek olur.
    assert "R2_ACCOUNT_ID" in str(exc_info.value)
    assert "R2_BUCKET_NAME" in str(exc_info.value)
    storage_module._get_client.cache_clear()


def test_get_client_succeeds_when_r2_configured(monkeypatch):
    from app.services import storage as storage_module

    storage_module._get_client.cache_clear()
    monkeypatch.setattr(settings, "r2_account_id", "hesap")
    monkeypatch.setattr(settings, "r2_access_key_id", "anahtar")
    monkeypatch.setattr(settings, "r2_secret_access_key", "gizli")
    monkeypatch.setattr(settings, "r2_bucket_name", "kova")

    client = storage_module._get_client()

    assert client.meta.endpoint_url == "https://hesap.r2.cloudflarestorage.com"
    storage_module._get_client.cache_clear()
