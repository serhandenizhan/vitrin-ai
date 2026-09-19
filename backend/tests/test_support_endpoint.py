"""`POST /api/support-requests` testleri: oturum, sahiplik, doğrulama, hız sınırı."""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from redis.exceptions import RedisError

from app.core.db import get_db_session
from app.main import app
from app.services.billing import limits
from app.services.billing.db import many

MESSAGE = "Kolye kesiminde zincir kısmen kayboluyor."


@pytest.fixture
async def client(db_session):
    # İstek testle AYNI event loop'ta koşsun diye ASGITransport: TestClient
    # kendi loop'unu açıyor ve paylaşılan asyncpg bağlantısı loop'lar arasında
    # taşınamıyor.
    async def _override_db_session():
        yield db_session

    app.dependency_overrides[get_db_session] = _override_db_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http
    app.dependency_overrides.clear()


async def _rows(db_session):
    return await many(db_session, "SELECT user_id,kind,email,message FROM support_requests")


async def test_requires_authentication(client, db_session, tokens):

    response = await client.post("/api/support-requests", json={"kind": "issue", "message": MESSAGE})

    assert response.status_code == 401
    assert await _rows(db_session) == []


async def test_request_is_bound_to_the_token_user_not_the_body(
    client, db_session, tokens, create_user, redis_client
):
    user_id = await create_user()
    someone_else = await create_user()

    response = await client.post(
        "/api/support-requests",
        json={
            "kind": "suggestion",
            "message": f"  {MESSAGE}  ",
            "email": " iletisim@vitrin.example ",
            # Gövdeden gelen kimlik yok sayılmalı; satır token'daki kullanıcıya yazılır.
            "user_id": str(someone_else),
        },
        headers=tokens.headers(user_id),
    )

    assert response.status_code == 201, response.text
    uuid.UUID(response.json()["id"])
    rows = await _rows(db_session)
    assert [dict(r) for r in rows] == [
        {"user_id": user_id, "kind": "suggestion", "email": "iletisim@vitrin.example", "message": MESSAGE}
    ]


@pytest.mark.parametrize(
    "body",
    [
        {"kind": "complaint", "message": MESSAGE},
        {"kind": "issue", "message": "kısa"},
        # Boşluklar kırpıldıktan sonra sınırın altında kalıyor.
        {"kind": "issue", "message": "kısa".center(30)},
        {"kind": "issue", "message": "x" * 4001},
    ],
    ids=["unknown-kind", "too-short", "short-after-strip", "too-long"],
)
async def test_invalid_body_is_rejected(client, db_session, tokens, create_user, redis_client, body):
    user_id = await create_user()

    response = await client.post("/api/support-requests", json=body, headers=tokens.headers(user_id))

    assert response.status_code == 422
    assert await _rows(db_session) == []


async def test_rate_limit_caps_requests_per_user(client, db_session, tokens, create_user, redis_client):
    user_id = await create_user()
    other_user = await create_user()
    body = {"kind": "issue", "message": MESSAGE}

    statuses = [
        (await client.post("/api/support-requests", json=body, headers=tokens.headers(user_id))).status_code
        for _ in range(limits.support_limiter.requests + 1)
    ]

    assert statuses[:-1] == [201] * limits.support_limiter.requests
    assert statuses[-1] == 429
    assert len(await _rows(db_session)) == limits.support_limiter.requests
    # Kova kullanıcı başına: başka bir hesap etkilenmemeli.
    assert (
        (await client.post("/api/support-requests", json=body, headers=tokens.headers(other_user))).status_code
        == 201
    )


async def test_redis_outage_fails_open(client, db_session, tokens, create_user, monkeypatch):
    """Redis düştüğünde sorun bildirme formu kapanmamalı (bilinçli fail-open)."""

    async def broken(_key):
        raise RedisError("bağlantı yok")

    monkeypatch.setattr(limits.support_limiter, "retry_after", broken)
    user_id = await create_user()

    response = await client.post(
        "/api/support-requests",
        json={"kind": "issue", "message": MESSAGE},
        headers=tokens.headers(user_id),
    )

    assert response.status_code == 201
    assert len(await _rows(db_session)) == 1
