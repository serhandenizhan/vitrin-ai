import asyncio
import uuid

import jwt

from app.core import auth as auth_module
from app.core.auth import CurrentUser
from app.core.config import settings
from app.middleware.early_auth import EarlyAuthenticationMiddleware
from app.services.rate_limit import RequestRateLimiter


async def _body_consuming_app(scope, receive, send):
    await receive()
    assert isinstance(scope["state"]["current_user"], CurrentUser)
    await send({"type": "http.response.start", "status": 200, "headers": []})
    await send({"type": "http.response.body", "body": b"ok"})


def _run(headers: list[tuple[bytes, bytes]], monkeypatch, verifier):
    monkeypatch.setattr(settings, "supabase_url", "https://test.supabase.co")
    monkeypatch.setattr(auth_module, "verify_access_token", verifier)
    receive_calls = 0
    sent = []

    async def receive():
        nonlocal receive_calls
        receive_calls += 1
        return {"type": "http.request", "body": b"buyuk-govde", "more_body": False}

    async def send(message):
        sent.append(message)

    middleware = EarlyAuthenticationMiddleware(_body_consuming_app)
    asyncio.run(
        middleware(
            {
                "type": "http",
                "method": "POST",
                "path": "/api/remove-background",
                "headers": headers,
            },
            receive,
            send,
        )
    )
    return sent, receive_calls


def test_missing_token_is_rejected_without_reading_body(monkeypatch):
    sent, receive_calls = _run([], monkeypatch, lambda _: None)

    assert sent[0]["status"] == 401
    assert receive_calls == 0


def test_invalid_token_is_rejected_without_reading_body(monkeypatch):
    def reject(_):
        raise jwt.InvalidTokenError("gecersiz")

    sent, receive_calls = _run(
        [(b"authorization", b"Bearer gecersiz")], monkeypatch, reject
    )

    assert sent[0]["status"] == 401
    assert receive_calls == 0


def test_valid_token_reaches_body_parser_with_verified_user(monkeypatch):
    user = CurrentUser(id=uuid.uuid4(), email="test@test.example", session_id=None)
    sent, receive_calls = _run(
        [(b"authorization", b"Bearer gecerli")], monkeypatch, lambda _: user
    )

    assert sent[0]["status"] == 200
    assert receive_calls == 1


def test_project_for_another_session_is_rejected_without_reading_body(monkeypatch):
    user = CurrentUser(id=uuid.uuid4(), email="test@test.example", session_id=None)
    monkeypatch.setattr(settings, "supabase_url", "https://test.supabase.co")
    monkeypatch.setattr(auth_module, "verify_access_token", lambda _: user)
    receive_calls = 0
    sent = []

    async def receive():
        nonlocal receive_calls
        receive_calls += 1
        return {"type": "http.request", "body": b"buyuk", "more_body": False}

    async def send(message):
        sent.append(message)

    asyncio.run(
        EarlyAuthenticationMiddleware(_body_consuming_app)(
            {
                "type": "http",
                "method": "POST",
                "path": "/api/projects",
                "headers": [
                    (b"authorization", b"Bearer gecerli"),
                    (b"x-expected-user-id", str(uuid.uuid4()).encode("ascii")),
                ],
            },
            receive,
            send,
        )
    )

    assert sent[0]["status"] == 409
    assert receive_calls == 0


def test_verified_user_rate_limit_runs_before_body(monkeypatch):
    user = CurrentUser(id=uuid.uuid4(), email="test@test.example", session_id=None)
    monkeypatch.setattr(settings, "supabase_url", "https://test.supabase.co")
    monkeypatch.setattr(auth_module, "verify_access_token", lambda _: user)
    limiter = RequestRateLimiter(1, 60)
    receive_calls = 0

    async def receive():
        nonlocal receive_calls
        receive_calls += 1
        return {"type": "http.request", "body": b"govde", "more_body": False}

    async def scenario():
        statuses = []
        middleware = EarlyAuthenticationMiddleware(
            _body_consuming_app, user_limiter=limiter
        )
        for _ in range(2):
            async def send(message):
                if message["type"] == "http.response.start":
                    statuses.append(message["status"])

            await middleware(
                {
                    "type": "http",
                    "method": "POST",
                    "path": "/api/remove-background",
                    "headers": [(b"authorization", b"Bearer gecerli")],
                },
                receive,
                send,
            )
        return statuses

    assert asyncio.run(scenario()) == [200, 429]
    assert receive_calls == 1
