from fastapi import FastAPI

from app.api.routes.health import router as health_router
from app.api.routes.remove_background import ROUTE_PATH
from app.api.routes.remove_background import router as remove_background_router
from app.core.config import settings
from app.middleware.admission_limiter import EndpointAdmissionLimiterMiddleware
from app.middleware.body_size_limit import BodySizeLimitMiddleware
from app.services.concurrency import InferenceCapacityLimiter

app = FastAPI(title="vitrin-ai backend")

# Modül seviyesinde tek bir örnek: `EndpointAdmissionLimiterMiddleware`'e
# enjekte edilir (Starlette middleware örneğini gecikmeli/gizli oluşturduğu
# için bu, testlerin üretimde çalışan gerçek limiter'a doğrudan erişebilmesinin
# tek yoludur — bkz. tests/test_remove_background_endpoint.py).
admission_limiter = InferenceCapacityLimiter(settings.max_concurrent_inferences)

# Starlette `add_middleware`, her çağrıda listenin BAŞINA ekler (bkz.
# `Starlette.add_middleware` kaynağı) — yani SONRA eklenen middleware daha
# DIŞTA/önce çalışır. Bu yüzden admission middleware'i (parser'dan önce
# çalışması gereken) body-size middleware'den SONRA ekliyoruz; böylece
# çağrı sırası: EndpointAdmissionLimiterMiddleware -> BodySizeLimitMiddleware
# -> ExceptionMiddleware -> router/parser olur.
app.add_middleware(
    BodySizeLimitMiddleware, max_body_bytes=settings.max_request_body_bytes
)
app.add_middleware(
    EndpointAdmissionLimiterMiddleware,
    limiter=admission_limiter,
    path=ROUTE_PATH,
)
app.include_router(remove_background_router)
app.include_router(health_router)
