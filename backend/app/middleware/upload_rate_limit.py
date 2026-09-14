"""Yukleme govdesi okunmadan once istemci IP'sine hiz siniri uygular."""

import json

from starlette.types import ASGIApp, Receive, Scope, Send

from app.middleware.early_auth import PROTECTED_UPLOADS
from app.services.rate_limit import RequestRateLimiter


class UploadRateLimitMiddleware:
    def __init__(self, app: ASGIApp, *, limiter: RequestRateLimiter):
        self.app = app
        self.limiter = limiter

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        target = (scope.get("method", "").upper(), scope.get("path", ""))
        if scope["type"] != "http" or target not in PROTECTED_UPLOADS:
            await self.app(scope, receive, send)
            return

        authorization = next(
            (value for name, value in scope.get("headers", []) if name.lower() == b"authorization"),
            None,
        )
        if authorization:
            # Gecerli token'lar early-auth icinde dogrulanmis kullaniciya
            # gore sinirlanir. Next.js vekilindeki tum kullanicilari tek
            # sunucu IP'si altinda toplamayiz. Gecersiz token'lar early-auth
            # hata dalinda yine IP sinirine yazilir.
            await self.app(scope, receive, send)
            return
        client = scope.get("client")
        client_ip = client[0] if client else "unknown"
        key = f"ip:{client_ip}"
        retry_after = await self.limiter.retry_after(key)
        if retry_after is None:
            await self.app(scope, receive, send)
            return

        body = json.dumps(
            {"detail": "Çok fazla istek gönderildi; lütfen daha sonra tekrar deneyin."},
            ensure_ascii=False,
        ).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 429,
                "headers": [
                    (b"content-type", b"application/json; charset=utf-8"),
                    (b"retry-after", str(retry_after).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
