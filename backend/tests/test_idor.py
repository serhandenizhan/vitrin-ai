"""Sistematik yetkilendirme ve IDOR paketi (Faz 7, `SECURITY.md` bölüm 9).

NEDEN AYRI BİR PAKET: uç başına yazılmış yetki testleri vardı ama hangi ucun
kapsandığını gösteren tek bir yer yoktu; yeni bir uç eklendiğinde yetki testi
yazılmadan birleşebilirdi. Bu dosya dört katmanlı:

1. ENVANTER — uygulamanın OpenAPI şemasındaki HER uç aşağıdaki dört sınıftan
   tam olarak birine atanmış olmalı. Sınıflandırılmamış yeni bir uç testi
   kırmızı yakar: "bu uç kime açık?" sorusu birleşmeden önce cevaplanır.
   Rotalar FastAPI'nin iç yapısından değil genel OpenAPI şemasından okunur
   (0.141'de `include_router` rotaları özel bir sarmalayıcıda tutuyor).
   26.09.2026'da şemadaki uç sayısı koddaki rota dekoratörü sayısıyla aynıydı
   (45); `include_in_schema=False` ile gizlenen bir uç bu envanterden kaçar,
   bu yüzden öyle bir uç eklenmez.
2. OTURUMSUZ — oturum isteyen her uç oturumsuz istekte 401 döner.
3. YÖNETİCİ — her admin ucu üç yoldan sınanır: oturumsuz 401, sıradan kullanıcı
   403, yönetici yetki kontrolünü GEÇER (401/403 dışında bir yanıt). Kabul
   yolu olmadan bozuk bir kontrol de "403 dönüyor" testinden yeşil geçerdi
   (kök `CLAUDE.md` ders 15). Yetkinin decorator'da mı imzada mı yazıldığına
   bakılmaz; uç gerçekten çağrılır (`resolve`/`retry` gibi uçlarda
   `require_admin` yalnız imzada — kodu okuyarak doğrulamak yanıltıcıydı).
4. SAHİPLİ KAYNAK — kaynağın kimliği yoldan gelen uçlarda başka bir kullanıcı
   404 alır (403 değil: 403 kimliğin var olduğunu doğrulardı) ve kaynak
   değişmez; SAHİBİ aynı istekle başarılı olur. Ayrıca kimliği yoldan değil
   başlıktan gelen bir iş anahtarı da (`Idempotency-Key`) kullanıcıya göre
   ayrılır: B, A'nın anahtarını gönderip A'nın saklanan kesimini alamaz.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.routes.remove_background import get_cutout_queue
from app.core.db import get_db_session
from app.core.config import settings
from app.main import app
from app.models.project import Project
from app.services.billing.db import one
from app.services.billing.entitlements import reserve, resolve_reservation
from app.services.billing.provider import Iyzico, get_provider
from app.services.cutout_queue import CutoutQueue
from app.services.storage import R2StorageService, get_storage_service
from app.services.supabase_admin import SupabaseAdminService, get_supabase_admin

# ---------------------------------------------------------------------------
# 1. Envanter
# ---------------------------------------------------------------------------

#: Oturum gerektirmeyen uçlar. Her birinin gerekçesi var: sağlık kontrolü,
#: herkese açık fiyat/belge listesi, oturumlu ya da oturumsuz çalışan zemin
#: listesi (oturumsuzsa temel paket), iyzico'nun tarayıcı geri dönüşü (token
#: sağlayıcıdan doğrulanır) ve imzalı webhook.
PUBLIC = {
    ("GET", "/api/health"),
    ("GET", "/api/plans"),
    ("GET", "/api/billing/documents"),
    ("GET", "/api/backgrounds"),
    ("POST", "/api/subscriptions/callback"),
    ("POST", "/api/webhooks/iyzico"),
}

#: Oturum ister ve YALNIZ oturum sahibinin hesabında çalışır; istemciden
#: başka bir kullanıcının kimliğini alan bir alan yoktur.
SESSION = {
    ("DELETE", "/api/account"),
    ("GET", "/api/admin/me"),
    ("GET", "/api/billing/history"),
    ("DELETE", "/api/projects"),
    ("GET", "/api/projects"),
    ("POST", "/api/projects"),
    ("POST", "/api/remove-background"),
    ("POST", "/api/subscriptions/cancel"),
    ("POST", "/api/subscriptions/change-plan"),
    ("POST", "/api/subscriptions/checkout"),
    ("GET", "/api/subscriptions/me"),
    ("POST", "/api/support-requests"),
}

#: Kaynağın kimliği yoldan gelir; sahiplik veritabanı sorgusunda doğrulanır.
OWNED = {
    ("GET", "/api/projects/{project_id}"),
    ("PATCH", "/api/projects/{project_id}"),
    ("DELETE", "/api/projects/{project_id}"),
    ("GET", "/api/subscriptions/checkout/{session_id}"),
    ("POST", "/api/subscriptions/checkout/{session_id}/cancel"),
    # Faz 7 kuyruğu: kimlik istemcinin anahtarı, kayıt `(kullanıcı, anahtar)`.
    ("GET", "/api/remove-background/jobs/{request_id}"),
}

#: Yalnız yöneticiye açık uçlar (`/api/admin/me` hariç: o, rolü gösterir).
ADMIN = {
    ("GET", "/api/admin/audit"),
    ("GET", "/api/admin/backgrounds"),
    ("POST", "/api/admin/backgrounds"),
    ("DELETE", "/api/admin/backgrounds/{background_id}"),
    ("PATCH", "/api/admin/backgrounds/{background_id}"),
    ("POST", "/api/admin/billing/{transaction_id}/chargeback"),
    ("PATCH", "/api/admin/billing/{transaction_id}/invoice"),
    ("POST", "/api/admin/billing/{transaction_id}/refund"),
    ("POST", "/api/admin/billing/actions/{action_id}/resolve"),
    ("POST", "/api/admin/billing/actions/{action_id}/retry"),
    ("GET", "/api/admin/billing/operations"),
    ("POST", "/api/admin/credits/{grant_id}/revoke"),
    ("PATCH", "/api/admin/plans/{plan_id}"),
    ("POST", "/api/admin/plans/{plan_id}/versions"),
    ("GET", "/api/admin/stats"),
    ("POST", "/api/admin/subscriptions/{user_id}/suspend"),
    ("GET", "/api/admin/users"),
    ("DELETE", "/api/admin/users/{user_id}"),
    ("GET", "/api/admin/users/{user_id}"),
    ("DELETE", "/api/admin/users/{user_id}/admin"),
    ("POST", "/api/admin/users/{user_id}/admin"),
    ("POST", "/api/admin/users/{user_id}/credits"),
}


def _openapi_routes() -> dict[tuple[str, str], dict]:
    routes = {}
    for path, operations in app.openapi()["paths"].items():
        for method, operation in operations.items():
            routes[(method.upper(), path)] = operation
    return routes


def test_every_route_has_exactly_one_access_class():
    classes = [PUBLIC, SESSION, OWNED, ADMIN]
    for i, first in enumerate(classes):
        for second in classes[i + 1 :]:
            assert not first & second, f"iki sınıfta birden: {first & second}"

    routes = set(_openapi_routes())
    classified = set().union(*classes)
    assert routes - classified == set(), (
        "Sınıflandırılmamış uç: bu dosyadaki PUBLIC/SESSION/OWNED/ADMIN "
        "kümelerinden birine eklenmeli ve o sınıfın yetki testi geçmeli"
    )
    assert classified - routes == set(), "Artık var olmayan uç sınıflandırılmış"


def test_no_admin_path_is_classified_outside_admin():
    # `/api/admin/` altındaki bir ucun yanlışlıkla SESSION ya da PUBLIC
    # sayılması, yönetici taramasını o uç için atlatırdı.
    for method, path in PUBLIC | SESSION | OWNED:
        assert not path.startswith("/api/admin/") or (method, path) == ("GET", "/api/admin/me")


# ---------------------------------------------------------------------------
# Ortak düzen: dış servisler sahte, veritabanı test oturumu
# ---------------------------------------------------------------------------


def _fill_path(path: str, operation: dict) -> str:
    """Yol parametrelerini tiplerine uygun, VAR OLMAYAN değerlerle doldurur."""
    for param in operation.get("parameters", []):
        if param.get("in") != "path":
            continue
        schema = param.get("schema", {})
        if schema.get("format") == "uuid":
            value = str(uuid.uuid4())
        elif schema.get("type") == "integer":
            value = "987654321"
        else:
            value = "olmayan-kayit"
        path = path.replace("{" + param["name"] + "}", value)
    return path


@pytest.fixture
async def client(db_session):
    async def session_override():
        try:
            yield db_session
        finally:
            await db_session.commit()

    provider = AsyncMock(spec=Iyzico)
    provider.transactions.return_value = {"transactions": [], "totalPageCount": 0}
    supabase = AsyncMock(spec=SupabaseAdminService)
    supabase.get_user.return_value = None
    supabase.get_user_email.return_value = None
    supabase.list_users.return_value = []
    storage = AsyncMock(spec=R2StorageService)
    storage.generate_presigned_url = MagicMock(
        side_effect=lambda key, expires_in=None: f"https://signed.example/{key}"
    )
    storage.ensure_configured = MagicMock()

    app.dependency_overrides[get_db_session] = session_override
    app.dependency_overrides[get_provider] = lambda: provider
    app.dependency_overrides[get_supabase_admin] = lambda: supabase
    app.dependency_overrides[get_storage_service] = lambda: storage
    # Test öneki: geliştirme ortamında çalışan bir işçi (execute.sh) testin
    # işlerini ALMASIN diye gerçek `cutout` önekinden ayrı.
    prefix = f"test-idor-{uuid.uuid4()}"
    queue = CutoutQueue(settings.redis_url, prefix=prefix)
    app.dependency_overrides[get_cutout_queue] = lambda: queue
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        http.storage = storage
        http.provider = provider
        http.queue = queue
        yield http
    app.dependency_overrides.clear()
    redis = queue._redis()
    keys = [key async for key in redis.scan_iter(match=f"{prefix}:*")]
    if keys:
        await redis.delete(*keys)
    await queue.aclose()


# ---------------------------------------------------------------------------
# 2. Oturumsuz erişim
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("method,path", sorted(SESSION | OWNED | ADMIN))
async def test_anonymous_request_is_rejected_with_401(client, tokens, method, path):
    # `tokens`, sahte Supabase projesini kurar: kimlik doğrulama yapılandırılmış
    # olmalı ki 401 "yapılandırma yok" 503'ünden ayrılsın.
    url = _fill_path(path, _openapi_routes()[(method, path)])
    response = await client.request(method, url)
    assert response.status_code == 401, (method, path, response.text)


# ---------------------------------------------------------------------------
# 3. Yönetici uçları — RED ve KABUL yolları ayrı ayrı
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("method,path", sorted(ADMIN))
async def test_admin_route_denies_regular_user_and_admits_admin(
    client, tokens, create_user, grant_admin, method, path
):
    url = _fill_path(path, _openapi_routes()[(method, path)])
    regular = await create_user()
    admin = await create_user()
    await grant_admin(admin)

    denied = await client.request(method, url, headers=tokens.headers(regular))
    assert denied.status_code == 403, (method, path, denied.text)

    # Kabul: yönetici yetki kapısından GEÇER. Var olmayan kimlik ve boş gövde
    # yüzünden 404/409/422 dönebilir; önemli olan 401/403 olmaması.
    admitted = await client.request(method, url, headers=tokens.headers(admin))
    assert admitted.status_code not in (401, 403), (method, path, admitted.text)


# ---------------------------------------------------------------------------
# 4. Sahipli kaynaklar — başkası 404 ve kaynak değişmez, sahibi başarılı
# ---------------------------------------------------------------------------


async def _insert_project(db, user_id) -> Project:
    project_id = uuid.uuid4()
    project = Project(
        id=project_id,
        user_id=user_id,
        file_name="yuzuk.jpg",
        result_r2_key=f"projects/{user_id}/{project_id}/result.png",
        thumbnail_r2_key=f"projects/{user_id}/{project_id}/thumbnail.png",
    )
    db.add(project)
    await db.commit()
    return project


async def _project_row(db, project_id):
    return await one(
        db,
        "SELECT file_name, workflow_status, editor_state FROM projects WHERE id=:id",
        id=project_id,
    )


PROJECT_REQUESTS = [
    ("GET", {}, 200),
    ("PATCH", {"data": {"file_name": "degisti.jpg"}}, 200),
    ("DELETE", {}, 204),
]


@pytest.mark.parametrize("method,kwargs,owner_status", PROJECT_REQUESTS)
async def test_project_is_invisible_to_others_and_open_to_its_owner(
    client, db_session, tokens, create_user, method, kwargs, owner_status
):
    owner, stranger = await create_user(), await create_user()
    project = await _insert_project(db_session, owner)
    url = f"/api/projects/{project.id}"
    before = await _project_row(db_session, project.id)

    denied = await client.request(method, url, headers=tokens.headers(stranger), **kwargs)
    assert denied.status_code == 404, denied.text
    assert await _project_row(db_session, project.id) == before
    client.storage.delete.assert_not_called()

    allowed = await client.request(method, url, headers=tokens.headers(owner), **kwargs)
    assert allowed.status_code == owner_status, allowed.text


async def test_project_list_and_bulk_delete_never_reach_other_users(
    client, db_session, tokens, create_user
):
    owner, stranger = await create_user(), await create_user()
    mine = await _insert_project(db_session, owner)
    theirs = await _insert_project(db_session, stranger)

    listed = await client.get("/api/projects", headers=tokens.headers(owner))
    assert listed.status_code == 200
    ids = {item["id"] for item in listed.json()["items"]}
    assert ids == {str(mine.id)}

    assert (await client.delete("/api/projects", headers=tokens.headers(owner))).status_code == 204
    # Toplu silme yalnız sahibinin projesini siler; başkasınınki yerinde kalır.
    assert await _project_row(db_session, mine.id) is None
    assert await _project_row(db_session, theirs.id) is not None


async def _open_checkout(db, user_id):
    version = await one(
        db,
        """INSERT INTO plan_versions(plan_id,version,price_minor_units,currency,monthly_quota,
        background_tier,iyzico_product_reference_code,iyzico_pricing_plan_reference_code,published_at)
        VALUES('atolye',(SELECT coalesce(max(version),0)+1 FROM plan_versions WHERE plan_id='atolye'),
        9900,'TRY',100,'full','product','paid-plan',now()) RETURNING id""",
    )
    session = await one(
        db,
        """INSERT INTO checkout_sessions(user_id,plan_version_id,idempotency_key,
        expected_amount_minor_units,currency,pricing_plan_reference,provider_checkout_token,
        checkout_form_content,initialization_started)
        VALUES(:uid,:vid,:key,9900,'TRY','paid-plan','token','<form>',true)
        RETURNING id,status,conversation_reference""",
        uid=user_id,
        vid=version["id"],
        key=uuid.uuid4(),
    )
    await db.commit()
    return session


async def _checkout_status(db, session_id):
    return (await one(db, "SELECT status FROM checkout_sessions WHERE id=:id", id=session_id))["status"]


async def test_checkout_session_is_invisible_to_others_and_open_to_its_owner(
    client, db_session, tokens, create_user
):
    owner, stranger = await create_user(), await create_user()
    session = await _open_checkout(db_session, owner)
    url = f"/api/subscriptions/checkout/{session['id']}"

    assert (await client.get(url, headers=tokens.headers(stranger))).status_code == 404
    assert (await client.get(url, headers=tokens.headers(owner))).status_code == 200


async def test_checkout_cancel_by_others_is_404_and_changes_nothing(
    client, db_session, tokens, create_user
):
    owner, stranger = await create_user(), await create_user()
    session = await _open_checkout(db_session, owner)
    url = f"/api/subscriptions/checkout/{session['id']}/cancel"

    # iyzico'nun GERÇEK "bu forma bağlı abonelik oluşmadı" yanıt gövdesi
    # (bkz. test_billing.py::test_pending_checkout_can_be_cancelled_when_provider_says_unpaid).
    client.provider.checkout.return_value = {
        "status": "success",
        "conversationId": str(session["conversation_reference"]),
        "data": {"pricingPlanReferenceCode": "paid-plan"},
    }

    denied = await client.post(url, headers=tokens.headers(stranger))
    assert denied.status_code == 404, denied.text
    assert await _checkout_status(db_session, session["id"]) == session["status"]
    # Başkasının isteği sağlayıcıya hiç ulaşmaz.
    client.provider.checkout.assert_not_called()

    allowed = await client.post(url, headers=tokens.headers(owner))
    assert allowed.status_code == 200 and allowed.json()["status"] == "failed", allowed.text
    assert await _checkout_status(db_session, session["id"]) == "failed"


async def test_idempotency_key_is_scoped_to_its_user(db_session, create_user):
    """B, A'nın `Idempotency-Key`'ini gönderse A'nın saklanan kesimini alamaz.

    Anahtar tahmin edilemez bir UUID olsa da istemcinin yazabildiği bir
    değer; sızarsa (log, ekran paylaşımı) başka bir hesap onu kullanabilir.
    Kayıt `(user_id, request_id)` ile tekil ve sorgu kullanıcıya göre süzülüyor
    — bu test o sözleşmeyi gerçek veritabanında sınıyor.
    """
    provider = AsyncMock(spec=Iyzico)
    first_user, second_user = await create_user(), await create_user()
    key = uuid.uuid4()

    first = await reserve(db_session, first_user, key, provider)
    first_result = f"results/{first_user}/{key}.png"
    assert await resolve_reservation(db_session, first.id, True, result_key=first_result)

    # Aynı anahtarla A kendi sonucunu geri alır (kabul yolu)...
    assert (await reserve(db_session, first_user, key, provider)).result_key == first_result
    # ...B ise kendi YENİ işini ve kendi kredisini açar, A'nın sonucunu görmez.
    second = await reserve(db_session, second_user, key, provider)
    assert second.id is not None and second.id != first.id
    assert second.result_key is None


async def test_cutout_job_and_result_are_bound_to_the_signed_in_user(
    client, db_session, tokens, create_user
):
    """HTTP + gerçek kuyruk + gerçek işçi: B, A'nın anahtarıyla A'nın kesimini alamaz.

    Faz 7'de iş kimliği istemcinin `Idempotency-Key`'i; Redis anahtarı
    `(kullanıcı, anahtar)`. A'nın işi bitip sonucu hazırken B aynı anahtarla
    hem yoklar hem de yükler: yoklamada 404, yüklemede KENDİ yeni işini alır.
    """
    import io

    from PIL import Image
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.workers.cutout import CutoutWorker

    class FakeRemoval:
        def remove(self, image_bytes):
            return b"sahibin-kesimi"

    stored: dict[str, bytes] = {}

    async def upload(key, content, content_type):
        stored[key] = content

    async def download(key):
        return stored[key]

    client.storage.upload.side_effect = upload
    client.storage.download.side_effect = download

    buf = io.BytesIO()
    Image.new("RGB", (10, 10), "green").save(buf, format="JPEG")
    owner, stranger = await create_user(), await create_user()
    key = str(uuid.uuid4())

    def post(user):
        return client.post(
            "/api/remove-background",
            files={"file": ("a.jpg", buf.getvalue(), "image/jpeg")},
            headers={**tokens.headers(user), "Idempotency-Key": key},
        )

    def poll(user):
        return client.get(f"/api/remove-background/jobs/{key}", headers=tokens.headers(user))

    assert (await post(owner)).status_code == 202
    worker = CutoutWorker(
        queue=client.queue,
        service=FakeRemoval(),
        storage=client.storage,
        session_factory=async_sessionmaker(
            create_async_engine(settings.database_url, poolclass=NullPool), expire_on_commit=False
        ),
        worker_id="idor-isci",
    )
    await worker.process(await client.queue.claim(worker.worker_id))

    # Kabul: sahibi kendi sonucunu alır.
    mine = await poll(owner)
    assert mine.status_code == 200 and mine.content == b"sahibin-kesimi"
    # Red: yabancı aynı anahtarla yoklar — kayıt yok.
    assert (await poll(stranger)).status_code == 404
    # Yabancı aynı anahtarla yükler — KENDİ işi sıraya girer, A'nınki değil.
    theirs = await post(stranger)
    assert theirs.status_code == 202 and theirs.json()["status"] == "queued"
    assert (await poll(stranger)).json()["status"] == "queued"
    # Yalnız sahibin tek sonucu var (her deneme kendi anahtarına yazar,
    # önek `results/<sahip>/<anahtar>-`); yabancıya ait hiçbir nesne yok.
    [only] = stored
    assert only.startswith(f"results/{owner}/{key}-") and only.endswith(".png")
