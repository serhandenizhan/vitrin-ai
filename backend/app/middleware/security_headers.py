from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# Backend bir JSON API'si: sayfa sunmaz, bu yüzden CSP/X-Frame-Options gibi
# belge başlıkları burada anlamsız. İki başlık yeterli ve zararsız:
# - nosniff: tarayıcı yanıtı içeriğinden tahminle başka türe çevirmesin.
# - CORP same-origin: yanıt başka bir sitenin <img>/<script> gibi no-cors
#   isteğiyle gömülemesin. CORS'lu fetch'i ETKİLEMEZ (CORP yalnız no-cors
#   istekleri keser); izinli origin'in CORS ile okuması çalışmaya devam eder.
SECURITY_HEADERS = {
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "same-origin",
}


class SecurityHeadersMiddleware:
    """Saf ASGI middleware: her HTTP yanıtına güvenlik başlıklarını ekler.

    En dışta (CORS'un da dışında) durmalı ki iç katmanların ürettiği 401/413/
    429 yanıtları ve CORS ön kontrolü de başlığı taşısın. `MutableHeaders`
    atamasıyla ekler: iç katman aynı başlığı koyduysa üzerine yazılır, çift
    başlık oluşmaz.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in SECURITY_HEADERS.items():
                    headers[name] = value
            await send(message)

        await self.app(scope, receive, send_with_headers)
