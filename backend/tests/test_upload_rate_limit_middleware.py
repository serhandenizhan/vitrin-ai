import uuid

import pytest

from app.core.config import settings
from app.middleware.upload_rate_limit import UploadRateLimitMiddleware
from app.services.rate_limit import RequestRateLimiter


@pytest.mark.asyncio
async def test_second_upload_is_rejected_before_body_is_read(redis_client):
    # `redis_client` fixture'ı parametre olarak isteniyor ki REDIS_URL'in
    # yerel/erişilebilir olduğu, gerçek Redis'e hiç bağlanmadan önce
    # doğrulansın (bkz. conftest.py) — limiter'ın kendisi ayrı bir bağlantı
    # açıyor (bkz. RequestRateLimiter'ın loop-başına-istemci notu).
    now = [100.0]
    limiter = RequestRateLimiter(1, 60, redis_url=settings.redis_url, clock=lambda: now[0])
    # Testler arasi paylasilan bir anahtara carpmamak icin benzersiz bir IP.
    client_ip = f"203.0.113.{uuid.uuid4().int % 250 + 1}"
    inner_calls = 0
    receive_calls = 0

    async def app(scope, receive, send):
        nonlocal inner_calls
        inner_calls += 1
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    async def receive():
        nonlocal receive_calls
        receive_calls += 1
        return {"type": "http.request", "body": b"buyuk", "more_body": False}

    middleware = UploadRateLimitMiddleware(app, limiter=limiter)
    statuses = []
    for _ in range(2):

        async def send(message):
            if message["type"] == "http.response.start":
                statuses.append(message["status"])

        await middleware(
            {
                "type": "http",
                "method": "POST",
                "path": "/api/projects",
                "headers": [],
                "client": (client_ip, 1234),
            },
            receive,
            send,
        )

    assert statuses == [204, 429]
    assert inner_calls == 1
    assert receive_calls == 0
    await limiter.aclose()


@pytest.mark.asyncio
async def test_window_expiry_allows_request_again(redis_client):
    now = [100.0]
    limiter = RequestRateLimiter(1, 10, redis_url=settings.redis_url, clock=lambda: now[0])
    key = f"user:{uuid.uuid4()}"

    assert await limiter.retry_after(key) is None
    assert await limiter.retry_after(key) == 10
    now[0] = 111.0
    assert await limiter.retry_after(key) is None
    await limiter.aclose()


@pytest.mark.asyncio
async def test_shared_redis_enforces_limit_across_separate_limiter_instances(redis_client):
    """Iki farkli `RequestRateLimiter` nesnesi (iki ayri worker'i taklit eder)
    ayni Redis anahtarini paylasinca sinir da paylasilmis olmali.

    Bu, tam olarak Faz 4 kapanisina kadarki process-ici implementasyonun
    COZEMEDIGI durumdur: iki ayri `dict`+`deque` nesnesi ayni anahtar icin
    BAGIMSIZ sayardi ve gercek sinir worker sayisiyla carpilirdi (1 istek/pencere
    limitiyle iki worker, pratikte 2 istek/pencere'ye izin verirdi). Bu test,
    process-ici eski implementasyona karsi calistirilsaydi KIRMIZI yanardi —
    iki ayri Python nesnesi birbirinden habersiz oldugu icin ikinci istek de
    kabul edilirdi.
    """
    now = [100.0]
    key = f"user:{uuid.uuid4()}"
    worker_a = RequestRateLimiter(1, 60, redis_url=settings.redis_url, clock=lambda: now[0])
    worker_b = RequestRateLimiter(1, 60, redis_url=settings.redis_url, clock=lambda: now[0])

    assert await worker_a.retry_after(key) is None
    # Ayni anahtar, farkli nesne/worker — sinir yine de dolu olmali.
    assert await worker_b.retry_after(key) == 60
    await worker_a.aclose()
    await worker_b.aclose()
