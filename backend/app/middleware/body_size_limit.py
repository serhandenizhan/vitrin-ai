import json

from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

_DETAIL = "İstek gövdesi izin verilen sınırı aşıyor."


class RequestBodyTooLarge(HTTPException):
    """`receive` wrapper, toplam gövde boyutu sınırı aşıldığında bunu fırlatır.

    Kasıtlı olarak `HTTPException`'dan türetiliyor: FastAPI, `request.form()`
    çağrısını (multipart parse) `except HTTPException: raise` / `except
    Exception: -> HTTPException(400, ...)` bloğuyla sarmalıyor
    (`fastapi/routing.py`). Sıradan bir `Exception` fırlatılsaydı FastAPI bunu
    yutup her zaman 400 "There was an error parsing the body" üretirdi —
    `HTTPException` alt sınıfı olması, bu istisnanın FastAPI'nin kendi iç
    yakalama bloğunu değişmeden geçmesini sağlar.
    """

    def __init__(self) -> None:
        super().__init__(status_code=413, detail=_DETAIL)


class BodySizeLimitMiddleware:
    """Saf ASGI middleware (BaseHTTPMiddleware kullanmaz).

    `receive` callable'ını sararak gelen her `http.request` mesajının `body`
    uzunluğunu koşan bir sayaca ekler. Sınır aşıldığında Starlette'in multipart
    parser'ına normal bir mesaj döndürmek yerine `RequestBodyTooLarge` fırlatır —
    bu, parser'ın gövdeyi `SpooledTemporaryFile`'a yazmayı tamamlamasını daha
    tamamlamadan durdurur. Sınır bir kez aşıldıktan sonra alttaki `receive()`
    bir daha hiç çağrılmaz (akıştan ek chunk tüketilmez).

    Bu katman uygulama-seviyesi bir yedektir; en erken/ucuz red reverse proxy
    (ör. nginx `client_max_body_size`) seviyesinde olmalıdır — kötü niyetli
    gövde proxy sınırını aşarsa Python sürecine hiç ulaşmaz. Bu middleware,
    proxy sınırı daha yüksek ayarlanmışsa veya proxy'siz ortamlarda (yerel
    geliştirme) devreye giren ikinci savunma hattıdır.

    FastAPI/Starlette'e entegre çalışırken `RequestBodyTooLarge`, bu
    middleware'den daha içeride oturan Starlette'in yerleşik
    `ExceptionMiddleware`'i tarafından yakalanıp 413 yanıtına çevrilir (bu,
    HTTPException'lar için standart Starlette mekanizmasıdır). Aşağıdaki
    `try/except` bloğu, bu middleware'in kendi başına — `ExceptionMiddleware`
    içermeyen çıplak bir ASGI uygulamasının önüne konduğunda da — doğru 413
    yanıtını üretebilmesini sağlayan bağımsız bir yedektir.
    """

    def __init__(self, app: ASGIApp, max_body_bytes: int):
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        received_bytes = 0
        limit_exceeded = False

        async def limited_receive() -> Message:
            nonlocal received_bytes, limit_exceeded
            if limit_exceeded:
                raise RequestBodyTooLarge()

            message = await receive()
            received_bytes += len(message.get("body", b""))
            if received_bytes > self.max_body_bytes:
                limit_exceeded = True
                raise RequestBodyTooLarge()
            return message

        try:
            await self.app(scope, limited_receive, send)
        except RequestBodyTooLarge as exc:
            body = json.dumps({"detail": exc.detail}, ensure_ascii=False).encode("utf-8")
            await send(
                {
                    "type": "http.response.start",
                    "status": exc.status_code,
                    "headers": [(b"content-type", b"application/json")],
                }
            )
            await send({"type": "http.response.body", "body": body})
