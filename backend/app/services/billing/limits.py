"""Checkout oluşturma ve herkese açık ödeme yüzeyleri için dağıtık hız sınırı."""

from fastapi import Depends, Request
from app.core.auth import CurrentUser, get_current_user
from app.core.config import settings
from app.services.rate_limit import RequestRateLimiter
from app.services.billing.errors import billing_error

checkout_limiter = RequestRateLimiter(10, 60, redis_url=settings.redis_url)
public_limiter = RequestRateLimiter(600, 60, redis_url=settings.redis_url)


def client_ip(request: Request) -> str:
    """Hız sınırı kovasının anahtarı olacak gerçek istemci adresi.

    Doğrudan `request.client.host` okumak nginx/Caddy arkasında proxy'nin kendi
    adresini verir: bütün public trafik tek kovayı paylaşır ve sınır fiilen
    kalkar. `X-Forwarded-For` ise istemcinin kendi YAZABİLDİĞİ bir başlık;
    körlemesine güvenmek her isteğe ayrı kova verir, bu da sınırı aynı şekilde
    kaldırır.

    Bu yüzden başlık YALNIZCA bağlantı güvenilen bir proxy'den geliyorsa
    okunur (`TRUSTED_PROXY_IPS`, uvicorn'un `--forwarded-allow-ips` değeriyle
    aynı liste). Zincirde sağdan sola yürünür: sağdaki kayıtları güvenilen
    altyapı eklemiştir, ilk güvenilmeyen değer gerçek istemcidir. Liste boşken
    başlık hiç okunmaz — varsayılan kurulumda sahte başlık kabul edilmez.
    """
    peer = request.client.host if request.client else "unknown"
    trusted = settings.trusted_proxy_ip_list
    if peer not in trusted:
        return peer
    chain = [
        value.strip()
        for value in request.headers.get("X-Forwarded-For", "").split(",")
        if value.strip()
    ]
    for candidate in reversed(chain):
        if candidate not in trusted:
            return candidate
    return peer


async def limit_checkout(user: CurrentUser = Depends(get_current_user)):
    retry = await checkout_limiter.retry_after("billing:checkout:" + str(user.id))
    if retry:
        raise billing_error(
            "rate_limited", "Çok fazla satın alma isteği. Biraz bekleyin.", 429, retry
        )


async def limit_public(request: Request):
    retry = await public_limiter.retry_after("billing:public:" + client_ip(request))
    if retry:
        raise billing_error(
            "rate_limited", "Çok fazla istek. Biraz bekleyin.", 429, retry
        )


async def limit_scoped(request: Request, name: str, user_id=None):
    """Oturum varsa kullanıcı başına, yoksa IP başına sınırlar.

    Zemin listesine tarayıcı doğrudan gelmiyor; istek Next.js vekilinden
    geçiyor ve backend'in gördüğü adres bütün kullanıcılar için AYNI. Salt
    IP'ye bağlı bir kova hepsini tek bütçeye sıkıştırırdı. Kimliği doğrulanmış
    kullanıcı kendi kovasını alır; anonim trafik IP kovasında kalır
    (doğrulanmamış bir başlıkla kova seçilemez).
    """
    scope = f"user:{user_id}" if user_id else f"ip:{client_ip(request)}"
    retry = await public_limiter.retry_after(f"billing:{name}:{scope}")
    if retry:
        raise billing_error(
            "rate_limited", "Çok fazla istek. Biraz bekleyin.", 429, retry
        )
