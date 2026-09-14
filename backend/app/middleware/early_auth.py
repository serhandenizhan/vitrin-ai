"""Dosya yukleme govdesi okunmadan once JWT dogrulayan ASGI katmani."""

import inspect
import json
import uuid
from typing import Any

import jwt
from fastapi.concurrency import run_in_threadpool
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core import auth as auth_module
from app.core.auth import CurrentUser, get_current_user
from app.core.config import settings
from app.services.rate_limit import RequestRateLimiter

PROTECTED_UPLOADS = frozenset(
    {
        ("POST", "/api/remove-background"),
        ("POST", "/api/projects"),
        ("POST", "/api/admin/backgrounds"),
    }
)


class EarlyAuthenticationMiddleware:
    """Korumali multipart isteklerini `receive()` cagirmadan reddeder."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        dependency_overrides_provider: Any | None = None,
        protected_uploads: frozenset[tuple[str, str]] = PROTECTED_UPLOADS,
        user_limiter: RequestRateLimiter | None = None,
        unauthenticated_limiter: RequestRateLimiter | None = None,
    ):
        self.app = app
        self.dependency_overrides_provider = dependency_overrides_provider
        self.protected_uploads = protected_uploads
        self.user_limiter = user_limiter
        self.unauthenticated_limiter = unauthenticated_limiter

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or (
            scope.get("method", "").upper(), scope.get("path", "")
        ) not in self.protected_uploads:
            await self.app(scope, receive, send)
            return

        # FastAPI dependency override'lari testlerin resmi degistirme noktasi;
        # erken katman da ayni auth override'ini kullanarak route ile ayrismaz.
        override = None
        if self.dependency_overrides_provider is not None:
            override = self.dependency_overrides_provider.dependency_overrides.get(
                get_current_user
            )
        if override is not None:
            user = override()
            if inspect.isawaitable(user):
                user = await user
            if not await self._project_user_matches(scope, receive, send, user):
                return
            scope.setdefault("state", {})["current_user"] = user
            await self.app(scope, receive, send)
            return

        if not settings.supabase_url:
            await self._error(
                scope,
                receive,
                send,
                503,
                "Kimlik doğrulama yapılandırılmamış; sunucuda SUPABASE_URL ayarlanmalı.",
            )
            return

        token = self._bearer_token(scope)
        if token is None:
            await self._error(scope, receive, send, 401, "Oturum açmanız gerekiyor.")
            return

        try:
            user = await run_in_threadpool(auth_module.verify_access_token, token)
        except jwt.PyJWKClientConnectionError:
            await self._error(
                scope,
                receive,
                send,
                503,
                "Kimlik doğrulama anahtarlarına ulaşılamadı.",
            )
            return
        except jwt.PyJWTError:
            retry_after = await self._unauthenticated_retry_after(scope)
            if retry_after is not None:
                await self._error(
                    scope,
                    receive,
                    send,
                    429,
                    "Çok fazla istek gönderildi; lütfen daha sonra tekrar deneyin.",
                    retry_after=retry_after,
                )
                return
            await self._error(
                scope, receive, send, 401, "Oturum geçersiz ya da süresi dolmuş."
            )
            return

        if not await self._project_user_matches(scope, receive, send, user):
            return
        if self.user_limiter is not None:
            retry_after = await self.user_limiter.retry_after(f"user:{user.id}")
            if retry_after is not None:
                await self._error(
                    scope,
                    receive,
                    send,
                    429,
                    "Çok fazla istek gönderildi; lütfen daha sonra tekrar deneyin.",
                    retry_after=retry_after,
                )
                return
        scope.setdefault("state", {})["current_user"] = user
        await self.app(scope, receive, send)

    async def _unauthenticated_retry_after(self, scope: Scope) -> int | None:
        if self.unauthenticated_limiter is None:
            return None
        client = scope.get("client")
        client_ip = client[0] if client else "unknown"
        return await self.unauthenticated_limiter.retry_after(f"ip:{client_ip}")

    @classmethod
    async def _project_user_matches(
        cls, scope: Scope, receive: Receive, send: Send, user: CurrentUser
    ) -> bool:
        if scope.get("path") != "/api/projects":
            return True
        raw = cls._header(scope, b"x-expected-user-id")
        try:
            expected_user_id = uuid.UUID(raw) if raw is not None else None
        except ValueError:
            expected_user_id = None
        if expected_user_id == user.id:
            return True
        await cls._error(
            scope,
            receive,
            send,
            409,
            "Oturum işlem sırasında değişti; çalışma kaydedilmedi.",
        )
        return False

    @staticmethod
    def _header(scope: Scope, wanted: bytes) -> str | None:
        for name, value in scope.get("headers", []):
            if name.lower() == wanted:
                return value.decode("latin-1")
        return None

    @staticmethod
    def _bearer_token(scope: Scope) -> str | None:
        value = EarlyAuthenticationMiddleware._header(scope, b"authorization")
        if value is not None:
            scheme, separator, token = value.partition(" ")
            if separator and scheme.casefold() == "bearer" and token.strip():
                return token.strip()
        return None

    @staticmethod
    async def _error(
        scope: Scope,
        receive: Receive,
        send: Send,
        status_code: int,
        detail: str,
        retry_after: int | None = None,
    ) -> None:
        del scope, receive
        body = json.dumps({"detail": detail}, ensure_ascii=False).encode("utf-8")
        headers = [(b"content-type", b"application/json; charset=utf-8")]
        if status_code == 401:
            headers.append((b"www-authenticate", b"Bearer"))
        if retry_after is not None:
            headers.append((b"retry-after", str(retry_after).encode("ascii")))
        await send(
            {"type": "http.response.start", "status": status_code, "headers": headers}
        )
        await send({"type": "http.response.body", "body": body})
