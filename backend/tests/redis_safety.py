"""Test Redis'ini oturum başında temizleme (yalnız `test.sh`'nin kendi Redis'i)."""

from collections.abc import Mapping
from urllib.parse import urlsplit

import redis as sync_redis

#: `test.sh`, kendi compose projesinde açtığı Redis için bunu `1` yapar.
OWNED_FLAG = "VITRIN_TEST_REDIS_OWNED"
#: Test Redis'inin yerel sayılan adresleri (TEK kaynak: conftest de buradan alır).
LOCAL_REDIS_HOSTS = frozenset({"localhost", "127.0.0.1", "::1", "redis"})


def flush_owned_test_redis(redis_url: str, environ: Mapping[str, str]) -> bool:
    """Bayrak `1` ve adres yerelse `redis_url`'in veritabanını temizler; temizlediyse True döner.

    Bayrak yoksa hiçbir şey yapılmaz: düz `pytest` geliştirme Redis'ine
    (bekleyen kesim işleri, fotoğraflar) yönelmiş olabilir. Redis'e
    ulaşılamıyorsa sessizce vazgeçilir; asıl hata onu kullanan testte okunur.
    """
    if environ.get(OWNED_FLAG) != "1":
        return False
    if (urlsplit(redis_url).hostname or "").lower() not in LOCAL_REDIS_HOSTS:
        return False
    client = sync_redis.Redis.from_url(redis_url)
    try:
        # FLUSHDB: yalnız `REDIS_URL`'in gösterdiği veritabanı (varsayılan 0). FLUSHALL aynı
        # sunucudaki diğer veritabanlarını da silerdi (PR #46 incelemesi, M3).
        client.flushdb()
    except sync_redis.RedisError:
        return False
    finally:
        client.close()
    return True
