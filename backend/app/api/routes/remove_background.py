import logging
import uuid
import anyio
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import Header
from app.services.billing.usage import UsageQuota, get_usage_quota
from app.services.billing.errors import billing_error
from app.services.billing.limits import limit_user_read
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, get_current_user
from app.core.config import settings
from app.core.db import get_db_session
from app.services.billing.db import one
from app.services.cutout_queue import DONE, FAILED, PROCESSING, QUEUED, CutoutQueue, QueueFull
from app.services.storage import (
    R2ConfigurationError,
    R2StorageService,
    get_storage_service,
)
from app.validation.upload import UploadValidationError, validate_upload

logger = logging.getLogger(__name__)

STORAGE_ERRORS = (BotoCoreError, ClientError, R2ConfigurationError)

# `app/main.py`'deki `EndpointAdmissionLimiterMiddleware` kaydı da aynı path'i
# kullanıyor — iki yerde aynı string'in birbirinden bağımsız yazılıp
# çelişmesini önlemek için burada tek bir sabit olarak tutuluyor.
ROUTE_PATH = "/api/remove-background"

router = APIRouter()


# Süreç başına tek kuyruk nesnesi; Redis bağlantısını olay döngüsü başına
# kendisi açar. Testler `app.dependency_overrides` ile değiştirir.
_queue = CutoutQueue(
    settings.redis_url,
    prefix=settings.cutout_queue_prefix,
    max_jobs=settings.cutout_queue_max_jobs,
)


def get_cutout_queue() -> CutoutQueue:
    return _queue


async def _report_if_unhealthy(queue: CutoutQueue) -> None:
    """İş kuyruğa girdikten sonra işçi yoksa/takılmışsa günlüğe `error` yazar.

    Müşteri tam şu an sırada bekliyor; işçi hiç çalışmıyorsa hiçbir yerde
    görünmüyordu. Yanıtı ASLA etkilemez: iş zaten kuyrukta, bu yalnız bir
    gözlem. Aynı durum 10 dakikada bir yazılır (`report_unhealthy`).
    """
    try:
        await queue.report_unhealthy(await queue.stats(), "yükleme")
    except Exception:  # noqa: BLE001 — gözlem, isteği düşürmemeli
        logger.warning("Kesim kuyruğu sağlığı okunamadı", exc_info=True)


@router.post(ROUTE_PATH)
async def remove_background(
    file: UploadFile = File(...),
    queue: CutoutQueue = Depends(get_cutout_queue),
    # Faz 4 ürün kararı (Kaan, 12.09.2026): giriş yapmadan arka plan
    # kaldırılamaz. Kimlik burada kullanılmıyor ama bağımlılık token'ı
    # doğruluyor; geçersizse 401 ile iş kuyruğa hiç girmiyor.
    #
    # `EarlyAuthenticationMiddleware` bu dependency ile ayni token'i multipart
    # govde okunmadan once dogrular ve kullaniciyi `request.state`e koyar.
    # Buradaki dependency o sonucu yeniden kullanir; middleware atlanarak route
    # test edilse bile auth zorunlulugu yerinde kalir.
    _user: CurrentUser = Depends(get_current_user),
    request_id: uuid.UUID = Header(..., alias="Idempotency-Key"),
    quota: UsageQuota = Depends(get_usage_quota),
    storage: R2StorageService = Depends(get_storage_service),
) -> Response:
    # Toplam istek gövdesi boyutu sınırı `BodySizeLimitMiddleware` tarafından,
    # aynı anda ayrıştırılan yükleme sayısı ise `EndpointAdmissionLimiterMiddleware`
    # (`MAX_CONCURRENT_UPLOADS`) tarafından multipart parse edilmeden ÖNCE
    # zaten uygulanıyor (bkz.
    # app/middleware/ ve app/main.py). Buradaki `content = await file.read()`
    # noktasına ulaşıldığında hem gövde boyutu sınırının altında olduğu hem de
    # bu isteğin kapasite dahilinde kabul edildiği garanti edilmiş durumda;
    # kalan iş `validate_upload`'ın dosya içeriğine özgü kontrolleridir
    # (declared/detected content-type, tam dosya boyutu, piksel sınırı vb.).
    content = await file.read()

    # `validate_upload` senkron ve içinde gerçek görüntü decode'u (`image.load()`
    # dahil, bkz. app/validation/upload.py) yapıyor — büyük/karmaşık bir
    # görüntüde bu, ölçülebilir CPU süresi alabilir. Doğrudan `await`lenmeden
    # çağrılırsa bu süre boyunca event loop'u bloke eder, aynı worker'daki başka hiçbir isteğe (health
    # check dahil) cevap verilemez. `run_in_threadpool` ile ayrı bir thread'e
    # taşınır — bu, admission middleware'in tuttuğu kapasite izninin süresini
    # etkilemez, sadece decode işini event loop dışına çıkarır.
    try:
        await run_in_threadpool(
            validate_upload,
            content,
            declared_content_type=file.content_type or "",
            max_file_size_mb=settings.max_file_size_mb,
            allowed_content_types=settings.allowed_content_types,
            max_image_pixels=settings.max_image_pixels,
        )
    except UploadValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=exc.reason
        ) from exc

    # Faz 7: kesim BU SÜREÇTE ÇALIŞMAZ. İş kuyruğa girer, ayrı bir işçi
    # (`app/workers/cutout.py`) modeli çalıştırır; istemci sonucu
    # `GET .../jobs/{id}` ile alır. Bu yüzden API süreci modeli hiç yüklemez.
    #
    # Aynı anahtarla gelen tekrar (çift tıklama, ağ koptu): iş zaten
    # sıradaysa/bittiyse onu gösterir; ikinci bir iş açılmaz.
    existing = await _safe_get_job(queue, _user.id, request_id)
    if existing is not None:
        if existing["status"] in (QUEUED, PROCESSING):
            return _job_response(request_id, existing)
        if existing["status"] == DONE:
            result = await queue.result(_user.id, request_id)
            if result is not None:
                return Response(content=result, media_type="image/png")
        # Başarısız iş: kredisi iade edildi; aynı anahtarla temiz bir deneme.
        await queue.forget(_user.id, request_id)

    # Sonuç deposu kullanılamıyorsa iş HİÇ başlamaz. Başlatıp sonucu
    # saklayamamak, kredisi harcanmış ama sonucu geri alınamayan bir işlem
    # bırakırdı; belirsiz bir sonucu yeniden inference'a bağlamak da aynı
    # krediyi ikinci kez yakma riski demek.
    try:
        storage.ensure_configured()
    except R2ConfigurationError as exc:
        raise billing_error(
            "result_storage_unavailable",
            "Sonuç deposu şu anda kullanılamıyor; işlem başlatılmadı.",
            503,
            retry_safe=True,
        ) from exc

    # Kuyruk dolu mu? Kredi AYRILMADAN önce bakılır: dolu kuyrukta ayrılıp
    # hemen iade edilen kredi gereksiz bir hareket olurdu. Yalnız aşırı
    # yoğunlukta görülür (fotoğraflar Redis belleğinde bekliyor).
    try:
        if await queue.queued_count() >= queue.max_jobs:
            raise _queue_busy()
    except RedisError as exc:
        raise _queue_unavailable() from exc

    try:
        reservation = await quota.reserve(_user.id, request_id)
    except HTTPException as exc:
        # Aynı anahtarla iki istek yarıştı (çift tıklama): ikincisi ilkinin
        # kuyruktaki işini görür, hata değil.
        if isinstance(exc.detail, dict) and exc.detail.get("code") == "request_in_progress":
            job = await _safe_get_job(queue, _user.id, request_id)
            if job is not None:
                return _job_response(request_id, job)
        raise
    if reservation.result_key:
        # Aynı iş daha önce başarıyla bitti ve yanıtı istemciye ulaşmamış.
        # Inference ÇALIŞTIRILMAZ, saklanan PNG döner, ikinci kredi harcanmaz.
        return await _stored_png(storage, reservation.result_key)

    try:
        await queue.enqueue(_user.id, request_id, reservation.id, content)
    except (QueueFull, RedisError) as exc:
        # İş kuyruğa giremedi: ayrılan kredi hemen iade edilir.
        with anyio.CancelScope(shield=True):
            await quota.resolve(reservation.id, False)
        raise (_queue_busy() if isinstance(exc, QueueFull) else _queue_unavailable()) from exc
    await _report_if_unhealthy(queue)
    return JSONResponse({"job_id": str(request_id), "status": QUEUED}, status_code=202)


@router.get(ROUTE_PATH + "/jobs/{request_id}", dependencies=[Depends(limit_user_read)])
async def cutout_job(
    request_id: uuid.UUID,
    _user: CurrentUser = Depends(get_current_user),
    queue: CutoutQueue = Depends(get_cutout_queue),
    storage: R2StorageService = Depends(get_storage_service),
    db: AsyncSession = Depends(get_db_session),
) -> Response:
    """İşin durumu; bittiyse PNG. Kimlik `(oturumdaki kullanıcı, anahtar)`:
    başka bir kullanıcının anahtarı burada hiçbir kayda karşılık gelmez (404)."""
    job = await _safe_get_job(queue, _user.id, request_id)
    if job is None:
        # Kuyruk kaydının ömrü dolmuş olabilir; iş başarıyla bittiyse sonucu
        # 24 saat R2'de (idempotency kopyası) durur.
        row = await one(
            db,
            """SELECT result_r2_key FROM usage_reservations WHERE user_id=:uid AND request_id=:rid
            AND status='consumed' AND result_r2_key IS NOT NULL AND result_expires_at>now()""",
            uid=_user.id,
            rid=request_id,
        )
        await db.commit()
        if row:
            return await _stored_png(storage, row["result_r2_key"])
        raise billing_error("job_not_found", "İşlem bulunamadı.", 404)
    if job["status"] == DONE:
        result = await queue.result(_user.id, request_id)
        if result is not None:
            return Response(content=result, media_type="image/png")
        if job.get("result_key"):
            return await _stored_png(storage, job["result_key"])
        raise billing_error(
            "request_already_processed",
            "Bu işlemin sonucu artık saklanmıyor; yeni bir işlem başlatın.",
        )
    if job["status"] == FAILED:
        code = job.get("error_code") or "processing_failed"
        message, status_code = FAILURE_MESSAGES.get(code, FAILURE_MESSAGES["processing_failed"])
        raise billing_error(code, message, status_code, retry_safe=job.get("retry_safe") == "1")
    return _job_response(request_id, job)


#: İşçinin iş kaydına yazdığı hata kodları → kullanıcıya gösterilen mesaj.
#: Hepsinde kredi iade edilmiş durumda (işçi önce iade eder, sonra yazar).
FAILURE_MESSAGES = {
    "processing_failed": ("Arka plan kaldırılamadı; krediniz iade edildi. Yeniden deneyin.", 422),
    "job_expired": ("İşlem zaman aşımına uğradı; krediniz iade edildi. Yeniden deneyin.", 503),
    "worker_lost": ("İşlem yarıda kaldı; krediniz iade edildi. Yeniden deneyin.", 503),
    "result_storage_unavailable": ("Sonuç saklanamadı; krediniz iade edildi, yeniden deneyin.", 503),
    "reservation_released": ("İşlem süresi doldu; kredi iade edildi. Yeniden deneyin.", 503),
}


def _job_response(request_id, job: dict) -> JSONResponse:
    # Sıra numarası BİLİNÇLİ OLARAK dönülmez (Serhan: yoğunluk müşteriye
    # hissettirilmesin); istemci yalnız "sürüyor" bilgisini alır.
    status_value = PROCESSING if job["status"] == PROCESSING else QUEUED
    return JSONResponse({"job_id": str(request_id), "status": status_value}, status_code=202)


async def _safe_get_job(queue: CutoutQueue, user_id, request_id) -> dict | None:
    try:
        return await queue.get_job(user_id, request_id)
    except RedisError as exc:
        raise _queue_unavailable() from exc


async def _stored_png(storage: R2StorageService, key: str) -> Response:
    try:
        stored = await storage.download(key)
    except STORAGE_ERRORS as exc:
        logger.warning("Saklanan sonuç okunamadı: %s", key)
        raise billing_error(
            "result_storage_unavailable",
            "Önceki sonuç şu anda okunamıyor; birazdan tekrar deneyin.",
            503,
        ) from exc
    return Response(content=stored, media_type="image/png")


def _queue_busy():
    return billing_error(
        "queue_busy",
        "Şu anda çok yoğunuz; birkaç dakika sonra tekrar deneyin.",
        503,
        retry=30,
        retry_safe=False,
    )


def _queue_unavailable():
    return billing_error(
        "queue_unavailable",
        "Kuyruğa şu anda ulaşılamıyor; birazdan tekrar deneyin.",
        503,
        retry_safe=False,
    )
