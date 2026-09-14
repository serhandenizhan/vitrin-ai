"""Redis tabanli, dagitik kayan pencere (sliding window log) istek hizi siniri.

Faz 4 kapanisina kadar bu process-ici bir `dict`+`deque` idi (bkz. git
gecmisi): coklu worker/instance'da her worker kendi sayacini tuttugu icin
gercek limit worker sayisiyla carpiliyordu (`SECURITY.md`'de "Faz 7'de
dagitik rate limiting" olarak bekleyen madde buydu; PR #13 incelemesinde
one cekildi). Simdi durum Redis'te tutuluyor — ayni anahtar (`user:<id>`
ya da `ip:<adres>`) hangi worker'a duserse dussun ayni sayaci paylasiyor.
"""

import asyncio
import time
import uuid
import weakref
from collections.abc import Callable

from redis.asyncio import Redis

# Anahtar oncesine eklenen ortak namespace — hem birden fazla RequestRateLimiter
# ornegi (ip/user) hem de Redis'in ileride baska bir amacla (ör. Celery/RQ
# broker'i) kullanilma ihtimali ayni anahtar uzayini paylasmasin diye.
_KEY_PREFIX = "vitrin:ratelimit"

# ZREMRANGEBYSCORE + ZCARD + (gerekiyorsa) ZADD tek bir Lua script'inde,
# ATOMIK calisiyor: bu ucunu Python tarafinda ayri komutlar olarak yazsaydik,
# iki farkli istek (iki farkli worker'da, ayni anda) araya girip ikisi de
# "sinirin altindayim" sonucuna ulasabilir ve limit asilirdi — tam da
# process-ici implementasyonun COZEMEDIGI yaris durumunun Redis'e tasinmis
# hali olurdu.
_SLIDING_WINDOW_SCRIPT = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry_after = math.ceil(tonumber(oldest[2]) + window - now)
  if retry_after < 1 then
    retry_after = 1
  end
  return retry_after
end

redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, window)
return 0
"""


class RequestRateLimiter:
    """Anahtar basina son `window_seconds` icindeki istekleri sinirlar.

    `redis.asyncio.Redis` baglantilari acildiklari event loop'a baglanir ve
    baska bir loop'tan kullanilamaz. Uretimde tek bir process boyunca tek bir
    loop (uvicorn'unki) var, ama testlerde her `TestClient` kendi loop'unu
    acan ayri bir anyio portal'i kullaniyor — TEK bir modul-seviyesi Redis
    nesnesi paylasilsaydi ikinci portal ilkinin baglantisini baska bir
    loop'tan kullanmaya calisip cokerdi (birebir olculdu). Bu yuzden istemci
    burada URL'den degil, calisan loop basina TEMBEL olusturuluyor: her loop
    kendi baglantisini acar, hicbiri bir digerininkini paylasmaz.
    """

    def __init__(
        self,
        requests: int,
        window_seconds: int,
        *,
        redis_url: str,
        # Varsayilan `time.time()` (duvar saati) — `time.monotonic()` her
        # process/host icin farkli, keyfi bir referans noktasindan sayar ve
        # PAYLASILAN bir Redis'teki skorlar farkli worker'lar arasinda
        # KIYASLANAMAZ olurdu. Testler deterministik bir sahte saat enjekte
        # edebilir; uretimde gercek duvar saati kullanilir (worker'lar
        # arasinda makul olcude senkron oldugu varsayilir).
        clock: Callable[[], float] = time.time,
    ):
        self.requests = requests
        self.window_seconds = window_seconds
        self._redis_url = redis_url
        self._clock = clock
        self._clients: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, Redis]" = (
            weakref.WeakKeyDictionary()
        )

    def _client_for_running_loop(self) -> Redis:
        loop = asyncio.get_running_loop()
        client = self._clients.get(loop)
        if client is None:
            client = Redis.from_url(self._redis_url)
            self._clients[loop] = client
        return client

    async def retry_after(self, key: str) -> int | None:
        client = self._client_for_running_loop()
        now = self._clock()
        # Ayni skorla (ayni saniye ici) birden fazla istek gelirse ZADD'nin
        # ayni member'i GUNCELLEMEK yerine ayri bir eleman olarak sayilmasi
        # icin her cagriya benzersiz bir member uretiliyor.
        member = f"{now!r}:{uuid.uuid4()}"
        result = await client.eval(
            _SLIDING_WINDOW_SCRIPT,
            1,
            f"{_KEY_PREFIX}:{key}",
            now,
            self.window_seconds,
            self.requests,
            member,
        )
        retry_after = int(result)
        return retry_after or None

    async def aclose(self) -> None:
        """Su anki (calisan) loop'a ait baglantiyi kapatir — uygulama
        kapanirken lifespan'dan cagrilir. Hic istek gelmediyse (hicbir loop
        icin istemci hic olusturulmadiysa) no-op'tur.
        """
        loop = asyncio.get_running_loop()
        client = self._clients.pop(loop, None)
        if client is not None:
            await client.aclose()
