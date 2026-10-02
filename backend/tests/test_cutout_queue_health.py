# ruff: noqa: F401, F811
# (`client` fixture'ı test_idor'dan içe aktarılıyor; pytest fixture kalıbı F811 tetikler.)
"""Kesim kuyruğu sağlığı: yönetici ucu ve bakım işi (Faz 7 kapanış denetimi, S3).

Kuyruğun kendi sayım/uyarı davranışı `test_cutout_queue.py`'de; burada onu
kullanan iki yüzey sınanıyor. Yetki (401/403/yönetici kabulü) `test_idor.py`'de,
hız sınırı yönü `test_rate_limit_coverage.py`'de.
"""

import time
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from app.services.billing.maintenance import check_cutout_queue
from app.services.cutout_queue import QUEUE_STALL_SECONDS, CutoutQueue, job_id_for
from tests.test_idor import client

URL = "/api/admin/cutout-queue"


@pytest.fixture
async def admin_headers(tokens, create_user, grant_admin):
    admin = await create_user()
    await grant_admin(admin)
    return tokens.headers(admin)


async def test_endpoint_reports_no_worker_on_an_idle_queue(client, admin_headers):
    body = (await client.get(URL, headers=admin_headers)).json()

    assert body["status"] == "no_worker"
    assert (body["workers"], body["queued"], body["processing"]) == (0, 0, 0)
    assert body["oldest_waiting_seconds"] is None
    assert body["stall_threshold_seconds"] == QUEUE_STALL_SECONDS


async def test_endpoint_reports_counts_when_healthy(client, admin_headers):
    await client.queue.heartbeat("isci")
    for _ in range(2):
        await client.queue.enqueue(uuid.uuid4(), uuid.uuid4(), None, b"x")
    await client.queue.claim("isci")

    body = (await client.get(URL, headers=admin_headers)).json()

    assert body["status"] == "ok"
    assert (body["workers"], body["queued"], body["processing"]) == (1, 1, 1)
    assert body["max_queued"] == client.queue.max_jobs


async def test_endpoint_reports_stalled_when_the_oldest_job_waits_too_long(client, admin_headers):
    user, request = uuid.uuid4(), uuid.uuid4()
    await client.queue.heartbeat("takilmis-isci")
    await client.queue.enqueue(user, request, None, b"x")
    await client.queue._redis().hset(
        client.queue._key("job", job_id_for(user, request)),
        "enqueued_at",
        repr(time.time() - (QUEUE_STALL_SECONDS + 60)),
    )

    body = (await client.get(URL, headers=admin_headers)).json()

    assert body["status"] == "stalled"
    assert body["oldest_waiting_seconds"] > QUEUE_STALL_SECONDS


async def test_endpoint_shows_a_redis_outage_instead_of_failing(client, admin_headers, monkeypatch):
    # Arızanın kendisini göstermek bu ucun işi: 5xx dönseydi panel boş kalırdı.
    monkeypatch.setattr(
        client.queue, "stats", AsyncMock(side_effect=RedisConnectionError("kapalı"))
    )

    response = await client.get(URL, headers=admin_headers)

    assert response.status_code == 200
    assert response.json()["status"] == "unavailable"


async def test_endpoint_logs_an_error_when_unhealthy(client, admin_headers, caplog):
    with caplog.at_level("ERROR", logger="vitrin.cutout-queue"):
        await client.get(URL, headers=admin_headers)

    assert any("no_worker" in r.getMessage() for r in caplog.records)


# --- bakım işi -------------------------------------------------------------


@pytest.fixture
async def own_queue():
    from app.core.config import settings

    queue = CutoutQueue(settings.redis_url, prefix=f"test-health-{uuid.uuid4()}")
    yield queue
    redis = queue._redis()
    keys = [key async for key in redis.scan_iter(match=f"{queue._prefix}:*")]
    if keys:
        await redis.delete(*keys)
    await queue.aclose()


async def test_maintenance_check_flags_a_queue_without_workers(own_queue, caplog):
    with caplog.at_level("ERROR", logger="vitrin.cutout-queue"):
        unhealthy = await check_cutout_queue(own_queue)

    assert unhealthy is True
    assert any("bakım" in r.getMessage() for r in caplog.records)


async def test_maintenance_check_is_quiet_when_a_worker_is_alive(own_queue, caplog):
    await own_queue.heartbeat("isci")

    with caplog.at_level("ERROR"):
        unhealthy = await check_cutout_queue(own_queue)

    assert unhealthy is False
    assert not caplog.records


async def test_maintenance_check_never_raises_on_a_redis_outage(own_queue, monkeypatch, caplog):
    monkeypatch.setattr(own_queue, "stats", AsyncMock(side_effect=RedisConnectionError("kapalı")))

    # Bakım turunu (ödeme işleri) gözlem hatası yüzünden düşürmemeli.
    with caplog.at_level("ERROR"):
        assert await check_cutout_queue(own_queue) is True
    assert any("okunamadı" in r.getMessage() for r in caplog.records)


async def test_maintenance_entrypoint_runs_the_queue_check_after_billing_work(monkeypatch):
    # Kontrol yalnız tanımlı olmak yetmez; her bakım turunda GERÇEKTEN çalışmalı.
    from contextlib import asynccontextmanager

    from app.services.billing import maintenance as module

    order: list[str] = []

    @asynccontextmanager
    async def fake_session():
        yield object()

    async def fake_maintenance(db, provider, storage):
        order.append("bakım")

    async def fake_check(queue):
        order.append("kuyruk")
        return False

    monkeypatch.setattr(module, "_session_factory", lambda: fake_session())
    monkeypatch.setattr(module, "maintenance", fake_maintenance)
    monkeypatch.setattr(module, "check_cutout_queue", fake_check)
    monkeypatch.setattr(module, "get_provider", lambda: None)
    monkeypatch.setattr(module, "get_storage_service", lambda: None)
    monkeypatch.setattr(module, "engine", SimpleNamespace(dispose=AsyncMock()))

    await module.main()

    assert order == ["bakım", "kuyruk"]
