"""Backend yük testi (Faz 7) — yerelde, gerçek model/Postgres/Redis ile.

NEYİ CEVAPLAR:
  inference  Aynı anda birden fazla arka plan kaldırma isteği gelince ne olur?
             Kabul sınırlayıcısı (MAX_CONCURRENT_INFERENCES) fazlasını gövdeyi
             okumadan 429'la geri çeviriyor mu, bellek sınırlı kalıyor mu, ve
             inference sürerken DİĞER uçlar (sağlık, proje listesi) yanıt
             vermeye devam ediyor mu (model iş parçacığında çalışıyor; olay
             döngüsü tıkanıyor mu)?
  read       Veritabanına giden okuma uçlarının eşzamanlılık 10/25/50'de
             gecikmesi ve hata oranı nedir (bağlantı havuzu varsayılanı 5+10)?

İKİ ADIM (iki ayrı terminal ya da biri arka planda):
  .venv/bin/python scripts/load_test.py serve --database-url <yerel-test-db> --state <durum.json>
  .venv/bin/python scripts/load_test.py run inference --state <durum.json> --photo <foto> --clients 4
  .venv/bin/python scripts/load_test.py run read --state <durum.json>

`serve` gerçek uygulamayı açar; yalnız iki şey değiştirilir:
  - Depolama bellekte sahtedir. R2 PRODUCTION ile ortak; yük testi oraya
    tek bir nesne yazmaz.
  - Kimlik doğrulama gerçek JWT doğrulamasıdır, ama anahtar Supabase'in değil,
    bu sürecin ürettiği test anahtarıdır (testlerdeki `tokens` ile aynı yol).
Kullanıcılar verilen TEST veritabanına eklenir; veritabanı yerel olmalı ve
`execute.sh`'ın kullandığı `vitrin_ai` olmamalı (orayı kirletmesin).

SINIRLAR (sonuç okunurken akılda tutulmalı): tek makine, istemci ve sunucu
aynı CPU'yu paylaşıyor; macOS belleği sıkıştırdığı için RSS Linux'taki
değerden düşük görünebilir. Canlı sunucu ölçümü Faz 7.5'te.
"""

import argparse
import asyncio
import json
import os
import statistics
import subprocess
import sys
import time
import uuid
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
TEST_SUPABASE_URL = "https://yuk-testi.supabase.example"
KEY_ID = "yuk-testi-anahtari"


# ---------------------------------------------------------------------------
# serve
# ---------------------------------------------------------------------------


def _check_database_url(url: str) -> None:
    from sqlalchemy.engine import make_url

    parsed = make_url(url)
    if parsed.host not in LOCAL_HOSTS:
        sys.exit(f"Yük testi yalnız YEREL veritabanında koşar (verilen: {parsed.host})")
    if parsed.database == "vitrin_ai":
        sys.exit("execute.sh'ın veritabanı (vitrin_ai) kullanılamaz; ayrı bir test veritabanı verin")


class MemoryStorage:
    """R2 yerine bellekte depo — yük testi gerçek bucket'a asla yazmaz."""

    def __init__(self):
        self.objects: dict[str, bytes] = {}

    def ensure_configured(self) -> None:
        return None

    async def upload(self, key, content, content_type=None):
        self.objects[key] = content

    async def download(self, key):
        return self.objects[key]

    async def delete(self, key):
        self.objects.pop(key, None)

    def generate_presigned_url(self, key, expires_in=None):
        return f"https://bellek.example/{key}"


async def _create_users(count: int, admins: int) -> tuple[list[str], list[str]]:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    from app.core.config import settings

    engine = create_async_engine(settings.database_url)
    users, admin_ids = [], []
    async with engine.begin() as conn:
        for index in range(count + admins):
            user_id = uuid.uuid4()
            await conn.execute(
                text("insert into auth.users (id, email) values (:id, :email)"),
                {"id": user_id, "email": f"yuk-{user_id}@test.example"},
            )
            if index < count:
                users.append(str(user_id))
            else:
                await conn.execute(
                    text("insert into admin_users (user_id) values (:id)"), {"id": user_id}
                )
                admin_ids.append(str(user_id))
    await engine.dispose()
    return users, admin_ids


def serve(args) -> None:
    _check_database_url(args.database_url)
    os.environ["DATABASE_URL"] = args.database_url
    # Yükleme hız sınırları yük testini değil kendini ölçerdi; yüksek tutulur.
    # Hız sınırının KENDİSİ ayrı testlerde (tests/test_upload_rate_limit_*) sınanıyor.
    os.environ.setdefault("UPLOAD_IP_RATE_LIMIT_REQUESTS", "100000")
    os.environ.setdefault("UPLOAD_USER_RATE_LIMIT_REQUESTS", "100000")
    os.environ["SENTRY_DSN"] = ""

    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        check=True,
        env={**os.environ, "DATABASE_URL": args.database_url},
    )

    import jwt
    import uvicorn
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    from app.core import auth as auth_module
    from app.core.config import settings
    from app.main import app
    from app.services.storage import get_storage_service

    private_key = ec.generate_private_key(ec.SECP256R1())
    public_jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(private_key.public_key()))
    public_jwk.update({"kid": KEY_ID, "alg": "ES256", "use": "sig"})
    settings.supabase_url = TEST_SUPABASE_URL
    settings.supabase_legacy_jwt_secret = ""
    jwt.PyJWKClient.fetch_data = lambda self: {"keys": [public_jwk]}
    auth_module.get_jwks_client.cache_clear()

    storage = MemoryStorage()
    app.dependency_overrides[get_storage_service] = lambda: storage

    if args.pool_size:
        # YALNIZ TEŞHİS: üretimdeki havuz varsayılanı (5 + 10 taşma) değişmez;
        # bu seçenek "gecikme havuz beklemesinden mi" sorusunu ölçmek içindir.
        from sqlalchemy.ext.asyncio import create_async_engine

        from app.core import db as db_module

        db_module._session_factory.configure(
            bind=create_async_engine(args.database_url, pool_size=args.pool_size, max_overflow=0)
        )

    users, admins = asyncio.run(_create_users(args.users, args.admins))
    state = {
        "base_url": f"http://127.0.0.1:{args.port}",
        "pid": os.getpid(),
        "users": users,
        "admins": admins,
        "private_key_pem": private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ).decode(),
        "max_concurrent_inferences": settings.max_concurrent_inferences,
        "pool_size": args.pool_size or "varsayılan (5 + 10 taşma)",
    }
    Path(args.state).write_text(json.dumps(state))
    print(f"hazır: {state['base_url']} (pid {state['pid']}), durum: {args.state}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")


# ---------------------------------------------------------------------------
# run
# ---------------------------------------------------------------------------


def _token(state: dict, user_id: str) -> str:
    import jwt
    from cryptography.hazmat.primitives import serialization

    key = serialization.load_pem_private_key(state["private_key_pem"].encode(), None)
    now = int(time.time())
    return jwt.encode(
        {
            "iss": f"{TEST_SUPABASE_URL}/auth/v1",
            "aud": "authenticated",
            "sub": user_id,
            "role": "authenticated",
            "iat": now,
            "exp": now + 7200,
            "session_id": str(uuid.uuid4()),
            "is_anonymous": False,
            "aal": "aal1",
        },
        key,
        algorithm="ES256",
        headers={"kid": KEY_ID},
    )


def _headers(state: dict, user_id: str) -> dict:
    return {"Authorization": f"Bearer {_token(state, user_id)}", "X-Expected-User-Id": user_id}


def _rss_mb(pid: int) -> float | None:
    try:
        out = subprocess.run(["ps", "-o", "rss=", "-p", str(pid)], capture_output=True, text=True)
        return int(out.stdout.strip()) / 1024
    except (ValueError, OSError):
        return None


def _summary(samples: list[float]) -> dict:
    if not samples:
        return {"n": 0}
    ordered = sorted(samples)

    def pct(p):
        return round(ordered[min(len(ordered) - 1, int(p / 100 * len(ordered)))] * 1000)

    return {
        "n": len(ordered),
        "p50_ms": pct(50),
        "p95_ms": pct(95),
        "p99_ms": pct(99),
        "max_ms": round(ordered[-1] * 1000),
        "mean_ms": round(statistics.fmean(ordered) * 1000),
    }


async def _poll_rss(pid: int, stop: asyncio.Event, peak: list[float]):
    while not stop.is_set():
        value = _rss_mb(pid)
        if value:
            peak.append(value)
        await asyncio.sleep(0.5)


async def run_inference(state: dict, args) -> dict:
    import httpx

    photo = Path(args.photo).read_bytes()
    admins = state["admins"]
    if len(admins) < args.clients:
        sys.exit(f"{args.clients} istemci için en az {args.clients} yönetici kullanıcı gerekir (serve --admins)")
    results: list[tuple[int, float]] = []
    probe: dict[str, list[float]] = {"/api/health": [], "/api/projects": []}
    probe_errors: list[str] = []
    stop = asyncio.Event()
    rss: list[float] = []

    async with httpx.AsyncClient(base_url=state["base_url"], timeout=300) as client:
        async def worker(user_id: str):
            for _ in range(args.requests):
                start = time.perf_counter()
                response = await client.post(
                    "/api/remove-background",
                    files={"file": (Path(args.photo).name, photo, "image/jpeg")},
                    headers={**_headers(state, user_id), "Idempotency-Key": str(uuid.uuid4())},
                )
                results.append((response.status_code, time.perf_counter() - start))
                if response.status_code == 429:
                    # Gerçek istemci gibi: kısa bekleyip yeniden dener.
                    await asyncio.sleep(args.retry_wait)

        async def prober():
            user = state["users"][0]
            while not stop.is_set():
                for path in probe:
                    start = time.perf_counter()
                    try:
                        response = await client.get(path, headers=_headers(state, user))
                        if response.status_code != 200:
                            probe_errors.append(f"{path} {response.status_code}")
                    except httpx.HTTPError as exc:
                        probe_errors.append(f"{path} {type(exc).__name__}")
                    probe[path].append(time.perf_counter() - start)
                await asyncio.sleep(0.25)

        baseline_rss = _rss_mb(state["pid"])
        tasks = [asyncio.create_task(prober()), asyncio.create_task(_poll_rss(state["pid"], stop, rss))]
        started = time.perf_counter()
        await asyncio.gather(*(worker(admins[i]) for i in range(args.clients)))
        elapsed = time.perf_counter() - started
        stop.set()
        await asyncio.gather(*tasks)

    by_status: dict[int, list[float]] = {}
    for code, seconds in results:
        by_status.setdefault(code, []).append(seconds)
    return {
        "scenario": "inference",
        "clients": args.clients,
        "requests_per_client": args.requests,
        "photo": Path(args.photo).name,
        "photo_bytes": len(photo),
        "wall_seconds": round(elapsed, 1),
        "status_counts": {str(k): len(v) for k, v in sorted(by_status.items())},
        "latency_by_status": {str(k): _summary(v) for k, v in sorted(by_status.items())},
        "server_rss_mb": {
            "before": round(baseline_rss or 0),
            "peak": round(max(rss)) if rss else None,
        },
        "probe_during_inference": {path: _summary(v) for path, v in probe.items()},
        "probe_errors": probe_errors[:20],
    }


READ_ENDPOINTS = ["/api/projects", "/api/backgrounds", "/api/subscriptions/me", "/api/health"]


async def run_read(state: dict, args) -> dict:
    import httpx

    users = state["users"]
    report = {"scenario": "read", "duration_seconds": args.duration, "levels": []}
    limits = httpx.Limits(max_connections=max(args.levels) + 10)
    async with httpx.AsyncClient(base_url=state["base_url"], timeout=60, limits=limits) as client:
        headers = [_headers(state, user) for user in users]
        for level in args.levels:
            for path in READ_ENDPOINTS:
                latencies: list[float] = []
                statuses: dict[int, int] = {}
                errors: list[str] = []
                deadline = time.perf_counter() + args.duration

                async def worker(index: int):
                    while time.perf_counter() < deadline:
                        start = time.perf_counter()
                        try:
                            response = await client.get(path, headers=headers[index % len(headers)])
                            statuses[response.status_code] = statuses.get(response.status_code, 0) + 1
                        except httpx.HTTPError as exc:
                            errors.append(type(exc).__name__)
                            continue
                        latencies.append(time.perf_counter() - start)

                await asyncio.gather(*(worker(i) for i in range(level)))
                report["levels"].append(
                    {
                        "concurrency": level,
                        "endpoint": path,
                        "rps": round(len(latencies) / args.duration, 1),
                        "statuses": {str(k): v for k, v in sorted(statuses.items())},
                        "client_errors": len(errors),
                        **_summary(latencies),
                    }
                )
                print(json.dumps(report["levels"][-1], ensure_ascii=False), flush=True)
    return report


def run(args) -> None:
    state = json.loads(Path(args.state).read_text())
    if args.scenario == "inference":
        report = asyncio.run(run_inference(state, args))
    else:
        report = asyncio.run(run_read(state, args))
    text = json.dumps(report, indent=2, ensure_ascii=False)
    print(text)
    if args.out:
        Path(args.out).write_text(text)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    serve_parser = sub.add_parser("serve")
    serve_parser.add_argument("--database-url", required=True)
    serve_parser.add_argument("--state", required=True)
    serve_parser.add_argument("--port", type=int, default=8790)
    serve_parser.add_argument("--users", type=int, default=50)
    serve_parser.add_argument("--admins", type=int, default=8)
    serve_parser.add_argument("--pool-size", type=int, help="yalnız teşhis: veritabanı havuzu boyutu")

    run_parser = sub.add_parser("run")
    run_parser.add_argument("scenario", choices=["inference", "read"])
    run_parser.add_argument("--state", required=True)
    run_parser.add_argument("--out")
    run_parser.add_argument("--photo")
    run_parser.add_argument("--clients", type=int, default=4)
    run_parser.add_argument("--requests", type=int, default=2)
    run_parser.add_argument("--retry-wait", type=float, default=2.0)
    run_parser.add_argument("--duration", type=float, default=10)
    run_parser.add_argument("--levels", type=int, nargs="+", default=[10, 25, 50])

    args = parser.parse_args()
    if args.command == "serve":
        serve(args)
    else:
        if args.scenario == "inference" and not args.photo:
            sys.exit("inference senaryosu --photo ister")
        run(args)


if __name__ == "__main__":
    main()
