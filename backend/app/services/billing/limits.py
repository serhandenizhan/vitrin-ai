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
#: CMYK dönüşümü (Next.js `/api/cmyk`, `sharp` ile 40 MP'ye kadar görsel): bir
#: kullanıcı birkaç boyutta indirme yapsa bile 10 dakikada 20 dönüşümü aşmaz.
#: Yön FAIL-CLOSED — bkz. `limit_cmyk`.
cmyk_limiter = RequestRateLimiter(20, 600, redis_url=settings.redis_url)
#: Oturumlu kullanıcının kendi verisini OKUMASI (çalışma listesi/ayrıntısı,
#: abonelik, ödeme geçmişi, kesim işi yoklaması). Yoklama sayfaları saniyede
#: bir istek atabilir; sınır bunu rahat karşılar, yalnız kötüye kullanımı keser.
#: Yön FAIL-OPEN — bkz. `limit_user_read`.
user_read_limiter = RequestRateLimiter(600, 60, redis_url=settings.redis_url)
#: Taslağın otomatik kaydı (stüdyo, 1,5 sn gecikmeli + kapanışta anında).
#: Yön FAIL-OPEN — bkz. `limit_project_write`.
project_write_limiter = RequestRateLimiter(300, 60, redis_url=settings.redis_url)
#: Çalışma silme (tek ya da toplu): gerçek bir kullanıcı dakikada onlarca kez
#: silmez; her silme R2'ye de istek atar. Yön FAIL-CLOSED — bkz. `limit_user_delete`.
user_delete_limiter = RequestRateLimiter(30, 60, redis_url=settings.redis_url)
#: Hesap silme geri alınamaz ve Supabase yönetici API'sine gider: saatte 5.
#: Yön FAIL-CLOSED — bkz. `limit_account_delete`.
account_delete_limiter = RequestRateLimiter(5, 3600, redis_url=settings.redis_url)


async def _retry_or_closed(limiter: RequestRateLimiter, key: str) -> int | None:
    """FAIL-CLOSED sorgu: Redis'e ulaşılamazsa 500 değil temiz bir 503 verir.

    Eskiden `limit_checkout`/`limit_admin`/`limit_public` `RedisError`'ı
    yakalamıyordu; istek yine reddediliyordu ama yakalanmamış istisnayla 500
    olarak. Yön değişmedi (kapalı), yalnız yanıt anlaşılır oldu.
    """
    try:
        return await limiter.retry_after(key)
    except RedisError as exc:
        logger.warning("Hız sınırı sorulamadı (Redis); istek reddedildi: %s", key.split(":")[1])
        raise billing_error(
            "rate_limit_unavailable",
            "Şu anda bu işlem yapılamıyor; birazdan tekrar deneyin.",
            503,
        ) from exc


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
    retry = await _retry_or_closed(checkout_limiter, "billing:checkout:" + str(user.id))
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
    retry = await _retry_or_closed(admin_limiter, "billing:admin:" + str(admin.id))
    if retry:
        raise billing_error(
            "rate_limited", "Çok fazla yönetici isteği. Biraz bekleyin.", 429, retry
        )


async def limit_cmyk(user: CurrentUser = Depends(get_current_user)):
    """CMYK dönüşüm izni — **fail-closed**, bilinçli (/cso incelemesi, 27.09.2026).

    Korunan şey sunucunun işlemcisi: her dönüşüm 40 MP'ye kadar bir görseli
    çözüp renk profiliyle yeniden kodluyor. Uç eskiden oturumsuz ve sınırsızdı;
    herkes sunucuyu bununla meşgul edebiliyordu. Redis arızasında sınırın
    sessizce kalkması aynı açığı geri getirirdi. Kaybedilen şey ise ana akış
    değil (kesim ve PNG indirme çalışmaya devam eder), yalnız CMYK dosyası
    birkaç dakika gecikir.
    """
    try:
        retry = await cmyk_limiter.retry_after("cmyk:" + str(user.id))
    except RedisError as exc:
        logger.warning("CMYK hız sınırı sorulamadı (Redis); istek reddedildi")
        raise billing_error(
            "rate_limit_unavailable",
            "Baskı dosyası şu anda hazırlanamıyor; birazdan tekrar deneyin.",
            503,
        ) from exc
    if retry:
        raise billing_error(
            "rate_limited",
            "Çok fazla baskı dosyası isteği. Biraz bekleyin.",
            429,
            retry,
        )


async def limit_public(request: Request):
    retry = await _retry_or_closed(public_limiter, "billing:public:" + client_ip(request))
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


async def limit_user_read(request: Request, user: CurrentUser = Depends(get_current_user)):
    """Kullanıcının kendi verisini okuyan uçlar — **fail-open**, bilinçli.

    Korunan şey okuma trafiği; sınırın altyapı arızasında kalkmasının bedeli
    sınırlı (sorgular kullanıcı filtreli ve sayfalı), kapatmanın bedeli ise
    kullanıcının kendi çalışmalarını/aboneliğini görememesi. Erişim kuralı 1
    (listeleme kapı değildir) ile aynı mantık.
    """
    await limit_scoped(request, "read", user.id, limiter=user_read_limiter)


async def limit_admin_read(request: Request, admin: CurrentUser = Depends(get_current_user)):
    """Yönetici paneli OKUMA uçları — fail-open (bkz. `limit_admin` docstring'i)."""
    await limit_scoped(request, "admin", admin.id)


async def limit_project_write(request: Request, user: CurrentUser = Depends(get_current_user)):
    """Taslak otomatik kaydı (PATCH) — **fail-open**, bilinçli.

    Yazan bir uç olduğu için varsayılan kapalı olurdu; ama burada Redis
    arızasında kapatmak kullanıcının STÜDYODA yaptığı düzenlemeyi kaybettirir
    (kayıt reddedilir, sekme kapanırsa iş gider). Bu, destek formundaki
    gerekçenin aynısı: kaybedilen şey ürünün kendisi. Veri kullanıcıya bağlı,
    küçük ve sahiplik filtreli; sınırsız geçmenin bedeli sınırlı.
    """
    await limit_scoped(request, "project-write", user.id, limiter=project_write_limiter)


async def limit_user_delete(user: CurrentUser = Depends(get_current_user)):
    """Çalışma silme — **fail-closed**: silme geri alınamaz ve R2'ye de istek atar."""
    retry = await _retry_or_closed(user_delete_limiter, "billing:delete:" + str(user.id))
    if retry:
        raise billing_error(
            "rate_limited", "Çok fazla silme isteği. Biraz bekleyin.", 429, retry
        )


async def limit_account_delete(user: CurrentUser = Depends(get_current_user)):
    """Hesap silme — **fail-closed**: geri alınamaz, Supabase yönetici API'sini tetikler."""
    retry = await _retry_or_closed(account_delete_limiter, "billing:account-delete:" + str(user.id))
    if retry:
        raise billing_error(
            "rate_limited", "Çok fazla hesap silme isteği. Daha sonra tekrar deneyin.", 429, retry
        )
