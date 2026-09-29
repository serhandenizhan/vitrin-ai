"""Hata izleme (Faz 7) — Sentry protokolü, veri minimizasyonuyla.

KARAR (Serhan, 26.09.2026: "hangisi mantıklıysa şu an onu yap"): SDK şimdi
kurulur ama `SENTRY_DSN` verilmedikçe HİÇ başlatılmaz. Sağlayıcı (sentry.io'nun
AB bölgesi mi, kendi barındırdığımız GlitchTip mi) canlı sunucu kararıyla
birlikte Faz 7.5'te seçilir; ikisi de aynı protokolü konuştuğu için kod
değişmez. Açmadan önce sağlayıcı KVKK aydınlatma metnine alıcı olarak
eklenmelidir — metin bugün Supabase/R2/iyzico'yu sayıyor.

NE GİTMEZ (`SECURITY.md` 6: "hata loglarına kullanıcı fotoğrafı veya kişisel
veri sızmamalı"):
- İstek gövdesi hiç okunmaz (`max_request_body_size="never"`): yüklenen
  fotoğraf, form alanları, ödeme formu.
- Yerel değişkenler gönderilmez (`include_local_variables=False`): yığın
  çerçevelerindeki `content` (fotoğraf baytları), token, secret burada durur.
- SDK kullanıcı/IP eklemez (`send_default_pii=False`) ve biz `set_user`
  çağırmayız.
- `before_send` ikinci bir ağ olarak çalışır: kimlik bilgisi taşıyan
  başlıklar, çerezler, sorgu dizesi ve gövde silinir; kalan her metinde
  e-posta adresi, JWT, `Bearer` token'ı ve SQLAlchemy hata mesajlarındaki
  sorgu parametreleri maskelenir. SDK'nın kendi
  ayarlarına tek başına güvenilmez — bir sürüm varsayılanı değiştirirse
  bu katman yine çalışır.
- Performans izi varsayılan kapalı (`SENTRY_TRACES_SAMPLE_RATE=0`).

NE GİDER: hata türü, maskelenmiş mesaj, yığın izi (dosya/satır/fonksiyon adı),
uç noktanın yolu ve yöntemi, ortam adı. Kullanıcı kimliği (UUID) yol ya da
R2 anahtarı içinde kalabilir; takma addır (pseudonymous) ama kişisel veri
sayılır — aydınlatma metnine bu yüzden eklenmesi gerekiyor.
"""

import re
from typing import Any

import sentry_sdk

from app.core.config import settings

#: Değeri tamamen silinen başlıklar (küçük harfle karşılaştırılır).
SENSITIVE_HEADERS = frozenset(
    {
        "authorization",
        "cookie",
        "set-cookie",
        "x-expected-user-id",
        "x-iyz-signature-v3",
        "x-admin-secret",
        "idempotency-key",
        "x-forwarded-for",
        "x-real-ip",
    }
)

REDACTED = "[silindi]"

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# Üç base64url parçalı JWT (Supabase access token'ı bu biçimde).
_JWT = re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
_BEARER = re.compile(r"(?i)bearer\s+[A-Za-z0-9._~+/=-]+")
# SQLAlchemy hata mesajları sorgu parametrelerini de taşır
# ("[parameters: ('Ayşe', 'Altın Kuyumcu', ...)]"); ad, şirket adı, editör
# verisi orada durabilir ve e-posta maskesi bunları yakalamaz.
_SQL_PARAMETERS = re.compile(r"\[parameters: .*?\](?=\s*(\(|\[|$))", re.DOTALL)


def _mask(text: str) -> str:
    text = _SQL_PARAMETERS.sub("[parameters: [silindi]]", text)
    text = _JWT.sub("[token]", text)
    text = _BEARER.sub("Bearer [token]", text)
    return _EMAIL.sub("[e-posta]", text)


def _mask_everywhere(value: Any) -> Any:
    if isinstance(value, str):
        return _mask(value)
    if isinstance(value, dict):
        return {key: _mask_everywhere(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_mask_everywhere(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_mask_everywhere(item) for item in value)
    return value


def scrub_event(event: dict, hint: dict | None = None) -> dict:
    """Sentry'ye gitmeden önce olayı temizler (`before_send`)."""
    request = event.get("request")
    if isinstance(request, dict):
        headers = request.get("headers")
        if isinstance(headers, dict):
            request["headers"] = {
                name: (REDACTED if name.lower() in SENSITIVE_HEADERS else value)
                for name, value in headers.items()
            }
        for field in ("cookies", "data", "query_string", "env"):
            if field in request:
                request[field] = REDACTED
    # SDK'nın ya da bir entegrasyonun eklediği kullanıcı bilgisi atılır.
    event.pop("user", None)
    return _mask_everywhere(event)


def scrub_breadcrumb(crumb: dict, hint: dict | None = None) -> dict:
    """Kırıntılar (log satırları, dış HTTP çağrıları) da aynı maskeden geçer.

    Dış çağrı kırıntısının URL'sindeki sorgu dizesi atılır: Supabase yönetici
    API'sine giden aramada e-posta sorgusu orada taşınıyor.
    """
    data = crumb.get("data")
    if isinstance(data, dict) and isinstance(data.get("url"), str):
        data["url"] = data["url"].split("?", 1)[0]
        data.pop("http.query", None)
    return _mask_everywhere(crumb)


def init_error_tracking(**overrides) -> bool:
    """DSN varsa Sentry'yi başlatır; yoksa hiçbir şey yapmaz ve False döner.

    `overrides` yalnız testler içindir (ör. sahte `transport`).
    """
    dsn = overrides.pop("dsn", settings.sentry_dsn)
    if not dsn:
        return False
    sentry_sdk.init(
        dsn=dsn,
        environment=settings.sentry_environment,
        send_default_pii=False,
        include_local_variables=False,
        max_request_body_size="never",
        traces_sample_rate=settings.sentry_traces_sample_rate,
        before_send=scrub_event,
        before_breadcrumb=scrub_breadcrumb,
        **overrides,
    )
    return True
