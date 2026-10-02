"""Test Redis'ini oturum başında temizleme koruması (`tests/redis_safety.py`).

NEDEN: test Redis'i oturumlar arasında kalıyor; yükleme hız sınırı sayaçları da
onunla birlikte taşınıp, aynı sabit kullanıcıyla koşan testleri arka arkaya
koşularda 429'a düşürüyordu (02.10.2026, mutasyon turunda görüldü). Temizlik
yalnız `test.sh`'nin KENDİ açtığı Redis'te yapılır: geliştirme Redis'inde
bekleyen kesim işleri ve özgün fotoğraflar var, `FLUSHALL` onları silerdi.
"""

import uuid
from urllib.parse import urlsplit

import redis as sync_redis

from app.core.config import settings
from tests.conftest import LOCAL_REDIS_HOSTS
from tests.redis_safety import OWNED_FLAG, flush_owned_test_redis


def _seed() -> tuple[sync_redis.Redis, str]:
    assert (urlsplit(settings.redis_url).hostname or "") in LOCAL_REDIS_HOSTS
    client = sync_redis.Redis.from_url(settings.redis_url)
    key = f"test-flush-{uuid.uuid4()}"
    client.set(key, "1", ex=60)
    return client, key


def test_nothing_is_flushed_without_the_ownership_flag():
    client, key = _seed()
    try:
        assert flush_owned_test_redis(settings.redis_url, {}) is False
        assert client.exists(key) == 1
    finally:
        client.delete(key)
        client.close()


def test_flag_must_be_exactly_one():
    client, key = _seed()
    try:
        assert flush_owned_test_redis(settings.redis_url, {OWNED_FLAG: "true"}) is False
        assert client.exists(key) == 1
    finally:
        client.delete(key)
        client.close()


def test_owned_local_redis_is_flushed():
    client, key = _seed()
    try:
        assert flush_owned_test_redis(settings.redis_url, {OWNED_FLAG: "1"}) is True
        assert client.exists(key) == 0
    finally:
        client.close()


def test_remote_redis_is_never_flushed_even_with_the_flag():
    # Adres kontrolü bağlanmadan ÖNCE: uzak sunucuya bağlantı bile açılmaz.
    assert flush_owned_test_redis("redis://uzak-sunucu.example.com:6379/0", {OWNED_FLAG: "1"}) is False
