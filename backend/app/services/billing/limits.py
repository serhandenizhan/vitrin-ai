"""Checkout oluşturma ve herkese açık ödeme yüzeyleri için dağıtık hız sınırı.

FAIL-OPEN / FAIL-CLOSED AYRIMI (PR #18 incelemesi): Redis'e ulaşılamadığında
sayaç sorulamıyor ve o anda iki kötü seçenek var — sınırı kaldırmak ya da uç
noktayı kapatmak. Karar uç noktanın NE KORUDUĞUNA göre veriliyor:

* `limit_checkout` / `limit_public` (para, sağlayıcı geri dönüşleri, webhook)
  **fail-closed** kalır: buradaki sınırın sessizce kalkması, Redis arızasında
  sınırsız checkout/webhook denemesi demek olurdu.
* `limit_scoped` (zemin listeleme, admin okuma uçları, destek formu)
  **fail-open**: burada korunan şey okuma trafiği ya da hesaba bağlı, iz
  bırakan bir yazma; kaybedilen şey ise ürünün kendisi. Destek formu için
  ayrıca: Redis'in düştüğü an, kullanıcının sorun bildirmek isteyeceği andır —
  o anda formu kapatmak yanlış yöne hata vermek olurdu. Zemin listelemede
  fail-closed seçilseydi Redis arızası 500'e, Next vekilinde "200 + boş liste"ye ve kullanıcının
  gözünde 93 zeminlik kütüphanenin yok olmasına dönüşüyordu. Kök `CLAUDE.md`'nin
  erişim kuralı 1 ile aynı mantık: listeleme bir kapı değil.
"""

import logging

from fastapi import Depends, Request
from redis.exceptions import RedisError
from app.core.auth import CurrentUser, get_current_user
from app.core.config import settings
from app.services.rate_limit import RequestRateLimiter
from app.services.billing.errors import billing_error

logger = logging.getLogger(__name__)

checkout_limiter = RequestRateLimiter(10, 60, redis_url=settings.redis_url)
public_limiter = RequestRateLimiter(600, 60, redis_url=settings.redis_url)
#: Faz 6 admin panelinin MUTASYON uçları (yükleme, kredi, silme, rol değişikliği).
#: Okuma uçları bu kovayı kullanmaz; onlar `limit_scoped` ile fail-open.
admin_limiter = RequestRateLimiter(60, 60, redis_url=settings.redis_url)
#: Destek formu: gerçek bir kullanıcı saatte birkaç mesajdan fazlasını yazmaz;
#: sınır, oturumlu bir hesabın tabloyu 4000 karakterlik satırlarla doldurmasını
#: engelliyor. Yön `limit_scoped` ile fail-open — gerekçe modül docstring'inde.
support_limiter = RequestRateLimiter(5, 3600, redis_url=settings.redis_url)


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


async def limit_admin(admin: CurrentUser = Depends(get_current_user)):
    """Admin panelinin yazan uçları — **fail-closed**, bilinçli.

    Burada korunan şey okuma trafiği değil: dosya yükleme, kredi verme, hesap
    silme ve rol değişikliği. Redis arızasında sınırın sessizce kalkması, yetkisi ele
    geçirilmiş tek bir admin oturumunun sınırsız hızla kredi basabilmesi
    demek olurdu. Panelin OKUMA uçları aynı gerekçeyle ters yöne kuruldu
    (`limit_scoped`, fail-open): orada kaybedilen şey yalnızca görünürlük.
    """
    retry = await admin_limiter.retry_after("billing:admin:" + str(admin.id))
    if retry:
        raise billing_error(
            "rate_limited", "Çok fazla yönetici isteği. Biraz bekleyin.", 429, retry
        )


async def limit_public(request: Request):
    retry = await public_limiter.retry_after("billing:public:" + client_ip(request))
    if retry:
        raise billing_error(
            "rate_limited", "Çok fazla istek. Biraz bekleyin.", 429, retry
        )


async def limit_scoped(
    request: Request, name: str, user_id=None, limiter: RequestRateLimiter = public_limiter
):
    """Oturum varsa kullanıcı başına, yoksa IP başına sınırlar.

    Zemin listesine tarayıcı doğrudan gelmiyor; istek Next.js vekilinden
    geçiyor ve backend'in gördüğü adres bütün kullanıcılar için AYNI. Salt
    IP'ye bağlı bir kova hepsini tek bütçeye sıkıştırırdı. Kimliği doğrulanmış
    kullanıcı kendi kovasını alır; anonim trafik IP kovasında kalır
    (doğrulanmamış bir başlıkla kova seçilemez).
    """
    scope = f"user:{user_id}" if user_id else f"ip:{client_ip(request)}"
    try:
        retry = await limiter.retry_after(f"billing:{name}:{scope}")
    except RedisError:
        # FAIL-OPEN, bilinçli — gerekçe modül docstring'inde. Sessiz değil:
        # log'a yazılıyor ki "sınır neden uygulanmadı" sorusu cevaplanabilsin.
        logger.warning(
            "Hız sınırı sorulamadı (Redis), istek sınırsız geçiyor: %s/%s", name, scope
        )
        return
    if retry:
        raise billing_error(
            "rate_limited", "Çok fazla istek. Biraz bekleyin.", 429, retry
        )
