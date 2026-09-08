from contextlib import asynccontextmanager
from typing import AsyncIterator

import anyio


class CapacityExceededError(Exception):
    """Kapasite dolu; çağıran istek beklemeden anında 429 üretmeli."""


class InferenceCapacityLimiter:
    """`anyio.CapacityLimiter` tabanlı, gerçek non-blocking sözleşmeli eşzamanlılık sınırı.

    Bu, sürece/worker'a özgüdür: çoklu uvicorn worker'ı ile dağıtımda her worker
    kendi bağımsız limitine sahip olur, toplam eşzamanlı inference sayısı
    `worker_sayısı × total_tokens` olur. Kalıcı, süreçler-arası global bir sınır
    için Celery/RQ + Redis kuyruğuna geçmek gerekir (bkz. kök CLAUDE.md).

    `acquire_nowait()`/`release()` anyio tarafından dokümante edilmiş gerçek bir
    non-blocking sözleşme sunar (kapasite doluysa senkron olarak `anyio.WouldBlock`
    fırlatır) — `Semaphore._value` gibi özel alanlara erişmek veya
    `timeout=0` gibi zamanlamaya dayalı kırılgan bir yaklaşım kullanmak yerine
    tercih edilir.
    """

    def __init__(self, total_tokens: int):
        self._limiter = anyio.CapacityLimiter(total_tokens)

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator[None]:
        try:
            self._limiter.acquire_nowait()
        except anyio.WouldBlock as exc:
            raise CapacityExceededError() from exc

        try:
            yield
        finally:
            self._limiter.release()
