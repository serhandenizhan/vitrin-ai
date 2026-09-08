import asyncio

from app.core.config import MULTIPART_OVERHEAD_ALLOWANCE_BYTES
from app.middleware.body_size_limit import BodySizeLimitMiddleware


async def _consuming_app(scope, receive, send):
    # Gerçek bir route/multipart parser'ın davranışını taklit eder: gövde
    # bitene kadar `receive()`'i tekrar tekrar çağırır.
    while True:
        message = await receive()
        if message["type"] == "http.disconnect" or not message.get("more_body", False):
            break
    await send({"type": "http.response.start", "status": 200, "headers": []})
    await send({"type": "http.response.body", "body": b"ok"})


def _make_chunked_receive(chunks: list[bytes]):
    call_count = 0

    async def fake_receive():
        nonlocal call_count
        call_count += 1
        index = call_count - 1
        if index >= len(chunks):
            return {"type": "http.disconnect"}
        return {
            "type": "http.request",
            "body": chunks[index],
            "more_body": index < len(chunks) - 1,
        }

    def get_call_count() -> int:
        return call_count

    return fake_receive, get_call_count


def test_rejects_with_413_and_stops_consuming_receive_stream_after_limit():
    # Sınır 15 bayt; chunk'lar 10'ar bayt -> ikinci chunk'ta (10+10=20 > 15)
    # sınır aşılıyor. Üçüncü chunk'a HİÇ ulaşılmamalı.
    chunks = [b"a" * 10, b"b" * 10, b"c" * 10]
    fake_receive, get_call_count = _make_chunked_receive(chunks)
    sent_messages: list[dict] = []

    async def fake_send(message):
        sent_messages.append(message)

    middleware = BodySizeLimitMiddleware(_consuming_app, max_body_bytes=15)

    asyncio.run(middleware({"type": "http"}, fake_receive, fake_send))

    assert sent_messages[0]["status"] == 413
    assert "sınırı" in sent_messages[1]["body"].decode("utf-8")
    # Sınır ikinci chunk'ta aşıldığı için alttaki receive() en fazla 2 kez
    # çağrılmış olmalı -> üçüncü chunk hiç tüketilmedi.
    assert get_call_count() == 2


def test_accepts_stream_within_limit_without_touching_response_path():
    chunks = [b"a" * 10, b"b" * 4]  # toplam 14 bayt, sınır 15
    fake_receive, get_call_count = _make_chunked_receive(chunks)
    sent_messages: list[dict] = []

    async def fake_send(message):
        sent_messages.append(message)

    middleware = BodySizeLimitMiddleware(_consuming_app, max_body_bytes=15)

    asyncio.run(middleware({"type": "http"}, fake_receive, fake_send))

    assert sent_messages[0]["status"] == 200
    assert sent_messages[1]["body"] == b"ok"
    # Son chunk `more_body=False` taşıdığı için tüketici döngü ek bir
    # `http.disconnect` beklemeden burada durur -> tam 2 çağrı.
    assert get_call_count() == 2


def test_default_allowance_rejects_metadata_that_explicit_override_would_accept():
    # `MAX_REQUEST_BODY_BYTES`'in "varsayılan vs. açık override" davranışını
    # `settings`/gerçek app seviyesinde değil, doğrudan middleware bileşeni
    # seviyesinde test ediyoruz: `app.main.app`'in middleware stack'i ilk
    # istekte bir kez inşa edilip modül ömrü boyunca önbelleklendiği için,
    # testte `settings.max_request_body_bytes`'i sonradan değiştirmek zaten
    # kurulmuş gerçek middleware örneğini ETKİLEMEZ. Bu yüzden aynı mekanizma
    # (`BodySizeLimitMiddleware(max_body_bytes=...)`) burada iki farklı
    # yapılandırmayla doğrudan örnekleniyor — production'da `max_body_bytes`
    # değeri `settings.max_request_body_bytes`'ten (varsayılan hesaplama veya
    # `MAX_REQUEST_BODY_BYTES` env override'ı) geliyor, mekanizma birebir aynı.
    file_size = 1000
    oversized_metadata = MULTIPART_OVERHEAD_ALLOWANCE_BYTES + 5000
    total_body_size = file_size + oversized_metadata

    default_style_max = file_size + MULTIPART_OVERHEAD_ALLOWANCE_BYTES
    override_style_max = total_body_size + 1

    def _run(max_body_bytes: int) -> int:
        sent_messages: list[dict] = []

        async def fake_send(message):
            sent_messages.append(message)

        async def passthrough_app(scope, receive, send):
            await receive()
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"ok"})

        async def fake_receive():
            return {
                "type": "http.request",
                "body": b"x" * total_body_size,
                "more_body": False,
            }

        middleware = BodySizeLimitMiddleware(passthrough_app, max_body_bytes=max_body_bytes)
        asyncio.run(middleware({"type": "http"}, fake_receive, fake_send))
        return sent_messages[0]["status"]

    assert _run(default_style_max) == 413
    assert _run(override_style_max) == 200


def test_non_http_scope_bypasses_limit_entirely():
    call_count = 0

    async def fake_receive():
        nonlocal call_count
        call_count += 1
        return {"type": "lifespan.startup"}

    sent_messages: list[dict] = []

    async def fake_send(message):
        sent_messages.append(message)

    async def lifespan_app(scope, receive, send):
        message = await receive()
        await send({"type": "lifespan.startup.complete", "seen": message["type"]})

    middleware = BodySizeLimitMiddleware(lifespan_app, max_body_bytes=1)

    asyncio.run(middleware({"type": "lifespan"}, fake_receive, fake_send))

    assert call_count == 1
    assert sent_messages[0]["type"] == "lifespan.startup.complete"
