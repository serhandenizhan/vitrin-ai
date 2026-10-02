import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.middleware.security_headers import SECURITY_HEADERS

ALLOWED_ORIGIN = "http://localhost:3000"


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _assert_has_security_headers(response) -> None:
    for name, value in SECURITY_HEADERS.items():
        assert response.headers.get(name) == value, name


def test_expected_header_values_are_pinned():
    # Sabitin kendisi sessizce gevşetilmesin: değer değişirse bu test de
    # bilerek güncellenmeli.
    assert SECURITY_HEADERS == {
        "x-content-type-options": "nosniff",
        "cross-origin-resource-policy": "same-origin",
    }


def test_successful_response_has_headers(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    _assert_has_security_headers(response)


def test_not_found_response_has_headers(client):
    response = client.get("/api/yok-boyle-bir-uc")

    assert response.status_code == 404
    _assert_has_security_headers(response)


def test_auth_rejection_has_headers(client):
    # Oturumsuz istek, route'a varmadan kimlik katmanında/bağımlılıkta reddedilir;
    # inner katmanların ürettiği hata yanıtı da başlığı taşımalı.
    response = client.get("/api/projects")

    assert response.status_code in (401, 403)
    _assert_has_security_headers(response)


def test_cors_preflight_has_headers(client):
    # CORS ön kontrolü gövdesiz ve iç katmanlara girmeden yanıtlanır; başlık
    # yine de gelmeli (middleware CORS'un da dışında olmalı).
    response = client.options(
        "/api/projects",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    _assert_has_security_headers(response)


def test_cors_headers_still_work_alongside(client):
    # Yeni katman CORS'u bozmamalı: izinli origin'e hâlâ izin dönüyor.
    response = client.get("/api/health", headers={"Origin": ALLOWED_ORIGIN})

    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    _assert_has_security_headers(response)


def test_downstream_value_is_overridden_not_duplicated():
    # İç katman yanlış bir değer koyarsa bizimki kazanır ve başlık tek kalır.
    from app.middleware.security_headers import SecurityHeadersMiddleware

    sent: list[dict] = []

    async def inner(scope, receive, send):
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [(b"x-content-type-options", b"sniff")],
            }
        )
        await send({"type": "http.response.body", "body": b""})

    async def fake_send(message):
        sent.append(message)

    import asyncio

    asyncio.run(
        SecurityHeadersMiddleware(inner)(
            {"type": "http", "method": "GET", "path": "/"}, None, fake_send
        )
    )

    headers = sent[0]["headers"]
    names = [name for name, _ in headers]
    assert names.count(b"x-content-type-options") == 1
    assert dict(headers)[b"x-content-type-options"] == b"nosniff"
