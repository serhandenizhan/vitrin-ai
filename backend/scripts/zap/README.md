# ZAP dinamik güvenlik taraması (yerel, hermetik)

OWASP ZAP ile backend API'sini (OpenAPI) ve ön yüzü (sayfalar + Next `/api/*` vekilleri)
**oturumlu** tarar. Gerçek Supabase, R2, iyzico, Resend'e hiçbir istek gitmez: kimlik
doğrulama yerel bir **sahte JWKS sunucusuyla** yapılır, token'ları kendimiz imzalarız.
İlk koşu ve sonuçlar: `ROADMAP.md` Faz 7 → "Dinamik tarama" (27.09 ve 02.10.2026).
Canlı/staging taraması bunun YERİNE değil, Faz 7.5'te ayrıca yapılır.

## Önkoşul

- Docker (test Postgres'i/Redis'i için `backend/scripts/test.sh` bir kez koşturulmuş olmalı;
  ZAP imajı: `docker pull ghcr.io/zaproxy/zaproxy:stable`, ~3,6 GB).
- Docker Desktop belleği: ZAP için ≥4 GB.
- Aşağıdakiler repo kökünden çalıştırılır. Üretilen her şey `backend/scripts/zap/.work/`
  altında kalır (git'e girmez).

## Adımlar

```bash
Z=backend/scripts/zap; W=$Z/.work; mkdir -p $W/reports; PY=backend/.venv/bin/python
# 1) Ayrı tarama veritabanı (testlerin veritabanına dokunmaz) + migration'lar
docker exec vitrin-ai-test-postgres-1 psql -U vitrin_ai -d vitrin_ai -c "create database zap_scan"
(source $Z/backend_env.sh && cd backend && .venv/bin/alembic upgrade head)
# 2) Sahte Supabase (yalnız JWKS) ve kullanıcı + yönetici oturumları
(cd $Z && nohup ../../.venv/bin/python fake_supabase.py 54329 >/dev/null 2>&1 &)
(cd $Z && ../../.venv/bin/python mint_sessions.py)
# 3) Backend (hız sınırlayıcıları KAPALI, yalnız bu örnekte): 8099
(source $Z/backend_env.sh && cd backend && nohup .venv/bin/python scripts/zap/scan_backend.py >$W/backend.log 2>&1 &)
# 4) Ön yüz: üretim derlemesi, sahte Supabase'e bağlı (ders 39: dev sunucusu değil) : 3012
(cd frontend && export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54329 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sahte \
   BACKEND_URL=http://127.0.0.1:8099 USE_MOCK_BACKEND=false && npm run build && nohup npx next start -H 127.0.0.1 -p 3012 >$W/frontend.log 2>&1 &)
# 5) Ön yüz vekil rotalarının OpenAPI tanımı + her kimlik için plan
$PY $Z/gen_next_openapi.py $W/reports/next-openapi.json
(cd $Z && ../../.venv/bin/python make_plan.py user && ../../.venv/bin/python make_plan.py admin)
# 6) Taramalar — SIRAYLA (iki ZAP birden 4 GB'lık Docker VM'ini aşabilir)
docker run --rm -v $PWD/$W/reports:/zap/wrk:rw ghcr.io/zaproxy/zaproxy:stable zap.sh -cmd -autorun /zap/wrk/plan-admin.yaml
docker run --rm -v $PWD/$W/reports:/zap/wrk:rw ghcr.io/zaproxy/zaproxy:stable zap.sh -cmd -autorun /zap/wrk/plan-user.yaml
#    Backend API (OpenAPI), anonim; kimlikli için: -z "-config replacer.full_list\(0\).description=a ... .replacement=Bearer\ <token>"
docker run --rm -v $PWD/$W/reports:/zap/wrk:rw ghcr.io/zaproxy/zaproxy:stable zap-api-scan.py \
   -t http://host.docker.internal:8099/openapi.json -f openapi -r backend-anon.html -J backend-anon.json -I
# 7) Temizlik: süreçleri kapat, ön yüz derlemesini SİL (sahte adres gömülü), veritabanını düşür
pkill -f fake_supabase.py; pkill -f scan_backend.py; pkill -f "next start -H 127.0.0.1 -p 3012"; rm -rf frontend/.next
docker exec vitrin-ai-test-postgres-1 psql -U vitrin_ai -d vitrin_ai -c "drop database zap_scan"
```

## Bilinmesi gerekenler (02.10.2026'da öğrenildi)

- **Bir tarama "bitti" demesi tamamlandığı anlamına gelmez.** `Automation plan succeeded!`
  ve rapor dosyasının var olması aranır. `zap-full-scan.py -j` (AJAX örümceği) ve aktif
  taramanın DOM-XSS kuralı (40026) x86 imajı ARM Mac'te emülasyonla çalışırken Firefox'u
  başlatamayıp **ZAP'i düşürüyor**; günlükte `Max retries exceeded ... localhost`
  görünür ve rapor hiç yazılmaz. Plan bu yüzden kuralı kapatır, `-j` kullanmaz.
- **Oturumlu taramanın gerçekten oturumlu olduğunu ölçün.** Veritabanında iz aramak
  yanıltır (ZAP'in karıştırdığı geçersiz UUID/gövde işleyiciden önce reddedilir, iz kalmaz).
  Doğru ölçüt: ZAP'in `requestor` işiyle yönetici-özel bir uca (`/api/admin/stats`)
  çerezle istek atıp beklenen kodu sınamak: yönetici 200, kullanıcı 403, çerezsiz 401;
  yanlış beklentiyle bir KONTROL koşusu "warnings" vermeli.
- **Hız sınırlayıcılar tarama örneğinde kapalıdır** (`scan_backend.py`); aksi hâlde
  yazma uçları birkaç saniyede 429'a düşer ve işleyiciler taranmaz. Sınırların kendisi
  `tests/test_rate_limit_coverage.py`'de sınanır.
- `backend/.env`'deki gerçek R2/Supabase anahtarları `backend_env.sh` ile açıkça boşaltılır.
  Kapsam dışı kalanlar: R2'ye, Supabase yönetici API'sine ve iyzico'ya dayanan uçların
  içi (kopuk; `/api/admin/users` bu yüzden 503 verir) — staging gerektirir (Faz 7.5).
