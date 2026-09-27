#!/usr/bin/env bash
# Backend testlerini AYRI bir test veritabanında koşturan tek komut.
#
# NEDEN: test paketi bağlandığı veritabanını sıfırlıyor (oturum sonunda
# `alembic downgrade base`). `DATABASE_URL` verilmeden koşturulan `pytest`,
# 27.09.2026'da `execute.sh` açıkken onun geliştirme veritabanını sildi.
# Bu betik kendi Postgres'ini (5434) ve Redis'ini (6380) ayrı bir compose
# projesinde açar, testleri oraya yöneltir; geliştirme ortamına dokunmaz.
# Düz `pytest` de artık geliştirme veritabanında durur (tests/db_safety.py).
#
# Kullanım (repo kökünden ya da herhangi bir yerden):
#   backend/scripts/test.sh                      # bütün testler
#   backend/scripts/test.sh tests/test_billing.py -k iade -x   # argümanlar pytest'e aynen geçer
#
# Çıkış kodu pytest'inkidir.
#
# Ortam değişkenleri (ders 11: yol/port koda gömülmez):
#   VITRIN_TEST_DB_PORT       — test Postgres portu (varsayılan: 5434)
#   VITRIN_TEST_REDIS_PORT    — test Redis portu (varsayılan: 6380)
#   VITRIN_TEST_PROJECT       — docker compose proje adı (varsayılan: vitrin-ai-test)
#   VITRIN_VENV_DIR           — sanal ortam (varsayılan: backend/.venv, execute.sh ile aynı)
#   POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB — docker-compose.yml ile aynı varsayılanlar

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(dirname "$BACKEND_DIR")"

TEST_DB_PORT="${VITRIN_TEST_DB_PORT:-5434}"
TEST_REDIS_PORT="${VITRIN_TEST_REDIS_PORT:-6380}"
TEST_PROJECT="${VITRIN_TEST_PROJECT:-vitrin-ai-test}"
VENV_DIR="${VITRIN_VENV_DIR:-$BACKEND_DIR/.venv}"
DB_USER="${POSTGRES_USER:-vitrin_ai}"
DB_PASSWORD="${POSTGRES_PASSWORD:-change_me_locally}"
DB_NAME="${POSTGRES_DB:-vitrin_ai}"

if ! command -v docker >/dev/null 2>&1; then
  echo "hata: docker bulunamadı. Test veritabanı Docker'da açılıyor." >&2
  exit 2
fi
if [ ! -x "$VENV_DIR/bin/pytest" ]; then
  echo "hata: $VENV_DIR/bin/pytest yok. Önce ./execute.sh'ı bir kez çalıştırın (sanal ortamı kurar)" >&2
  echo "      ya da VITRIN_VENV_DIR ile başka bir sanal ortam gösterin." >&2
  exit 2
fi

compose() {
  (cd "$REPO_ROOT" && POSTGRES_PORT="$TEST_DB_PORT" REDIS_PORT="$TEST_REDIS_PORT" \
    docker compose -p "$TEST_PROJECT" "$@")
}

echo "== Test Postgres (:$TEST_DB_PORT) + Redis (:$TEST_REDIS_PORT), proje '$TEST_PROJECT' ==" >&2
compose up -d postgres redis >&2

ready=false
for _ in $(seq 1 60); do
  if compose exec -T postgres pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1 \
    && compose exec -T redis redis-cli ping >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then
  echo "hata: test Postgres/Redis 60 sn'de hazır olmadı. \`docker compose -p $TEST_PROJECT logs\` ile bakın." >&2
  exit 2
fi

export DATABASE_URL="postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@localhost:${TEST_DB_PORT}/${DB_NAME}"
export REDIS_URL="redis://localhost:${TEST_REDIS_PORT}/0"

cd "$BACKEND_DIR"
exec "$VENV_DIR/bin/pytest" "$@"
