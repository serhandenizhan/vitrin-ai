from fastapi import APIRouter

router = APIRouter()


@router.get("/api/health")
async def health() -> dict[str, str]:
    # Bilinçli olarak sadece süreç canlılığını doğrular, model yüklü mü diye
    # bakmaz: model ilk çağrıda gecikmeli yükleniyor (bkz.
    # app/services/background_removal.py `_get_session`), health check'in
    # bunu tetiklemesi ilk isteği ~30-35sn'lik bir sağlık kontrolüne çevirirdi.
    return {"status": "ok"}
