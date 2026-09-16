# backend

FastAPI uygulaması, AI inference servisi (BiRefNet) burada yaşıyor. Celery worker'ları
ve arka plan meta verisi Faz 3'te eklenecek.

**Durum:** Faz 1 tamamlandı — `POST /api/remove-background` endpoint'i çalışıyor,
birim testleri yeşil, gerçek mücevher fotoğraflarıyla (HEIC + WhatsApp JPEG) doğrulandı,
Docker build başarıyla derleniyor ve container düzgün başlıyor. Faz 3'ün backend kısmı
(arka plan kütüphanesi: yükleme + listeleme + R2 depolama) da tamamlandı — ayrıntılar
aşağıda ve kök `ROADMAP.md` Faz 3 bölümünde. Ayrıca `GET /api/health` endpoint'i var —
sadece süreç canlılığını doğrular, model yüklü mü diye bakmaz (model ilk çağrıda
gecikmeli yüklenir, health check bunu tetiklerse ilk kontrol ~30-35sn sürerdi).
`backend/Dockerfile`'daki `HEALTHCHECK` bu uç noktayı kullanıyor.
**Faz 4 (backend) tamamlandı:** Supabase JWT doğrulaması, kullanıcı projeleri API'si,
`admin_users` ile gerçek yönetici yetkisi, tüm tablolarda RLS, CORS, hesap silme
(`DELETE /api/account`) ve `POST /api/remove-background`'da oturum zorunluluğu. Gerçek
Supabase projesi 11.09.2026'da kuruldu; migration'lar uygulandı ve RLS canlı projede
doğrulandı. Arayüzle birlikte gerçek Supabase + R2'ye karşı uçtan uca denendi (bkz.
"Kimlik doğrulama ve yetkilendirme").

**`.env` her zaman `backend/.env`'den okunuyor**, uygulama hangi klasörden başlatılırsa
başlatılsın (`app/core/config.py` → `BACKEND_ENV_FILE`). Önceden göreli yol kullanılıyordu
ve repo kökünden başlatılan backend `.env`'yi hiç okumadan açılıp her oturum isteğine 503
dönüyordu (kök `CLAUDE.md` ders 18).

## Yerel çalıştırma (venv ile)

Sistem Python'u (3.14) `torch`/`onnxruntime` ile uyumlu olmayabileceğinden 3.11
kullanın:

```bash
cd backend
python3.11 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env
.venv/bin/uvicorn app.main:app --reload
```

İlk istekte model belleğe yüklenir (~30-35sn); sonraki istekler ~8-15sn sürer
(bkz. kök `CLAUDE.md` — "Bilinen kısıt" bölümü). **CPU inference için en az
12-14GB RAM gerekir.**

## Testler

```bash
.venv/bin/pytest tests/ -v
```

Testler `BackgroundRemovalService`'i mock'lar — gerçek BiRefNet modelini her
test çalıştırmasında indirip inference yapmak pratik değil (ağır kaynak
kullanımı). Gerçek modelle doğrulama ayrı ve manuel yapılır.

Testler gerçek bir Postgres ister (`docker compose up -d postgres`) ve oturum
başında `alembic upgrade head`, sonunda `alembic downgrade base` çalıştırır —
yani bağlandıkları veritabanını **sıfırlar**. Başka bir işin veritabanına karşı
çalıştırmayın; paralel worktree'lerde ayrı bir Postgres açıp `DATABASE_URL` ile
yönlendirin:

```bash
POSTGRES_PORT=5434 docker compose -p <worktree-adi> up -d postgres
DATABASE_URL=postgresql+asyncpg://vitrin_ai:change_me_locally@localhost:5434/vitrin_ai .venv/bin/pytest
```

Ayrıca gerçek bir **Redis** ister (`docker compose up -d redis`) — yükleme hız
sınırlayıcısı testleri gerçek Redis'e karşı çalışır, mock'lanmaz. Postgres gibi
paralel worktree'lerde ayrı bir porta yönlendirilebilir:

```bash
REDIS_PORT=6380 docker compose -p <worktree-adi> up -d redis
REDIS_URL=redis://localhost:6380/0 .venv/bin/pytest
```

Redis testleri Postgres'inki gibi ağır bir "sıfırlama" koruması gerektirmiyor:
her test kendi rastgele anahtarını kullanıyor (ör. `user:<uuid4>`) ve yazılan
tek şey birkaç saniyelik TTL'li sayaç anahtarları — üzerine yazma ya da veri
kaybı riski yok. Yine de testler bağlanmadan önce `REDIS_URL`'in yerel bir
Redis'e (`localhost`/`127.0.0.1`/`::1`/docker-compose servis adı `redis`)
işaret ettiğini doğruluyor (`tests/conftest.py`).

**Koruma, iki aşama** (`tests/db_safety.py`, yalnızca Postgres için):

1. **Bağlanmadan önce adres:** `DATABASE_URL`'in sunucusu `localhost`, `127.0.0.1`,
   `::1` ya da docker-compose servis adı `postgres` değilse oturum çıkış kodu 3 ile
   durur, uzak sunucuya bağlantı bile açılmaz. Ayrı bir uzak TEST veritabanı
   bilinçli olarak kullanılacaksa (ör. CI) `VITRIN_ALLOW_REMOTE_TEST_DB=1`. PR #12
   incelemesinde eklendi: yalnızca şema kontrolü, `auth` şeması olmayan uzak bir
   Postgres'i "yeni kurulmuş" sanıp sıfırlardı.
2. **Bağlandıktan sonra şema:** bağlanılan veritabanında `auth` şeması varsa ve yerel
uyumluluk katmanının (migration 0002) işaretini taşımıyorsa — yani büyük
olasılıkla Supabase ise — testler hiçbir şeye dokunmadan çıkış kodu 3 ile durur
(`tests/db_safety.py`). `.env`'e Supabase `DATABASE_URL`'i yazıldıktan sonra
yanlışlıkla `pytest` çalıştırmak bu korumadan önce gerçek kullanıcıların hepsini
silerdi; sahte bir Supabase veritabanında birebir gösterildi.

**Faz 4 ve Faz 5 incelemesindeki testlerin tamamı** izole yerel PostgreSQL
(`localhost:5434`) ve Redis (`localhost:6380`) üzerinde çalıştırıldı: **285
test geçti**. Buna hesap, oturum/gövde, DB adres güvenliği, cursor, erken
JWT, hesap değişimi ve dağıtık hız sınırı testleri dahildir; gerçek Supabase
test hedefi olarak kullanılmadı.

Kimlik doğrulama testleri gerçek bir Supabase'e gitmiyor: test anahtarıyla
imzalanmış token'lar üretiliyor ve yalnızca JWKS indirme adımı taklit ediliyor
(`tests/conftest.py` → `tokens`). RLS testleri `anon`/`authenticated` rollerini
`set local role` ile taklit ediyor (`tests/test_rls.py`).

## R2 CORS

Kompozisyon editörü zemin görsellerini tarayıcıda `crossOrigin="anonymous"`
ile yüklüyor; bucket her frontend origin'i için **GET ve HEAD** izni vermeli.
Kural eksikse hata vermez: editör sessizce gradyan zemine düşer ve dışa
aktarılan görsel zeminsiz iner. Bucket yine public-read değil — CORS yalnızca
tarayıcının imzalı URL yanıtını okuyabilmesini sağlıyor, yetki vermiyor.

**Şu an henüz bir production alan adı yok (10.09.2026 itibarıyla), bu yüzden
kural bilinçli olarak yalnızca `localhost:3000` içeriyor:**

Cloudflare dashboard → R2 → bucket → Settings → CORS Policy:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": [],
    "MaxAgeSeconds": 3600
  }
]
```

**⚠️ PRODUCTION'A DEPLOY EDERKEN:** asıl alan adı belirlendiğinde
`AllowedOrigins` listesine mutlaka eklenmeli
(`["https://<production-alan-adi>", "http://localhost:3000"]`). Eklenmezse
canlıda hata VERMEZ — editör sessizce gradyan zemine düşer ve her kompozisyon
zeminsiz iner; yerelde fark edilmez çünkü `localhost:3000` zaten kuralda.

Doğrulama (gerçek bucket'a karşı, `.env` içindeki R2_* ile):

```bash
.venv/bin/python scripts/check_r2_cors.py http://localhost:3000
# production'a geçince:
.venv/bin/python scripts/check_r2_cors.py https://<production-alan-adi> http://localhost:3000
```

Script önce tanımlı kuralı okur, sonra bucket'taki gerçek bir nesne için imzalı
URL üretip her origin'le GET/HEAD atar ve `Access-Control-Allow-Origin`
yanıtını kontrol eder. Çıkış kodu 0 değilse kural eksiktir.

## Kimlik doğrulama ve yetkilendirme (Faz 4)

**Akış:** tarayıcı oturumu `@supabase/ssr` ile çerezde tutuyor; Next.js vekili
isteği `Authorization: Bearer <access_token>` ile FastAPI'ye iletiyor. Backend
token'ı Supabase'e sormadan projenin genel anahtarlarıyla (JWKS,
`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`, ES256/RS256) doğruluyor:
imza, `exp`/`iat`, `iss`, `aud=authenticated`, `role=authenticated`; anonim
oturumlar reddediliyor. Kod: `app/core/auth.py`.

| Durum | Yanıt |
| --- | --- |
| `SUPABASE_URL` boş | `503` — sessizce açık kalmaz |
| Token yok / geçersiz / süresi dolmuş | `401` + `WWW-Authenticate: Bearer` |
| JWKS'ye ulaşılamıyor | `503` |
| Oturum var ama yönetici değil (admin uç noktası) | `403` |

**Anahtar önbelleği:** JWK set 10 dakika önbellekte tutuluyor; Supabase'de iptal
edilen bir imzalama anahtarı en geç bu süre dolunca reddediliyor (PyJWT'nin
anahtar başına süresiz önbelleği bilinçli olarak kapalı). Bilinmeyen bir `kid`
(anahtar rotasyonu) JWKS'yi yeniden çektiriyor ama en fazla dakikada bir —
rastgele `kid`'li token'larla Supabase'e istek yağdırılıp threadpool
doldurulamasın diye.

**Yönetici yetkisi** Faz 3'teki geçici `X-Admin-Secret` yerine `admin_users`
tablosundan geliyor; her istekte veritabanından kontrol ediliyor. JWT'deki
`user_metadata` (kullanıcı düzenleyebilir) ve `app_metadata` (token
yenilenene kadar bayat) bilinçli olarak kullanılmadı. İlk yönetici Supabase SQL
editöründen eklenir:

```sql
insert into public.admin_users (user_id)
select id from auth.users where email = '<e-posta>';
```

### Kullanıcı projeleri (geçmiş çalışmalar)

`frontend/src/lib/work-history.ts`'in dört fonksiyonunun sunucu karşılığı:

| Uç nokta | İş |
| --- | --- |
| `GET /api/projects?limit=50&cursor=...` | Tek sayfa, en yeni önce; `{items, next_cursor}` (sayfa başına en fazla 100) |
| `POST /api/projects` | Multipart: `result` (PNG), `thumbnail` (PNG/JPEG/WebP, ≤512 KB), `file_name`, `is_mocked`, `duration_seconds` → `201` |
| `GET /api/projects/{id}` | Tek proje |
| `DELETE /api/projects/{id}` | `204` |
| `DELETE /api/projects` | Kullanıcının tüm projeleri, `204` |

Yanıtlarda görseller süreli imzalı URL (`result_url`, `thumbnail_url`,
`expires_in` = `PROJECT_URL_EXPIRY_SECONDS`).

- **IDOR:** her sorgu `user_id = <token'daki kullanıcı>` filtresi taşıyor;
  başkasının projesi için `403` değil `404` dönüyor (varlığını doğrulamamak için).
- **Hesap-değişimi yarışı:** POST/DELETE mutasyonları işlemi başlatan tarayıcı
  kullanıcısını `X-Expected-User-Id` ile taşır. JWT'deki doğrulanmış kullanıcı
  farklıysa `409`; A'nın bekleyen sonucu B'nin hesabına yazılamaz.
- **R2 anahtarı:** `projects/<user_id>/<uuid>/result.png` — kullanıcının verdiği
  dosya adı anahtara hiç girmiyor (path traversal koruması), yalnızca
  görüntüleme metni olarak saklanıyor.
- **Sıra:** önce R2, sonra veritabanı; ikinci yükleme patlarsa ilki geri
  siliniyor. Veritabanı yazımı başarısız olursa da yüklenen görseller geri
  siliniyor; Supabase'den silinmiş ama token'ı hâlâ geçerli bir kullanıcının
  kaydı (FK ihlali) `500` değil `401` dönüyor — Supabase kullanıcı silmede
  token'ları iptal etmiyor. Silmede önce satır siliniyor, R2 silmesi başarısız
  olursa nesne yetim kalıyor ve log'a yazılıyor (kullanıcıya hata dönmüyor).
- **Süre:** `duration_seconds` sonlu ve negatif olmayan bir sayı olmalı. `inf`
  hem route'ta (`422`) hem veritabanı kısıtında reddediliyor: JSON'a
  çevrilemediği için kaydedilseydi kullanıcının proje listesi her istekte `500`
  dönerdi. Postgres'te `'NaN' >= 0` doğru olduğu için kısıt `< 'Infinity'` ile
  ikisini birden eliyor.
- **Bilinen sınır:** sonuç PNG'si `MAX_FILE_SIZE_MB` (20 MB) ile sınırlı ve tüm
  istek `MAX_REQUEST_BODY_BYTES` içinde kalmalı. 20 MB'lık bir JPEG'den çıkan
  saydam PNG bundan büyük olabilir; bu durumda `413` döner.
- **KVKK:** kullanıcı Supabase'den silinince `projects` ve `admin_users`
  satırları `ON DELETE CASCADE` ile gidiyor. Kullanıcı hesabını **arayüzden**
  silerse R2 görselleri de siliniyor (aşağıdaki "Hesap silme"); Supabase panelinden
  elle silinen bir kullanıcının R2 nesneleri ise hâlâ otomatik temizlenmiyor.

### Hesap silme

`DELETE /api/account` (oturum + gövdede hesap e-postası) artık **202 pending**
döner. Kalıcı worker önce tüm provider aboneliklerini iptal eder, ardından R2
öneklerini ve Supabase Auth kullanıcısını siler. Belirsiz ödeme/iptal sonucu
çözülmeden hesap silinmez. Finansal ve kabul kayıtları cascade silinmez;
kimlik bağlantısı ayrılır. Ayrıntı ve retry: [ödeme runbook'u](../docs/billing-runbook.md).

**Gizli anahtar** RLS'i atlayan tam yetkili bir anahtar: yalnızca backend'de, hata
mesajlarına ve loglara hiç yazılmıyor (testle korunuyor). Yeni `sb_secret_...`
anahtarları yalnızca `apikey` başlığıyla, eski `service_role` JWT'si ek olarak
`Authorization` ile gönderiliyor.

### Arka plan kaldırmada oturum

`POST /api/remove-background` Faz 4'te **oturum istiyor** (ürün kararı, 12.09.2026):
`EarlyAuthenticationMiddleware` token'ı multipart gövdenin ilk baytından önce
doğruluyor; geçersizse `401` ile gövde okunmadan ve BiRefNet'e ulaşılmadan
reddediliyor. Aynı erken katman doğrulanmış kullanıcı hız sınırını uygular;
Next.js vekili de oturumu kendi gövdesini okumadan kontrol eder.

### Veritabanı erişim modeli ve RLS

Backend Postgres'e tablo **sahibi** olarak bağlanıyor ve RLS onu etkilemiyor;
kullanıcı verisinin birinci koruması yukarıdaki sahiplik filtresi. RLS ikinci
katman: Supabase'in `anon` anahtarı herkese açık ve Data API (PostgREST)
tablolara ulaşabiliyor. Bu yüzden (migration 0003 ve 0004):

- `public` şemasındaki **her** tabloda RLS açık — `alembic_version` dahil
  (varsayılan grant'lerin olduğu bir projede `anon` ona yazabilirdi).
- `anon` ve `authenticated` rollerinin hiçbir tabloda yetkisi yok (`revoke all`).
  Supabase 28.04.2026'dan beri yeni tabloları Data API'ye otomatik açmıyor;
  eski projelerdeki varsayılan grant'lere karşı yine de açıkça geri alınıyor.
- `projects` için yalnızca "kendi satırını oku/sil" politikaları var (tablo
  ileride Data API'ye açılırsa geçerli olacak kurallar). **INSERT/UPDATE
  politikası bilinçli olarak yok:** istemci kendi satırına başka birinin R2
  anahtarını yazabilir ve backend o görsel için imzalı URL üretirdi.
- `admin_users`, `backgrounds` ve `user_consents` için politika yok — tam ret.
- `user_consents`, kayıt metadata'sındaki sürümü trigger ile sunucu zamanında
  kaydeder. Migration öncesi kullanıcılar `metadata_backfill` kaynağıyla
  taşınır; istemci rollerinin tablo üzerinde hiçbir yetkisi yoktur.
- `tests/test_rls.py`, `public`'teki her tablonun RLS'li olduğunu ve istemci
  rollerinin hiçbir yetkisi olmadığını genel olarak doğruluyor: RLS'siz yeni
  bir tablo eklenirse test kırmızı yanar.

**Yerel uyumluluk katmanı (migration 0002):** düz Postgres'te Supabase'in
`auth` şeması, `auth.uid()` ve `anon`/`authenticated` rolleri yok. 0002 bunları
yalnızca YOKSA oluşturuyor; Supabase'de hiçbir şey yapmıyor. Downgrade yalnızca
kendi işaretlediği şemayı siliyor, Supabase'in `auth` şemasına dokunmuyor.

**Supabase'e bağlanırken:** `DATABASE_URL` için doğrudan bağlantıyı ya da
**session** pooler'ı (5432) kullanın; transaction pooler (6543) asyncpg'nin
prepared statement'larıyla uyumsuz.

### CORS

`CORS_ALLOWED_ORIGINS` (virgülle ayrılmış) dışındaki origin'lere izin
verilmiyor; `*` ve yol içeren değerler uygulama başlarken reddediliyor
(`SECURITY.md` 2.2). Yöntemler `GET/POST/DELETE`, başlıklar
`Authorization/Content-Type`; kimlik çerezle değil başlıkla taşındığı için
`allow_credentials` kapalı. Bugünkü asıl istemci Next.js vekili (sunucudan
sunucuya, CORS gerektirmez); bu katman tarayıcıdan doğrudan erişilen her durum
için sınırı baştan çiziyor.

## Docker

```bash
docker build -t vitrin-ai-backend .
docker run -p 8000:8000 --env-file .env vitrin-ai-backend
```

Container root olmayan bir kullanıcıyla (`appuser`) çalışır.

**GEÇİCİ kısıt — migration'lar container içinden çalışmıyor:** `Dockerfile`
sadece `app/` dizinini image'a kopyalıyor; `alembic/` ve `alembic.ini` image'a
dahil değil ve container'ın başlatma adımında bir migration adımı yok. Yani bu
image'dan çalışan bir container **kendi migration'larını çalıştıramaz** —
`backgrounds` tablosunun (ve gelecekteki tabloların) oluşması hâlâ bir
geliştiricinin tam bir checkout'tan hedef veritabanına karşı elle
`alembic upgrade head` çalıştırmasına bağlı; bu adım deploy'dan önce veya
deploy ile birlikte, ayrı olarak yapılmalı. Bu bilinçli bir kısayol —
Dockerfile'ı/deploy sürecini yeniden yapılandırmak bu PR'ın kapsamı dışında
tutuldu, sessizce bırakılmadı (bkz. kök `CLAUDE.md` ders 8).

**Not:** Yerelde Docker Desktop'a ayrılan bellek 12-14GB'ın altındaysa gerçek bir
inference isteği container'ı OOM ile kill eder (`exitcode=137`) — bu bir kod
hatası değil, yukarıdaki RAM kısıtının doğal sonucu. Docker Desktop'ın bellek
limitini (Settings → Resources) artırın veya production'da yeterli RAM'li bir
sunucu/instance seçin.

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `MAX_FILE_SIZE_MB` | `20` | Yükleme boyutu sınırı (dosya içeriği) |
| `MAX_CONCURRENT_INFERENCES` | `1` | Aynı anda çalışabilecek BiRefNet inference sayısı (sürece/worker'a özgü) |
| `MAX_IMAGE_PIXELS` | `40000000` | Kabul edilen maksimum piksel sayısı (decompression-bomb koruması) |
| `MAX_REQUEST_BODY_BYTES` | boş (otomatik: `MAX_FILE_SIZE_MB` + 64KB) | Toplam istek gövdesi sınırı (multipart zarf dahil); ayrıca, açıkça override edilebilir |
| `UPLOAD_RATE_LIMIT_WINDOW_SECONDS` | `60` | Upload hız sınırının kayan pencere süresi |
| `UPLOAD_IP_RATE_LIMIT_REQUESTS` | `120` | Oturumsuz/geçersiz-token denemeleri; process/IP/pencere |
| `UPLOAD_USER_RATE_LIMIT_REQUESTS` | `30` | Doğrulanmış kullanıcı başına upload; process/pencere |
| `REDIS_URL` | `redis://localhost:6379/0` | Hız sınırlayıcı sayaçlarının tutulduğu Redis (yerelde `docker-compose.yml`'deki Redis'e işaret eder) — birden fazla worker/instance aynı sayacı paylaşır |
| `REMBG_MODEL_NAME` | `birefnet-general` | Kullanılan segmentasyon modeli |
| `DATABASE_URL` | `postgresql+asyncpg://vitrin_ai:change_me_locally@localhost:5432/vitrin_ai` | Postgres bağlantı dizesi (yerelde `docker-compose.yml`'deki Postgres'e işaret eder) |
| `SUPABASE_URL` | boş | Supabase proje adresi (`https://<ref>.supabase.co`). Token'ların `iss`'i ve JWKS adresi buradan türetiliyor. Boşsa oturum gerektiren uç noktalar `503` döner. Faz 3'teki `ADMIN_SECRET` kaldırıldı |
| `SUPABASE_JWT_AUDIENCE` | `authenticated` | Beklenen `aud` değeri |
| `SUPABASE_LEGACY_JWT_SECRET` | boş | Yalnızca JWKS'ye geçmemiş eski projeler için HS256 secret'ı. Yeni projelerde boş kalmalı |
| `SUPABASE_SECRET_KEY` | boş | Supabase gizli sunucu anahtarı (`sb_secret_...`; Dashboard → Project Settings → API Keys → Secret keys). Yalnızca hesap silme için; RLS'i atlar, frontend'e asla yazılmaz. Boşsa `DELETE /api/account` hiçbir şeye dokunmadan `503` döner |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | Virgülle ayrılmış origin'ler; `*` ve yollu değerler reddedilir. Production alan adı belli olunca eklenmeli |
| `PROJECT_URL_EXPIRY_SECONDS` | `3600` | Proje görsellerinin imzalı URL süresi; yanıtta `expires_in` olarak da dönüyor |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` | boş | Cloudflare R2 kimlik bilgileri. Dördü de dolu olmadan R2 client'ı oluşturulmaz: eksik ayarları adlarıyla listeleyen bir `R2ConfigurationError` fırlatılır. Yalnızca gerçekten R2'ye dokunan yollar etkilenir: sunucu ayağa kalkar, boş bir veritabanında `GET /api/backgrounds` hiç client oluşturmaz. **Ama Faz 5'ten beri `POST /api/remove-background` da R2 istiyor** (idempotency sonuç deposu) ve ayarlar eksikse inference'a girmeden `503 result_storage_unavailable` döner — yani arka plan kaldırmayı yerelde denemek için de dört ayar gerekli |
| `BACKGROUND_URL_EXPIRY_SECONDS` | `3600` | `GET /api/backgrounds` presigned URL geçerlilik süresi. Aynı değer yanıtta `expires_in` alanı olarak da dönüyor — istemci yenileme zamanını buradan öğrenir, kendi tarafına sabitlemez |
| `TRUSTED_PROXY_IPS` | boş | Virgülle ayrılmış, GÜVENİLEN ters proxy adresleri. `X-Forwarded-For` yalnızca bağlantı bu listedeki bir adresten geliyorsa okunur; boşken başlık hiç okunmaz (sahte başlıkla hız sınırı kovası değiştirilemez). Uvicorn'un `--forwarded-allow-ips` değeriyle aynı liste olmalı |
| `RESEND_API_KEY` / `RESEND_BASE_URL` / `BILLING_EMAIL_FROM` | boş / `https://api.resend.com` / boş | "Ödemeniz alınamadı, kartınızı güncelleyin" e-postası. **Ücretli checkout'un açılış koşuludur**: eksikse `BILLING_CHECKOUT_ENABLED=true` olsa bile satın alma 503 döner — kullanıcıya vaat edilen 3 günlük grace penceresinin tek uyarısı bu e-posta. Gönderim yine de yapılamazsa `billing_alerts`'e `dunning_email_not_sent` yazılır; action başarılı sayılmaz, sınırlı retry/manual inceleme için açık kalır. Gönderim isteği `provider_actions.id`'yi Resend'e `Idempotency-Key` başlığıyla taşır: timeout sonrası tekrar deneme çift e-posta göndermez |

Frontend'in yükleme kısıtları (`ALLOWED_CONTENT_TYPES` / `MAX_FILE_SIZE_MB`) bu
değerlerle elle senkron tutulmalı (bkz. kök `CLAUDE.md`). Karşılığı Faz 2'de
`frontend/src/lib/upload-constraints.ts` içinde yazıldı — buradaki bir değer
değişirse o dosya da güncellenmeli.

Desteklenen formatlar: JPEG, PNG, WebP, HEIC/HEIF.

## Kaynak tüketimi korumaları

`POST /api/remove-background` Faz 4'ten beri **oturum istiyor** (bkz. "Arka plan
kaldırmada oturum"); Faz 5'te kredi kontrolü atomik dönem rezervasyonuyla uygulanır. Oturumdan bağımsız olarak
kaynak tüketimini sınırlayan beş katman var:

1. **Erken hız sınırı** — `UploadRateLimitMiddleware` oturumsuz/geçersiz
   token denemelerini IP ile; `EarlyAuthenticationMiddleware` doğrulanmış
   kullanıcıları `sub` ile kayan pencerede sınırlar. Aşım gövde okunmadan
   `429` + `Retry-After` döner. Sayaçlar Redis'te (`app/services/rate_limit.py`,
   `REDIS_URL`) — **dağıtık**: birden fazla worker/instance aynı anahtarı
   paylaşır. Faz 7'ye bekletilen "dağıtık rate limiting" maddesiydi, PR #13
   incelemesinde öne alındı; önceden process içi bellekteydi ve her worker
   kendi sayacını tuttuğu için gerçek limit worker sayısıyla çarpılıyordu.
2. **Erken JWT** — korumalı üç POST uç noktasında token multipart parser'ın
   ilk `receive()` çağrısından önce doğrulanır; 401/503 yanıtı gövdeyi tüketmez.
3. **`BodySizeLimitMiddleware`** (`app/middleware/body_size_limit.py`) — saf
   ASGI middleware, `receive()` akışını sararak toplam istek gövdesi
   `MAX_REQUEST_BODY_BYTES` sınırını aşarsa Starlette'in multipart parser'ı
   gövdeyi tamamlamadan `413` döner. Bu sınır ayrı, açıkça yapılandırılabilir
   bir ayardır (`max_request_body_bytes`, env `MAX_REQUEST_BODY_BYTES`);
   verilmezse `max_file_size_mb + 64KB` (multipart zarf overhead payı) olarak
   otomatik hesaplanır. Bu, uygulama-seviyesi bir yedektir — en erken/ucuz red
   reverse proxy'de (`SECURITY.md` 2.3) olmalı.
4. **Piksel sınırı** (`app/validation/upload.py`) — `MAX_IMAGE_PIXELS`, küçük
   byte boyutlu ama devasa çözünürlüklü ("decompression bomb") görselleri
   reddeder; PIL'in kendi `Image.MAX_IMAGE_PIXELS` global'ine güvenilmiyor.
   Görsel decode/verify aşamasında PIL'in fırlatabileceği tüm istisnalar
   (`SyntaxError`, `struct.error` vb. dahil — sadece `OSError`/
   `UnidentifiedImageError` değil) yakalanıp `UploadValidationError`'a çevrilir;
   bozuk/kasıtlı olarak bozulmuş dosyalar 500 yerine her zaman 400 üretir.
5. **`EndpointAdmissionLimiterMiddleware`** (`app/middleware/admission_limiter.py`)
   — saf ASGI middleware, yalnızca `POST /api/remove-background`'a özgü.
   `InferenceCapacityLimiter`'ı (`app/services/concurrency.py`,
   `anyio.CapacityLimiter` tabanlı, gerçek non-blocking sözleşme) **multipart
   parser çağrılmadan önce**, en dış middleware katmanında uygular; kapasite
   doluysa istek parser'a/route'a hiç ulaşmadan beklemeden anında `429` alır.
   İzin, downstream işlem (parse + validation + inference) tamamen bitene
   kadar — başarı, hata veya iptal fark etmeksizin — tutulur. **Sürece/worker'a
   özgüdür** — çoklu worker dağıtımında toplam kapasite `worker_sayısı ×
   MAX_CONCURRENT_INFERENCES` olur; kalıcı, süreçler-arası bir sınır için
   Celery/RQ + Redis kuyruğuna geçmek gerekir (bu PR'ın kapsamı dışında).

## Ödemeler ve kredi (Faz 5)

Kurulum, tüm açılış kapıları ve operasyon prosedürleri:
[ödeme runbook'u](../docs/billing-runbook.md). Migration `0005`; yeni tabloların
RLS/grant kısıtları aynı migration'dadır. İş kuralları `app/services/billing`,
HTTP sözleşmesi `app/api/routes/billing.py` içindedir. PostgreSQL kalıcı kuyrukları
`deploy/billing-maintenance.timer` işletir; ayrıca Celery gerektirmez.
`POST /api/remove-background` UUID `Idempotency-Key` ister. **Anahtar isteği
değil İŞİ tanımlar** ve kredi anahtar başına yalnızca bir kez tüketilir:

- başarılı PNG, `results/<user_id>/<request_id>.png` altında **geçici bir R2
  nesnesi** olarak saklanır; `usage_reservations` satırı bu anahtarı ve son
  kullanma zamanını tutar (`RESULT_RETENTION`, **24 saat**);
- aynı `Idempotency-Key` tekrar gelirse **inference hiç çalışmaz**, saklanan
  PNG döner, ikinci kredi harcanmaz. Yanıtı ağda kaybolan iş böylece
  kurtarılabilir olur;
- ilki hâlâ sürüyorsa ikinci istek `409 request_in_progress` alır (iki hızlı
  tıklama iki kredi açamaz);
- iş kesin başarısız olup kredi iade edildiyse (`released`) aynı anahtar yeni
  bir denemeye açılır — o mantıksal iş henüz tamamlanmadı;
- saklama süresi dolduysa `request_already_processed` döner ve bu bilinçli
  olarak **`retry_safe` DEĞİLDİR**: istemcinin kendiliğinden yeni anahtara
  geçip ikinci krediyi yakmaması için.

Sıra önemli: sonuç **önce saklanır, sonra kredi tüketilir**. Tersi olsaydı
saklama adımında çöken bir süreç krediyi harcanmış ama sonucu yok bırakırdı.

**Sonuç deposu bir ön koşuldur.** İstek, R2 yapılandırılmamışsa inference'a
hiç girmeden `503 result_storage_unavailable` döner; yükleme başarısız olursa
kredi iade edilir ve yine aynı kod döner. Belirsiz bir sonucu yeniden
inference'a bağlamak, aynı krediyi ikinci kez yakma riski demekti. **Yerel
geliştirmede de R2 ayarları gerekiyor** (`R2_*`); yalnız arayüzü denemek için
`frontend/.env.local` içindeki `USE_MOCK_BACKEND=true` kullanılabilir.

Süresi dolan sonuçları bakım turu (`purge_expired_results`) R2'den siler; DB
kaydı yalnız nesne gerçekten silindikten sonra temizlenir, silme başarısız
olursa bir sonraki turda tekrar denenir. Hesap silmede `projects/<uid>/` ile
birlikte `results/<uid>/` öneki de kaldırılır.

**Hata yanıtlarında `retry_safe`:** kredinin hiç tüketilmediğini ya da iade
edildiğini backend AÇIKÇA bildirir. İstemci yeni bir idempotency anahtarına
yalnızca bu bayrakla geçer; bayrak yoksa anahtar korunur.

**Zemin listelemesi kota kapısı değildir.** `GET /api/backgrounds` oturumluysa
`background_tier()`'ı çağırır ama kota/abonelik hatasında (402/403/409) listeyi
BOŞALTMAZ, `basic` seviyeye düşer; yalnız kimlik hatası (401) gerçek hatadır.
Asıl kapı rezervasyondur.

**`past_due` erişimi anında kesmez:** `past_due_access_until` bir kez ve tam 3
gün sonrasına yazılır, o süre boyunca MEVCUT dönemin kalan kotası kullanılır
(yeni dönem/kredi yok), sonra abonelik `expired` olur. Geçişte kullanıcıya
kalıcı kuyruktan bir kez "kartınızı güncelleyin" e-postası gider.

**İade/itiraz kapsamı dönem snapshot'ından belirlenir**
(`billing_transactions.period_id` → `subscription_periods.provider_subscription_reference`):
eski bir aboneliğin tahsilatını iade etmek kullanıcının güncel paketini kapatmaz.

Yeni billing testleri gerçek izole PostgreSQL kullanır, iyzico/R2 yan etkileri
taklit edilir. `subscription_periods` DB seviyesinde değişmez olduğu için
testler zamanı geriye alırken korumayı yalnızca `tests/test_billing.py`
içindeki `backdate_period` yardımcısında ve yalnız o işlem süresince kapatır.
