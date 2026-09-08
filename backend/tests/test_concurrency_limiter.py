import asyncio

import pytest

from app.services.concurrency import CapacityExceededError, InferenceCapacityLimiter


async def _hold_permit(limiter: InferenceCapacityLimiter, started: asyncio.Event, release: asyncio.Event) -> None:
    # `anyio.CapacityLimiter.acquire_nowait()` izni "mevcut task" kimliğine
    # bağlar; bu yüzden eşzamanlı bir isteği gerçekçi şekilde simüle etmek için
    # ayrı bir asyncio Task olarak çalıştırılmalı (aynı task içinde iç içe
    # `acquire()` çağırmak farklı bir hatayla karışır, iki farklı isteği temsil
    # etmez).
    async with limiter.acquire():
        started.set()
        await release.wait()


def test_rejects_immediately_without_waiting_when_capacity_is_full():
    limiter = InferenceCapacityLimiter(total_tokens=1)

    async def scenario():
        started = asyncio.Event()
        release = asyncio.Event()
        holder_task = asyncio.create_task(_hold_permit(limiter, started, release))
        await started.wait()

        # Kapasite doluyken ikinci "istek" beklemeden anında
        # `CapacityExceededError` almalı.
        with pytest.raises(CapacityExceededError):
            async with limiter.acquire():
                pass  # pragma: no cover - buraya hiç ulaşılmamalı

        release.set()
        await holder_task

    asyncio.run(scenario())


def test_accepts_new_request_after_permit_is_released():
    limiter = InferenceCapacityLimiter(total_tokens=1)

    async def scenario():
        async with limiter.acquire():
            pass  # izin burada serbest bırakılıyor

        entered = False
        async with limiter.acquire():
            entered = True
        assert entered

    asyncio.run(scenario())


def test_second_concurrent_request_accepted_when_total_tokens_is_two():
    limiter = InferenceCapacityLimiter(total_tokens=2)

    async def scenario():
        started = asyncio.Event()
        release = asyncio.Event()
        holder_task = asyncio.create_task(_hold_permit(limiter, started, release))
        await started.wait()

        entered_second = False
        async with limiter.acquire():
            entered_second = True
        assert entered_second

        release.set()
        await holder_task

    asyncio.run(scenario())


def test_third_concurrent_request_rejected_when_total_tokens_is_two():
    limiter = InferenceCapacityLimiter(total_tokens=2)

    async def scenario():
        started_a, release_a = asyncio.Event(), asyncio.Event()
        started_b, release_b = asyncio.Event(), asyncio.Event()
        task_a = asyncio.create_task(_hold_permit(limiter, started_a, release_a))
        task_b = asyncio.create_task(_hold_permit(limiter, started_b, release_b))
        await started_a.wait()
        await started_b.wait()

        with pytest.raises(CapacityExceededError):
            async with limiter.acquire():
                pass  # pragma: no cover - buraya hiç ulaşılmamalı

        release_a.set()
        release_b.set()
        await task_a
        await task_b

    asyncio.run(scenario())
