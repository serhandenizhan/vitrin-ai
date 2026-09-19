import io
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from botocore.exceptions import ClientError
from redis.exceptions import ConnectionError as RedisConnectionError
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app.api.routes.backgrounds import get_storage_service
from app.core.auth import CurrentUser
from app.core.config import settings
from app.core.db import get_db_session
from app.main import app
from app.models.background import Background
from app.services import storage as storage_module
from app.services.billing import limits


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


@pytest_asyncio.fixture
async def admin_headers(tokens, create_user, grant_admin) -> dict[str, str]:
    admin_id = await create_user()
    await grant_admin(admin_id)
    return tokens.headers(admin_id)


async def test_upload_without_session_returns_401(db_session, tokens):
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.jpg", _jpeg_bytes(), "image/jpeg")},
    )

    assert response.status_code == 401
    storage_mock.upload.assert_not_called()


async def test_upload_ignores_the_removed_admin_secret_header(db_session, tokens):
    # Faz 3'ün geçici `X-Admin-Secret`'ı Faz 4'te kaldırıldı. Eski değerini
    # bilen biri artık hiçbir şey açamamalı.
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.jpg", _jpeg_bytes(), "image/jpeg")},
        headers={"X-Admin-Secret": "change-me-before-deploy"},
    )

    assert response.status_code == 401
    storage_mock.upload.assert_not_called()


async def test_upload_by_signed_in_non_admin_returns_403(db_session, tokens, create_user):
    # Oturum açmış olmak yetmez — rol kontrolü backend'de (SECURITY.md 3.2).
    user_id = await create_user()
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.jpg", _jpeg_bytes(), "image/jpeg")},
        headers=tokens.headers(user_id),
    )

    assert response.status_code == 403
    storage_mock.upload.assert_not_called()


async def test_upload_without_supabase_configuration_returns_503(db_session, monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "")
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.jpg", _jpeg_bytes(), "image/jpeg")},
    )

    assert response.status_code == 503
    storage_mock.upload.assert_not_called()


async def test_unconfigured_r2_returns_service_unavailable_for_upload(
    db_session, monkeypatch, admin_headers
):
    for name in storage_module.REQUIRED_R2_SETTINGS:
        monkeypatch.setattr(settings, name, "")

    client = _client(db_session, raise_server_exceptions=False)

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.jpg", _jpeg_bytes(), "image/jpeg")},
        headers=admin_headers,
    )

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "R2 depolama yapılandırılmamış; eksik ayar(lar): "
        "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME"
    )


async def test_invalid_file_returns_400(db_session, admin_headers):
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.txt", b"not-an-image", "image/jpeg")},
        headers=admin_headers,
    )

    assert response.status_code == 400
    storage_mock.upload.assert_not_called()


async def test_happy_path_uploads_and_creates_row(db_session, admin_headers):
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)
    content = _jpeg_bytes()

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.jpg", content, "image/jpeg")},
        headers=admin_headers,
    )

    assert response.status_code == 201
    background_id = uuid.UUID(response.json()["id"])

    # Zeminin kendisi olduğu gibi, yanında küçük JPEG önizlemesi.
    assert storage_mock.upload.call_count == 2
    storage_mock.upload.assert_any_call(
        f"backgrounds/{background_id}.jpg", content, "image/jpeg"
    )
    thumb_call = storage_mock.upload.call_args_list[1]
    assert thumb_call.args[0] == f"backgrounds/thumbs/{background_id}.jpg"
    assert thumb_call.args[2] == "image/jpeg"
    assert Image.open(io.BytesIO(thumb_call.args[1])).format == "JPEG"

    result = await db_session.execute(
        select(Background).where(Background.id == background_id)
    )
    row = result.scalar_one()
    assert row.r2_key == f"backgrounds/{background_id}.jpg"
    assert row.is_active is True


async def test_r2_upload_failure_returns_502_and_creates_no_row(db_session, admin_headers):
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
        headers=admin_headers,
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


async def test_list_backgrounds_is_public_without_session(db_session, monkeypatch):
    # Zemin listesi editörün ilk açılışında, oturum açılmadan da gerekiyor;
    # Faz 4'ün kimlik doğrulaması bu uç noktayı kapatmamalı.
    monkeypatch.setattr(settings, "supabase_url", "")
    client = _client(db_session, AsyncMock())

    assert client.get("/api/backgrounds").status_code == 200


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
    # Önizleme adresi zeminin anahtarından türetiliyor; DB'de ayrı alan yok.
    assert body[0]["thumbnail_url"] == "https://signed.example/backgrounds/thumbs/active.jpg"
    # İmzalı URL'ler süreli; istemcinin yenilemeyi ne zaman yapacağını
    # sunucudan öğrenmesi gerekiyor (bkz. ROADMAP.md Faz 3 uyarısı).
    assert body[0]["expires_in"] == settings.background_url_expiry_seconds


async def test_list_backgrounds_expires_in_follows_settings(db_session, monkeypatch):
    # `expires_in`'in sabitlenmiş bir değer değil, gerçekten ayardan geldiğini
    # doğrular — ayar değişip yanıt değişmeseydi istemci sessizce süresi dolmuş
    # URL'lerle çalışırdı, ki bu tam olarak yol haritasının uyardığı sessiz hata.
    monkeypatch.setattr(settings, "background_url_expiry_seconds", 120)

    db_session.add(Background(id=uuid.uuid4(), r2_key="backgrounds/a.jpg", is_active=True))
    await db_session.commit()

    storage_mock = AsyncMock()
    storage_mock.generate_presigned_url = MagicMock(return_value="https://signed.example/a")
    client = _client(db_session, storage_mock)

    response = client.get("/api/backgrounds")

    assert response.status_code == 200
    assert response.json()[0]["expires_in"] == 120


async def test_thumbnail_upload_failure_deletes_the_already_uploaded_original(
    db_session, admin_headers
):
    # Kritik ayrım: yukarıdaki test HER yüklemeyi başarısız kılıyor, yani
    # "ilk yükleme patladı" yolunu sınıyor. İKİNCİ yükleme (küçük önizleme)
    # patladığında ise ana görsel R2'ye ÇOKTAN yazılmış olur ve DB satırı hiç
    # yazılmadığı için anahtarını bilen hiçbir kayıt kalmaz — nesne erişilemez
    # biçimde yer tutmaya devam eder (PR #18 incelemesinde bucket'ta gerçek bir
    # örneği bulundu). Bu yüzden hata yolunda yüklenenler geri silinmeli.
    storage_mock = AsyncMock()
    storage_mock.upload.side_effect = [
        None,
        ClientError(
            {"Error": {"Code": "InternalError", "Message": "boom"}}, "PutObject"
        ),
    ]
    client = _client(db_session, storage_mock)

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.jpg", _jpeg_bytes(), "image/jpeg")},
        headers=admin_headers,
    )

    assert response.status_code == 502
    uploaded_key = storage_mock.upload.call_args_list[0].args[0]
    storage_mock.delete.assert_awaited_once_with(uploaded_key)

    result = await db_session.execute(select(Background))
    assert result.scalars().all() == []


async def test_database_failure_deletes_both_uploaded_objects(db_session, admin_headers):
    # Yüklemelerin ikisi de başarılı ama DB satırı yazılamıyorsa iki nesne de
    # yetim kalır. R2'ye "önce yükle, sonra satır yaz" sırası yetim DB kaydını
    # engelliyor; bu temizlik de ters yöndeki yetimi engelliyor.
    storage_mock = AsyncMock()
    # Gerçek session yerine tamamen sahte bir session veriliyor: `_client`'ın
    # teardown'daki `commit()` çağrısı da bu sahteye gittiği için gerçek
    # fixture'ın bağlantısı hiç bozulmuyor (aksi hâlde teardown başka bir
    # event loop'ta patlıyor).
    failing_session = MagicMock()
    failing_session.add = MagicMock()
    failing_session.commit = AsyncMock(side_effect=RuntimeError("db down"))
    client = _client(failing_session, storage_mock, raise_server_exceptions=False)

    response = client.post(
        "/api/admin/backgrounds",
        files={"file": ("bg.jpg", _jpeg_bytes(), "image/jpeg")},
        headers=admin_headers,
    )

    assert response.status_code == 500
    deleted = {call.args[0] for call in storage_mock.delete.await_args_list}
    uploaded = {call.args[0] for call in storage_mock.upload.await_args_list}
    assert deleted == uploaded

    result = await db_session.execute(select(Background))
    assert result.scalars().all() == []


async def test_list_backgrounds_survives_a_redis_outage(db_session, monkeypatch):
    # Hız sınırı Redis'te tutuluyor. Redis'e ulaşılamadığında sayaç
    # sorulamıyor; eskiden bu hata yukarı sızıp 500 oluyordu ve Next vekili
    # bütün 5xx'leri "200 + boş liste"ye çevirdiği için 93 zeminlik kütüphane
    # kullanıcının gözünde YOK OLUYORDU. Sınırlayıcının altyapı arızası, ürünün
    # çekirdek özelliğini kapatmak için bir sebep değil: kota kararları bile
    # listeyi boşaltmıyor (kök CLAUDE.md, erişim kuralı 1).
    active = Background(id=uuid.uuid4(), r2_key="backgrounds/aktif.jpg", is_active=True)
    db_session.add(active)
    await db_session.commit()

    async def _redis_down(_key: str):
        raise RedisConnectionError("Redis kapalı")

    monkeypatch.setattr(limits.public_limiter, "retry_after", _redis_down)

    storage_mock = AsyncMock()
    storage_mock.generate_presigned_url = MagicMock(return_value="https://r2.example/aktif")
    client = _client(db_session, storage_mock)

    response = client.get("/api/backgrounds")

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [str(active.id)]


async def test_checkout_rate_limit_stays_fail_closed_on_a_redis_outage():
    # Karşı taraf bilinçli olarak AKSİ yönde: parayla ilgili yüzeyde sınırın
    # sessizce kalkması, Redis arızasında sınırsız checkout denemesi demek
    # olurdu. Bu yüzden `limit_checkout` fail-CLOSED kalıyor; ayrım
    # `limits.py`'de yazılı ve bu test o ayrımın korunduğunu kanıtlıyor.
    async def _redis_down(_key: str):
        raise RedisConnectionError("Redis kapalı")

    original = limits.checkout_limiter.retry_after
    limits.checkout_limiter.retry_after = _redis_down
    try:
        user = CurrentUser(id=uuid.uuid4(), email="kuyumcu@example.com", session_id=None)
        with pytest.raises(RedisConnectionError):
            await limits.limit_checkout(user)
    finally:
        limits.checkout_limiter.retry_after = original


async def test_admin_list_requires_admin(db_session, tokens, create_user):
    # Oturum yetmez, rol gerekir (SECURITY.md 3.2) — RED yolu.
    user_id = await create_user()
    storage_mock = AsyncMock()
    storage_mock.generate_presigned_url = MagicMock(side_effect=lambda key: f"https://signed.example/{key}")
    client = _client(db_session, storage_mock)

    assert client.get("/api/admin/backgrounds").status_code == 401
    assert (
        client.get("/api/admin/backgrounds", headers=tokens.headers(user_id)).status_code == 403
    )


async def test_admin_list_includes_inactive_and_full_tier(db_session, admin_headers):
    # Panelin asıl işi: kullanıcıya GİTMEYEN zemini de göstermek. Kullanıcı ucu
    # (`GET /api/backgrounds`) yalnızca aktif + `basic` döndürüyor; bu iki liste
    # AYNI veritabanında farklı sonuç vermeli, yoksa panel bir şey eklemiyor.
    active = Background(id=uuid.uuid4(), r2_key="backgrounds/a.jpg", is_active=True)
    passive = Background(id=uuid.uuid4(), r2_key="backgrounds/p.jpg", is_active=False)
    full = Background(id=uuid.uuid4(), r2_key="backgrounds/f.jpg", tier="full", is_active=True)
    db_session.add_all([active, passive, full])
    await db_session.commit()

    storage_mock = AsyncMock()
    storage_mock.generate_presigned_url = MagicMock(
        side_effect=lambda key: f"https://signed.example/{key}"
    )
    client = _client(db_session, storage_mock)

    body = client.get("/api/admin/backgrounds", headers=admin_headers).json()

    assert {row["id"] for row in body} == {str(active.id), str(passive.id), str(full.id)}
    by_id = {row["id"]: row for row in body}
    assert by_id[str(passive.id)]["is_active"] is False
    assert by_id[str(full.id)]["tier"] == "full"
    assert by_id[str(active.id)]["thumbnail_url"] == "https://signed.example/backgrounds/thumbs/a.jpg"
    assert by_id[str(active.id)]["expires_in"] == settings.background_url_expiry_seconds

    # Aynı veriyle kullanıcı ucu yalnızca aktif + basic görüyor.
    public = client.get("/api/backgrounds").json()
    assert {row["id"] for row in public} == {str(active.id)}


async def test_admin_list_survives_a_redis_outage(db_session, admin_headers, monkeypatch):
    # Okuma ucu fail-open: sınırlayıcının altyapı arızası paneli karartmamalı
    # (kök CLAUDE.md hız sınırı kuralı).
    db_session.add(Background(id=uuid.uuid4(), r2_key="backgrounds/a.jpg"))
    await db_session.commit()

    async def _redis_down(_key: str):
        raise RedisConnectionError("Redis kapalı")

    monkeypatch.setattr(limits.public_limiter, "retry_after", _redis_down)
    storage_mock = AsyncMock()
    storage_mock.generate_presigned_url = MagicMock(side_effect=lambda key: f"https://signed.example/{key}")
    client = _client(db_session, storage_mock)

    response = client.get("/api/admin/backgrounds", headers=admin_headers)

    assert response.status_code == 200
    assert len(response.json()) == 1


async def test_update_background_requires_admin(db_session, tokens, create_user):
    bg = Background(id=uuid.uuid4(), r2_key="backgrounds/a.jpg")
    db_session.add(bg)
    await db_session.commit()
    client = _client(db_session, AsyncMock())

    assert client.patch(f"/api/admin/backgrounds/{bg.id}", json={"tier": "full"}).status_code == 401
    user_id = await create_user()
    assert (
        client.patch(
            f"/api/admin/backgrounds/{bg.id}",
            json={"tier": "full"},
            headers=tokens.headers(user_id),
        ).status_code
        == 403
    )
    await db_session.refresh(bg)
    assert bg.tier == "basic"


async def test_update_background_changes_tier_and_visibility(db_session, admin_headers):
    # PASİF = SİLİNMİŞ DEĞİL: satır duruyor, yalnız kullanıcı listesinden çıkıyor.
    bg = Background(id=uuid.uuid4(), r2_key="backgrounds/a.jpg")
    db_session.add(bg)
    await db_session.commit()

    storage_mock = AsyncMock()
    storage_mock.generate_presigned_url = MagicMock(side_effect=lambda key: f"https://signed.example/{key}")
    client = _client(db_session, storage_mock)

    body = client.patch(
        f"/api/admin/backgrounds/{bg.id}",
        json={"tier": "full", "is_active": False},
        headers=admin_headers,
    ).json()

    assert body["tier"] == "full" and body["is_active"] is False
    # Kullanıcı ucundan düştü ama satır ve nesneler duruyor.
    assert client.get("/api/backgrounds").json() == []
    assert len(client.get("/api/admin/backgrounds", headers=admin_headers).json()) == 1
    storage_mock.delete.assert_not_called()


async def test_update_background_writes_one_audit_row_only_when_changed(db_session, admin_headers):
    # Faz 6 kuralı 5: idempotent tekrar, olmamış ikinci bir eylem göstermemeli.
    from app.services.billing.db import many

    bg = Background(id=uuid.uuid4(), r2_key="backgrounds/a.jpg")
    db_session.add(bg)
    await db_session.commit()
    client = _client(db_session, AsyncMock())

    client.patch(f"/api/admin/backgrounds/{bg.id}", json={"is_active": False}, headers=admin_headers)
    client.patch(f"/api/admin/backgrounds/{bg.id}", json={"is_active": False}, headers=admin_headers)

    rows = await many(
        db_session,
        "SELECT action,detail FROM admin_audit_log WHERE subject_id=:id",
        id=str(bg.id),
    )
    assert len(rows) == 1
    assert rows[0]["action"] == "background_update"


async def test_update_background_rejects_unknown_field(db_session, admin_headers):
    bg = Background(id=uuid.uuid4(), r2_key="backgrounds/a.jpg")
    db_session.add(bg)
    await db_session.commit()
    client = _client(db_session, AsyncMock())

    response = client.patch(
        f"/api/admin/backgrounds/{bg.id}", json={"r2_key": "backgrounds/baska.jpg"}, headers=admin_headers
    )

    assert response.status_code == 422
    await db_session.refresh(bg)
    assert bg.r2_key == "backgrounds/a.jpg"


async def test_delete_background_removes_row_and_both_objects(db_session, admin_headers):
    bg = Background(id=uuid.uuid4(), r2_key="backgrounds/a.jpg")
    db_session.add(bg)
    await db_session.commit()
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)

    response = client.delete(f"/api/admin/backgrounds/{bg.id}", headers=admin_headers)

    assert response.status_code == 200
    assert (await db_session.execute(select(Background))).scalars().all() == []
    # Asıl görsel VE küçük önizleme; biri unutulursa bucket'ta yer tutar.
    assert {call.args[0] for call in storage_mock.delete.await_args_list} == {
        "backgrounds/a.jpg",
        "backgrounds/thumbs/a.jpg",
    }


async def test_delete_background_succeeds_even_if_storage_fails(db_session, admin_headers):
    # Depolama arızası, kullanıcının gözünde tamamlanmış silmeyi 500'e
    # çevirmemeli: satır zaten gitti, geri dönüş yok.
    bg = Background(id=uuid.uuid4(), r2_key="backgrounds/a.jpg")
    db_session.add(bg)
    await db_session.commit()
    storage_mock = AsyncMock()
    storage_mock.delete.side_effect = ClientError({"Error": {"Code": "500"}}, "DeleteObject")
    client = _client(db_session, storage_mock)

    response = client.delete(f"/api/admin/backgrounds/{bg.id}", headers=admin_headers)

    assert response.status_code == 200
    assert (await db_session.execute(select(Background))).scalars().all() == []


async def test_delete_background_requires_admin_and_writes_audit(db_session, tokens, create_user, admin_headers):
    from app.services.billing.db import many

    bg = Background(id=uuid.uuid4(), r2_key="backgrounds/a.jpg")
    db_session.add(bg)
    await db_session.commit()
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)

    user_id = await create_user()
    assert client.delete(f"/api/admin/backgrounds/{bg.id}").status_code == 401
    assert client.delete(f"/api/admin/backgrounds/{bg.id}", headers=tokens.headers(user_id)).status_code == 403
    storage_mock.delete.assert_not_called()

    client.delete(f"/api/admin/backgrounds/{bg.id}", headers=admin_headers)
    rows = await many(
        db_session, "SELECT action FROM admin_audit_log WHERE subject_id=:id", id=str(bg.id)
    )
    assert [row["action"] for row in rows] == ["background_delete"]


async def test_delete_missing_background_returns_404(db_session, admin_headers):
    storage_mock = AsyncMock()
    client = _client(db_session, storage_mock)

    response = client.delete(f"/api/admin/backgrounds/{uuid.uuid4()}", headers=admin_headers)

    assert response.status_code == 404
    storage_mock.delete.assert_not_called()
