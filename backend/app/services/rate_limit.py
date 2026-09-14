"""Process icinde kayan pencereli istek hizi siniri."""

import asyncio
import math
import time
from collections import deque
from collections.abc import Callable


class RequestRateLimiter:
    """Anahtar basina son `window_seconds` icindeki istekleri sinirlar."""

    def __init__(
        self,
        requests: int,
        window_seconds: int,
        *,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.requests = requests
        self.window_seconds = window_seconds
        self._clock = clock
        self._events: dict[str, deque[float]] = {}
        self._lock = asyncio.Lock()

    async def retry_after(self, key: str) -> int | None:
        now = self._clock()
        cutoff = now - self.window_seconds
        async with self._lock:
            events = self._events.setdefault(key, deque())
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self.requests:
                return max(1, math.ceil(events[0] + self.window_seconds - now))
            events.append(now)

            # Uzun yasayan worker'da bir kez gorulen IP/kullanici anahtarlari
            # sonsuza kadar birikmesin.
            for stale_key in [
                candidate
                for candidate, candidate_events in self._events.items()
                if candidate != key and (not candidate_events or candidate_events[-1] <= cutoff)
            ]:
                del self._events[stale_key]
        return None
