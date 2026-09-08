import json

from starlette.types import ASGIApp, Receive, Scope, Send

from app.services.concurrency import CapacityExceededError, InferenceCapacityLimiter

_DETAIL = "Şu anda çok fazla istek işleniyor, lütfen daha sonra tekrar deneyin."


class EndpointAdmissionLimiterMiddleware:
    """Saf ASGI middleware (BaseHTTPMiddleware kullanmaz), tek bir endpoint'e özgü.

    Belirli bir `(method, path)` çiftine gelen istekler için, kapasite
    (`total_tokens`) dolu değilse bir izin edinip `self.app(...)` çağrısını
    (multipart parse + route + inference dahil TÜM downstream işlem) bu izni
    tutarak yürütür; kapasite doluysa `self.app`'e HİÇ delegasyon yapmadan
    (yani multipart parser hiç çağrılmadan, route hiç çalışmadan) doğrudan
    `send()` üzerinden anında `429` üretir.

    Bu, önceki tasarımdaki route-içi `InferenceCapacityLimiter` kullanımının
    yerini alır: route içindeki edinim, gövde zaten tamamen okunup/parse
    edildikten SONRA çalışıyordu (CPU/bellek zaten harcanmıştı). Bu middleware
    aynı `InferenceCapacityLimiter`'ı (bkz. app/services/concurrency.py) çok
    daha erken bir noktada, ASGI katmanında ve parser'dan önce uygulayarak
    aynı korumayı sağlıyor — bu yüzden route içindeki ayrı katman kaldırıldı,
    tek sorumluluk tek yerde.

    İzin, `self.app(...)` çağrısı tamamen bitene kadar (başarı, istisna veya
    iptal — hepsinde) tutulur; bu, `InferenceCapacityLimiter.acquire()`'ın
    kendi `try/finally`'si sayesinde garantilenir.

    Sürece/worker'a özgüdür: çoklu uvicorn worker'ı ile dağıtımda her worker
    kendi bağımsız `total_tokens` kapasitesine sahip olur (bkz.
    app/services/concurrency.py'deki aynı not).
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        limiter: InferenceCapacityLimiter,
        path: str,
        method: str = "POST",
    ):
        # `total_tokens` yerine hazır bir `InferenceCapacityLimiter` alınır:
        # bu, çağıranın (bkz. app/main.py) aynı örneği modül seviyesinde bir
        # sabite atayıp testlerde/başka yerlerde doğrudan referans
        # alabilmesini sağlar (Starlette `add_middleware`, middleware
        # örneğini gecikmeli/gizli oluşturduğu için aksi halde üretimde
        # çalışan gerçek limiter'a testten erişmenin başka bir yolu olmaz).
        self.app = app
        self._limiter = limiter
        self._path = path
        self._method = method

    def _matches(self, scope: Scope) -> bool:
        return (
            scope["type"] == "http"
            and scope.get("method") == self._method
            and scope.get("path") == self._path
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if not self._matches(scope):
            await self.app(scope, receive, send)
            return

        try:
            async with self._limiter.acquire():
                await self.app(scope, receive, send)
        except CapacityExceededError:
            body = json.dumps({"detail": _DETAIL}, ensure_ascii=False).encode("utf-8")
            await send(
                {
                    "type": "http.response.start",
                    "status": 429,
                    "headers": [(b"content-type", b"application/json")],
                }
            )
            await send({"type": "http.response.body", "body": body})
