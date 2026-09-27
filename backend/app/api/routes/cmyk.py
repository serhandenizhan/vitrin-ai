"""CMYK dönüşümüne izin (Next.js `/api/cmyk` vekili sorar).

Dönüşümün kendisi Next.js sunucusunda (`sharp`) yapılıyor; orada ne ortak bir
hız sınırı sayacı (Redis) ne de backend'deki JWT doğrulaması var. Bu uç ikisini
tek yerde veriyor: oturum geçerliyse ve kullanıcı sınırın altındaysa 204.
Next rotası isteğin gövdesini okumadan ÖNCE buraya sorar; oturumsuz ya da
sınırı aşmış bir istek 40 MB'lık dosyayı sunucuya okutamaz (/cso incelemesi,
27.09.2026: uç oturumsuz ve sınırsızdı).
"""

from fastapi import APIRouter, Depends, Response, status

from app.services.billing.limits import limit_cmyk

router = APIRouter()


@router.post(
    "/api/cmyk/permit",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(limit_cmyk)],
)
async def cmyk_permit() -> Response:
    return Response(status_code=status.HTTP_204_NO_CONTENT)
