"""Arka plan kaldırma kuyruğu (Faz 7) — Redis üzerinde.

NEDEN: yük testinde süreç başına tek eşzamanlı kesim ve fazlasına anında 429
çıktı; Serhan'ın kararı (26.09.2026): istekler reddedilmez, SIRAYA girer ve
müşteri bunu hissetmez. Kesim API'den ayrı işçi süreçlerinde çalışır
(`app/workers/cutout.py`); API yalnız doğrular, kredi ayırır ve işi buraya
koyar. Kapasite, API'ye dokunmadan işçi eklenerek artar.

ANAHTARLAR (`<p>` = önek, testlerde her test kendi önekini kullanır):
  <p>:queue                 bekleyen iş kimlikleri (LPUSH ekler, işçi sağdan alır)
  <p>:processing:<işçi>     o işçinin elindeki işler (BLMOVE ile atomik geçiş)
  <p>:worker:<işçi>         işçinin nabzı (kısa TTL); yoksa işçi ölü sayılır
  <p>:job:<iş>              iş kaydı (hash): durum, kullanıcı, kredi ayırması…
  <p>:photo:<iş>            özgün fotoğraf baytları — en fazla PHOTO_TTL
  <p>:result:<iş>           teslim için kısa süre saklanan PNG
İş kimliği `<kullanıcı>:<Idempotency-Key>`: başka bir kullanıcı aynı anahtarı
gönderse bile başka bir kayda bakar (IDOR yapı gereği kapalı).

KVKK: özgün fotoğraf diske/R2'ye yazılmaz; Redis belleğinde iş bitene kadar,
en geç PHOTO_TTL (15 dk) tutulur ve iş bitince silinir. İşçi alırken değil
bitirince silinir: kesimin ortasında çöken bir işçinin işi başka bir işçiye
fotoğrafıyla birlikte verilebilsin.

"Diske yazılmaz" sözü Redis'in YAPILANDIRMASINA bağlı: varsayılan Redis
belleği `dump.rdb`'ye (RDB) yazar. Bu yüzden `enqueue` fotoğrafı koymadan önce
Redis'te RDB ve AOF'un kapalı olduğunu doğrular; açıksa fotoğrafı hiç almaz
(Codex incelemesi, 27.09.2026 — yerel Redis'te `save 3600 1 300 100 60 10000`
ve dolu bir `dump.rdb` bulundu). `CONFIG` komutu yasaklıysa (bazı yönetilen
Redis hizmetleri) kalıcılık doğrulanamaz ve fotoğraf YİNE alınmaz: doğrulanamayan
bir söz, verilmiş bir söz değildir (Codex incelemesi, 2. tur). Böyle bir Redis
seçilecekse karar Faz 7.5'te bilinçli olarak verilir (`backend/README.md` →
"Kesim kuyruğu").
"""

import asyncio
import logging
import time
import weakref
from dataclasses import dataclass

from redis.asyncio import Redis
from redis.exceptions import RedisError, ResponseError

logger = logging.getLogger("vitrin.cutout-queue")

#: Özgün fotoğrafın Redis'te kalabileceği en uzun süre (KVKK metninde yazılı).
PHOTO_TTL_SECONDS = 15 * 60
#: İş kaydının ömrü: fotoğraf ömrü + kesim süresi için pay.
JOB_TTL_SECONDS = 30 * 60
#: Biten sonucun kuyruktan teslim edilebileceği süre; sonrasında R2'deki
#: 24 saatlik idempotency kopyası kullanılır.
RESULT_TTL_SECONDS = 10 * 60

QUEUED = "queued"
PROCESSING = "processing"
DONE = "done"
FAILED = "failed"


#: KEYS: kuyruk, fotoğraf, iş kaydı. ARGV: üst sınır, fotoğraf, fotoğraf
#: TTL'i, kayıt TTL'i, iş kimliği, kullanıcı, anahtar, ayırma, eklenme anı.
#: Kuyruk doluysa hiçbir şey yazmadan 0 döner.
_ENQUEUE_SCRIPT = """
if redis.call('LLEN', KEYS[1]) >= tonumber(ARGV[1]) then
  return 0
end
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
redis.call('HSET', KEYS[3], 'status', 'queued', 'user_id', ARGV[6], 'request_id', ARGV[7],
  'reservation_id', ARGV[8], 'enqueued_at', ARGV[9], 'attempts', 0)
redis.call('EXPIRE', KEYS[3], ARGV[4])
redis.call('LPUSH', KEYS[1], ARGV[5])
return 1
"""


class QueueFull(Exception):
    """Kuyruk üst sınırda — fotoğraflar Redis belleğinde beklediği için sınırsız olamaz."""


class ClaimError(Exception):
    """Kuyruktan alınmış ama iş kaydı okunamamış; iş kimliği kurtarma için saklanır."""

    def __init__(self, job_id: str):
        super().__init__(job_id)
        self.job_id = job_id


class RedisPersistenceEnabled(RedisError):
    """Redis belleği diske yazıyor YA DA yazmadığı doğrulanamıyor: özgün
    fotoğraf kuyruğa konamaz.

    `RedisError` alt sınıfı: API bunu Redis'e ulaşılamaması gibi ele alır
    (kredi iade edilir, `503 queue_unavailable`).
    """


async def redis_persistence(redis) -> bool | None:
    """Redis diske yazıyor mu? True: RDB ya da AOF açık; False: ikisi de
    kapalı; None: doğrulanamadı (`CONFIG` komutu yasak)."""
    try:
        save = await redis.config_get("save")
        appendonly = await redis.config_get("appendonly")
    except ResponseError:
        return None
    save = {_text(k): _text(v) for k, v in save.items()}
    appendonly = {_text(k): _text(v) for k, v in appendonly.items()}
    return bool((save.get("save") or "").strip()) or appendonly.get("appendonly") == "yes"


@dataclass
class ClaimedJob:
    job_id: str
    user_id: str
    request_id: str
    reservation_id: str | None
    enqueued_at: float
    attempts: int
    photo: bytes | None  # None: fotoğrafın süresi dolmuş


def job_id_for(user_id, request_id) -> str:
    return f"{user_id}:{request_id}"


def _text(value) -> str | None:
    if value is None:
        return None
    return value.decode() if isinstance(value, bytes) else str(value)


class CutoutQueue:
    def __init__(self, redis_url: str, *, prefix: str = "cutout", max_jobs: int = 50):
        self._redis_url = redis_url
        self._prefix = prefix
        self.max_jobs = max_jobs
        # Redis bağlantısı açıldığı olay döngüsüne bağlıdır; testlerde her
        # TestClient ayrı döngü açar (bkz. app/services/rate_limit.py).
        self._clients: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, Redis]" = (
            weakref.WeakKeyDictionary()
        )

    # -- yardımcılar ------------------------------------------------------

    def _redis(self) -> Redis:
        loop = asyncio.get_running_loop()
        client = self._clients.get(loop)
        if client is None:
            client = Redis.from_url(self._redis_url)
            self._clients[loop] = client
        return client

    def _key(self, *parts: str) -> str:
        return ":".join((self._prefix, *parts))

    async def ensure_ephemeral(self) -> None:
        """Redis diske yazıyorsa `RedisPersistenceEnabled` fırlatır."""
        state = await redis_persistence(self._redis())
        if state:
            logger.error(
                "Redis diske yazıyor (RDB/AOF açık); özgün fotoğraflar kuyruğa "
                "konmuyor. Redis'i `--save \"\" --appendonly no` ile başlatın."
            )
            raise RedisPersistenceEnabled()
        if state is None:
            # Fail-closed: KVKK metni "diske yazılmaz" diyor ve bunu burada
            # kanıtlayamıyoruz. Uyarıp devam etmek sözü kanıtsız bırakırdı.
            logger.error(
                "Redis kalıcılık ayarı doğrulanamadı (CONFIG yasak); özgün "
                "fotoğraflar kuyruğa konmuyor. Redis'e CONFIG GET yetkisi verin."
            )
            raise RedisPersistenceEnabled()

    async def aclose(self) -> None:
        client = self._clients.pop(asyncio.get_running_loop(), None)
        if client is not None:
            await client.aclose()

    # -- API tarafı ---------------------------------------------------------

    async def get_job(self, user_id, request_id) -> dict | None:
        raw = await self._redis().hgetall(self._key("job", job_id_for(user_id, request_id)))
        if not raw:
            return None
        return {_text(k): _text(v) for k, v in raw.items()}

    async def queued_count(self) -> int:
        return int(await self._redis().llen(self._key("queue")))

    async def enqueue(self, user_id, request_id, reservation_id, photo: bytes) -> None:
        # Sınır kontrolü ile ekleme TEK bir Lua betiğinde (Redis'te atomik):
        # ayrı bir `LLEN` + ekleme, eşzamanlı isteklerin hepsinin boş kuyruk
        # görüp sınırı aşmasına izin veriyordu (Codex incelemesi, 27.09.2026 —
        # `max_jobs=1` ile 5 eşzamanlı istekten 5'i de kabul edilmişti).
        await self.ensure_ephemeral()
        job_id = job_id_for(user_id, request_id)
        accepted = await self._redis().eval(
            _ENQUEUE_SCRIPT,
            3,
            self._key("queue"),
            self._key("photo", job_id),
            self._key("job", job_id),
            self.max_jobs,
            photo,
            PHOTO_TTL_SECONDS,
            JOB_TTL_SECONDS,
            job_id,
            str(user_id),
            str(request_id),
            str(reservation_id) if reservation_id else "",
            repr(time.time()),
        )
        if not accepted:
            raise QueueFull()

    async def result(self, user_id, request_id) -> bytes | None:
        return await self._redis().get(self._key("result", job_id_for(user_id, request_id)))

    async def forget(self, user_id, request_id) -> None:
        """Başarısız bir işi unutur: aynı anahtarla yeniden deneme temiz başlar."""
        job_id = job_id_for(user_id, request_id)
        await self._redis().delete(
            self._key("job", job_id), self._key("photo", job_id), self._key("result", job_id)
        )

    # -- işçi tarafı ------------------------------------------------------

    async def heartbeat(self, worker_id: str, ttl_seconds: int = 30) -> None:
        await self._redis().set(self._key("worker", worker_id), "1", ex=ttl_seconds)

    async def claim(self, worker_id: str, timeout_seconds: float = 1.0) -> ClaimedJob | None:
        redis = self._redis()
        processing = self._key("processing", worker_id)
        raw_id = await redis.blmove(
            self._key("queue"), processing, timeout_seconds, "RIGHT", "LEFT"
        )
        if raw_id is None:
            return None
        job_id = _text(raw_id)
        try:
            job_key = self._key("job", job_id)
            pipe = redis.pipeline(transaction=True)
            pipe.hgetall(job_key)
            pipe.get(self._key("photo", job_id))
            pipe.hset(job_key, mapping={"status": PROCESSING, "worker": worker_id})
            pipe.hincrby(job_key, "attempts", 1)
            raw_job, photo, _, attempts = await pipe.execute()
            if not raw_job:
                # İş kaydının süresi dolmuş (çok uzun beklemiş); geride kalan
                # yarım kaydı ve listedeki kimliği temizle.
                await redis.delete(job_key)
                await redis.lrem(processing, 0, job_id)
                return None
            job = {_text(k): _text(v) for k, v in raw_job.items()}
            return ClaimedJob(
                job_id=job_id,
                user_id=job["user_id"],
                request_id=job["request_id"],
                reservation_id=job.get("reservation_id") or None,
                enqueued_at=float(job["enqueued_at"]),
                attempts=int(attempts),
                photo=photo,
            )
        except Exception as exc:
            raise ClaimError(job_id) from exc

    async def complete(
        self, worker_id: str | None, job_id: str, result: bytes | None, result_key: str | None
    ) -> None:
        """İşi bitmiş işaretler. `result` None olabilir: önceki bir deneme
        sonucu R2'ye saklayıp krediyi tüketmiş ama işi işaretleyemeden ölmüşse
        teslim `result_key`'deki saklanan kopyadan yapılır (inference tekrar
        çalışmaz, ikinci kredi harcanmaz)."""
        job_key = self._key("job", job_id)
        pipe = self._redis().pipeline(transaction=True)
        if result is not None:
            pipe.set(self._key("result", job_id), result, ex=RESULT_TTL_SECONDS)
        pipe.hset(job_key, mapping={"status": DONE, "result_key": result_key or ""})
        pipe.expire(job_key, RESULT_TTL_SECONDS)
        pipe.delete(self._key("photo", job_id))
        if worker_id:
            pipe.lrem(self._key("processing", worker_id), 0, job_id)
        await pipe.execute()

    async def fail(self, worker_id: str | None, job_id: str, code: str, *, retry_safe: bool) -> None:
        job_key = self._key("job", job_id)
        pipe = self._redis().pipeline(transaction=True)
        pipe.hset(
            job_key,
            mapping={"status": FAILED, "error_code": code, "retry_safe": "1" if retry_safe else ""},
        )
        pipe.delete(self._key("photo", job_id))
        if worker_id:
            pipe.lrem(self._key("processing", worker_id), 0, job_id)
        await pipe.execute()

    async def requeue(self, worker_id: str, job_id: str) -> bool:
        """Beklenmedik işçi hatasından sonra işi aynı kimlikle yeniden sıraya koyar."""
        # Önceki deneme işi bitirdiyse processing listesinde artık yoktur.
        # Liste ve durum değişimi tek betikte yapılır; başka işçi araya giremez.
        moved = await self._redis().eval(
            """
            if redis.call('LREM', KEYS[1], 1, ARGV[1]) == 0 then return 0 end
            if redis.call('EXISTS', KEYS[2]) == 0 then return 0 end
            redis.call('HSET', KEYS[2], 'status', 'queued')
            redis.call('RPUSH', KEYS[3], ARGV[1])
            return 1
            """,
            3,
            self._key("processing", worker_id),
            self._key("job", job_id),
            self._key("queue"),
            job_id,
        )
        return bool(moved)

    async def recover_stale(self, *, max_attempts: int = 2) -> list[tuple[str, str | None]]:
        """Nabzı kesilmiş işçilerin elindeki işleri kurtarır.

        Fotoğrafı duran ve deneme hakkı kalan iş kuyruğun ÖNÜNE geri konur
        (bir sonraki alınan o olur — sırası kaybolmasın). Kalanlar döndürülür:
        çağıran (işçi) onları başarısız işaretleyip kredisini iade eder;
        kredi iadesi veritabanı işi olduğu için burada yapılmaz.
        Aynı anda iki işçinin aynı işi kurtarmaması için kısa bir kilit alınır.
        """
        redis = self._redis()
        if not await redis.set(self._key("recovery-lock"), "1", nx=True, ex=30):
            return []
        to_fail: list[tuple[str, str | None]] = []
        try:
            async for raw_key in redis.scan_iter(match=self._key("processing", "*")):
                processing = _text(raw_key)
                worker_id = processing.rsplit(":", 1)[-1]
                if await redis.exists(self._key("worker", worker_id)):
                    continue
                while True:
                    raw_id = await redis.rpop(processing)
                    if raw_id is None:
                        break
                    job_id = _text(raw_id)
                    job_key = self._key("job", job_id)
                    attempts = int(await redis.hget(job_key, "attempts") or 0)
                    has_photo = await redis.exists(self._key("photo", job_id))
                    if has_photo and attempts < max_attempts:
                        await redis.hset(job_key, "status", QUEUED)
                        # Sağdan alındığı için sağa konan iş bir sonraki olur.
                        await redis.rpush(self._key("queue"), job_id)
                    else:
                        reservation = _text(await redis.hget(job_key, "reservation_id"))
                        to_fail.append((job_id, reservation or None))
        finally:
            await redis.delete(self._key("recovery-lock"))
        return to_fail
