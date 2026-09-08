import asyncio

import pytest

from app.middleware.admission_limiter import EndpointAdmissionLimiterMiddleware
from app.services.concurrency import InferenceCapacityLimiter

TARGET_PATH = "/api/remove-background"


def _scope(path: str = TARGET_PATH, method: str = "POST") -> dict:
    return {"type": "http", "method": method, "path": path}


def _make_middleware(app, total_tokens: int, *, limiter: InferenceCapacityLimiter | None = None):
    return EndpointAdmissionLimiterMiddleware(
        app,
        limiter=limiter if limiter is not None else InferenceCapacityLimiter(total_tokens),
        path=TARGET_PATH,
    )


def _make_inner_app(on_call=None):
    call_count = 0

    async def inner_app(scope, receive, send):
        nonlocal call_count
        call_count += 1
        if on_call is not None:
            await on_call(scope, receive, send)
        else:
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"ok"})

    def get_call_count() -> int:
        return call_count

    return inner_app, get_call_count


def test_rejects_with_429_without_ever_calling_inner_app_when_full():
    # Kapasite 1; ilk çağrı izni tutarken içeride bekletiliyor. İkinci çağrı
    # -- ayrı bir asyncio Task olarak -- doluyken parser/route'u temsil eden
    # inner app'e HİÇ ulaşmamalı (call_count artmamalı) ve anında 429 almalı.
    holder_started = asyncio.Event()
    holder_release = asyncio.Event()

    async def holder_body(scope, receive, send):
        holder_started.set()
        await holder_release.wait()
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    holder_app, holder_call_count = _make_inner_app(on_call=holder_body)
    rejected_app, rejected_call_count = _make_inner_app()

    shared_limiter = InferenceCapacityLimiter(1)
    holder_middleware = _make_middleware(holder_app, 1, limiter=shared_limiter)
    rejected_middleware = _make_middleware(rejected_app, 1, limiter=shared_limiter)

    sent_messages: list[dict] = []

    async def fake_send(message):
        sent_messages.append(message)

    async def fake_receive():
        return {"type": "http.disconnect"}

    async def scenario():
        holder_task = asyncio.create_task(
            holder_middleware(_scope(), fake_receive, lambda m: asyncio.sleep(0))
        )
        await holder_started.wait()

        await rejected_middleware(_scope(), fake_receive, fake_send)

        holder_release.set()
        await holder_task

    asyncio.run(scenario())

    assert sent_messages[0]["status"] == 429
    assert rejected_call_count() == 0


def test_non_matching_path_bypasses_admission_control_entirely():
    inner_app, get_call_count = _make_inner_app()
    middleware = _make_middleware(inner_app, 0)

    sent_messages: list[dict] = []

    async def fake_send(message):
        sent_messages.append(message)

    async def fake_receive():
        return {"type": "http.disconnect"}

    asyncio.run(middleware(_scope(path="/api/other"), fake_receive, fake_send))

    assert get_call_count() == 1
    assert sent_messages[0]["status"] == 200


def test_non_matching_method_bypasses_admission_control_entirely():
    inner_app, get_call_count = _make_inner_app()
    middleware = _make_middleware(inner_app, 0)

    sent_messages: list[dict] = []

    async def fake_send(message):
        sent_messages.append(message)

    async def fake_receive():
        return {"type": "http.disconnect"}

    asyncio.run(middleware(_scope(method="GET"), fake_receive, fake_send))

    assert get_call_count() == 1
    assert sent_messages[0]["status"] == 200


def test_token_released_after_successful_request_allows_next_admission():
    inner_app, get_call_count = _make_inner_app()
    middleware = _make_middleware(inner_app, 1)

    sent_messages: list[dict] = []

    async def fake_send(message):
        sent_messages.append(message)

    async def fake_receive():
        return {"type": "http.disconnect"}

    async def scenario():
        await middleware(_scope(), fake_receive, fake_send)
        await middleware(_scope(), fake_receive, fake_send)

    asyncio.run(scenario())

    assert get_call_count() == 2
    starts = [m for m in sent_messages if m["type"] == "http.response.start"]
    assert [m["status"] for m in starts] == [200, 200]


def test_token_released_after_inner_app_raises_exception():
    # `failing_body` her çağrıda hata fırlatıyor (kasıtlı) — buradaki amaç
    # ikinci çağrının da (429 yerine) yine aynı `RuntimeError`'a ulaşabildiğini
    # kanıtlamak: eğer izin ilk çağrıdan sonra bırakılmamış olsaydı ikinci
    # çağrı admission middleware'in kendisinden 429 alırdı, route'a hiç
    # ulaşmazdı.
    async def failing_body(scope, receive, send):
        raise RuntimeError("servis hatası")

    inner_app, get_call_count = _make_inner_app(on_call=failing_body)
    middleware = _make_middleware(inner_app, 1)

    async def fake_send(message):
        pass

    async def fake_receive():
        return {"type": "http.disconnect"}

    async def scenario():
        with pytest.raises(RuntimeError, match="servis hatası"):
            await middleware(_scope(), fake_receive, fake_send)

        # İzin serbest bırakılmış olmalı: ikinci çağrı da inner app'e (429
        # almadan) ulaşabilmeli ve aynı `RuntimeError`'ı üretebilmeli.
        with pytest.raises(RuntimeError, match="servis hatası"):
            await middleware(_scope(), fake_receive, fake_send)

    asyncio.run(scenario())

    assert get_call_count() == 2


def test_token_released_after_send_raises_exception():
    # İnner app normal akışında `send()`'i çağırıyor ama `send()`'in kendisi
    # (ör. istemci bağlantısı koptuğu için) hata fırlatıyor. Bu, inner app'in
    # kendisinin fırlattığı bir hatadan farklı bir yol — `try/finally`'nin
    # `self.app(...)` çağrısının NASIL başarısız olduğundan bağımsız
    # çalıştığını kanıtlar.
    async def normal_body(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    inner_app, get_call_count = _make_inner_app(on_call=normal_body)
    middleware = _make_middleware(inner_app, 1)

    async def failing_send(message):
        raise ConnectionResetError("istemci bağlantısı koptu")

    async def fake_receive():
        return {"type": "http.disconnect"}

    async def scenario():
        with pytest.raises(ConnectionResetError, match="istemci bağlantısı koptu"):
            await middleware(_scope(), fake_receive, failing_send)

        # İzin serbest bırakılmış olmalı: ikinci (normal) bir istek anında
        # kabul edilip 200 ile tamamlanabilmeli.
        sent_messages: list[dict] = []

        async def collecting_send(message):
            sent_messages.append(message)

        await middleware(_scope(), fake_receive, collecting_send)

        starts = [m for m in sent_messages if m["type"] == "http.response.start"]
        assert starts[0]["status"] == 200

    asyncio.run(scenario())

    assert get_call_count() == 2


def test_token_released_after_inner_app_is_cancelled():
    entered = asyncio.Event()

    async def hanging_body(scope, receive, send):
        entered.set()
        await asyncio.Event().wait()  # asla kendiliğinden bitmez, iptal edilecek

    hanging_app, hanging_call_count = _make_inner_app(on_call=hanging_body)
    shared_limiter = InferenceCapacityLimiter(1)
    middleware = _make_middleware(hanging_app, 1, limiter=shared_limiter)

    async def fake_receive():
        return {"type": "http.disconnect"}

    async def fake_send(message):
        pass

    async def scenario():
        task = asyncio.create_task(middleware(_scope(), fake_receive, fake_send))
        await entered.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

        # İptal sonrası izin serbest bırakılmış olmalı: normal (asılı
        # kalmayan) bir app'e bağlı YENİ bir middleware örneği aynı
        # `_limiter`'ı paylaştığında istek anında kabul edilip normal şekilde
        # tamamlanabilmeli (429 almamalı, sonsuza kadar asılı kalmamalı).
        normal_app, normal_call_count = _make_inner_app()
        second_middleware = _make_middleware(normal_app, 1, limiter=shared_limiter)

        sent_messages: list[dict] = []

        async def collecting_send(message):
            sent_messages.append(message)

        await asyncio.wait_for(
            second_middleware(_scope(), fake_receive, collecting_send), timeout=2
        )

        assert normal_call_count() == 1
        starts = [m for m in sent_messages if m["type"] == "http.response.start"]
        assert starts[0]["status"] == 200

    asyncio.run(scenario())
