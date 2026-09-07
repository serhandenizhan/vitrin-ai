from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

from app.core.config import settings
from app.services.background_removal import BackgroundRemovalService
from app.validation.upload import UploadValidationError, validate_upload

router = APIRouter()


def get_background_removal_service() -> BackgroundRemovalService:
    return BackgroundRemovalService(model_name=settings.rembg_model_name)


@router.post("/api/remove-background")
async def remove_background(
    file: UploadFile = File(...),
    service: BackgroundRemovalService = Depends(get_background_removal_service),
) -> Response:
    # Multipart gövdesi zaten tamamen alınmış olsa da (Starlette bunu bir
    # SpooledTemporaryFile'a yazar), `file.size` burada ek bir I/O olmadan
    # kullanılabilir — boyut sınırını aşan dosyaları belleğe `bytes` olarak
    # tamamen okumadan (ki bu, BiRefNet'in zaten sınırlı olan RAM bütçesini
    # gereksiz yere zorlar) erkenden reddetmek için kullanılır.
    max_size_bytes = settings.max_file_size_mb * 1024 * 1024
    if file.size is not None and file.size > max_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dosya boyutu {settings.max_file_size_mb}MB sınırını aşıyor.",
        )

    content = await file.read()

    try:
        validate_upload(
            content,
            declared_content_type=file.content_type or "",
            max_file_size_mb=settings.max_file_size_mb,
            allowed_content_types=settings.allowed_content_types,
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
