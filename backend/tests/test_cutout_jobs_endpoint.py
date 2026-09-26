"""`GET /api/remove-background/jobs/{id}` — kuyruktaki işin durumu ya da sonucu.

İstemci (ön yüz) bu ucu birkaç saniyede bir yoklar. Sözleşme:
  sürüyor → 202 {"status": "queued" | "processing"} — SIRA NUMARASI YOK
  bitti   → 200 image/png
  başarısız → işçinin yazdığı kod, `retry_safe` ile (kredi iade edilmiş)
  yok     → kuyruk kaydı dolmuşsa 24 saatlik R2 kopyası, o da yoksa 404
"""

import uuid
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.api.routes.remove_background import get_cutout_queue
from app.core.auth import CurrentUser, get_current_user
from app.core.db import get_db_session
from app.main import app
from app.services.billing.entitlements import reserve, resolve_reservation
from app.services.billing.provider import Iyzico
from app.services.storage import get_storage_service
from tests.test_remove_background_endpoint import FakeCutoutQueue, FakeStorage


@pytest.fixture
def call(db_session):
    """Oturumdaki kullanıcı adına ucu çağırır."""

    async def session_override():
        try:
            yield db_session
        finally:
            await db_session.commit()

    def _call(user_id, request_id, queue=None, storage=None):
        user = CurrentUser(id=user_id, email=None, session_id=None)
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_cutout_queue] = lambda: queue or FakeCutoutQueue()
        app.dependency_overrides[get_storage_service] = lambda: storage or FakeStorage()
        app.dependency_overrides[get_db_session] = session_override
        try:
            with TestClient(app) as client:
                return client.get(f"/api/remove-background/jobs/{request_id}")
        finally:
            app.dependency_overrides.clear()

    return _call


@pytest.mark.parametrize("state", ["queued", "processing"])
def test_running_job_reports_only_that_it_is_running(call, state):
    user, key = uuid.uuid4(), uuid.uuid4()
    queue = FakeCutoutQueue()
    queue.jobs[(str(user), str(key))] = {"status": state, "worker": "isci-1", "attempts": "1"}

    response = call(user, key, queue)

    assert response.status_code == 202
    # Sıra/işçi/deneme bilgisi dışarı verilmez: müşteri yoğunluğu görmez.
    assert response.json() == {"job_id": str(key), "status": state}


def test_finished_job_returns_the_png(call):
    user, key = uuid.uuid4(), uuid.uuid4()
    queue = FakeCutoutQueue()
    queue.jobs[(str(user), str(key))] = {"status": "done"}
    queue.results[(str(user), str(key))] = b"kesim-png"

    response = call(user, key, queue)

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == b"kesim-png"


def test_finished_job_falls_back_to_the_stored_copy(call):
    user, key = uuid.uuid4(), uuid.uuid4()
    queue = FakeCutoutQueue()
    queue.jobs[(str(user), str(key))] = {"status": "done", "result_key": "results/k.png"}
    storage = FakeStorage()
    storage.objects["results/k.png"] = b"r2-kopyasi"

    response = call(user, key, queue, storage)

    assert response.status_code == 200 and response.content == b"r2-kopyasi"


@pytest.mark.parametrize(
    "code,status",
    [("processing_failed", 422), ("job_expired", 503), ("worker_lost", 503),
     ("result_storage_unavailable", 503), ("reservation_released", 503)],
)
def test_failed_job_reports_the_workers_code_as_retry_safe(call, code, status):
    user, key = uuid.uuid4(), uuid.uuid4()
    queue = FakeCutoutQueue()
    queue.jobs[(str(user), str(key))] = {"status": "failed", "error_code": code, "retry_safe": "1"}

    response = call(user, key, queue)

    assert response.status_code == status
    detail = response.json()["detail"]
    assert detail["code"] == code and detail["retry_safe"] is True
    assert "iade" in detail["message"]  # kullanıcıya kredisinin iade edildiği söylenir


def test_unknown_job_is_404(call, create_user):
    response = call(uuid.uuid4(), uuid.uuid4())
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "job_not_found"


async def test_expired_queue_record_still_serves_the_24h_stored_result(
    call, db_session, create_user
):
    # Kuyruk kaydı 10 dk sonra silinir; başarılı iş ise idempotency için R2'de
    # 24 saat durur. Ağ yüzünden geç yoklayan istemci sonucunu yine alır.
    user, key = await create_user(), uuid.uuid4()
    provider = AsyncMock(spec=Iyzico)
    reservation = await reserve(db_session, user, key, provider)
    result_key = f"results/{user}/{key}.png"
    assert await resolve_reservation(db_session, reservation.id, True, result_key)
    storage = FakeStorage()
    storage.objects[result_key] = b"r2-kopyasi"

    response = call(user, key, FakeCutoutQueue(), storage)

    assert response.status_code == 200 and response.content == b"r2-kopyasi"


async def test_another_users_stored_result_is_not_served(call, db_session, create_user):
    owner, stranger, key = await create_user(), await create_user(), uuid.uuid4()
    provider = AsyncMock(spec=Iyzico)
    reservation = await reserve(db_session, owner, key, provider)
    result_key = f"results/{owner}/{key}.png"
    assert await resolve_reservation(db_session, reservation.id, True, result_key)
    storage = FakeStorage()
    storage.objects[result_key] = b"sahibin-kesimi"

    response = call(stranger, key, FakeCutoutQueue(), storage)

    assert response.status_code == 404
