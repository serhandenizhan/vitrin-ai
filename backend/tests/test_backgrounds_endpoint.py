import io
import uuid
from unittest.mock import AsyncMock

from botocore.exceptions import ClientError
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app.api.routes.backgrounds import get_storage_service
from app.core.config import settings
from app.core.db import get_db_session
from app.main import app
from app.models.background import Background
from app.services import storage as storage_module


def _jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color="green").save(buf, format="JPEG")
    return buf.getvalue()


def _client(
    db_session, storage_mock=None, *, raise_server_exceptions: bool = True
) -> TestClient:
    async def _override_db_session():
        try:
            yield db_session
        finally:
            # TestClient, isteği ayrı bir event loop'ta (AnyIO portal) çalıştırır;
            # bağlantı burada serbest bırakılmazsa fixture teardown'ı farklı bir
            # loop'ta rollback denerken "attached to a different loop" hatası alır.
            # rollback() (expire_on_commit ayarından bağımsız olarak) session'daki
            # TÜM nesneleri expire eder; bu da testin request sonrası halihazırda
            # set edilmiş attribute'lara (ör. active.id) senkron eriştiği yerlerde
            # "MissingGreenlet" hatasına yol açıyordu. commit() ise (bu test
            # session factory'si expire_on_commit=False ile kurulduğu için)
            # nesneleri expire etmeden aynı şekilde bağlantıyı serbest bırakır.
            await db_session.commit()

    app.dependency_overrides[get_db_session] = _override_db_session
    if storage_mock is not None:
        app.dependency_overrides[get_storage_service] = lambda: storage_mock
    return TestClient(app, raise_server_exceptions=raise_server_exceptions)


def teardown_function():
    # Sibling test dosyasındaki (`test_remove_background_endpoint.py`)
    # convention'la aynı: her testten sonra override'lar temizlenmezse
    # sonraki testler yanlışlıkla önceki testin mock'larını miras alabilir.
    app.dependency_overrides.clear()
    storage_module._get_client.cache_clear()


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


async def test_non_ascii_admin_secret_returns_401_not_500(db_session):
    # `secrets.compare_digest`, `str` argümanlarında ASCII-dışı karakterlerde
    # `TypeError` fırlatır. ASCII-dışı bir secret gönderildiğinde bile yanıt
    # 401 olmalı (500 değil) — bkz. app/api/routes/backgrounds.py'deki
    # UTF-8 bayt karşılaştırması düzeltmesi. Header değeri bytes olarak
    # veriliyor çünkü httpx, str header değerlerini `ascii` codec'iyle encode
    # etmeye çalışır (ki bu da testin amacına aykırı şekilde burada patlar);
    # bytes değer bu kısıtı atlayıp ham baytları doğrudan gönderir.
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.jpg", _jpeg_bytes(), "image/jpeg")},
        headers={"X-Admin-Secret": "şifre".encode("utf-8")},
    )

    assert response.status_code == 401
    storage_mock.upload.assert_not_called()


async def test_non_ascii_admin_secret_accepts_correct_value(db_session, monkeypatch):
    # Bu test, `test_non_ascii_admin_secret_returns_401_not_500`'in AÇIK KALAN
    # yarısını kapatıyor. O test yalnızca "yanlış secret 500 değil 401 döndürüyor
    # mu" diye bakıyordu; DOĞRU secret'ın kabul edildiğini hiç doğrulamıyordu.
    # Bu yüzden karşılaştırmanın her iki tarafını `utf-8` ile encode eden (ve
    # non-ASCII secret'larda doğru değerle bile kalıcı 401 üreten) bozuk sürüm
    # de o testten yeşil geçiyordu — belirti değişmişti, hata durmamıştı.
    #
    # Header değeri bilinçli olarak `bytes`: httpx `str` header değerlerini
    # `ascii` codec'iyle encode etmeye çalışıp patlar. `bytes` vererek istemcinin
    # telde göndereceği ham UTF-8 baytları birebir taklit ediyoruz — gerçek bir
    # istemcinin davranışı budur.
    secret = "çok-gizli-şifre"
    monkeypatch.setattr(settings, "admin_secret", secret)

    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.jpg", _jpeg_bytes(), "image/jpeg")},
        headers={"X-Admin-Secret": secret.encode("utf-8")},
    )

    assert response.status_code == 201, response.text
    storage_mock.upload.assert_awaited_once()


async def test_unconfigured_r2_returns_service_unavailable_for_upload(
    db_session, monkeypatch
):
    for name in storage_module.REQUIRED_R2_SETTINGS:
        monkeypatch.setattr(settings, name, "")

    client = _client(db_session, raise_server_exceptions=False)

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.jpg", _jpeg_bytes(), "image/jpeg")},
        headers={"X-Admin-Secret": settings.admin_secret},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "R2 depolama yapılandırılmamış; eksik ayar(lar): "
        "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME"
    )


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


async def test_r2_upload_failure_returns_502_and_creates_no_row(db_session):
    # R2 yüklemesi başarısız olursa yetim bir DB kaydı OLUŞMAMALI (bkz.
    # backgrounds.py'deki "önce R2'ye yükle, DB satırı yalnızca başarılıysa
    # yazılır" sırası). Bu test o sıranın gerçek bir hata altında da
    # çalıştığını, sadece happy path'te değil, kanıtlıyor.
    storage_mock = AsyncMock()
    storage_mock.upload.side_effect = ClientError(
        {"Error": {"Code": "InternalError", "Message": "boom"}}, "PutObject"
    )
    client = _client(db_session, storage_mock)

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.jpg", _jpeg_bytes(), "image/jpeg")},
        headers={"X-Admin-Secret": settings.admin_secret},
    )

    assert response.status_code == 502

    result = await db_session.execute(select(Background))
    assert result.scalars().all() == []


async def test_list_backgrounds_returns_empty_list_when_none_exist(db_session):
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)

    response = client.get("/api/backgrounds")

    assert response.status_code == 200
    assert response.json() == []


async def test_list_backgrounds_returns_empty_list_without_r2_configuration(
    db_session, monkeypatch
):
    for name in storage_module.REQUIRED_R2_SETTINGS:
        monkeypatch.setattr(settings, name, "")

    client = _client(db_session)

    response = client.get("/api/backgrounds")

    assert response.status_code == 200
    assert response.json() == []


async def test_list_backgrounds_returns_service_unavailable_without_r2_configuration(
    db_session, monkeypatch
):
    db_session.add(Background(id=uuid.uuid4(), r2_key="backgrounds/a.jpg", is_active=True))
    await db_session.commit()

    for name in storage_module.REQUIRED_R2_SETTINGS:
        monkeypatch.setattr(settings, name, "")

    client = _client(db_session)

    response = client.get("/api/backgrounds")

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "R2 depolama yapılandırılmamış; eksik ayar(lar): "
        "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME"
    )


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
    # İmzalı URL'ler süreli; istemcinin yenilemeyi ne zaman yapacağını
    # sunucudan öğrenmesi gerekiyor (bkz. ROADMAP.md Faz 3 uyarısı).
    assert body[0]["expires_in"] == settings.background_url_expiry_seconds


async def test_list_backgrounds_expires_in_follows_settings(db_session, monkeypatch):
    # `expires_in`'in sabitlenmiş bir değer değil, gerçekten ayardan geldiğini
    # doğrular — ayar değişip yanıt değişmeseydi istemci sessizce süresi dolmuş
    # URL'lerle çalışırdı, ki bu tam olarak yol haritasının uyardığı sessiz hata.
    from unittest.mock import MagicMock

    monkeypatch.setattr(settings, "background_url_expiry_seconds", 120)

    db_session.add(Background(id=uuid.uuid4(), r2_key="backgrounds/a.jpg", is_active=True))
    await db_session.commit()

    storage_mock = AsyncMock()
    storage_mock.generate_presigned_url = MagicMock(return_value="https://signed.example/a")
    client = _client(db_session, storage_mock)

    response = client.get("/api/backgrounds")

    assert response.status_code == 200
    assert response.json()[0]["expires_in"] == 120
