"""Kesim kuyruğu (`app/services/cutout_queue.py`) — gerçek Redis'te.

Her test kendi önekini kullanır ve sonunda yalnız kendi anahtarlarını siler;
aynı Redis'i kullanan geliştirme ortamına dokunmaz.
"""

import uuid
from urllib.parse import urlsplit

import pytest

from app.core.config import settings
from app.services.cutout_queue import (
    DONE,
    FAILED,
    PHOTO_TTL_SECONDS,
    PROCESSING,
    QUEUED,
    CutoutQueue,
    QueueFull,
    job_id_for,
)


@pytest.fixture
async def queue():
    # conftest'teki `redis_client` oturum boyu tek döngüye bağlı; kuyruk ise
    # her testin kendi döngüsünde istemci açıyor. Yerel Redis kontrolü burada.
    from tests.conftest import LOCAL_REDIS_HOSTS

    assert (urlsplit(settings.redis_url).hostname or "") in LOCAL_REDIS_HOSTS
    prefix = f"test-cutout-{uuid.uuid4()}"
    q = CutoutQueue(settings.redis_url, prefix=prefix, max_jobs=3)
    yield q
    redis = q._redis()
    keys = [key async for key in redis.scan_iter(match=f"{prefix}:*")]
    if keys:
        await redis.delete(*keys)
    await q.aclose()


async def test_enqueued_job_is_claimed_with_its_photo(queue):
    user, request = uuid.uuid4(), uuid.uuid4()
    await queue.enqueue(user, request, "rezervasyon-1", b"foto")
    assert (await queue.get_job(user, request))["status"] == QUEUED

    job = await queue.claim("isci-a")
    assert job.job_id == job_id_for(user, request)
    assert job.photo == b"foto" and job.attempts == 1
    assert job.reservation_id == "rezervasyon-1"
    assert (await queue.get_job(user, request))["status"] == PROCESSING


async def test_job_is_invisible_to_another_user_with_the_same_key(queue):
    owner, stranger, request = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    await queue.enqueue(owner, request, None, b"foto")
    assert await queue.get_job(stranger, request) is None
    assert await queue.result(stranger, request) is None


async def test_jobs_are_taken_in_arrival_order(queue):
    user = uuid.uuid4()
    requests = [uuid.uuid4() for _ in range(3)]
    for request in requests:
        await queue.enqueue(user, request, None, b"x")
    claimed = [(await queue.claim("isci-a")).request_id for _ in requests]
    assert claimed == [str(r) for r in requests]


async def test_full_queue_refuses_new_jobs(queue):
    user = uuid.uuid4()
    for _ in range(3):
        await queue.enqueue(user, uuid.uuid4(), None, b"x")
    with pytest.raises(QueueFull):
        await queue.enqueue(user, uuid.uuid4(), None, b"x")


async def test_photo_lives_at_most_fifteen_minutes(queue):
    user, request = uuid.uuid4(), uuid.uuid4()
    await queue.enqueue(user, request, None, b"foto")
    ttl = await queue._redis().ttl(queue._key("photo", job_id_for(user, request)))
    assert 0 < ttl <= PHOTO_TTL_SECONDS


async def test_complete_delivers_result_and_deletes_photo(queue):
    user, request = uuid.uuid4(), uuid.uuid4()
    await queue.enqueue(user, request, None, b"foto")
    job = await queue.claim("isci-a")
    await queue.complete("isci-a", job, b"png", "results/x.png")

    record = await queue.get_job(user, request)
    assert record["status"] == DONE and record["result_key"] == "results/x.png"
    assert await queue.result(user, request) == b"png"
    assert not await queue._redis().exists(queue._key("photo", job.job_id))
    assert await queue._redis().llen(queue._key("processing", "isci-a")) == 0


async def test_fail_records_code_and_deletes_photo(queue):
    user, request = uuid.uuid4(), uuid.uuid4()
    await queue.enqueue(user, request, None, b"foto")
    job = await queue.claim("isci-a")
    await queue.fail("isci-a", job.job_id, "processing_failed", retry_safe=True)

    record = await queue.get_job(user, request)
    assert record["status"] == FAILED
    assert record["error_code"] == "processing_failed" and record["retry_safe"] == "1"
    assert not await queue._redis().exists(queue._key("photo", job.job_id))


async def test_dead_worker_job_returns_to_the_front_of_the_queue(queue):
    user = uuid.uuid4()
    first, second = uuid.uuid4(), uuid.uuid4()
    await queue.enqueue(user, first, None, b"1")
    await queue.enqueue(user, second, None, b"2")
    await queue.heartbeat("olu-isci", ttl_seconds=1)
    claimed = await queue.claim("olu-isci")
    assert claimed.request_id == str(first)
    await queue._redis().delete(queue._key("worker", "olu-isci"))  # nabız kesildi

    assert await queue.recover_stale() == []
    assert (await queue.get_job(user, first))["status"] == QUEUED
    # Kurtarılan iş, sonradan gelenin ÖNÜNDE: sırasını kaybetmez.
    again = await queue.claim("yeni-isci")
    assert again.request_id == str(first) and again.photo == b"1" and again.attempts == 2


async def test_live_worker_jobs_are_left_alone(queue):
    user, request = uuid.uuid4(), uuid.uuid4()
    await queue.enqueue(user, request, None, b"x")
    await queue.heartbeat("canli-isci")
    await queue.claim("canli-isci")

    assert await queue.recover_stale() == []
    assert (await queue.get_job(user, request))["status"] == PROCESSING


async def test_job_out_of_attempts_is_handed_back_for_refund(queue):
    user, request = uuid.uuid4(), uuid.uuid4()
    await queue.enqueue(user, request, "rezervasyon-9", b"x")
    # 1. deneme: işçi çöktü, hakkı var → kuyruğa geri döner.
    assert (await queue.claim("olu-1")).attempts == 1
    assert await queue.recover_stale(max_attempts=2) == []
    assert await queue.queued_count() == 1
    # 2. deneme: yine çöktü, hakkı bitti → kuyruğa dönmez, kredi iadesi için
    # çağırana verilir.
    assert (await queue.claim("olu-2")).attempts == 2
    assert await queue.recover_stale(max_attempts=2) == [
        (job_id_for(user, request), "rezervasyon-9")
    ]
    assert await queue.queued_count() == 0


async def test_job_whose_photo_expired_is_handed_back_for_refund(queue):
    user, request = uuid.uuid4(), uuid.uuid4()
    await queue.enqueue(user, request, "rezervasyon-3", b"x")
    await queue.claim("olu-isci")
    await queue._redis().delete(queue._key("photo", job_id_for(user, request)))

    assert await queue.recover_stale() == [(job_id_for(user, request), "rezervasyon-3")]


async def test_claim_skips_a_job_whose_record_expired(queue):
    user, request = uuid.uuid4(), uuid.uuid4()
    await queue.enqueue(user, request, None, b"x")
    await queue._redis().delete(queue._key("job", job_id_for(user, request)))

    assert await queue.claim("isci-a") is None
    assert await queue._redis().llen(queue._key("processing", "isci-a")) == 0


async def test_empty_queue_claim_returns_none_after_timeout(queue):
    assert await queue.claim("isci-a", timeout_seconds=0.1) is None


async def test_forget_clears_a_failed_job(queue):
    user, request = uuid.uuid4(), uuid.uuid4()
    await queue.enqueue(user, request, None, b"x")
    job = await queue.claim("isci-a")
    await queue.fail("isci-a", job.job_id, "processing_failed", retry_safe=True)
    await queue.forget(user, request)
    assert await queue.get_job(user, request) is None
