from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

from app.core.config import settings
from app.services.background_removal import BackgroundRemovalService
from app.validation.upload import UploadValidationError, validate_upload

# `app/main.py`'deki `EndpointAdmissionLimiterMiddleware` kaydı da aynı path'i
# kullanıyor — iki yerde aynı string'in birbirinden bağımsız yazılıp
# çelişmesini önlemek için burada tek bir sabit olarak tutuluyor.
ROUTE_PATH = "/api/remove-background"

router = APIRouter()


def get_background_removal_service() -> BackgroundRemovalService:
    return BackgroundRemovalService(model_name=settings.rembg_model_name)


@router.post(ROUTE_PATH)
async def remove_background(
    file: UploadFile = File(...),
    service: BackgroundRemovalService = Depends(get_background_removal_service),
) -> Response:
    # Toplam istek gövdesi boyutu sınırı `BodySizeLimitMiddleware` tarafından,
    # eşzamanlılık kapasitesi ise `EndpointAdmissionLimiterMiddleware`
    # tarafından multipart parse edilmeden ÖNCE zaten uygulanıyor (bkz.
    # app/middleware/ ve app/main.py). Buradaki `content = await file.read()`
    # noktasına ulaşıldığında hem gövde boyutu sınırının altında olduğu hem de
    # bu isteğin kapasite dahilinde kabul edildiği garanti edilmiş durumda;
    # kalan iş `validate_upload`'ın dosya içeriğine özgü kontrolleridir
    # (declared/detected content-type, tam dosya boyutu, piksel sınırı vb.).
    content = await file.read()

    # `validate_upload` senkron ve içinde gerçek görüntü decode'u (`image.load()`
    # dahil, bkz. app/validation/upload.py) yapıyor — büyük/karmaşık bir
    # görüntüde bu, ölçülebilir CPU süresi alabilir. Doğrudan `await`lenmeden
    # çağrılırsa `service.remove` ile aynı sorunu yaratır: bu süre boyunca
    # event loop'u bloke eder, aynı worker'daki başka hiçbir isteğe (health
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

    # `service.remove` senkron ve CPU'da ~15sn (ilk çağrıda ~30-35sn) süren
    # bir BiRefNet inference çağrısı yapıyor (bkz. kök CLAUDE.md "Bilinen
    # kısıt"). Doğrudan `await`lenmeden çağrılırsa bu süre boyunca asyncio
    # event loop'unu tamamen bloke eder ve tek worker'lı bir süreçte aynı anda
    # başka hiçbir isteğe (health check dahil) cevap verilemez. `run_in_threadpool`
    # ile ayrı bir thread'e taşınır.
    result_bytes = await run_in_threadpool(service.remove, content)

    return Response(content=result_bytes, media_type="image/png")
