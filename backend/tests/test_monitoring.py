"""Hata izleme (`app/core/monitoring.py`) — kapalıyken hiçbir şey, açıkken
yalnız maskelenmiş hata gider.

Temizleme fonksiyonları tek başına da sınanıyor, ama asıl kanıt uçtan uca
test: gerçek SDK, gerçek FastAPI entegrasyonu ve bizim `init_error_tracking`
ayarlarımızla bir uç patlatılıyor ve SDK'nın ağa çıkaracağı zarf (envelope)
sahte bir taşıyıcıda yakalanıyor. Sahte nesneye olay yazdırıp "temizlendi"
demek, SDK'nın gerçekte ne topladığını hiç sınamazdı (kök `CLAUDE.md` ders 22).
"""

import json

import pytest
import sentry_sdk
from fastapi import FastAPI, File, UploadFile
from fastapi.testclient import TestClient
from sentry_sdk.transport import Transport

from app.core import monitoring
from app.core.config import settings

SECRET_TOKEN = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.imza-parcasi"
PHOTO_MARKER = b"FOTOGRAF-BAYTLARI-" * 50
EMAIL = "musteri@kuyumcu.example"


class CapturingTransport(Transport):
    """Ağa çıkmak yerine SDK'nın göndereceği zarfları biriktirir."""

    def __init__(self, options=None):
        super().__init__(options)
        self.envelopes = []

    def capture_envelope(self, envelope):
        self.envelopes.append(envelope)

    def payloads(self) -> list[str]:
        # JSON Türkçe karakterleri `\u0131` biçiminde kaçırıyor; çözülüp
        # yeniden yazılıyor ki metin araması gerçek içeriğe bakmış olsun.
        texts = []
        for envelope in self.envelopes:
            for item in envelope.items:
                raw = item.payload.get_bytes().decode("utf-8", "replace")
                try:
                    texts.append(json.dumps(json.loads(raw), ensure_ascii=False))
                except ValueError:
                    texts.append(raw)
        return texts


@pytest.fixture
def reset_sentry():
    yield
    # Test süreci boyunca başka hiçbir test izlenmesin: istemci kapatılıp
    # DSN'siz (etkisiz) bir istemciyle değiştirilir.
    sentry_sdk.get_client().close()
    sentry_sdk.init()


def test_test_session_never_reports_to_a_real_tracker():
    # conftest.py SENTRY_DSN'i boşaltıyor; `.env`'de gerçek bir DSN olsa bile
    # test süreci izleme istemcisi açmamış olmalı.
    import app.main  # noqa: F401 — izleme bu içe aktarmada başlatılıyor

    assert settings.sentry_dsn == ""
    assert not sentry_sdk.get_client().is_active()


def test_tracking_stays_off_without_a_dsn(monkeypatch, reset_sentry):
    monkeypatch.setattr(settings, "sentry_dsn", "")
    assert monitoring.init_error_tracking() is False
    assert not sentry_sdk.get_client().is_active()


def test_scrub_event_drops_credentials_body_and_user():
    event = {
        "request": {
            "headers": {
                "Authorization": f"Bearer {SECRET_TOKEN}",
                "Cookie": "sb-access-token=gizli",
                "X-Expected-User-Id": "kullanici",
                "Idempotency-Key": "anahtar",
                "User-Agent": "Mozilla",
            },
            "cookies": {"sb": "gizli"},
            "data": "fotoğraf",
            "query_string": f"email={EMAIL}",
        },
        "user": {"id": "u", "ip_address": "1.2.3.4"},
    }
    cleaned = monitoring.scrub_event(event)
    headers = cleaned["request"]["headers"]
    assert headers["Authorization"] == monitoring.REDACTED
    assert headers["Cookie"] == monitoring.REDACTED
    assert headers["X-Expected-User-Id"] == monitoring.REDACTED
    assert headers["Idempotency-Key"] == monitoring.REDACTED
    assert headers["User-Agent"] == "Mozilla"  # zararsız başlık korunur
    for field in ("cookies", "data", "query_string"):
        assert cleaned["request"][field] == monitoring.REDACTED
    assert "user" not in cleaned


def test_masks_email_token_and_sql_parameters_in_any_text():
    event = {
        "exception": {
            "values": [
                {
                    "type": "IntegrityError",
                    "value": (
                        "duplicate key [SQL: INSERT INTO t VALUES ($1, $2)] "
                        f"[parameters: ('Ayşe Yılmaz', '{EMAIL}', [1, 2])] "
                        "(Background on this error at: https://sqlalche.me/e/20/gkpj)"
                    ),
                }
            ]
        },
        "extra": {"not": f"token={SECRET_TOKEN} Bearer abc.def"},
    }
    text = json.dumps(monitoring.scrub_event(event), ensure_ascii=False)
    assert EMAIL not in text and SECRET_TOKEN not in text and "abc.def" not in text
    assert "Ayşe" not in text
    # Hatanın türü ve SQL'in kendisi (parametresiz) okunabilir kalır.
    assert "IntegrityError" in text and "INSERT INTO t" in text


def test_breadcrumb_url_loses_query_string():
    crumb = {
        "category": "httplib",
        "data": {"url": f"https://proje.supabase.co/auth/v1/admin/users?filter={EMAIL}"},
        "message": f"arandı {EMAIL}",
    }
    cleaned = monitoring.scrub_breadcrumb(crumb)
    assert cleaned["data"]["url"] == "https://proje.supabase.co/auth/v1/admin/users"
    assert EMAIL not in cleaned["message"]


def test_end_to_end_crash_reaches_sentry_without_personal_data(monkeypatch, reset_sentry):
    monkeypatch.setattr(settings, "sentry_environment", "test")
    transport = CapturingTransport()
    assert monitoring.init_error_tracking(
        dsn="https://anahtar@izleme.example/1", transport=transport
    )

    crash_app = FastAPI()

    @crash_app.post("/patla")
    async def patla(file: UploadFile = File(...)):
        content = await file.read()  # yerel değişkende fotoğraf baytları
        user_email = EMAIL  # yerel değişkende e-posta
        raise RuntimeError(f"işlenemedi: {user_email} ({len(content)} bayt)")

    client = TestClient(crash_app, raise_server_exceptions=False)
    response = client.post(
        f"/patla?email={EMAIL}",
        files={"file": ("yuzuk.jpg", PHOTO_MARKER, "image/jpeg")},
        headers={"Authorization": f"Bearer {SECRET_TOKEN}", "Cookie": "sb=gizli"},
    )
    assert response.status_code == 500
    sentry_sdk.flush()

    payloads = transport.payloads()
    events = [p for p in payloads if "RuntimeError" in p]
    assert events, f"hata olayı Sentry'ye ulaşmadı: {payloads!r}"
    sent = "\n".join(payloads)
    # Hata anlaşılır kalır...
    assert "işlenemedi" in sent and "/patla" in sent and '"environment": "test"' in sent
    # ...ama kişisel veri ve kimlik bilgisi hiçbir biçimde gitmez.
    assert EMAIL not in sent
    assert SECRET_TOKEN not in sent
    assert "gizli" not in sent
    assert "FOTOGRAF-BAYTLARI" not in sent
    assert '"vars"' not in sent  # yığın çerçevelerinde yerel değişken yok
