"""Kesim işçisi (`app/workers/cutout.py`) — gerçek Redis kuyruğu ve gerçek
veritabanındaki kredi ayırmasıyla; yalnız model ve R2 sahte.

Her hata yolunda iki şey birlikte sınanır: iş `retry_safe` olarak başarısız
işaretlenir VE kredi gerçekten iade edilir (veritabanından okunarak). Yalnız
birini sınamak, müşterinin kredisinin sessizce yandığı yolu görmezdi.
"""

import asyncio
import threading
import time
import uuid
from unittest.mock import AsyncMock
from urllib.parse import urlsplit

import pytest
from botocore.exceptions import BotoCoreError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.services.billing.db import one
from app.services.billing.entitlements import reserve
from app.services.billing.provider import Iyzico
from app.services.cutout_queue import DONE, FAILED, CutoutQueue
from app.workers.cutout import CutoutWorker


class FakeRemoval:
    def __init__(self, result=b"kesim-png", error=None, delay=0.0):
        self.result, self.error, self.delay = result, error, delay
        self.calls = 0
        self.max_parallel = 0
        self._running = 0
        self._lock = threading.Lock()

    def remove(self, image_bytes):
        with self._lock:
            self.calls += 1
            self._running += 1
            self.max_parallel = max(self.max_parallel, self._running)
        try:
            if self.delay:
                time.sleep(self.delay)
            if self.error:
                raise self.error
            return self.result
        finally:
            with self._lock:
                self._running -= 1


class FakeStorage:
    def __init__(self, fail_upload=False):
        self.objects = {}
        self.fail_upload = fail_upload

    async def upload(self, key, content, content_type):
        if self.fail_upload:
            raise BotoCoreError()
        self.objects[key] = content

    async def delete(self, key):
        self.objects.pop(key, None)


@pytest.fixture
async def queue():
    from tests.conftest import LOCAL_REDIS_HOSTS

    assert (urlsplit(settings.redis_url).hostname or "") in LOCAL_REDIS_HOSTS
    prefix = f"test-cutout-worker-{uuid.uuid4()}"
    q = CutoutQueue(settings.redis_url, prefix=prefix)
    yield q
    redis = q._redis()
    keys = [key async for key in redis.scan_iter(match=f"{prefix}:*")]
    if keys:
        await redis.delete(*keys)
    await q.aclose()


@pytest.fixture
def session_factory():
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
def provider():
    mock = AsyncMock(spec=Iyzico)
    mock.transactions.return_value = {"transactions": [], "totalPageCount": 0}
    return mock


async def _reservation_status(db, reservation_id):
    row = await one(db, "SELECT status FROM usage_reservations WHERE id=:id", id=reservation_id)
    await db.commit()
    return row["status"]


async def _queued_job(db, create_user, provider, queue, photo=b"foto"):
    user, request = await create_user(), uuid.uuid4()
    reservation = await reserve(db, user, request, provider)
    await queue.enqueue(user, request, reservation.id, photo)
    return user, request, reservation.id


def _worker(queue, session_factory, removal=None, storage=None, worker_id="isci-test"):
    return CutoutWorker(
        queue=queue,
        service=removal or FakeRemoval(),
        storage=storage or FakeStorage(),
        session_factory=session_factory,
        worker_id=worker_id,
    )


async def test_success_stores_result_then_consumes_credit(
    db_session, create_user, provider, queue, session_factory
):
    user, request, reservation_id = await _queued_job(db_session, create_user, provider, queue)
    storage = FakeStorage()
    worker = _worker(queue, session_factory, storage=storage)

    await worker.process(await queue.claim(worker.worker_id))

    record = await queue.get_job(user, request)
    assert record["status"] == DONE
    key = f"results/{user}/{request}.png"
    assert record["result_key"] == key and storage.objects[key] == b"kesim-png"
    assert await queue.result(user, request) == b"kesim-png"
    assert await _reservation_status(db_session, reservation_id) == "consumed"


@pytest.mark.parametrize(
    "case,code",
    [("inference", "processing_failed"), ("storage", "result_storage_unavailable"), ("expired", "job_expired")],
)
async def test_every_failure_refunds_the_credit_and_is_retry_safe(
    db_session, create_user, provider, queue, session_factory, case, code
):
    user, request, reservation_id = await _queued_job(db_session, create_user, provider, queue)
    removal = FakeRemoval(error=RuntimeError("model çöktü") if case == "inference" else None)
    storage = FakeStorage(fail_upload=case == "storage")
    worker = _worker(queue, session_factory, removal=removal, storage=storage)
    job = await queue.claim(worker.worker_id)
    if case == "expired":
        job.enqueued_at -= 16 * 60  # 15 dk'lık fotoğraf süresi geçti

    await worker.process(job)

    record = await queue.get_job(user, request)
    assert record["status"] == FAILED and record["error_code"] == code
    assert record["retry_safe"] == "1"
    assert await _reservation_status(db_session, reservation_id) == "released"
    assert storage.objects == {}
    if case == "expired":
        assert removal.calls == 0  # süresi dolan fotoğraf işlenmez


async def test_reservation_released_meanwhile_discards_the_orphan_result(
    db_session, create_user, provider, queue, session_factory
):
    user, request, reservation_id = await _queued_job(db_session, create_user, provider, queue)
    # Bakım işi ayırmayı bu arada iade etmiş olsun.
    from app.services.billing.entitlements import resolve_reservation

    await resolve_reservation(db_session, reservation_id, False)
    storage = FakeStorage()
    worker = _worker(queue, session_factory, storage=storage)

    await worker.process(await queue.claim(worker.worker_id))

    record = await queue.get_job(user, request)
    assert record["status"] == FAILED and record["error_code"] == "reservation_released"
    assert storage.objects == {}  # sahipsiz sonuç silindi


async def test_admin_job_needs_no_credit_and_no_storage(
    db_session, create_user, grant_admin, provider, queue, session_factory
):
    admin, request = await create_user(), uuid.uuid4()
    await grant_admin(admin)
    reservation = await reserve(db_session, admin, request, provider)
    assert reservation.id is None
    await queue.enqueue(admin, request, None, b"foto")
    storage = FakeStorage()
    worker = _worker(queue, session_factory, storage=storage)

    await worker.process(await queue.claim(worker.worker_id))

    assert (await queue.get_job(admin, request))["status"] == DONE
    assert await queue.result(admin, request) == b"kesim-png"
    assert storage.objects == {}


async def test_lost_worker_job_is_refunded_by_recovery(
    db_session, create_user, provider, queue, session_factory
):
    user, request, reservation_id = await _queued_job(db_session, create_user, provider, queue)
    dead = _worker(queue, session_factory, worker_id="olu-isci")
    await queue.claim(dead.worker_id)
    # Fotoğraf da gitmiş: iş kurtarılamaz, kredisi iade edilmeli.
    await queue._redis().delete(queue._key("photo", f"{user}:{request}"))

    survivor = _worker(queue, session_factory, worker_id="canli-isci")
    assert await survivor.recover_once() == 1

    record = await queue.get_job(user, request)
    assert record["status"] == FAILED and record["error_code"] == "worker_lost"
    assert await _reservation_status(db_session, reservation_id) == "released"


async def test_worker_runs_jobs_in_parallel_up_to_its_concurrency(
    db_session, create_user, provider, queue, session_factory
):
    jobs = [await _queued_job(db_session, create_user, provider, queue) for _ in range(3)]
    removal = FakeRemoval(delay=0.3)
    worker = _worker(queue, session_factory, removal=removal)
    stop = asyncio.Event()

    async def stop_when_done():
        while True:
            statuses = [(await queue.get_job(u, r))["status"] for u, r, _ in jobs]
            if all(s == DONE for s in statuses):
                stop.set()
                return
            await asyncio.sleep(0.05)

    await asyncio.wait_for(asyncio.gather(worker.run(2, stop), stop_when_done()), timeout=15)

    assert removal.calls == 3
    # İki tüketici aynı anda kesti; üçüncü sıraya girip bekledi.
    assert removal.max_parallel == 2
    for user, request, reservation_id in jobs:
        assert await _reservation_status(db_session, reservation_id) == "consumed"
