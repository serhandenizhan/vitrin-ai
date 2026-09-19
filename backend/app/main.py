from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.admin import router as admin_router
from app.api.routes.billing import router as billing_router
from app.api.routes.account import router as account_router
from app.api.routes.backgrounds import router as backgrounds_router
from app.api.routes.health import router as health_router
from app.api.routes.projects import router as projects_router
from app.api.routes.support import router as support_router
from app.api.routes.remove_background import ROUTE_PATH
from app.api.routes.remove_background import router as remove_background_router
from app.core.config import settings
from app.core.db import engine
from app.middleware.admission_limiter import EndpointAdmissionLimiterMiddleware
from app.middleware.body_size_limit import BodySizeLimitMiddleware
from app.middleware.early_auth import EarlyAuthenticationMiddleware
from app.middleware.upload_rate_limit import UploadRateLimitMiddleware
from app.services.concurrency import InferenceCapacityLimiter
from app.services.rate_limit import RequestRateLimiter
from app.services.storage import R2ConfigurationError
from app.services.billing.limits import (
    admin_limiter,
    checkout_limiter,
    public_limiter,
    support_limiter,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Uygulama kapanırken process başına tek olan async engine'in connection
    # pool'unu düzgünce serbest bırak (bkz. app/core/db.py).
    yield
    await engine.dispose()
    await upload_ip_limiter.aclose()
    await upload_user_limiter.aclose()
    await checkout_limiter.aclose()
    await public_limiter.aclose()
    await admin_limiter.aclose()
    await support_limiter.aclose()


app = FastAPI(title="vitrin-ai backend", lifespan=lifespan)


@app.exception_handler(R2ConfigurationError)
async def r2_configuration_error_handler(_, exc: R2ConfigurationError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc)})


# Modül seviyesinde tek bir örnek: `EndpointAdmissionLimiterMiddleware`'e
# enjekte edilir (Starlette middleware örneğini gecikmeli/gizli oluşturduğu
# için bu, testlerin üretimde çalışan gerçek limiter'a doğrudan erişebilmesinin
# tek yoludur — bkz. tests/test_remove_background_endpoint.py).
admission_limiter = InferenceCapacityLimiter(settings.max_concurrent_inferences)
# Redis tabanli, dagitik hiz sinirlayicilar — birden fazla worker/instance
# ayni Redis'e baglaninca ayni sayaci paylasir (bkz. app/services/rate_limit.py;
# baglanti nesnesi calisan event loop basina tembel olusturulur).
upload_ip_limiter = RequestRateLimiter(
    settings.upload_ip_rate_limit_requests,
    settings.upload_rate_limit_window_seconds,
    redis_url=settings.redis_url,
)
upload_user_limiter = RequestRateLimiter(
    settings.upload_user_rate_limit_requests,
    settings.upload_rate_limit_window_seconds,
    redis_url=settings.redis_url,
)

# Starlette `add_middleware`, her çağrıda listenin BAŞINA ekler (bkz.
# `Starlette.add_middleware` kaynağı) — yani SONRA eklenen middleware daha
# DIŞTA/önce çalışır. Bu yüzden admission middleware'i (parser'dan önce
# çalışması gereken) body-size middleware'den SONRA ekliyoruz; böylece
# çağrı sırası: EndpointAdmissionLimiterMiddleware -> BodySizeLimitMiddleware
# -> ExceptionMiddleware -> router/parser olur.
app.add_middleware(
    BodySizeLimitMiddleware, max_body_bytes=settings.max_request_body_bytes
)
# Kimlik, multipart parser `receive()` ile ilk bayti okumadan once dogrulanir.
# Admission katmani bunun disinda kalir: kapasite doluyken istek, JWT dogrulama
# maliyetine bile girmeden 429 alir; yer varken auth yine govdeden once calisir.
app.add_middleware(
    EarlyAuthenticationMiddleware,
    dependency_overrides_provider=app,
    user_limiter=upload_user_limiter,
    unauthenticated_limiter=upload_ip_limiter,
)
app.add_middleware(
    EndpointAdmissionLimiterMiddleware,
    limiter=admission_limiter,
    path=ROUTE_PATH,
)
# IP hizi JWT/JWKS maliyetinden de once sinirlanir. Kullanici hizi yukaridaki
# early-auth katmaninda, dogrulanmis `sub` ile ve yine govde okunmadan uygulanir.
app.add_middleware(UploadRateLimitMiddleware, limiter=upload_ip_limiter)
# CORS en dista kalir ve OPTIONS isteklerini auth katmanina sokmadan yanitlar.
# CORS EN DIŞTA (en son eklenen): tarayıcının OPTIONS ön kontrol isteği
# gövdesiz geliyor ve admission/body-size katmanlarına hiç girmeden
# yanıtlanmalı. Asıl istemci bugün Next.js vekili (sunucudan sunucuya, CORS
# gerektirmez); bu katman backend'e tarayıcıdan doğrudan erişilen her durum
# için (ayrı alan adı, Faz 8 mobil web görünümleri) sınırı baştan çiziyor.
#
# `allow_credentials=False`: kimlik çerezle değil `Authorization` başlığıyla
# taşınıyor. Credentials açılsaydı yanlış yapılandırılmış bir origin
# listesi, tarayıcının çerezleri başka bir siteye göndermesine yol açabilirdi.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "X-Expected-User-Id", "Idempotency-Key"],
    max_age=600,
)
app.include_router(remove_background_router)
app.include_router(backgrounds_router)
app.include_router(health_router)
app.include_router(projects_router)
app.include_router(support_router)
app.include_router(account_router)
app.include_router(billing_router)
app.include_router(admin_router)
