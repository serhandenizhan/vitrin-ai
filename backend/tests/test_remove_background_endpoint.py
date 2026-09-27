
from app.services.billing.entitlements import Reservation
from app.services.billing.usage import get_usage_quota
from app.services.storage import R2ConfigurationError, get_storage_service
import asyncio
import io

import anyio
import struct
import threading
import time
import uuid
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from app.api.routes.remove_background import get_cutout_queue, remove_background
from app.core.auth import CurrentUser, get_current_user
from app.core.config import (
    DEFAULT_METADATA_BUDGET_BYTES,
    MULTIPART_OVERHEAD_ALLOWANCE_BYTES,
    settings,
)
from app.main import admission_limiter, app
from app.validation import upload as upload_module

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


class FakeCutoutQueue:
    """Kesim kuyruğunun yerine: API artık modeli çağırmıyor, işi SIRAYA koyuyor
    (Faz 7). `received_content` sıraya konan fotoğraftır; `None` ise hiçbir
    iş açılmamıştır (eski "model hiç çağrılmadı" kontrollerinin karşılığı)."""

    def __init__(self, *, full: bool = False, fail_enqueue: Exception | None = None):
        self.received_content: bytes | None = None
        self.enqueued: list[tuple] = []
        self.jobs: dict[tuple, dict] = {}
        self.results: dict[tuple, bytes] = {}
        self.max_jobs = 0 if full else 50
        self.fail_enqueue = fail_enqueue

    async def queued_count(self) -> int:
        return len(self.enqueued)

    async def get_job(self, user_id, request_id):
        return self.jobs.get((str(user_id), str(request_id)))

    async def enqueue(self, user_id, request_id, reservation_id, photo):
        if self.fail_enqueue:
            raise self.fail_enqueue
        self.received_content = photo
        self.enqueued.append((user_id, request_id, reservation_id))
        self.jobs[(str(user_id), str(request_id))] = {"status": "queued"}

    async def result(self, user_id, request_id):
        return self.results.get((str(user_id), str(request_id)))

    async def forget(self, user_id, request_id):
        self.jobs.pop((str(user_id), str(request_id)), None)


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


class FakeQuota:
    """Kotadan muaf kullanıcı: rezervasyon açılmaz, sonuç saklanmaz."""

    async def reserve(self, user_id, request_id):
        return Reservation()

    async def resolve(self, reservation_id, success, result_key=None):
        return True


class FakeStorage:
    """Sonuç deposu: yapılandırılmış sayılır, nesneleri bellekte tutar."""

    def __init__(self, configured: bool = True):
        self.configured = configured
        self.objects: dict[str, bytes] = {}

    def ensure_configured(self) -> None:
        if not self.configured:
            raise R2ConfigurationError("R2 depolama yapılandırılmamış")

    async def upload(self, key: str, content: bytes, content_type: str) -> None:
        self.objects[key] = content

    async def download(self, key: str) -> bytes:
        return self.objects[key]


def _client_with_fake_queue(fake_queue: FakeCutoutQueue) -> TestClient:
    # Bu dosyadaki testler yükleme/doğrulama davranışını sınıyor; oturum
    # zorunluluğu aşağıdaki ayrı testlerde gerçek token doğrulamasıyla sınanıyor.
    app.dependency_overrides[get_cutout_queue] = lambda: fake_queue
    app.dependency_overrides[get_current_user] = _signed_in_user
    app.dependency_overrides[get_usage_quota] = FakeQuota
    app.dependency_overrides[get_storage_service] = FakeStorage
    client = TestClient(app, headers={"Idempotency-Key": str(uuid.uuid4())})
    return client


def teardown_function():
    app.dependency_overrides.clear()


def test_returns_png_for_valid_jpeg_upload():
    fake_queue = FakeCutoutQueue()
    client = _client_with_fake_queue(fake_queue)

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.jpg", _jpeg_bytes(), "image/jpeg")},
    )

    assert response.status_code == 202 and response.json()["status"] == "queued"
    assert fake_queue.received_content == _jpeg_bytes()


def test_rejects_request_without_session_with_401_and_service_not_called(tokens):
    # Faz 4 kararı: giriş yapmadan arka plan kaldırılamaz. RED yolu (ders 15):
    # oturumsuz istek 401 alıyor ve BiRefNet HİÇ çağrılmıyor.
    fake_queue = FakeCutoutQueue()
    app.dependency_overrides[get_cutout_queue] = lambda: fake_queue
    app.dependency_overrides[get_usage_quota] = FakeQuota
    app.dependency_overrides[get_storage_service] = FakeStorage
    client = TestClient(app, headers={"Idempotency-Key": str(uuid.uuid4())})

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.jpg", _jpeg_bytes(), "image/jpeg")},
    )

    assert response.status_code == 401
    assert fake_queue.received_content is None


def test_rejects_invalid_token_with_401_and_service_not_called(tokens):
    fake_queue = FakeCutoutQueue()
    app.dependency_overrides[get_cutout_queue] = lambda: fake_queue
    app.dependency_overrides[get_usage_quota] = FakeQuota
    app.dependency_overrides[get_storage_service] = FakeStorage
    client = TestClient(app, headers={"Idempotency-Key": str(uuid.uuid4())})

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.jpg", _jpeg_bytes(), "image/jpeg")},
        headers=tokens.headers(uuid.uuid4(), expires_in=-3600),
    )

    assert response.status_code == 401
    assert fake_queue.received_content is None


def test_accepts_request_with_valid_token(tokens):
    # KABUL yolu (ders 15): override yok, gerçek JWT doğrulaması.
    fake_queue = FakeCutoutQueue()
    app.dependency_overrides[get_cutout_queue] = lambda: fake_queue
    app.dependency_overrides[get_usage_quota] = FakeQuota
    app.dependency_overrides[get_storage_service] = FakeStorage
    client = TestClient(app, headers={"Idempotency-Key": str(uuid.uuid4())})

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.jpg", _jpeg_bytes(), "image/jpeg")},
        headers=tokens.headers(uuid.uuid4()),
    )

    assert response.status_code == 202 and response.json()["status"] == "queued"
    assert fake_queue.received_content is not None


def test_returns_png_for_valid_webp_upload():
    fake_queue = FakeCutoutQueue()
    client = _client_with_fake_queue(fake_queue)

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.webp", _webp_bytes(), "image/webp")},
    )

    assert response.status_code == 202 and response.json()["status"] == "queued"
    assert fake_queue.received_content == _webp_bytes()


def test_returns_png_for_valid_heic_upload():
    fake_queue = FakeCutoutQueue()
    client = _client_with_fake_queue(fake_queue)

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.heic", _heic_bytes(), "image/heic")},
    )

    assert response.status_code == 202 and response.json()["status"] == "queued"
    assert fake_queue.received_content == _heic_bytes()


def test_rejects_disallowed_content_type_with_400():
    fake_queue = FakeCutoutQueue()
    client = _client_with_fake_queue(fake_queue)

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )

    assert response.status_code == 400
    assert "content-type" in response.json()["detail"]
    assert fake_queue.received_content is None


def test_rejects_corrupted_png_with_valid_signature_without_500():
    # CRC'si bozuk bir PNG: magic-byte/content-type kontrolünü geçer ama
    # `image.verify()` decode sırasında PIL'in `SyntaxError` fırlatmasına yol
    # açar. Bu, 500'e sızmadan 400'e çevrilmeli ve servis hiç çağrılmamalı.
    fake_queue = FakeCutoutQueue()
    client = _client_with_fake_queue(fake_queue)

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.png", _png_with_corrupted_idat_crc(), "image/png")},
    )

    assert response.status_code == 400
    assert "geçerli bir görüntü değil" in response.json()["detail"]
    assert fake_queue.received_content is None


def test_rejects_jpeg_truncated_after_header_without_500():
    # Header'dan hemen sonra kesilmiş bir JPEG: `Image.open()` başlığı
    # ayrıştırır ama `image.verify()` decode sırasında patlar. 500 yerine
    # 400 üretilmeli, servis hiç çağrılmamalı.
    fake_queue = FakeCutoutQueue()
    client = _client_with_fake_queue(fake_queue)

    truncated = _jpeg_bytes()[:30]
    response = client.post(
        "/api/remove-background",
        files={"file": ("product.jpg", truncated, "image/jpeg")},
    )

    assert response.status_code == 400
    assert "geçerli bir görüntü değil" in response.json()["detail"]
    assert fake_queue.received_content is None


def test_rejects_jpeg_truncated_after_sos_entropy_data_without_500():
    # Gerçek SOF/SOS marker'ları sağlam olan ama entropy-coded tarama verisi
    # kesilmiş bir JPEG: bu, `verify()`'in TEK BAŞINA yakalayamadığı bir
    # durumdur (sadece marker yapısına bakar) — yalnızca ayrı bir
    # `Image.open()` + `image.load()` decode aşaması bunu tespit eder. 500
    # yerine 400 üretilmeli, servis hiç çağrılmamalı.
    fake_queue = FakeCutoutQueue()
    client = _client_with_fake_queue(fake_queue)

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
    assert fake_queue.received_content is None


def test_rejects_struct_error_during_decode_with_400_and_service_not_called(monkeypatch):
    # `struct.error`, `validate_upload`'ın dar `except` tuple'ına açıkça
    # eklendi (OSError/ValueError'dan türemeyen kendi başına bir Exception
    # alt sınıfı). Bu, gerçek uçtan uca istekte de 500'e sızmadan 400
    # ürettiğini ve servis hiç çağrılmadığını kanıtlıyor.
    def raise_struct_error(*args, **kwargs):
        raise struct.error("simulated struct.unpack failure during header decode")

    monkeypatch.setattr(upload_module.Image, "open", raise_struct_error)

    fake_queue = FakeCutoutQueue()
    client = _client_with_fake_queue(fake_queue)

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.jpg", _jpeg_bytes(), "image/jpeg")},
    )

    assert response.status_code == 400
    assert "geçerli bir görüntü değil" in response.json()["detail"]
    assert fake_queue.received_content is None


def test_accepts_exact_file_size_with_metadata_within_default_budget():
    # `DEFAULT_METADATA_BUDGET_BYTES` bir GARANTİ değil, varsayılan bir
    # referans bütçesidir (bkz. app/core/config.py). Metadata toplamı bu
    # bütçenin altında kaldığında, tam `max_file_size_bytes` boyutundaki
    # geçerli bir dosya VARSAYILAN `max_request_body_bytes` ile 413 almıyor —
    # gerçek/operasyonel sınır her zaman `MAX_REQUEST_BODY_BYTES`'tir.
    fake_queue = FakeCutoutQueue()
    client = _client_with_fake_queue(fake_queue)

    base = _jpeg_bytes()
    exact_size_content = base + b"\x00" * (settings.max_file_size_bytes - len(base))

    # Bütçenin büyük kısmı dosya ADINA değil form alanı DEĞERİNE konuyor:
    # python-multipart 0.0.27'den beri bir parçanın başlığı ~4 KB ile sınırlı
    # (başlık DoS düzeltmesi, PYSEC-2026-3039) ve daha uzun bir dosya adı
    # 400 alır. Gerçek dosya adları 255 karakteri geçmediği için bu sınır
    # ürünü etkilemiyor; testin ölçtüğü şey toplam metadata bütçesi.
    long_filename = "urun-" + ("x" * 200) + ".jpg"
    extra_field_value = "y" * (DEFAULT_METADATA_BUDGET_BYTES - 1000)
    assert len(long_filename) + len(extra_field_value) < DEFAULT_METADATA_BUDGET_BYTES

    response = client.post(
        "/api/remove-background",
        files={"file": (long_filename, exact_size_content, "image/jpeg")},
        data={"not_used_extra_field": extra_field_value},
    )

    assert response.status_code == 202 and response.json()["status"] == "queued"
    assert fake_queue.received_content == exact_size_content


def test_rejects_oversized_part_header_with_400_without_calling_service():
    # python-multipart'ın parça başlığı sınırı (~4 KB, PYSEC-2026-3039
    # düzeltmesi) aşıldığında istek 500'e değil 400'e düşmeli ve model hiç
    # çalışmamalı. Sınırı kaldıran bir sürüm düşüşü bu testi kırmızı yakar.
    fake_queue = FakeCutoutQueue()
    client = _client_with_fake_queue(fake_queue)

    oversized_filename = "urun-" + ("x" * 8000) + ".jpg"
    response = client.post(
        "/api/remove-background",
        files={"file": (oversized_filename, _jpeg_bytes(), "image/jpeg")},
    )

    assert response.status_code == 400
    assert fake_queue.received_content is None


def test_rejects_exact_file_size_with_metadata_beyond_default_allowance():
    # `DEFAULT_METADATA_BUDGET_BYTES`'in dışında, `MULTIPART_OVERHEAD_ALLOWANCE_BYTES`'i
    # de açıkça aşan bir metadata boyutu: varsayılan `max_request_body_bytes`
    # bunu karşılamaz — asıl operasyonel sınır olan `MAX_REQUEST_BODY_BYTES`
    # açıkça artırılmadığı sürece bu 413 alır (bkz. app/core/config.py
    # dokümantasyonu ve test_body_size_limit_middleware.py'deki override
    # testi).
    fake_queue = FakeCutoutQueue()
    client = _client_with_fake_queue(fake_queue)

    base = _jpeg_bytes()
    exact_size_content = base + b"\x00" * (settings.max_file_size_bytes - len(base))

    filename_padding = MULTIPART_OVERHEAD_ALLOWANCE_BYTES + 5000
    oversized_filename = "urun-" + ("x" * filename_padding) + ".jpg"

    response = client.post(
        "/api/remove-background",
        files={"file": (oversized_filename, exact_size_content, "image/jpeg")},
    )

    assert response.status_code == 413
    assert fake_queue.received_content is None


def test_rejects_body_exceeding_max_request_body_bytes_with_413():
    # Toplam gövde `max_request_body_bytes`'i (max_file_size + overhead payı)
    # açıkça aşıyor -> BodySizeLimitMiddleware, multipart parser gövdeyi
    # tamamlamadan devreye girip 413 döndürmeli; route/servis hiç çalışmamalı.
    fake_queue = FakeCutoutQueue()
    client = _client_with_fake_queue(fake_queue)

    grossly_oversized = _jpeg_bytes() + b"\x00" * (settings.max_request_body_bytes + 1)
    response = client.post(
        "/api/remove-background",
        files={"file": ("product.jpg", grossly_oversized, "image/jpeg")},
    )

    assert response.status_code == 413
    assert fake_queue.received_content is None


def test_rejects_file_just_over_max_file_size_with_400():
    # Gövde `max_request_body_bytes` eşiğinin altında kalacak kadar küçük bir
    # payla `max_file_size_bytes`'i az miktarda aşıyor -> middleware'i geçer,
    # ama `validate_upload`'ın içerik-boyutu kontrolü bunu 400 ile reddetmeli.
    fake_queue = FakeCutoutQueue()
    client = _client_with_fake_queue(fake_queue)

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
    assert fake_queue.received_content is None


def test_accepts_upload_at_exact_max_file_size_boundary():
    # Tam `max_file_size_bytes` boyutunda geçerli bir dosya ne middleware'den
    # (413) ne de içerik-boyutu kontrolünden (400) yanlışlıkla reddedilmemeli.
    fake_queue = FakeCutoutQueue()
    client = _client_with_fake_queue(fake_queue)

    base = _jpeg_bytes()
    exact_size_content = base + b"\x00" * (settings.max_file_size_bytes - len(base))
    assert len(exact_size_content) == settings.max_file_size_bytes

    response = client.post(
        "/api/remove-background",
        files={"file": ("product.jpg", exact_size_content, "image/jpeg")},
    )

    assert response.status_code == 202 and response.json()["status"] == "queued"
    assert fake_queue.received_content == exact_size_content


def test_returns_429_immediately_when_admission_capacity_is_full(monkeypatch):
    # Faz 7: kabul sınırlayıcısı artık aynı anda AYRIŞTIRILAN YÜKLEME sayısını
    # tutuyor (`MAX_CONCURRENT_UPLOADS`, varsayılan 4); kesim işçide. Kapasite
    # testte 1'e indiriliyor ve ilk istek sıraya koyma adımında bekletiliyor;
    # ikinci (eşzamanlı) istek parser/route'a hiç ulaşmadan anında 429 almalı.
    monkeypatch.setattr(admission_limiter._limiter, "total_tokens", 1)
    started = threading.Event()
    release = threading.Event()

    class BlockingQueue(FakeCutoutQueue):
        async def enqueue(self, user_id, request_id, reservation_id, photo):
            started.set()
            await anyio.to_thread.run_sync(release.wait, 5)
            await super().enqueue(user_id, request_id, reservation_id, photo)

    blocking_queue = BlockingQueue()
    app.dependency_overrides[get_cutout_queue] = lambda: blocking_queue
    app.dependency_overrides[get_current_user] = _signed_in_user
    app.dependency_overrides[get_usage_quota] = FakeQuota
    app.dependency_overrides[get_storage_service] = FakeStorage
    client = TestClient(app, headers={"Idempotency-Key": str(uuid.uuid4())})

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

    assert first_response["response"].status_code == 202


def test_admission_full_blocks_real_middleware_stack_before_receive_is_ever_called(monkeypatch):
    # Gerçek `app` (BodySizeLimitMiddleware + EndpointAdmissionLimiterMiddleware
    # + ExceptionMiddleware + router, hepsi gerçek kayıtlı haliyle) doğrudan bir
    # ASGI çağrısıyla sürülüyor. Kapasite, üretimde kullanılan gerçek
    # `admission_limiter` singleton'ı üzerinden ELLE dolduruluyor (aynı
    # event loop içinde). Doluyken yapılan çağrıda, ham `receive()`'in HİÇ
    # çağrılmadığı sayılarak kanıtlanıyor -- bu, admission middleware'in
    # kendisinden SONRAKİ hiçbir katmanın (body-size middleware, multipart
    # parser, route) devreye girmediğini gösterir.
    fake_queue = FakeCutoutQueue()
    app.dependency_overrides[get_cutout_queue] = lambda: fake_queue
    # Varsayılan yükleme kapasitesi 4; tek izinle doldurulabilsin diye 1.
    monkeypatch.setattr(admission_limiter._limiter, "total_tokens", 1)

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
    assert fake_queue.received_content is None


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
        fake_queue = FakeCutoutQueue()
        response = await remove_background(
            quota=FakeQuota(), request_id=uuid.uuid4(), storage=FakeStorage(),
            file=fake_file, queue=fake_queue, _user=_signed_in_user()
        )
        assert response.status_code == 202

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


class RecordingQuota:
    """Gerçek sözleşmeyi taklit eder: bir kredi, saklanan bir sonuç."""

    def __init__(self, reservation: Reservation):
        self.reservation = reservation
        self.resolved: list[tuple[bool, str | None]] = []
        self.reserved: list = []

    async def reserve(self, user_id, request_id):
        self.reserved.append(request_id)
        return self.reservation

    async def resolve(self, reservation_id, success, result_key=None):
        self.resolved.append((success, result_key))
        return True


def _post_with(queue, quota, storage=None, key=None):
    app.dependency_overrides[get_cutout_queue] = lambda: queue
    app.dependency_overrides[get_current_user] = _signed_in_user
    app.dependency_overrides[get_usage_quota] = lambda: quota
    app.dependency_overrides[get_storage_service] = lambda: storage or FakeStorage()
    try:
        with TestClient(app) as client:
            return client.post(
                "/api/remove-background",
                files={"file": ("a.jpg", _jpeg_bytes(), "image/jpeg")},
                headers={"Idempotency-Key": key or str(uuid.uuid4())},
            )
    finally:
        app.dependency_overrides.clear()


def test_api_only_reserves_the_credit_and_queues_the_job():
    # Faz 7: kesim, sonucun saklanması ve kredinin TÜKETİLMESİ işçinin işi
    # (tests/test_cutout_worker.py). API krediyi yalnız AYIRIR; ne tüketir ne
    # iade eder — iş sıraya girip sürüyor.
    fake_queue = FakeCutoutQueue()
    reservation_id = uuid.uuid4()
    quota = RecordingQuota(Reservation(id=reservation_id))
    key = str(uuid.uuid4())

    response = _post_with(fake_queue, quota, key=key)

    assert response.status_code == 202
    assert response.json() == {"job_id": key, "status": "queued"}
    assert fake_queue.enqueued[0][2] == reservation_id
    assert quota.resolved == []


def test_job_that_cannot_enter_the_queue_releases_the_credit():
    from redis.exceptions import ConnectionError as RedisConnectionError

    fake_queue = FakeCutoutQueue(fail_enqueue=RedisConnectionError("redis kapalı"))
    quota = RecordingQuota(Reservation(id=uuid.uuid4()))

    response = _post_with(fake_queue, quota)

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "queue_unavailable"
    assert response.json()["detail"]["retry_safe"] is True
    assert quota.resolved == [(False, None)]


def test_full_queue_answers_busy_without_touching_the_credit():
    fake_queue = FakeCutoutQueue(full=True)
    quota = RecordingQuota(Reservation(id=uuid.uuid4()))

    response = _post_with(fake_queue, quota)

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["code"] == "queue_busy" and detail["retry_safe"] is True
    assert response.headers["Retry-After"] == "30"
    # Dolu kuyrukta kredi hiç ayrılmadı (ayrılıp hemen iade edilmesi boşuna olurdu).
    assert quota.reserved == []
    assert fake_queue.received_content is None


def test_repeat_with_the_same_key_sees_the_queued_job_instead_of_a_second_one():
    fake_queue = FakeCutoutQueue()
    quota = RecordingQuota(Reservation(id=uuid.uuid4()))
    key = str(uuid.uuid4())
    user = _signed_in_user()
    fake_queue.jobs[(str(user.id), key)] = {"status": "processing"}
    app.dependency_overrides[get_current_user] = lambda: user

    app.dependency_overrides[get_cutout_queue] = lambda: fake_queue
    app.dependency_overrides[get_usage_quota] = lambda: quota
    app.dependency_overrides[get_storage_service] = FakeStorage
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/remove-background",
                files={"file": ("a.jpg", _jpeg_bytes(), "image/jpeg")},
                headers={"Idempotency-Key": key},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 202 and response.json()["status"] == "processing"
    assert fake_queue.enqueued == [] and quota.reserved == []


def test_stored_result_is_returned_without_running_inference_again():
    fake_queue = FakeCutoutQueue()
    storage = FakeStorage()
    storage.objects["results/onceki.png"] = b"saklanan-sonuc"
    quota = RecordingQuota(Reservation(result_key="results/onceki.png"))
    app.dependency_overrides[get_cutout_queue] = lambda: fake_queue
    app.dependency_overrides[get_current_user] = _signed_in_user
    app.dependency_overrides[get_usage_quota] = lambda: quota
    app.dependency_overrides[get_storage_service] = lambda: storage
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/remove-background",
                files={"file": ("a.jpg", _jpeg_bytes(), "image/jpeg")},
                headers={"Idempotency-Key": str(uuid.uuid4())},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.content == b"saklanan-sonuc"
    # Inference HİÇ çalışmadı ve ikinci bir kredi hareketi olmadı.
    assert fake_queue.received_content is None
    assert quota.resolved == []


def test_missing_result_storage_stops_the_job_before_inference():
    # Belirsiz sonucu yeniden inference'a bağlamak yerine açıkça durur.
    fake_queue = FakeCutoutQueue()
    quota = RecordingQuota(Reservation(id=uuid.uuid4()))
    app.dependency_overrides[get_cutout_queue] = lambda: fake_queue
    app.dependency_overrides[get_current_user] = _signed_in_user
    app.dependency_overrides[get_usage_quota] = lambda: quota
    app.dependency_overrides[get_storage_service] = lambda: FakeStorage(configured=False)
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/remove-background",
                files={"file": ("a.jpg", _jpeg_bytes(), "image/jpeg")},
                headers={"Idempotency-Key": str(uuid.uuid4())},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "result_storage_unavailable"
    # Güvenli tekrar: hiç kredi tüketilmedi, istemci yeni anahtara geçebilir.
    assert response.json()["detail"]["retry_safe"] is True
    assert fake_queue.received_content is None and quota.resolved == []


