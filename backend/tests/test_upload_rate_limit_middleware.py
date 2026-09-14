import asyncio

from app.middleware.upload_rate_limit import UploadRateLimitMiddleware
from app.services.rate_limit import RequestRateLimiter


def test_second_upload_is_rejected_before_body_is_read():
    now = [100.0]
    limiter = RequestRateLimiter(1, 60, clock=lambda: now[0])
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

    async def scenario():
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
                    "client": ("203.0.113.8", 1234),
                },
                receive,
                send,
            )
        return statuses

    assert asyncio.run(scenario()) == [204, 429]
    assert inner_calls == 1
    assert receive_calls == 0


def test_window_expiry_allows_request_again():
    now = [100.0]
    limiter = RequestRateLimiter(1, 10, clock=lambda: now[0])

    async def scenario():
        assert await limiter.retry_after("user:1") is None
        assert await limiter.retry_after("user:1") == 10
        now[0] = 111.0
        assert await limiter.retry_after("user:1") is None

    asyncio.run(scenario())
