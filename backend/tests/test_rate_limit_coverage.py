# ruff: noqa: F401, F811
# (`client` fixture'ı test_idor'dan içe aktarılıyor; pytest fixture kalıbı F811 tetikler.)
"""Hız sınırı kapsam envanteri (Faz 7, `SECURITY.md` bölüm 9).

`test_idor.py`'nin kardeşi: o "bu uç kime açık?" sorusunu, bu dosya "bu uç
hangi hız sınırına ve hangi ARIZA yönüne sahip?" sorusunu zorlar. Kök
`CLAUDE.md` ders 15'e göre yalnız tanım değil DAVRANIŞ sınanır:

1. ENVANTER — OpenAPI'deki HER uç aşağıdaki dört sınıftan tam olarak birine
   atanmış olmalı. Sınıflandırılmamış yeni uç testi kırmızı yakar.
2. LİMİT DOLU — her sınırlayıcının `retry_after`'ı "doldu" dönerken muaf
   olmayan her uç gerçek bir istekte 429 vermeli. Mekanizma (bağımlılık, uç
   içi çağrı, middleware) fark etmez: sınırı kaldırılan uç kırmızı yakar.
3. REDİS DÜŞTÜ — sınıfın yönü doğrulanır: CLOSED uç 503 `rate_limit_unavailable`
   verir (para/geri alınamaz işlem/yönetici yazması), OPEN uç sınırsız geçer
   (okuma, taslak kaydı, destek formu). Yön uç başına BİLİNÇLİ seçilir; gerekçeler
   `app/services/billing/limits.py` docstring'lerinde.

Muaf (EXEMPT) bir ucun gerekçesi burada yazılı olmalı.
"""

import gc
from unittest.mock import AsyncMock

import pytest
from redis.exceptions import RedisError

from app.services.rate_limit import RequestRateLimiter
from tests.test_idor import _fill_path, _openapi_routes, client

#: Redis arızasında 503 verir; limit dolunca 429.
CLOSED = {
    ("GET", "/api/billing/documents"),  # herkese açık, IP başına (limit_public)
    ("GET", "/api/plans"),
    ("POST", "/api/subscriptions/callback"),
    ("POST", "/api/webhooks/iyzico"),
    ("POST", "/api/subscriptions/checkout"),
    ("POST", "/api/subscriptions/change-plan"),
    ("POST", "/api/subscriptions/cancel"),
    ("POST", "/api/subscriptions/checkout/{session_id}/cancel"),
    ("POST", "/api/cmyk/permit"),
    ("DELETE", "/api/projects"),
    ("DELETE", "/api/projects/{project_id}"),
    ("DELETE", "/api/account"),
    ("DELETE", "/api/admin/backgrounds/{background_id}"),
    ("PATCH", "/api/admin/backgrounds/{background_id}"),
    ("PATCH", "/api/admin/billing/{transaction_id}/invoice"),
    ("PATCH", "/api/admin/plans/{plan_id}"),
    ("POST", "/api/admin/billing/actions/{action_id}/resolve"),
    ("POST", "/api/admin/billing/actions/{action_id}/retry"),
    ("POST", "/api/admin/billing/{transaction_id}/chargeback"),
    ("POST", "/api/admin/billing/{transaction_id}/refund"),
    ("POST", "/api/admin/credits/{grant_id}/revoke"),
    ("POST", "/api/admin/plans/{plan_id}/versions"),
    ("POST", "/api/admin/subscriptions/{user_id}/suspend"),
    ("DELETE", "/api/admin/users/{user_id}"),
    ("DELETE", "/api/admin/users/{user_id}/admin"),
    ("POST", "/api/admin/users/{user_id}/admin"),
    ("POST", "/api/admin/users/{user_id}/credits"),
}

#: Redis arızasında sınırsız geçer (log'a uyarı yazılır); limit dolunca 429.
OPEN = {
    ("GET", "/api/backgrounds"),
    ("GET", "/api/projects"),
    ("GET", "/api/projects/{project_id}"),
    ("PATCH", "/api/projects/{project_id}"),  # taslak otomatik kaydı: kayıp düzenleme > sınırsız PATCH
    ("GET", "/api/remove-background/jobs/{request_id}"),
    ("GET", "/api/subscriptions/me"),
    ("GET", "/api/subscriptions/checkout/{session_id}"),
    ("GET", "/api/billing/history"),
    ("POST", "/api/support-requests"),
    ("GET", "/api/admin/me"),
    ("GET", "/api/admin/audit"),
    ("GET", "/api/admin/backgrounds"),
    ("GET", "/api/admin/billing/operations"),
    ("GET", "/api/admin/cutout-queue"),
    ("GET", "/api/admin/stats"),
    ("GET", "/api/admin/users"),
    ("GET", "/api/admin/users/{user_id}"),
}

#: Yükleme uçları: sınır middleware'de (IP + kullanıcı, gövde okunmadan önce;
#: bkz. `test_upload_rate_limit_middleware.py`, `test_early_auth_middleware.py`).
UPLOAD = {
    ("POST", "/api/projects"),
    ("POST", "/api/remove-background"),
    # Middleware sınırına ek olarak uç içinde `limit_admin` de var.
    ("POST", "/api/admin/backgrounds"),
}

#: Bilinçli olarak sınırsız. GEREKÇE ZORUNLU.
EXEMPT = {
    # Yük dengeleyici/sağlık kontrolü sık yoklar; sınır sağlık sinyalini bozardı.
    # Redis'e dokunmaz, sabit küçük yanıt döner.
    ("GET", "/api/health"): "sağlık kontrolü; Redis'e bağlı olmamalı",
}

#: Gövde doğrulaması sınırdan ÖNCE çalışan (uç içi çağrı) uçlar için geçerli gövde.
BODIES = {
    ("POST", "/api/support-requests"): {
        "json": {"kind": "issue", "message": "Bu bir deneme mesajıdır."}
    },
}

CLASSES = [CLOSED, OPEN, UPLOAD, set(EXEMPT)]
LIMITED = sorted(CLOSED | OPEN | UPLOAD)


def _patch_every_limiter(monkeypatch, replacement) -> None:
    """Canlı HER `RequestRateLimiter` örneğinin `retry_after`'ını değiştirir.

    Sınıfa taklit atmak yetmez: `monkeypatch.setattr(örnek, ...)` kullanan
    eski testler geri alırken bağlı metodu ÖRNEK özniteliği olarak bırakıyor
    ve bu, sınıf düzeyindeki taklidi gölgeliyor (tam pakette sırayla
    kırılıyordu). Örnekleri tek tek taklit etmek sıradan bağımsızdır.
    """
    limiters = [o for o in gc.get_objects() if isinstance(o, RequestRateLimiter)]
    assert limiters, "Hiç sınırlayıcı örneği bulunamadı; test hiçbir şeyi sınamıyor"
    for limiter in limiters:
        monkeypatch.setattr(limiter, "retry_after", replacement)


def test_every_route_has_exactly_one_rate_limit_class():
    for i, first in enumerate(CLASSES):
        for second in CLASSES[i + 1 :]:
            assert not first & second, f"iki sınıfta birden: {first & second}"

    routes = set(_openapi_routes())
    classified = set().union(*CLASSES)
    assert routes - classified == set(), (
        "Hız sınırı sınıfı olmayan uç: CLOSED/OPEN/UPLOAD kümelerinden birine "
        "(ve gerçekten sınırlanarak) ya da gerekçesiyle EXEMPT'e eklenmeli"
    )
    assert classified - routes == set(), "Artık var olmayan uç sınıflandırılmış"


@pytest.fixture
async def admin_headers(tokens, create_user, grant_admin):
    # Yönetici her oturumlu ve yönetici ucundan geçer; böylece yetki kapısı
    # 403'ü sınır sonucunu gölgelemez.
    admin = await create_user()
    await grant_admin(admin)
    return tokens.headers(admin)


async def _call(client, route, headers):
    method, path = route
    url = _fill_path(path, _openapi_routes()[route])
    return await client.request(method, url, headers=headers, **BODIES.get(route, {}))


@pytest.mark.parametrize("method,path", LIMITED)
async def test_route_returns_429_when_limit_is_exhausted(
    client, admin_headers, monkeypatch, method, path
):
    _patch_every_limiter(monkeypatch, AsyncMock(return_value=7))

    response = await _call(client, (method, path), admin_headers)

    assert response.status_code == 429, (method, path, response.status_code, response.text)


@pytest.mark.parametrize("method,path", sorted(EXEMPT))
async def test_exempt_route_ignores_the_limiter(client, admin_headers, monkeypatch, method, path):
    _patch_every_limiter(monkeypatch, AsyncMock(return_value=7))

    response = await _call(client, (method, path), admin_headers)

    assert response.status_code != 429, (method, path)


@pytest.mark.parametrize("method,path", sorted(CLOSED))
async def test_closed_route_returns_503_when_redis_is_down(
    client, admin_headers, monkeypatch, method, path
):
    _patch_every_limiter(monkeypatch, AsyncMock(side_effect=RedisError("kapalı")))

    response = await _call(client, (method, path), admin_headers)

    assert response.status_code == 503, (method, path, response.status_code, response.text)
    assert "rate_limit_unavailable" in response.text, (method, path, response.text)


@pytest.mark.parametrize("method,path", sorted(UPLOAD))
async def test_upload_route_returns_503_when_redis_is_down(
    client, admin_headers, monkeypatch, method, path
):
    # Yükleme sınırı yönü KAPALI: sayaç sorulamıyorsa gövde okunmadan reddedilir.
    # Eskiden yakalanmamış RedisError ham bir 500'e dönüşüyordu.
    _patch_every_limiter(monkeypatch, AsyncMock(side_effect=RedisError("kapalı")))

    response = await _call(client, (method, path), admin_headers)

    assert response.status_code == 503, (method, path, response.status_code, response.text)


@pytest.mark.parametrize("method,path", sorted(OPEN))
async def test_open_route_passes_when_redis_is_down(
    client, admin_headers, monkeypatch, method, path
):
    _patch_every_limiter(monkeypatch, AsyncMock(side_effect=RedisError("kapalı")))

    response = await _call(client, (method, path), admin_headers)

    # Uç kendi işini yapar (200/404/…); sınırlayıcı yüzünden reddedilmez.
    assert response.status_code != 429, (method, path, response.text)
    assert "rate_limit_unavailable" not in response.text, (method, path, response.text)
