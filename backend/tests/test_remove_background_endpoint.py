import asyncio
import io
import struct
import threading
import time
import uuid
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from app.api.routes.remove_background import get_background_removal_service, remove_background
from app.core.auth import CurrentUser, get_current_user
from app.core.config import (
    DEFAULT_METADATA_BUDGET_BYTES,
    MULTIPART_OVERHEAD_ALLOWANCE_BYTES,
    settings,
)
from app.main import admission_limiter, app
from app.validation import upload as upload_module

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


class FakeBackgroundRemovalService:
    def __init__(self, result: bytes = b"fake-png-bytes"):
        self.result = result
        self.received_content: bytes | None = None

    def remove(self, image_bytes: bytes) -> bytes:
        self.received_content = image_bytes
        return self.result


def _jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color="green").save(buf, format="JPEG")
    return buf.getvalue()


def _webp_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color="blue").save(buf, format="WEBP")
    return buf.getvalue()


def _heic_bytes() -> bytes:
    return (FIXTURES_DIR / "tiny.heic").read_bytes()


def _png_with_corrupted_idat_crc() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (50, 50), color="red").save(buf, format="PNG")
    data = bytearray(buf.getvalue())

    idat_type_index = data.find(b"IDAT")
    length = struct.unpack(">I", bytes(data[idat_type_index - 4 : idat_type_index]))[0]
    crc_start = idat_type_index + 4 + length
    data[crc_start : crc_start + 4] = b"\x00\x00\x00\x00"
    return bytes(data)


def _jpeg_truncated_after_sos_entropy() -> bytes:
    # Gerçek SOF/SOS marker'ları sağlam, ama entropy-coded tarama verisi
    # (asıl piksel verisi) sadece birkaç bayttan sonra kesilmiş. `verify()`
    # bunu yakalamaz (sadece marker yapısına bakar) — yalnızca tam decode
    # (`image.load()`) "image file is truncated" hatasını üretir.
    buf = io.BytesIO()
    Image.new("RGB", (100, 100), color="green").save(buf, format="JPEG", quality=90)
    jpeg = buf.getvalue()
    sos_index = jpeg.find(b"\xff\xda")
    sos_len = struct.unpack(">H", jpeg[sos_index + 2 : sos_index + 4])[0]
    cut_point = sos_index + 2 + sos_len + 5
    return jpeg[:cut_point]


def _signed_in_user() -> CurrentUser:
    return CurrentUser(id=uuid.uuid4(), email="test@test.example", session_id=None)


def _client_with_fake_service(fake_service: FakeBackgroundRemovalService) -> TestClient:
    # Bu dosyadaki testler yükleme/doğrulama davranışını sınıyor; oturum
    # zorunluluğu aşağıdaki ayrı testlerde gerçek token doğrulamasıyla sınanıyor.
    app.dependency_overrides[get_background_removal_service] = lambda: fake_service
    app.dependency_overrides[get_current_user] = _signed_in_user
    client = TestClient(app)
    return client


def teardown_function():
    app.dependency_overrides.clear()


def test_returns_png_for_valid_jpeg_upload():
    fake_service = FakeBackgroundRemovalService(result=b"cutout-png-bytes")
    client = _client_with_fake_service(fake_service)

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.jpg", _jpeg_bytes(), "image/jpeg")},
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == b"cutout-png-bytes"
    assert fake_service.received_content == _jpeg_bytes()


def test_rejects_request_without_session_with_401_and_service_not_called(tokens):
    # Faz 4 kararı: giriş yapmadan arka plan kaldırılamaz. RED yolu (ders 15):
    # oturumsuz istek 401 alıyor ve BiRefNet HİÇ çağrılmıyor.
    fake_service = FakeBackgroundRemovalService()
    app.dependency_overrides[get_background_removal_service] = lambda: fake_service
    client = TestClient(app)

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.jpg", _jpeg_bytes(), "image/jpeg")},
    )

    assert response.status_code == 401
    assert fake_service.received_content is None


def test_rejects_invalid_token_with_401_and_service_not_called(tokens):
    fake_service = FakeBackgroundRemovalService()
    app.dependency_overrides[get_background_removal_service] = lambda: fake_service
    client = TestClient(app)

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.jpg", _jpeg_bytes(), "image/jpeg")},
        headers=tokens.headers(uuid.uuid4(), expires_in=-3600),
    )

    assert response.status_code == 401
    assert fake_service.received_content is None


def test_accepts_request_with_valid_token(tokens):
    # KABUL yolu (ders 15): override yok, gerçek JWT doğrulaması.
    fake_service = FakeBackgroundRemovalService(result=b"cutout-png-bytes")
    app.dependency_overrides[get_background_removal_service] = lambda: fake_service
    client = TestClient(app)

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.jpg", _jpeg_bytes(), "image/jpeg")},
        headers=tokens.headers(uuid.uuid4()),
    )

    assert response.status_code == 200
    assert response.content == b"cutout-png-bytes"


def test_returns_png_for_valid_webp_upload():
    fake_service = FakeBackgroundRemovalService(result=b"cutout-png-bytes")
    client = _client_with_fake_service(fake_service)

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.webp", _webp_bytes(), "image/webp")},
    )

    assert response.status_code == 200
    assert fake_service.received_content == _webp_bytes()


def test_returns_png_for_valid_heic_upload():
    fake_service = FakeBackgroundRemovalService(result=b"cutout-png-bytes")
    client = _client_with_fake_service(fake_service)

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.heic", _heic_bytes(), "image/heic")},
    )

    assert response.status_code == 200
    assert fake_service.received_content == _heic_bytes()


def test_rejects_disallowed_content_type_with_400():
    fake_service = FakeBackgroundRemovalService()
    client = _client_with_fake_service(fake_service)

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )

    assert response.status_code == 400
    assert "content-type" in response.json()["detail"]
    assert fake_service.received_content is None


def test_rejects_corrupted_png_with_valid_signature_without_500():
    # CRC'si bozuk bir PNG: magic-byte/content-type kontrolünü geçer ama
    # `image.verify()` decode sırasında PIL'in `SyntaxError` fırlatmasına yol
    # açar. Bu, 500'e sızmadan 400'e çevrilmeli ve servis hiç çağrılmamalı.
    fake_service = FakeBackgroundRemovalService()
    client = _client_with_fake_service(fake_service)

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.png", _png_with_corrupted_idat_crc(), "image/png")},
    )

    assert response.status_code == 400
    assert "geçerli bir görüntü değil" in response.json()["detail"]
    assert fake_service.received_content is None


def test_rejects_jpeg_truncated_after_header_without_500():
    # Header'dan hemen sonra kesilmiş bir JPEG: `Image.open()` başlığı
    # ayrıştırır ama `image.verify()` decode sırasında patlar. 500 yerine
    # 400 üretilmeli, servis hiç çağrılmamalı.
    fake_service = FakeBackgroundRemovalService()
    client = _client_with_fake_service(fake_service)

    truncated = _jpeg_bytes()[:30]
    response = client.post(
        "/api/remove-background",
        files={"file": ("product.jpg", truncated, "image/jpeg")},
    )

    assert response.status_code == 400
    assert "geçerli bir görüntü değil" in response.json()["detail"]
    assert fake_service.received_content is None


def test_rejects_jpeg_truncated_after_sos_entropy_data_without_500():
    # Gerçek SOF/SOS marker'ları sağlam olan ama entropy-coded tarama verisi
    # kesilmiş bir JPEG: bu, `verify()`'in TEK BAŞINA yakalayamadığı bir
    # durumdur (sadece marker yapısına bakar) — yalnızca ayrı bir
    # `Image.open()` + `image.load()` decode aşaması bunu tespit eder. 500
    # yerine 400 üretilmeli, servis hiç çağrılmamalı.
    fake_service = FakeBackgroundRemovalService()
    client = _client_with_fake_service(fake_service)

    response = client.post(
        "/api/remove-background",
        files={
            "file": (
                "product.jpg",
                _jpeg_truncated_after_sos_entropy(),
                "image/jpeg",
            )
        },
    )

    assert response.status_code == 400
    assert "geçerli bir görüntü değil" in response.json()["detail"]
    assert fake_service.received_content is None


def test_rejects_struct_error_during_decode_with_400_and_service_not_called(monkeypatch):
    # `struct.error`, `validate_upload`'ın dar `except` tuple'ına açıkça
    # eklendi (OSError/ValueError'dan türemeyen kendi başına bir Exception
    # alt sınıfı). Bu, gerçek uçtan uca istekte de 500'e sızmadan 400
    # ürettiğini ve servis hiç çağrılmadığını kanıtlıyor.
    def raise_struct_error(*args, **kwargs):
        raise struct.error("simulated struct.unpack failure during header decode")

    monkeypatch.setattr(upload_module.Image, "open", raise_struct_error)

    fake_service = FakeBackgroundRemovalService()
    client = _client_with_fake_service(fake_service)

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.jpg", _jpeg_bytes(), "image/jpeg")},
    )

    assert response.status_code == 400
    assert "geçerli bir görüntü değil" in response.json()["detail"]
    assert fake_service.received_content is None


def test_accepts_exact_file_size_with_metadata_within_default_budget():
    # `DEFAULT_METADATA_BUDGET_BYTES` bir GARANTİ değil, varsayılan bir
    # referans bütçesidir (bkz. app/core/config.py). Metadata toplamı bu
    # bütçenin altında kaldığında, tam `max_file_size_bytes` boyutundaki
    # geçerli bir dosya VARSAYILAN `max_request_body_bytes` ile 413 almıyor —
    # gerçek/operasyonel sınır her zaman `MAX_REQUEST_BODY_BYTES`'tir.
    fake_service = FakeBackgroundRemovalService(result=b"cutout-png-bytes")
    client = _client_with_fake_service(fake_service)

    base = _jpeg_bytes()
    exact_size_content = base + b"\x00" * (settings.max_file_size_bytes - len(base))

    filename_padding = DEFAULT_METADATA_BUDGET_BYTES - 1000
    long_filename = "urun-" + ("x" * filename_padding) + ".jpg"
    extra_field_value = "y" * 500
    assert len(long_filename) + len(extra_field_value) < DEFAULT_METADATA_BUDGET_BYTES

    response = client.post(
        "/api/remove-background",
        files={"file": (long_filename, exact_size_content, "image/jpeg")},
        data={"not_used_extra_field": extra_field_value},
    )

    assert response.status_code == 200
    assert fake_service.received_content == exact_size_content


def test_rejects_exact_file_size_with_metadata_beyond_default_allowance():
    # `DEFAULT_METADATA_BUDGET_BYTES`'in dışında, `MULTIPART_OVERHEAD_ALLOWANCE_BYTES`'i
    # de açıkça aşan bir metadata boyutu: varsayılan `max_request_body_bytes`
    # bunu karşılamaz — asıl operasyonel sınır olan `MAX_REQUEST_BODY_BYTES`
    # açıkça artırılmadığı sürece bu 413 alır (bkz. app/core/config.py
    # dokümantasyonu ve test_body_size_limit_middleware.py'deki override
    # testi).
    fake_service = FakeBackgroundRemovalService()
    client = _client_with_fake_service(fake_service)

    base = _jpeg_bytes()
    exact_size_content = base + b"\x00" * (settings.max_file_size_bytes - len(base))

    filename_padding = MULTIPART_OVERHEAD_ALLOWANCE_BYTES + 5000
    oversized_filename = "urun-" + ("x" * filename_padding) + ".jpg"

    response = client.post(
        "/api/remove-background",
        files={"file": (oversized_filename, exact_size_content, "image/jpeg")},
    )

    assert response.status_code == 413
    assert fake_service.received_content is None


def test_rejects_body_exceeding_max_request_body_bytes_with_413():
    # Toplam gövde `max_request_body_bytes`'i (max_file_size + overhead payı)
    # açıkça aşıyor -> BodySizeLimitMiddleware, multipart parser gövdeyi
    # tamamlamadan devreye girip 413 döndürmeli; route/servis hiç çalışmamalı.
    fake_service = FakeBackgroundRemovalService()
    client = _client_with_fake_service(fake_service)

    grossly_oversized = _jpeg_bytes() + b"\x00" * (settings.max_request_body_bytes + 1)
    response = client.post(
        "/api/remove-background",
        files={"file": ("product.jpg", grossly_oversized, "image/jpeg")},
    )

    assert response.status_code == 413
    assert fake_service.received_content is None


def test_rejects_file_just_over_max_file_size_with_400():
    # Gövde `max_request_body_bytes` eşiğinin altında kalacak kadar küçük bir
    # payla `max_file_size_bytes`'i az miktarda aşıyor -> middleware'i geçer,
    # ama `validate_upload`'ın içerik-boyutu kontrolü bunu 400 ile reddetmeli.
    fake_service = FakeBackgroundRemovalService()
    client = _client_with_fake_service(fake_service)

    just_over_file_limit = _jpeg_bytes() + b"\x00" * (
        settings.max_file_size_bytes - len(_jpeg_bytes()) + 1024
    )
    assert len(just_over_file_limit) < settings.max_request_body_bytes

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.jpg", just_over_file_limit, "image/jpeg")},
    )

    assert response.status_code == 400
    assert "boyut" in response.json()["detail"]
    assert fake_service.received_content is None


def test_accepts_upload_at_exact_max_file_size_boundary():
    # Tam `max_file_size_bytes` boyutunda geçerli bir dosya ne middleware'den
    # (413) ne de içerik-boyutu kontrolünden (400) yanlışlıkla reddedilmemeli.
    fake_service = FakeBackgroundRemovalService(result=b"cutout-png-bytes")
    client = _client_with_fake_service(fake_service)

    base = _jpeg_bytes()
    exact_size_content = base + b"\x00" * (settings.max_file_size_bytes - len(base))
    assert len(exact_size_content) == settings.max_file_size_bytes

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.jpg", exact_size_content, "image/jpeg")},
    )

    assert response.status_code == 200
    assert fake_service.received_content == exact_size_content


def test_returns_429_immediately_when_admission_capacity_is_full():
    # `settings.max_concurrent_inferences` varsayılan olarak 1. İlk isteği
    # bilerek bir thread'de "inference sürüyor" durumunda bekleten sahte bir
    # servisle tutarken, ikinci (eşzamanlı) istek admission middleware
    # tarafından parser/route'a hiç ulaşmadan anında 429 almalı.
    started = threading.Event()
    release = threading.Event()

    class BlockingService:
        def remove(self, image_bytes: bytes) -> bytes:
            started.set()
            release.wait(timeout=5)
            return b"cutout-png-bytes"

    app.dependency_overrides[get_background_removal_service] = lambda: BlockingService()
    app.dependency_overrides[get_current_user] = _signed_in_user
    client = TestClient(app)

    first_response: dict = {}

    def run_first_request() -> None:
        first_response["response"] = client.post(
            "/api/remove-background",
            files={"file": ("product.jpg", _jpeg_bytes(), "image/jpeg")},
        )

    worker = threading.Thread(target=run_first_request)
    worker.start()
    assert started.wait(timeout=5), "ilk istek beklenen sürede işlenmeye başlamadı"

    try:
        second_response = client.post(
            "/api/remove-background",
            files={"file": ("product.jpg", _jpeg_bytes(), "image/jpeg")},
        )
        assert second_response.status_code == 429
    finally:
        release.set()
        worker.join(timeout=5)

    assert first_response["response"].status_code == 200


def test_admission_full_blocks_real_middleware_stack_before_receive_is_ever_called():
    # Gerçek `app` (BodySizeLimitMiddleware + EndpointAdmissionLimiterMiddleware
    # + ExceptionMiddleware + router, hepsi gerçek kayıtlı haliyle) doğrudan bir
    # ASGI çağrısıyla sürülüyor. Kapasite, üretimde kullanılan gerçek
    # `admission_limiter` singleton'ı üzerinden ELLE dolduruluyor (aynı
    # event loop içinde). Doluyken yapılan çağrıda, ham `receive()`'in HİÇ
    # çağrılmadığı sayılarak kanıtlanıyor -- bu, admission middleware'in
    # kendisinden SONRAKİ hiçbir katmanın (body-size middleware, multipart
    # parser, route) devreye girmediğini gösterir.
    fake_service = FakeBackgroundRemovalService()
    app.dependency_overrides[get_background_removal_service] = lambda: fake_service

    receive_call_count = 0

    async def counting_receive():
        nonlocal receive_call_count
        receive_call_count += 1
        return {"type": "http.disconnect"}

    sent_messages: list[dict] = []

    async def fake_send(message):
        sent_messages.append(message)

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/remove-background",
        "headers": [
            (b"content-type", b"multipart/form-data; boundary=doluluk-testi"),
        ],
        "query_string": b"",
        "client": ("testclient", 123),
        "server": ("testserver", 80),
        "http_version": "1.1",
    }

    async def scenario():
        # `admission_limiter.acquire()` izni "mevcut task" kimliğine bağlıyor
        # (bkz. app/services/concurrency.py); bu yüzden gerçek app çağrısı,
        # kapasiteyi elle dolduran bu coroutine'in AYNI task'ında değil, ayrı
        # bir asyncio Task içinde yapılmalı (iki farklı isteği simüle etmek
        # için — bkz. tests/test_concurrency_limiter.py'deki aynı desen).
        async with admission_limiter.acquire():
            await asyncio.create_task(app(scope, counting_receive, fake_send))

    try:
        asyncio.run(scenario())
    finally:
        app.dependency_overrides.clear()

    assert receive_call_count == 0
    starts = [m for m in sent_messages if m["type"] == "http.response.start"]
    assert starts[0]["status"] == 429
    assert fake_service.received_content is None


class _FakeUploadFile:
    def __init__(self, content: bytes, content_type: str):
        self.content_type = content_type
        self._content = content

    async def read(self) -> bytes:
        return self._content


def test_validate_upload_runs_in_threadpool_without_blocking_event_loop(monkeypatch):
    # `validate_upload` senkron ve gerçek decode işi yapıyor
    # (app/api/routes/remove_background.py'de `run_in_threadpool` ile
    # sarmalandı). Burada kontrollü bir "yavaş decoder" simüle ediliyor
    # (gerçek wall-clock zaman harcayan, senkron `time.sleep`) ve aynı event
    # loop'ta paralel çalışan bağımsız bir "heartbeat" coroutine'inin bu süre
    # boyunca DA ilerleyebildiği kanıtlanıyor. Eğer `validate_upload` doğrudan
    # (threadpool'suz) çağrılsaydı, tek thread'li event loop bu senkron
    # `time.sleep` süresince tamamen bloke olur, heartbeat'in `asyncio.sleep`
    # çağrıları o süre boyunca HİÇ ilerlemezdi.
    slow_decode_seconds = 0.3

    def slow_validate_upload(*args, **kwargs):
        time.sleep(slow_decode_seconds)

    monkeypatch.setattr(
        "app.api.routes.remove_background.validate_upload", slow_validate_upload
    )

    heartbeat_ticks: list[float] = []

    async def heartbeat():
        for _ in range(10):
            await asyncio.sleep(0.03)
            heartbeat_ticks.append(time.monotonic())

    async def call_route():
        fake_file = _FakeUploadFile(_jpeg_bytes(), "image/jpeg")
        fake_service = FakeBackgroundRemovalService(result=b"cutout-png-bytes")
        response = await remove_background(
            file=fake_file, service=fake_service, _user=_signed_in_user()
        )
        assert response.status_code == 200

    async def scenario():
        start = time.monotonic()
        await asyncio.gather(call_route(), heartbeat())
        return start

    start_time = asyncio.run(scenario())

    # Heartbeat, senkron decode'un bittiği anı (start + slow_decode_seconds)
    # beklemeden, decode SÜRERKEN birden fazla kez tikleyebilmiş olmalı --
    # event loop bloke olsaydı bu tikler ancak decode bittikten SONRA,
    # hepsi bir anda gerçekleşirdi.
    ticks_during_decode = [
        t for t in heartbeat_ticks if t < start_time + slow_decode_seconds
    ]
    assert len(ticks_during_decode) >= 5, (
        f"event loop bloke olmuş olabilir: decode sürerken sadece "
        f"{len(ticks_during_decode)} heartbeat tik'i kaydedildi (toplam "
        f"{len(heartbeat_ticks)})"
    )
