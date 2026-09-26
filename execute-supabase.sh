#!/usr/bin/env bash
#
# execute.sh'ın Supabase karşılığı: Postgres yerel Docker'da DEĞİL, gerçek
# Supabase projesinde — böylece admin yetkisi (admin_users), abonelikler ve
# auth.users execute.sh'ın yerel şiminde (0002_local_supabase_auth_shim.py)
# değil, gerçek Supabase Auth ile aynı veritabanında yaşar. Redis hâlâ yerel
# Docker'da (Supabase'in parçası değil, yalnızca hız sınırlama için).
#
# NEDEN AYRI BİR BETİK (execute.sh değil de bu): 22.09.2026'da bu makineden
# Supabase pooler'ına (5432 VE 6543) giden TCP bağlantısının sessizce
# düştüğü ölçüldü — 443 (HTTPS) sorunsuz açılıyor. Bu bir kod/config sorunu
# değil, bu ağın (VPN/güvenlik duvarı/ISP) Postgres portlarını engellemesi.
# execute.sh bu yüzden yerel Docker Postgres kullanmaya devam ediyor (CLAUDE.md
# "Sistemi çalıştırma"); bu betik yalnızca ağ bu portlara izin veriyorsa
# (örn. başka bir ağdan) kullanılır — migration adımı network engelliyse
# execute.sh'ta olduğu gibi sessizce asılı kalır, bu ölçülmüş ve beklenen bir
# davranış, betiğin hatası değil.
#
# ÖN KOŞUL: backend/.venv ve frontend/node_modules'un zaten kurulu olması —
# bu betik onları KURMUYOR, yalnızca ./execute.sh'ın kurduğunu varsayıyor. Bir
# kez ./execute.sh çalıştırıp Ctrl+C ile kapatmak yeterli.
#
# Kullanım:
#   ./execute-supabase.sh
#
# Gerekli: backend/.env.supabase (gitignored, DATABASE_URL=<Supabase pooler
# bağlantı dizesi>). Yoksa betik açık bir hata ile durur.
#
# Ortam değişkenleriyle override edilebilir (CLAUDE.md ders 11):
#   VITRIN_VENV_DIR       — backend sanal ortamının yolu (varsayılan: backend/.venv)
#   VITRIN_BACKEND_PORT   — backend portu (varsayılan: 8000)
#   VITRIN_FRONTEND_PORT  — frontend portu (varsayılan: 3000)
#   REDIS_PORT            — docker-compose.yml zaten okuyor (varsayılan: 6379)
#   VITRIN_SUPABASE_MIGRATE=1 — migration'ları Supabase'e uygular (varsayılan:
#                           KAPALI, çünkü bu veritabanı production'dır)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"
VENV_DIR="${VITRIN_VENV_DIR:-$BACKEND_DIR/.venv}"
BACKEND_PORT="${VITRIN_BACKEND_PORT:-8000}"
FRONTEND_PORT="${VITRIN_FRONTEND_PORT:-3000}"
REDIS_PORT_FOR_DISPLAY="${REDIS_PORT:-6379}"
LOG_DIR="$REPO_ROOT/.run"
SUPABASE_ENV_FILE="$BACKEND_DIR/.env.supabase"

mkdir -p "$LOG_DIR"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  echo "hata: $VENV_DIR yok. Once ./execute.sh'i bir kez calistirip Ctrl+C ile kapatin (venv + node_modules kurulumu icin)." >&2
  exit 1
fi
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "hata: frontend/node_modules yok. Once ./execute.sh'i bir kez calistirip Ctrl+C ile kapatin." >&2
  exit 1
fi
if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "hata: backend/.env yok. Once ./execute.sh'i bir kez calistirin." >&2
  exit 1
fi
if [ ! -f "$SUPABASE_ENV_FILE" ]; then
  echo "hata: $SUPABASE_ENV_FILE yok." >&2
  echo "       Icine Supabase pooler'inin DATABASE_URL'ini yazin, ornek:" >&2
  echo "       DATABASE_URL=postgresql+asyncpg://<kullanici>:<sifre>@<pooler-host>:5432/postgres" >&2
  exit 1
fi

# DATABASE_URL burada gercek ortam degiskeni olarak disari veriliyor —
# backend/.env'deki ayni anahtari GECERSIZ KILAR (pydantic-settings'te gercek
# ortam degiskeni her zaman .env dosyasindan once gelir, dogrulandi). .env'deki
# diger her deger (SUPABASE_URL, R2, vb.) aynen kullaniliyor.
set -a
# shellcheck disable=SC1090
source "$SUPABASE_ENV_FILE"
set +a
if [ -z "${DATABASE_URL:-}" ]; then
  echo "hata: $SUPABASE_ENV_FILE icinde DATABASE_URL bos." >&2
  exit 1
fi

echo "== Redis (docker compose) =="
if ! command -v docker >/dev/null 2>&1; then
  echo "hata: docker bulunamadi." >&2
  exit 1
fi
(cd "$REPO_ROOT" && docker compose up -d redis)

echo "  hazir olmasi bekleniyor..."
redis_ready=false
for _ in $(seq 1 30); do
  if (cd "$REPO_ROOT" && docker compose exec -T redis redis-cli ping) >/dev/null 2>&1; then
    redis_ready=true
    break
  fi
  sleep 1
done
if [ "$redis_ready" != true ]; then
  echo "hata: Redis 30 saniyede hazir olmadi. \`docker compose logs redis\` ile kontrol edin." >&2
  exit 1
fi
echo "  hazir."

echo ""
echo "== Backend migration'lari (Supabase) =="
# Bu veritabani GERCEK (production) Supabase projesi. Migration varsayilan
# olarak CALISTIRILMAZ: bir feature dalinda henuz birlesmemis bir migration
# burada sessizce uygulanirsa production semasina girer ve o dosya bir daha
# duzenlenemez (CLAUDE.md "Uygulanmis bir migration yerinde duzenlenmez").
# Bilincli olarak uygulamak icin: VITRIN_SUPABASE_MIGRATE=1 ./execute-supabase.sh
if [ "${VITRIN_SUPABASE_MIGRATE:-0}" = "1" ]; then
  echo "  VITRIN_SUPABASE_MIGRATE=1 — upgrade head calistiriliyor."
  echo "  Ag bu portu (5432) engelliyorsa bu adim sessizce asili kalir (bkz. betik basindaki not)."
  (cd "$BACKEND_DIR" && "$VENV_DIR/bin/alembic" upgrade head)
else
  echo "  Atlandi (production veritabani). Uygulamak icin VITRIN_SUPABASE_MIGRATE=1 verin."
fi

echo ""
echo "== Frontend =="
if [ ! -f "$FRONTEND_DIR/.env.local" ]; then
  echo "hata: frontend/.env.local yok. Once ./execute.sh'i bir kez calistirin." >&2
  exit 1
fi

echo ""
echo "== Servisler baslatiliyor (backend Supabase'e bagli) =="
echo "Backend:  http://localhost:$BACKEND_PORT   (log: .run/backend.log)"
echo "Frontend: http://localhost:$FRONTEND_PORT   (log: .run/frontend.log)"
echo "Redis:    localhost:$REDIS_PORT_FOR_DISPLAY"
echo ""
echo "Durdurmak icin Ctrl+C — ikisi de birlikte kapanir."
echo ""

cleanup() {
  echo
  echo "Kapatiliyor..."
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(
  cd "$BACKEND_DIR"
  "$VENV_DIR/bin/uvicorn" app.main:app --reload --port "$BACKEND_PORT"
) > "$LOG_DIR/backend.log" 2>&1 &

(
  cd "$FRONTEND_DIR"
  BACKEND_URL="http://localhost:$BACKEND_PORT" npm run dev -- -p "$FRONTEND_PORT"
) > "$LOG_DIR/frontend.log" 2>&1 &

tail -n +1 -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log" &

wait
