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
# uygulanır — sonraki çalıştırmalar bu adımları atlar. Her açılışta gerçek
# Supabase kullanıcıları yerel auth.users'a (LOCAL_ADMIN_EMAILS'teki adresler
# yerelde yönetici olur; bkz. backend/scripts/sync_local_auth.py) ve production
# zemin kütüphanesi yerel backgrounds tablosuna (scripts/sync_local_backgrounds.py,
# backend/.env.supabase gerekir) aktarılır. Ctrl+C ile
# durdurulur; her iki servis de birlikte kapanır.
#
# Ortam değişkenleriyle override edilebilir (CLAUDE.md ders 11: path'ler
# hard-code edilmez):
#   VITRIN_PYTHON        — venv kurulumunda kullanılacak Python (varsayılan: python3.11)
#   VITRIN_VENV_DIR       — backend sanal ortamının yolu (varsayılan: backend/.venv)
#   VITRIN_BACKEND_PORT   — backend portu (varsayılan: 8000)
#   VITRIN_FRONTEND_PORT  — frontend portu (varsayılan: 3000)
#   POSTGRES_PORT         — docker-compose.yml zaten okuyor (varsayılan: 5432)
#   REDIS_PORT            — docker-compose.yml zaten okuyor (varsayılan: 6379)
#
# Port override'ları özellikle bu repoda birden fazla worktree'nin AYNI ANDA
# çalıştığı durumlar için var — ikinci bir worktree'de varsayılan portlar
# neredeyse her zaman doluyor olur.

set -euo pipefail

# Repo kökü betiğin kendi konumundan türetiliyor — geliştiricinin makinesine
# özgü mutlak bir yol asla sabit yazılmıyor.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"
VENV_DIR="${VITRIN_VENV_DIR:-$BACKEND_DIR/.venv}"
PYTHON_BIN="${VITRIN_PYTHON:-python3.11}"
BACKEND_PORT="${VITRIN_BACKEND_PORT:-8000}"
FRONTEND_PORT="${VITRIN_FRONTEND_PORT:-3000}"
POSTGRES_PORT_FOR_DISPLAY="${POSTGRES_PORT:-5432}"
REDIS_PORT_FOR_DISPLAY="${REDIS_PORT:-6379}"
LOG_DIR="$REPO_ROOT/.run"

mkdir -p "$LOG_DIR"

echo "== Postgres + Redis (docker compose) =="
if ! command -v docker >/dev/null 2>&1; then
  echo "hata: docker bulunamadı. Postgres/Redis olmadan backend'in çoğu endpoint'i çalışmaz." >&2
  exit 1
fi
(cd "$REPO_ROOT" && docker compose up -d postgres redis)

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

redis_ready=false
for _ in $(seq 1 30); do
  if (cd "$REPO_ROOT" && docker compose exec -T redis redis-cli ping) >/dev/null 2>&1; then
    redis_ready=true
    break
  fi
  sleep 1
done
if [ "$redis_ready" != true ]; then
  echo "hata: Redis 30 saniyede hazır olmadı. \`docker compose logs redis\` ile kontrol edin." >&2
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

# Requirements değiştiyse (ör. Faz 7'deki güvenlik yükseltmesi) mevcut ortam da
# güncellenir. Önceden .venv bir kez kurulunca hiç dokunulmuyordu: yeni pin'ler
# git'e girse de geliştirici sessizce eski, açıklı sürümlerle çalışıyordu.
REQ_STAMP="$VENV_DIR/.requirements.sha256"
if command -v shasum >/dev/null 2>&1; then
  REQ_HASH="$(cat "$BACKEND_DIR"/requirements*.txt | shasum -a 256 | cut -d' ' -f1)"
else
  REQ_HASH="$(cat "$BACKEND_DIR"/requirements*.txt | sha256sum | cut -d' ' -f1)"
fi
if [ "$(cat "$REQ_STAMP" 2>/dev/null)" != "$REQ_HASH" ]; then
  echo "  requirements değişmiş, bağımlılıklar güncelleniyor..."
  "$VENV_DIR/bin/pip" install -q -r "$BACKEND_DIR/requirements-dev.txt"
  echo "$REQ_HASH" > "$REQ_STAMP"
fi

if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "  backend/.env yok, .env.example'dan kopyalanıyor..."
  # DATABASE_URL/REDIS_URL'deki portlar, .env.example'da SABİT 5432/6379 yazıyor.
  # POSTGRES_PORT/REDIS_PORT override edildiyse (paralel worktree senaryosu) ve
  # bu satırlar olduğu gibi kopyalansaydı, alembic/backend SESSİZCE başka bir
  # yerdeki (ör. başka bir worktree'nin) Postgres/Redis'ine bağlanırdı — bu
  # betiğin ilk sürümünde DATABASE_URL için birebir ölçüldü: 5433'te Postgres
  # başlatılmışken .env hâlâ 5432 diyordu. Kopyalarken portlar her zaman eşitleniyor.
  sed -e "s#@localhost:5432/#@localhost:${POSTGRES_PORT_FOR_DISPLAY}/#" \
      -e "s#redis://localhost:6379/#redis://localhost:${REDIS_PORT_FOR_DISPLAY}/#" \
    "$BACKEND_DIR/.env.example" > "$BACKEND_DIR/.env"
fi

# Var olan bir .env, POSTGRES_PORT/REDIS_PORT ile farklı bir porta işaret
# ediyorsa (ör. bu .env varsayılan portlar için kurulmuşken betik bu
# çalıştırmada başka bir porta yönlendirildiyse) sessizce yanlış
# veritabanına/Redis'e bağlanmak yerine açıkça uyarılıyor.
existing_db_port="$(grep -o '@localhost:[0-9]*/' "$BACKEND_DIR/.env" 2>/dev/null | grep -o '[0-9]*' | head -1 || true)"
if [ -n "$existing_db_port" ] && [ "$existing_db_port" != "$POSTGRES_PORT_FOR_DISPLAY" ]; then
  echo "  UYARI: backend/.env içindeki DATABASE_URL localhost:$existing_db_port diyor," >&2
  echo "         ama bu çalıştırmada Postgres localhost:$POSTGRES_PORT_FOR_DISPLAY üzerinde." >&2
  echo "         Kasıtlı değilse backend/.env'i elle düzeltin." >&2
fi
existing_redis_port="$(grep -o 'redis://localhost:[0-9]*/' "$BACKEND_DIR/.env" 2>/dev/null | grep -o '[0-9]*' | head -1 || true)"
if [ -n "$existing_redis_port" ] && [ "$existing_redis_port" != "$REDIS_PORT_FOR_DISPLAY" ]; then
  echo "  UYARI: backend/.env içindeki REDIS_URL localhost:$existing_redis_port diyor," >&2
  echo "         ama bu çalıştırmada Redis localhost:$REDIS_PORT_FOR_DISPLAY üzerinde." >&2
  echo "         Kasıtlı değilse backend/.env'i elle düzeltin." >&2
fi

echo ""
echo "== Backend migration'ları =="
(cd "$BACKEND_DIR" && "$VENV_DIR/bin/alembic" upgrade head)

echo ""
echo "== Yerel auth kullanıcıları (Supabase'den) =="
# Yerel auth.users 0002'nin boş şimi: gerçek bir hesapla giriş yapılsa da
# abonelik ve admin yetkisi görünmez. Betik kullanıcıları Supabase yönetici
# API'sinden (HTTPS) okuyup yerel tabloya yazar; LOCAL_ADMIN_EMAILS'teki
# adresleri yerelde yönetici yapar. Yalnız yerel şime yazar. Başarısız olursa
# sistem yine açılır — yalnızca gerçek hesaplar yerelde abonelik/admin görmez.
if ! (cd "$BACKEND_DIR" && "$VENV_DIR/bin/python" scripts/sync_local_auth.py); then
  echo "  UYARI: eşitleme yapılamadı (SUPABASE_SECRET_KEY boş ya da Supabase'e ulaşılamadı)." >&2
  echo "         Sistem açılıyor; gerçek hesaplar yerelde abonelik/admin görmeyecek." >&2
fi

echo ""
echo "== Yerel zemin kütüphanesi (Supabase'den) =="
# Zemin görselleri R2'de (production'la ortak), ama hangi zeminlerin olduğu
# backgrounds tablosunda — yerelde boşsa stüdyo yalnız sade zeminleri gösterir.
# Betik production'daki satırları YALNIZCA OKUYUP yerele yazar (kaynak:
# backend/.env.supabase). Ağ 5432'yi engelliyorsa kısa zaman aşımıyla düşer,
# yerel tablo son eşitlemedeki hâliyle kalır ve sistem yine açılır.
if ! (cd "$BACKEND_DIR" && "$VENV_DIR/bin/python" scripts/sync_local_backgrounds.py); then
  echo "  UYARI: zemin eşitlemesi yapılamadı; zeminler son eşitlemedeki hâliyle." >&2
fi

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
echo "Backend:  http://localhost:$BACKEND_PORT   (log: .run/backend.log)"
echo "Frontend: http://localhost:$FRONTEND_PORT   (log: .run/frontend.log)"
echo "Postgres: localhost:$POSTGRES_PORT_FOR_DISPLAY"
echo "Redis:    localhost:$REDIS_PORT_FOR_DISPLAY"
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
  # R2 bucket'ı production'la ortak ve yerel zemin satırları production'dan
  # kopyalanıyor: yerelde zemin silmek canlıdaki dosyayı da silmesin
  # (bkz. app/core/config.py → r2_shared_with_production).
  R2_SHARED_WITH_PRODUCTION=true "$VENV_DIR/bin/uvicorn" app.main:app --reload --port "$BACKEND_PORT"
) > "$LOG_DIR/backend.log" 2>&1 &

(
  cd "$FRONTEND_DIR"
  # BACKEND_URL burada process ortamına yazılıyor: Next.js .env.local'i
  # otomatik yüklüyor ama gerçek ortam değişkenleri her zaman onu geçersiz
  # kılar — backend portu varsayılandan farklıysa .env.local'e hiç dokunmadan
  # doğru adrese işaret ediyor.
  BACKEND_URL="http://localhost:$BACKEND_PORT" npm run dev -- -p "$FRONTEND_PORT"
) > "$LOG_DIR/frontend.log" 2>&1 &

# Her iki log'u da terminale akıtır ki VS Code görevlerindeki "ayrı panel"
# deneyimine yakın bir şey olsun; loglar ayrıca dosyada da kalıcı kalıyor.
tail -n +1 -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log" &

wait
