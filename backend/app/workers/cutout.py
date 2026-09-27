"""Kesim işçisi (Faz 7) — kuyruktan iş alır, arka planı kaldırır.

Çalıştırma: `python -m app.workers.cutout` (backend klasöründen). Modeli
BİR KEZ yükler ve `MAX_CONCURRENT_INFERENCES` kadar işi aynı anda işler;
eşzamanlı kesimler aynı model kopyasını paylaşır (onnxruntime oturumu
iş parçacıkları arasında paylaşılabilir). Daha fazla kapasite için başka bir
makinede ikinci bir işçi açılır; API'ye dokunulmaz.

Kredi sözleşmesi API'deki eski akışla AYNI (kök CLAUDE.md "Ödemeler"):
sonuç ÖNCE R2'ye saklanır, kredi SONRA tüketilir; herhangi bir hata yolunda
kredi iade edilir ve iş `retry_safe` olarak işaretlenir — istemci ancak o
zaman yeni bir idempotency anahtarına geçer.

Bir iş BİRDEN FAZLA kez işlenebilir: işçi krediyi tükettikten sonra, işi
Redis'te bitmiş işaretleyemeden ölürse kurtarma işi onu kuyruğa geri koyar.
Bu yüzden `retry_safe` YALNIZCA kredinin gerçekten iade edildiği durumda
yazılır; ayırma zaten tüketilmişse iş başarılı sayılır ve saklanan sonuç
teslim edilir (Codex incelemesi, 27.09.2026: aksi hâlde ikinci deneme
tüketilmiş krediye ait sonucu siliyor, ön yüz de sessizce yeni bir kredi
harcıyordu).
"""

import asyncio
import logging
import os
import signal
import socket
import time
import uuid

import anyio
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings
from app.core.db import _session_factory
from app.services.background_removal import BackgroundRemovalService, _get_session
from app.services.billing.entitlements import (
    register_result_attempt,
    reservation_outcome,
    resolve_reservation,
)
from app.services.cutout_queue import PHOTO_TTL_SECONDS, ClaimedJob, CutoutQueue
from app.services.storage import R2ConfigurationError, R2StorageService, get_storage_service

logger = logging.getLogger("vitrin.cutout-worker")

STORAGE_ERRORS = (BotoCoreError, ClientError, R2ConfigurationError)
HEARTBEAT_SECONDS = 10
HEARTBEAT_TTL_SECONDS = 30
RECOVERY_SECONDS = 30


def result_key_for(job: ClaimedJob) -> str:
    # Her DENEME kendi anahtarına yazar (Codex incelemesi, 2. tur): iki işçi
    # aynı işi paralel yürütürse (nabzı gecikip kurtarılan işçi) sabit bir
    # anahtarda sonra yükleyen, kredisi ödenmiş sonucun ÜZERİNE yazıyordu.
    # Hangi anahtarın ödendiği `usage_reservations.result_r2_key`'de durur;
    # tüm denemeler yüklemeden önce `cutout_result_attempts`'a kaydedilir;
    # sonucu okuyan her yer ödenen anahtarı DB'den alır. `results/<kullanıcı>/`
    # öneki korunur: hesap silme temizliği bu önekle çalışıyor.
    return f"results/{job.user_id}/{job.request_id}-{uuid.uuid4().hex[:12]}.png"


class CutoutWorker:
    def __init__(
        self,
        *,
        queue: CutoutQueue,
        service: BackgroundRemovalService,
        storage: R2StorageService,
        session_factory=_session_factory,
        worker_id: str | None = None,
    ):
        self.queue = queue
        self.service = service
        self.storage = storage
        self.session_factory = session_factory
        self.worker_id = worker_id or f"{socket.gethostname()}-{os.getpid()}-{uuid.uuid4().hex[:6]}"

    async def _resolve(self, reservation_id, success, result_key=None) -> bool:
        if not reservation_id:
            return True  # yönetici: kotadan muaf, kredi hareketi yok
        async with self.session_factory() as db:
            return await resolve_reservation(db, uuid.UUID(reservation_id), success, result_key)

    async def _outcome(self, reservation_id) -> tuple[str | None, str | None]:
        async with self.session_factory() as db:
            return await reservation_outcome(db, uuid.UUID(reservation_id))

    async def _register_attempt(self, reservation_id, result_key) -> bool:
        async with self.session_factory() as db:
            return await register_result_attempt(db, uuid.UUID(reservation_id), result_key)

    async def _finish_settled(self, job_id, reservation_id, code, worker_id) -> None:
        """Ayırma bu işçiden önce sonuçlanmış. Tüketildiyse iş BAŞARILIDIR
        (önceki deneme sonucu saklayıp krediyi harcamış): saklanan kopya
        teslim edilir. İade edildiyse istemci yeni anahtarla deneyebilir."""
        status, stored_key = await self._outcome(reservation_id)
        if status == "consumed":
            await self.queue.complete(worker_id, job_id, None, stored_key)
        else:
            await self.queue.fail(worker_id, job_id, code, retry_safe=True)

    async def _refund_and_fail(self, job_id, reservation_id, code, worker_id=None) -> None:
        # Kredi iadesi kesintiye uğramasın: süreç kapanırken bile tamamlanır.
        with anyio.CancelScope(shield=True):
            if await self._resolve(reservation_id, False):
                await self.queue.fail(worker_id, job_id, code, retry_safe=True)
            else:
                # İade edilemedi: ayırma zaten sonuçlanmış. Tüketilmiş bir
                # krediyi "iade edildi, yeniden dene" diye bildirmek, istemciyi
                # ikinci bir krediye yönlendirirdi.
                await self._finish_settled(job_id, reservation_id, code, worker_id)

    async def process(self, job: ClaimedJob) -> None:
        if job.reservation_id:
            status, _ = await self._outcome(job.reservation_id)
            if status != "pending":
                # Önceki bir deneme işi bitirmiş ya da bakım işi krediyi iade
                # etmiş: inference tekrar çalışmaz, saklanan sonucun üzerine
                # yazılmaz.
                await self._finish_settled(
                    job.job_id, job.reservation_id, "reservation_released", self.worker_id
                )
                return
        if job.photo is None or time.time() - job.enqueued_at > PHOTO_TTL_SECONDS:
            # Fotoğraf 15 dk içinde işlenemedi (KVKK süresi doldu).
            await self._refund_and_fail(job.job_id, job.reservation_id, "job_expired", self.worker_id)
            return
        try:
            result = await anyio.to_thread.run_sync(self.service.remove, job.photo)
        except Exception:
            logger.exception("Kesim başarısız: %s", job.job_id)
            await self._refund_and_fail(job.job_id, job.reservation_id, "processing_failed", self.worker_id)
            return
        except BaseException:
            await self._refund_and_fail(job.job_id, job.reservation_id, "processing_failed", self.worker_id)
            raise

        result_key = None
        if job.reservation_id:
            result_key = result_key_for(job)
            if not await self._register_attempt(job.reservation_id, result_key):
                await self._finish_settled(
                    job.job_id, job.reservation_id, "reservation_released", self.worker_id
                )
                return
            try:
                await self.storage.upload(result_key, result, "image/png")
            except STORAGE_ERRORS:
                logger.warning("Sonuç saklanamadı: %s", job.job_id)
                await self._refund_and_fail(
                    job.job_id, job.reservation_id, "result_storage_unavailable", self.worker_id
                )
                return
        if not await self._resolve(job.reservation_id, True, result_key):
            # Bu denemenin yüklediği nesne kimseye ait değil: ya bakım işi
            # krediyi iade etti ya da aynı işin başka bir denemesi krediyi
            # KENDİ sonucu için tüketti. İkisinde de bu nesne silinir; ödenen
            # sonuç (başka anahtarda) hiç değişmez.
            if result_key:
                try:
                    await self.storage.delete(result_key)
                except STORAGE_ERRORS:
                    logger.warning("Sahipsiz sonuç silinemedi: %s", result_key)
            status, stored_key = await self._outcome(job.reservation_id)
            if status == "consumed":
                # Müşterinin parası diğer denemenin sonucuna ödendi: teslim
                # edilen de o (baytlar R2'den, `result_key` üzerinden).
                await self.queue.complete(self.worker_id, job.job_id, None, stored_key)
                return
            await self.queue.fail(self.worker_id, job.job_id, "reservation_released", retry_safe=True)
            return
        await self.queue.complete(self.worker_id, job.job_id, result, result_key)

    async def recover_once(self) -> int:
        """Ölü işçilerin işlerini geri alır; kurtarılamayanların kredisini iade eder."""
        lost = await self.queue.recover_stale()
        for job_id, reservation_id in lost:
            await self._refund_and_fail(job_id, reservation_id, "worker_lost")
        return len(lost)

    async def run(self, concurrency: int, stop: asyncio.Event) -> None:
        await self.queue.heartbeat(self.worker_id, HEARTBEAT_TTL_SECONDS)

        async def heartbeat():
            while not stop.is_set():
                await self.queue.heartbeat(self.worker_id, HEARTBEAT_TTL_SECONDS)
                await asyncio.sleep(HEARTBEAT_SECONDS)

        async def recovery():
            while not stop.is_set():
                try:
                    await self.recover_once()
                except Exception:
                    logger.exception("Kurtarma turu başarısız")
                await asyncio.sleep(RECOVERY_SECONDS)

        async def consumer():
            while not stop.is_set():
                job = await self.queue.claim(self.worker_id, timeout_seconds=1)
                if job is not None:
                    await self.process(job)

        background = [asyncio.create_task(heartbeat()), asyncio.create_task(recovery())]
        try:
            # Durdurma isteğinde tüketiciler yeni iş almaz, eldekini bitirir.
            await asyncio.gather(*(consumer() for _ in range(concurrency)))
        finally:
            for task in background:
                task.cancel()
            await asyncio.gather(*background, return_exceptions=True)


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    from app.core.monitoring import init_error_tracking

    init_error_tracking()
    queue = CutoutQueue(
        settings.redis_url,
        prefix=settings.cutout_queue_prefix,
        max_jobs=settings.cutout_queue_max_jobs,
    )
    worker = CutoutWorker(
        queue=queue,
        service=BackgroundRemovalService(model_name=settings.rembg_model_name),
        storage=get_storage_service(),
    )
    concurrency = settings.max_concurrent_inferences
    logger.info("Model yükleniyor (%s)…", settings.rembg_model_name)
    # İlk müşteri 30 sn'lik model yüklemesini beklemesin: iş almadan önce yükle.
    await anyio.to_thread.run_sync(_get_session, settings.rembg_model_name)
    logger.info("İşçi hazır: %s, eşzamanlı kesim %d", worker.worker_id, concurrency)

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:
            # Windows'ta (Kaan'ın ortamı, .vscode/tasks.json) olay döngüsü
            # sinyal işleyicisini desteklemiyor; Ctrl+C orada KeyboardInterrupt
            # olarak gelir ve süreci kapatır. Yarım kalan iş, nabız kesildiği
            # için başka bir işçi tarafından kurtarılır.
            pass
    try:
        await worker.run(concurrency, stop)
    finally:
        await queue.aclose()
        logger.info("İşçi durdu: %s", worker.worker_id)


if __name__ == "__main__":
    asyncio.run(main())
