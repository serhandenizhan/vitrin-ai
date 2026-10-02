# Tarama backend'inin ortamı: gerçek hiçbir servise ulaşmaz. `backend/.env`'deki
# R2/Supabase/yedek anahtarları AÇIKÇA boşaltılır (ortam değişkeni .env'den önce gelir).
# Kullanım: source backend/scripts/zap/backend_env.sh
export DATABASE_URL="postgresql+asyncpg://${POSTGRES_USER:-vitrin_ai}:${POSTGRES_PASSWORD:-change_me_locally}@127.0.0.1:${ZAP_DB_PORT:-5434}/${ZAP_DB_NAME:-zap_scan}"
export REDIS_URL="redis://127.0.0.1:${VITRIN_TEST_REDIS_PORT:-6380}/0"
export SUPABASE_URL="${ZAP_SUPABASE_URL:-http://127.0.0.1:54329}"
export SUPABASE_SECRET_KEY="" SUPABASE_LEGACY_JWT_SECRET="" BACKUP_ENCRYPTION_KEY=""
export R2_ACCOUNT_ID="" R2_ACCESS_KEY_ID="" R2_SECRET_ACCESS_KEY="" R2_BUCKET_NAME="" R2_SHARED_WITH_PRODUCTION="true"
export LOCAL_ADMIN_EMAILS="" SENTRY_DSN="" CORS_ALLOWED_ORIGINS="http://127.0.0.1:3012"
export CUTOUT_HEALTH_CHECK_INTERVAL_SECONDS=0
