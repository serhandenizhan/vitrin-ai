"""`POST /api/cmyk/permit`: CMYK dönüşümünden önce oturum + kullanıcı başına sınır.

/cso incelemesi (27.09.2026): Next.js `/api/cmyk` oturumsuz ve sınırsızdı;
herkes 40 MP'ye kadar görselleri dönüştürtüp sunucuyu meşgul edebiliyordu.
Next rotası artık gövdeyi okumadan önce bu uca soruyor.
"""

import pytest
from httpx import ASGITransport, AsyncClient
from redis.exceptions import RedisError

from app.core.db import get_db_session
from app.main import app
from app.services.billing import limits


@pytest.fixture
async def client(db_session):
    async def _override_db_session():
        yield db_session

    app.dependency_overrides[get_db_session] = _override_db_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http
    app.dependency_overrides.clear()


async def test_permit_requires_a_session(client, tokens):
    assert (await client.post("/api/cmyk/permit")).status_code == 401


async def test_permit_is_granted_to_a_signed_in_user(client, tokens, create_user, redis_client):
    response = await client.post("/api/cmyk/permit", headers=tokens.headers(await create_user()))
    assert response.status_code == 204


async def test_permit_caps_conversions_per_user(client, tokens, create_user, redis_client):
    user_id, other_user = await create_user(), await create_user()
    statuses = [
        (await client.post("/api/cmyk/permit", headers=tokens.headers(user_id))).status_code
        for _ in range(limits.cmyk_limiter.requests + 1)
    ]
    assert statuses[:-1] == [204] * limits.cmyk_limiter.requests
    assert statuses[-1] == 429
    # Kova kullanıcı başına.
    assert (await client.post("/api/cmyk/permit", headers=tokens.headers(other_user))).status_code == 204


async def test_redis_outage_fails_closed(client, tokens, create_user, monkeypatch):
    # Bilinçli fail-closed: sınırın sessizce kalkması eski açığı geri getirirdi.
    async def broken(_key):
        raise RedisError("bağlantı yok")

    monkeypatch.setattr(limits.cmyk_limiter, "retry_after", broken)
    response = await client.post("/api/cmyk/permit", headers=tokens.headers(await create_user()))
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "rate_limit_unavailable"
