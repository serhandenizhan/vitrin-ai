"""Kesim kuyruğu (`app/services/cutout_queue.py`) — gerçek Redis'te.

Her test kendi önekini kullanır ve sonunda yalnız kendi anahtarlarını siler;
aynı Redis'i kullanan geliştirme ortamına dokunmaz.
"""

import asyncio
import time
import uuid
from urllib.parse import urlsplit

import pytest
from redis.exceptions import RedisError, ResponseError

from app.core.config import settings
from app.services import cutout_queue
from app.services.cutout_queue import (
    DONE,
    FAILED,
    PHOTO_TTL_SECONDS,
    PROCESSING,
    QUEUE_STALL_SECONDS,
    QUEUED,
    CutoutQueue,
    QueueFull,
    RedisPersistenceEnabled,
    job_id_for,
    redis_persistence,
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


async def test_concurrent_enqueues_never_exceed_the_limit(queue):
    # Sınır kontrolü ile ekleme ayrı adımlarken eşzamanlı isteklerin hepsi
    # boş kuyruk görüp kabul ediliyordu; fotoğraflar Redis belleğinde durduğu
    # için bellek sınırı da aşılıyordu (Codex incelemesi, 27.09.2026).
    user = uuid.uuid4()
    requests = [uuid.uuid4() for _ in range(10)]
    results = await asyncio.gather(
        *(queue.enqueue(user, request, None, b"x") for request in requests),
        return_exceptions=True,
    )
    accepted = [r for r, result in zip(requests, results) if result is None]
    assert all(isinstance(result, QueueFull) for result in results if result is not None)
    assert len(accepted) == queue.max_jobs == 3
    assert await queue.queued_count() == 3
    # Reddedilen isteğin fotoğrafı ve kaydı hiç yazılmaz.
    for request in set(requests) - set(accepted):
        assert await queue.get_job(user, request) is None
        assert not await queue._redis().exists(queue._key("photo", job_id_for(user, request)))


class _FakeConfigRedis:
    def __init__(self, save="", appendonly="no", forbidden=False):
        self.values = {"save": save, "appendonly": appendonly}
        self.forbidden = forbidden

    async def config_get(self, name):
        if self.forbidden:
            raise ResponseError("unknown command 'CONFIG'")
        return {name.encode(): self.values[name].encode()}


@pytest.mark.parametrize(
    "fake,expected",
    [
        (_FakeConfigRedis(save="3600 1 300 100 60 10000"), True),  # Redis 7 varsayılanı
        (_FakeConfigRedis(appendonly="yes"), True),
        (_FakeConfigRedis(), False),
        (_FakeConfigRedis(forbidden=True), None),
    ],
)
async def test_redis_persistence_is_read_from_its_config(fake, expected):
    assert await redis_persistence(fake) is expected


@pytest.mark.parametrize("state", [True, None], ids=["diske-yaziyor", "dogrulanamiyor"])
async def test_photo_is_refused_while_redis_writes_to_disk(queue, monkeypatch, state):
    # KVKK metni "özgün fotoğraf diske yazılmaz" diyor; Redis'in varsayılan
    # ayarı belleği `dump.rdb`'ye yazıyor (Codex incelemesi, 27.09.2026).
    # `CONFIG` yasak olduğu için doğrulanamayan Redis de reddedilir (2. tur):
    # kanıtlanamayan bir söz verilmiş sayılmaz.
    async def writes_to_disk(_redis):
        return state

    monkeypatch.setattr(cutout_queue, "redis_persistence", writes_to_disk)
    user, request = uuid.uuid4(), uuid.uuid4()
    with pytest.raises(RedisPersistenceEnabled):
        await queue.enqueue(user, request, None, b"foto")
    assert isinstance(RedisPersistenceEnabled(), RedisError)  # API 503 + kredi iadesi yolu
    assert not await queue._redis().exists(queue._key("photo", job_id_for(user, request)))
    assert await queue.queued_count() == 0


async def test_persistence_is_rechecked_before_every_photo(queue, monkeypatch):
    state = False
    checks = 0

    async def current_persistence(_redis):
        nonlocal checks
        checks += 1
        return state

    monkeypatch.setattr(cutout_queue, "redis_persistence", current_persistence)
    user = uuid.uuid4()
    await queue.enqueue(user, uuid.uuid4(), None, b"ilk foto")
    state = True  # Redis ilk kontrolden sonra yeniden başlatıldı/ayar değişti
    rejected = uuid.uuid4()
    with pytest.raises(RedisPersistenceEnabled):
        await queue.enqueue(user, rejected, None, b"ikinci foto")
    assert checks == 2
    assert not await queue._redis().exists(queue._key("photo", job_id_for(user, rejected)))


async def test_test_redis_is_configured_without_persistence(queue):
    # conftest'teki `redis_without_persistence` gerçekten uygulanmış olmalı;
    # aksi hâlde bu dosyadaki diğer testler yanlış sebeple kırmızı yanar.
    assert await redis_persistence(queue._redis()) is False


async def test_photo_lives_at_most_fifteen_minutes(queue):
    user, request = uuid.uuid4(), uuid.uuid4()
    await queue.enqueue(user, request, None, b"foto")
    ttl = await queue._redis().ttl(queue._key("photo", job_id_for(user, request)))
    assert 0 < ttl <= PHOTO_TTL_SECONDS


async def test_complete_delivers_result_and_deletes_photo(queue):
    user, request = uuid.uuid4(), uuid.uuid4()
    await queue.enqueue(user, request, None, b"foto")
    job = await queue.claim("isci-a")
    await queue.complete("isci-a", job.job_id, b"png", "results/x.png")

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


# --- İşçi sağlığı görünürlüğü (Faz 7 kapanış denetimi, S3) -------------------


async def test_stats_of_an_idle_queue_without_workers_report_no_worker(queue):
    stats = await queue.stats()

    assert (stats.workers, stats.queued, stats.processing) == (0, 0, 0)
    assert stats.oldest_waiting_seconds is None
    # Kuyruk boşken bile işçi yoksa durum "ok" değildir: sıradaki müşteri bekler.
    assert stats.status == "no_worker"


async def test_stats_count_workers_queue_and_running_jobs(queue):
    user = uuid.uuid4()
    await queue.heartbeat("isci-1")
    await queue.heartbeat("isci-2")
    for _ in range(3):
        await queue.enqueue(user, uuid.uuid4(), None, b"x")
    await queue.claim("isci-1")

    stats = await queue.stats()

    assert stats.workers == 2
    assert stats.queued == 2
    assert stats.processing == 1
    assert stats.oldest_waiting_seconds is not None and stats.oldest_waiting_seconds < 5
    assert stats.status == "ok"


async def test_a_worker_with_a_cut_heartbeat_is_not_counted_alive(queue):
    # Sayım, `recover_stale`'in "ölü" tanımıyla aynı olmalı: nabız anahtarı yok = ölü.
    await queue.heartbeat("canli")
    await queue.heartbeat("olu")
    await queue._redis().delete(queue._key("worker", "olu"))

    assert (await queue.stats()).workers == 1


async def test_oldest_waiting_is_the_job_that_will_be_claimed_next(queue):
    user = uuid.uuid4()
    first, second = uuid.uuid4(), uuid.uuid4()
    await queue.heartbeat("isci")
    await queue.enqueue(user, first, None, b"1")
    await queue.enqueue(user, second, None, b"2")
    # İlk işin eklenme anını 90 sn geriye al: bekleyenlerin en eskisi o.
    await queue._redis().hset(
        queue._key("job", job_id_for(user, first)), "enqueued_at", repr(time.time() - 90)
    )

    stats = await queue.stats()

    assert 85 < stats.oldest_waiting_seconds < 100


async def test_live_worker_that_stopped_consuming_is_reported_stalled(queue):
    user, request = uuid.uuid4(), uuid.uuid4()
    await queue.heartbeat("takilmis-isci")  # nabız var ama iş almıyor
    await queue.enqueue(user, request, None, b"x")
    await queue._redis().hset(
        queue._key("job", job_id_for(user, request)),
        "enqueued_at",
        repr(time.time() - (QUEUE_STALL_SECONDS + 30)),
    )

    assert (await queue.stats()).status == "stalled"


async def test_unhealthy_report_is_logged_once_per_cooldown(queue, caplog):
    stats = await queue.stats()  # işçi yok
    assert stats.status == "no_worker"

    with caplog.at_level("ERROR", logger="vitrin.cutout-queue"):
        first = await queue.report_unhealthy(stats, "test")
        second = await queue.report_unhealthy(stats, "test")

    assert (first, second) == (True, False)
    errors = [r for r in caplog.records if r.levelname == "ERROR"]
    assert len(errors) == 1
    assert "no_worker" in errors[0].getMessage()


async def test_healthy_queue_is_never_reported(queue, caplog):
    await queue.heartbeat("isci")
    stats = await queue.stats()

    with caplog.at_level("ERROR", logger="vitrin.cutout-queue"):
        assert await queue.report_unhealthy(stats, "test") is False
    assert not caplog.records


# --- "Tıkalı" = İLERLEME yok; uzun ama ilerleyen kuyruk tıkalı değildir (PR #46 incelemesi, M1) ---


async def test_long_but_progressing_queue_is_not_stalled(queue):
    # Tek işçi ~12 sn/iş keser; 10+ iş birikince en eski iş 120 sn'yi aşar. Sistem
    # normal çalışıyor, "tıkalı" denmemeli (alarm yorgunluğu ve Sentry gürültüsü).
    user = uuid.uuid4()
    await queue.heartbeat("isci")
    for _ in range(3):
        await queue.enqueue(user, uuid.uuid4(), None, b"x")
    await queue.claim("isci")  # işçi hâlâ iş alıyor: ilerleme var
    for key in [k async for k in queue._redis().scan_iter(match=queue._key("job", "*"))]:
        await queue._redis().hset(key, "enqueued_at", repr(time.time() - 300))

    stats = await queue.stats()

    assert stats.oldest_waiting_seconds > QUEUE_STALL_SECONDS  # bekleme uzun...
    assert stats.status == "ok"  # ...ama ilerleme var
    assert stats.seconds_without_progress < 5


async def test_waiting_jobs_with_no_claim_for_too_long_is_stalled(queue):
    user = uuid.uuid4()
    await queue.heartbeat("takilmis")
    await queue.enqueue(user, uuid.uuid4(), None, b"x")
    for key in [k async for k in queue._redis().scan_iter(match=queue._key("job", "*"))]:
        await queue._redis().hset(key, "enqueued_at", repr(time.time() - 400))
    # Son iş alımı eşikten uzun süre önce: işçi canlı ama ilerlemiyor.
    await queue._redis().set(queue._key("last-claim"), repr(time.time() - (QUEUE_STALL_SECONDS + 60)))

    stats = await queue.stats()

    assert stats.status == "stalled"
    assert stats.seconds_without_progress > QUEUE_STALL_SECONDS


async def test_first_job_after_a_long_idle_period_is_not_stalled(queue):
    # Saatlerce boşta kalmış işçi, gelen ilk işi saniyeler içinde alır. Son alım
    # saatler önce olsa da bekleme sayacı işin GELİŞİNDEN başlar: yalancı alarm yok.
    await queue.heartbeat("isci")
    await queue._redis().set(queue._key("last-claim"), repr(time.time() - 2 * 3600))
    await queue.enqueue(uuid.uuid4(), uuid.uuid4(), None, b"x")

    stats = await queue.stats()

    assert stats.status == "ok"
    assert stats.seconds_without_progress < 5


async def test_claiming_a_job_records_progress(queue):
    await queue.heartbeat("isci")
    await queue.enqueue(uuid.uuid4(), uuid.uuid4(), None, b"x")
    assert await queue._redis().get(queue._key("last-claim")) is None

    await queue.claim("isci")

    assert time.time() - float(await queue._redis().get(queue._key("last-claim"))) < 5
