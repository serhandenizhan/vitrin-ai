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
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.services.billing.db import one
from app.services.billing.entitlements import reserve, resolve_reservation
from app.services.billing.provider import Iyzico
from app.services.cutout_queue import DONE, FAILED, ClaimError, CutoutQueue, job_id_for
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
    def __init__(self, fail_upload=False, on_upload=None):
        self.objects = {}
        self.fail_upload = fail_upload
        # Yükleme ile kredi tüketimi ARASINA başka bir sürecin girmesini
        # (bakım işi, kurtarılan ikinci deneme) taklit etmek için.
        self.on_upload = on_upload
        self.uploads = []  # yüklenen her anahtar, sırasıyla (üzerine yazma tespiti)

    async def upload(self, key, content, content_type):
        if self.fail_upload:
            raise BotoCoreError()
        self.uploads.append(key)
        self.objects[key] = content
        if self.on_upload:
            await self.on_upload(key)

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


async def _paid_key(db, reservation_id):
    """Kredinin ödendiği sonucun anahtarı (her deneme kendi anahtarına yazar)."""
    row = await one(db, "SELECT result_r2_key FROM usage_reservations WHERE id=:id", id=reservation_id)
    await db.commit()
    return row["result_r2_key"]


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
    key = await _paid_key(db_session, reservation_id)
    assert key.startswith(f"results/{user}/{request}-") and key.endswith(".png")
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

    async def maintenance_releases(_key):
        # Bakım işi ayırmayı sonuç saklandıktan SONRA, tüketimden ÖNCE iade etsin.
        async with session_factory() as db:
            await resolve_reservation(db, reservation_id, False)

    storage = FakeStorage(on_upload=maintenance_releases)
    worker = _worker(queue, session_factory, storage=storage)

    await worker.process(await queue.claim(worker.worker_id))

    record = await queue.get_job(user, request)
    assert record["status"] == FAILED and record["error_code"] == "reservation_released"
    assert record["retry_safe"] == "1"
    assert storage.objects == {}  # sahipsiz sonuç silindi
    assert await _reservation_status(db_session, reservation_id) == "released"


async def test_crash_after_upload_leaves_a_durable_key_for_cleanup(
    db_session, create_user, provider, queue, session_factory
):
    from app.services.billing.db import execute
    from app.services.billing.maintenance import purge_expired_results

    user, request, reservation_id = await _queued_job(db_session, create_user, provider, queue)
    storage = FakeStorage()
    worker = _worker(queue, session_factory, storage=storage)
    original_resolve = worker._resolve

    async def crash_before_credit_consumption(*_args):
        raise RuntimeError("işçi R2 yüklemesinden sonra öldü")

    worker._resolve = crash_before_credit_consumption
    with pytest.raises(RuntimeError, match="öldü"):
        await worker.process(await queue.claim(worker.worker_id))

    key = next(iter(storage.objects))
    row = await one(
        db_session,
        "SELECT key FROM cutout_result_attempts WHERE reservation_id=:id",
        id=reservation_id,
    )
    assert row["key"] == key  # yükleme öncesinde commit edilmiş

    worker._resolve = original_resolve
    await worker._resolve(str(reservation_id), False)
    await execute(
        db_session,
        "UPDATE cutout_result_attempts SET created_at=now()-interval '25 hours' WHERE key=:key",
        key=key,
    )
    await db_session.commit()
    await purge_expired_results(db_session, storage)
    assert storage.objects == {}
    assert await one(
        db_session, "SELECT key FROM cutout_result_attempts WHERE key=:key", key=key
    ) is None


async def test_failed_orphan_delete_is_retried_by_maintenance(
    db_session, create_user, provider, queue, session_factory
):
    from app.services.billing.db import execute
    from app.services.billing.maintenance import purge_expired_results

    user, request, reservation_id = await _queued_job(db_session, create_user, provider, queue)

    async def release_after_upload(_key):
        async with session_factory() as db:
            await resolve_reservation(db, reservation_id, False)

    class FailingDeleteStorage(FakeStorage):
        async def delete(self, key):
            raise BotoCoreError()

    storage = FailingDeleteStorage(on_upload=release_after_upload)
    worker = _worker(queue, session_factory, storage=storage)
    await worker.process(await queue.claim(worker.worker_id))
    key = next(iter(storage.objects))
    assert (await queue.get_job(user, request))["status"] == FAILED

    await execute(
        db_session,
        "UPDATE cutout_result_attempts SET created_at=now()-interval '25 hours' WHERE key=:key",
        key=key,
    )
    await db_session.commit()
    await purge_expired_results(db_session, storage)
    assert key in storage.objects
    assert await one(db_session, "SELECT key FROM cutout_result_attempts WHERE key=:key", key=key)

    storage.on_upload = None
    storage.delete = FakeStorage.delete.__get__(storage, FailingDeleteStorage)
    await purge_expired_results(db_session, storage)
    assert storage.objects == {}
    assert await one(
        db_session, "SELECT key FROM cutout_result_attempts WHERE key=:key", key=key
    ) is None


async def test_reservation_released_before_claim_skips_inference(
    db_session, create_user, provider, queue, session_factory
):
    user, request, reservation_id = await _queued_job(db_session, create_user, provider, queue)
    async with session_factory() as db:
        await resolve_reservation(db, reservation_id, False)
    removal, storage = FakeRemoval(), FakeStorage()
    worker = _worker(queue, session_factory, removal=removal, storage=storage)

    await worker.process(await queue.claim(worker.worker_id))

    record = await queue.get_job(user, request)
    assert record["status"] == FAILED and record["error_code"] == "reservation_released"
    assert record["retry_safe"] == "1"
    assert removal.calls == 0 and storage.objects == {}


# --- Tüketilmiş kredi ASLA "iade edildi, yeniden dene" diye bildirilmez ------
# (Codex incelemesi, 27.09.2026.) İşçi krediyi tükettikten sonra, işi Redis'te
# bitmiş işaretleyemeden ölürse iş kurtarılıp yeniden işleniyor. Eski kod bu
# ikinci denemede `resolve_reservation`'ın False dönüşünü "iade edilmiş" sanıp
# saklanan sonucu siliyor ve `retry_safe` yazıyordu: ön yüz de sessizce yeni
# bir anahtarla İKİNCİ bir kredi harcıyordu.


async def _consume_then_die(queue, session_factory, storage, worker_id="olu-isci"):
    """İlk işçi sonucu saklar, krediyi tüketir ve `complete` öncesi ölür."""
    dead = _worker(queue, session_factory, storage=storage, worker_id=worker_id)
    job = await queue.claim(dead.worker_id)

    async def redis_dies(*_args, **_kwargs):
        raise ConnectionError("işçi burada öldü")

    queue.complete, original = redis_dies, queue.complete
    try:
        with pytest.raises(ConnectionError):
            await dead.process(job)
    finally:
        queue.complete = original
    return job


async def test_retry_after_consumed_crash_delivers_the_stored_result(
    db_session, create_user, provider, queue, session_factory
):
    user, request, reservation_id = await _queued_job(db_session, create_user, provider, queue)
    storage = FakeStorage()
    await _consume_then_die(queue, session_factory, storage)
    key = await _paid_key(db_session, reservation_id)
    assert await _reservation_status(db_session, reservation_id) == "consumed"

    removal = FakeRemoval(result=b"ikinci-kesim")
    survivor = _worker(queue, session_factory, removal=removal, storage=storage, worker_id="canli-isci")
    await queue.heartbeat(survivor.worker_id)
    assert await survivor.recover_once() == 0  # fotoğraf duruyor: kuyruğa geri konur
    job = await queue.claim(survivor.worker_id)
    assert job.attempts == 2
    await survivor.process(job)

    record = await queue.get_job(user, request)
    assert record["status"] == DONE and record["result_key"] == key
    assert storage.objects[key] == b"kesim-png"  # ilk denemenin sonucu yerinde
    assert removal.calls == 0  # inference ikinci kez çalışmadı
    assert await _reservation_status(db_session, reservation_id) == "consumed"


async def test_consumed_job_out_of_attempts_is_done_not_refunded(
    db_session, create_user, provider, queue, session_factory
):
    user, request, reservation_id = await _queued_job(db_session, create_user, provider, queue)
    storage = FakeStorage()
    job = await _consume_then_die(queue, session_factory, storage)
    # Deneme hakkı bitmiş olsun: kurtarma işi onu "kaybedildi" diye iade etmeye çalışır.
    await queue._redis().hset(queue._key("job", job.job_id), "attempts", 2)

    survivor = _worker(queue, session_factory, storage=storage, worker_id="canli-isci")
    await queue.heartbeat(survivor.worker_id)
    assert await survivor.recover_once() == 1

    record = await queue.get_job(user, request)
    assert record["status"] == DONE
    assert record["result_key"] == await _paid_key(db_session, reservation_id)
    assert record.get("retry_safe") in (None, "")
    assert await _reservation_status(db_session, reservation_id) == "consumed"


async def test_parallel_attempts_never_overwrite_the_paid_result(
    db_session, create_user, provider, queue, session_factory
):
    # Nabzı gecikip kurtarılan bir işçi aynı işi ikinci bir işçiyle PARALEL
    # yürütüyor: ikisi de ayırmayı `pending` görür, ikisi de sonucunu yükler,
    # sonra ikisi de krediyi tüketmeye çalışır. Sabit anahtarla sonra yükleyen,
    # kredisi ödenmiş sonucun üzerine yazıyordu (Codex incelemesi, 2. tur).
    user, request, reservation_id = await _queued_job(db_session, create_user, provider, queue)
    both_uploaded = asyncio.Barrier(2)

    async def wait_for_the_other(_key):
        await both_uploaded.wait()  # iki yükleme de bitmeden kimse tüketmez

    storage = FakeStorage(on_upload=wait_for_the_other)
    first = _worker(queue, session_factory, removal=FakeRemoval(result=b"A"), storage=storage, worker_id="isci-a")
    second = _worker(queue, session_factory, removal=FakeRemoval(result=b"B"), storage=storage, worker_id="isci-b")
    job_a = await queue.claim(first.worker_id)
    # isci-a'nın nabzı yok: kurtarma işi aynı işi kuyruğa geri koyar, isci-b alır.
    await queue.heartbeat(second.worker_id)
    assert await second.recover_once() == 0
    job_b = await queue.claim(second.worker_id)
    assert job_b.job_id == job_a.job_id

    await asyncio.gather(first.process(job_a), second.process(job_b))

    paid = await _paid_key(db_session, reservation_id)
    assert len(storage.uploads) == len(set(storage.uploads)) == 2  # hiçbir anahtar ezilmedi
    assert list(storage.objects) == [paid]  # kaybedenin nesnesi silindi
    record = await queue.get_job(user, request)
    assert record["status"] == DONE and record["result_key"] == paid
    delivered = await queue.result(user, request)
    assert delivered in (None, storage.objects[paid])  # teslim edilen = ödenen
    assert await _reservation_status(db_session, reservation_id) == "consumed"


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


@pytest.mark.parametrize("failure_at", ["claim", "claim_after_move", "outcome"])
async def test_worker_recovers_from_one_transient_dependency_error(
    db_session, create_user, provider, queue, session_factory, monkeypatch, failure_at
):
    user, request, reservation_id = await _queued_job(db_session, create_user, provider, queue)
    worker = _worker(queue, session_factory)
    stop = asyncio.Event()

    if failure_at in ("claim", "claim_after_move"):
        original = queue.claim
        calls = 0

        async def fail_once(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                if failure_at == "claim_after_move":
                    await original(*args, **kwargs)
                    raise ClaimError(job_id_for(user, request))
                raise RedisConnectionError("anlık kesinti")
            return await original(*args, **kwargs)

        monkeypatch.setattr(queue, "claim", fail_once)
    else:
        original = worker._outcome
        calls = 0

        async def fail_once(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                raise ConnectionError("veritabanı anlık kesinti")
            return await original(*args, **kwargs)

        monkeypatch.setattr(worker, "_outcome", fail_once)

    async def stop_when_done():
        while True:
            record = await queue.get_job(user, request)
            if record["status"] == DONE:
                stop.set()
                return
            await asyncio.sleep(0.05)

    await asyncio.wait_for(asyncio.gather(worker.run(1, stop), stop_when_done()), timeout=15)

    assert calls >= 2
    assert await _reservation_status(db_session, reservation_id) == "consumed"
