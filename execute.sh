#!/usr/bin/env bash
#
# Sistemi tek komutla ayağa kaldırır: Postgres (Docker) + backend (FastAPI,
# venv) + frontend (Next.js). Windows'ta VS Code görevleri (.vscode/tasks.json,
# Ctrl+Shift+B) kullanılıyor; bu betik macOS/Linux için onun karşılığı.
#
# Kullanım:
#   ./execute.sh
#
# İlk çalıştırmada backend sanal ortamı yoksa kurulur, bağımlılıklar
# yüklenir, .env dosyaları örneklerden kopyalanır ve migration'lar
# uygulanır — sonraki çalıştırmalar bu adımları atlar. Ctrl+C ile
# durdurulur; her iki servis de birlikte kapanır.
#
# Ortam değişkenleriyle override edilebilir (CLAUDE.md ders 11: path'ler
# hard-code edilmez):
#   VITRIN_PYTHON   — venv kurulumunda kullanılacak Python (varsayılan: python3.11)
#   VITRIN_VENV_DIR — backend sanal ortamının yolu (varsayılan: backend/.venv)

set -euo pipefail

# Repo kökü betiğin kendi konumundan türetiliyor — geliştiricinin makinesine
# özgü mutlak bir yol asla sabit yazılmıyor.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"
VENV_DIR="${VITRIN_VENV_DIR:-$BACKEND_DIR/.venv}"
PYTHON_BIN="${VITRIN_PYTHON:-python3.11}"
LOG_DIR="$REPO_ROOT/.run"

mkdir -p "$LOG_DIR"

echo "== Postgres (docker compose) =="
if ! command -v docker >/dev/null 2>&1; then
  echo "hata: docker bulunamadı. Postgres olmadan backend'in çoğu endpoint'i çalışmaz." >&2
  exit 1
fi
(cd "$REPO_ROOT" && docker compose up -d postgres)

echo "  hazır olması bekleniyor..."
POSTGRES_USER_FOR_CHECK="${POSTGRES_USER:-vitrin_ai}"
postgres_ready=false
for _ in $(seq 1 30); do
  if (cd "$REPO_ROOT" && docker compose exec -T postgres pg_isready -U "$POSTGRES_USER_FOR_CHECK") >/dev/null 2>&1; then
    postgres_ready=true
    break
  fi
  sleep 1
done
if [ "$postgres_ready" != true ]; then
  echo "hata: Postgres 30 saniyede hazır olmadı. \`docker compose logs postgres\` ile kontrol edin." >&2
  exit 1
fi
echo "  hazır."

echo ""
echo "== Backend sanal ortamı =="
if [ ! -x "$VENV_DIR/bin/python" ]; then
  if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    echo "hata: $PYTHON_BIN bulunamadı. VITRIN_PYTHON=<yol> ile başka bir Python 3.11 belirtin." >&2
    exit 1
  fi
  echo "  .venv yok, oluşturuluyor ($PYTHON_BIN)..."
  "$PYTHON_BIN" -m venv "$VENV_DIR"
  echo "  bağımlılıklar yükleniyor..."
  "$VENV_DIR/bin/pip" install -q -r "$BACKEND_DIR/requirements-dev.txt"
else
  echo "  mevcut ($VENV_DIR)."
fi

if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "  backend/.env yok, .env.example'dan kopyalanıyor..."
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
fi

echo ""
echo "== Backend migration'ları =="
(cd "$BACKEND_DIR" && "$VENV_DIR/bin/alembic" upgrade head)

echo ""
echo "== Frontend bağımlılıkları =="
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "  node_modules yok, npm install çalıştırılıyor..."
  (cd "$FRONTEND_DIR" && npm install)
else
  echo "  mevcut."
fi

if [ ! -f "$FRONTEND_DIR/.env.local" ]; then
  echo "  frontend/.env.local yok, .env.example'dan kopyalanıyor..."
  # Bu betik gerçek backend'i başlattığı için demo modu kapatılıyor —
  # aksi halde arayüz backend çalışıyorken bile sabit örnek görseli
  # göstermeye devam eder (bkz. kök CLAUDE.md ders 10).
  sed 's/USE_MOCK_BACKEND=true/USE_MOCK_BACKEND=false/' \
    "$FRONTEND_DIR/.env.example" > "$FRONTEND_DIR/.env.local"
  echo "  USE_MOCK_BACKEND=false yapıldı (gerçek backend ayakta)."
fi

echo ""
echo "== Servisler başlatılıyor =="
echo "Backend:  http://localhost:8000   (log: .run/backend.log)"
echo "Frontend: http://localhost:3000   (log: .run/frontend.log)"
echo "Postgres: localhost:5432"
echo ""
echo "Durdurmak için Ctrl+C — ikisi de birlikte kapanır."
echo ""

# Betik sona erdiğinde (Ctrl+C dahil) tüm alt süreçleri kapatır. `kill 0`
# bu betiğin süreç grubundaki HERKESE sinyal gönderir (backend + frontend +
# tail arka plan işleri dahil) — PID'leri tek tek toplayıp kill etmekten
# daha güvenilir, biri erken çökerse bile geri kalanı kapatır.
#
# `wait -n` (bash 4.3+) kullanılmıyor: macOS'un sistem bash'i hâlâ 3.2 —
# bu yüzden tüm arka plan işlerinin bitmesini bekleyen sade `wait` tercih
# edildi, Ctrl+C ile durdurma zaten trap üzerinden çalışıyor.
cleanup() {
  echo
  echo "Kapatılıyor..."
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(
  cd "$BACKEND_DIR"
  "$VENV_DIR/bin/uvicorn" app.main:app --reload --port 8000
) > "$LOG_DIR/backend.log" 2>&1 &

(
  cd "$FRONTEND_DIR"
  npm run dev
) > "$LOG_DIR/frontend.log" 2>&1 &

# Her iki log'u da terminale akıtır ki VS Code görevlerindeki "ayrı panel"
# deneyimine yakın bir şey olsun; loglar ayrıca dosyada da kalıcı kalıyor.
tail -n +1 -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log" &

wait
