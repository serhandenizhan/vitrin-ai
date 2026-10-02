"""Tarama için backend başlatıcı: hız sınırlayıcıları DEVRE DIŞI.

Aktif tarama saniyeler içinde yüzlerce istek atar; sınırlayıcılar (ör. admin yazma
60/dk, fail-closed) taramayı 429'a boğup işleyicilere ulaştırmaz. Sınırlayıcıların
kendisi `tests/test_rate_limit_coverage.py`'de sınanıyor; ZAP işleyicileri sınar.
YALNIZ tarama örneğinde kullanılır, üretim koduna dokunmaz. Önce `backend_env.sh` kaynaklanır.
Kullanım (backend/ klasöründen): .venv/bin/python scripts/zap/scan_backend.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.services import rate_limit  # noqa: E402


async def _never(self, key):
    return None


rate_limit.RequestRateLimiter.retry_after = _never

import uvicorn  # noqa: E402

from app.main import app  # noqa: E402

uvicorn.run(app, host="127.0.0.1", port=8099, log_level="warning")
