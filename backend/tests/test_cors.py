import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings, settings
from app.main import app

ALLOWED_ORIGIN = "http://localhost:3000"


def test_default_allowed_origins_are_local_frontend_only():
    assert settings.cors_allowed_origin_list == [ALLOWED_ORIGIN]


def test_preflight_from_allowed_origin_is_accepted():
    client = TestClient(app)

    response = client.options(
        "/api/projects",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    # Kimlik bilgisi çerezle değil Authorization başlığıyla taşınıyor;
    # credentials izni verilmiyor.
    assert "access-control-allow-credentials" not in response.headers


def test_preflight_from_unknown_origin_is_rejected():
    client = TestClient(app)

    response = client.options(
        "/api/projects",
        headers={
            "Origin": "https://kotu-niyetli.example",
            "Access-Control-Request-Method": "DELETE",
        },
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_simple_request_from_unknown_origin_gets_no_allow_origin_header(monkeypatch):
    # Uygulama yanıtı yine döner (CORS bir sunucu güvenlik duvarı değil), ama
    # tarayıcı başlık olmadığı için yanıtı sayfaya vermez.
    monkeypatch.setattr(settings, "supabase_url", "")
    client = TestClient(app)

    response = client.get("/api/projects", headers={"Origin": "https://kotu-niyetli.example"})

    assert "access-control-allow-origin" not in response.headers


@pytest.mark.parametrize(
    "value",
    [
        "*",
        "http://localhost:3000,*",
        "localhost:3000",
        "http://localhost:3000/",
        "https://vitrin.example/app",
        "ftp://vitrin.example",
    ],
)
def test_settings_reject_unsafe_or_malformed_origins(value):
    # SECURITY.md 2.2: `*` production'da asla kullanılmaz. Sondaki `/` gibi
    # biçim hataları da reddediliyor: tarayıcının gönderdiği Origin hiçbir
    # zaman yol içermez, böyle bir değer sessizce hiçbir isteğe uymazdı.
    with pytest.raises(ValidationError):
        Settings(_env_file=None, cors_allowed_origins=value)


def test_settings_accept_comma_separated_origins():
    configured = Settings(
        _env_file=None,
        cors_allowed_origins=" https://vitrin.example , http://localhost:3000 ",
    )

    assert configured.cors_allowed_origin_list == ["https://vitrin.example", "http://localhost:3000"]
