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
**Faz 4 (backend) sürüyor:** Supabase JWT doğrulaması, kullanıcı projeleri API'si,
`admin_users` ile gerçek yönetici yetkisi, tüm tablolarda RLS ve CORS yazıldı ve
yerel Postgres'e karşı test edildi. Gerçek Supabase projesi 11.09.2026'da kuruldu;
migration'lar uygulandı ve RLS canlı projede doğrulandı (bkz.
"Kimlik doğrulama ve yetkilendirme").

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

**Koruma:** oturum başında bağlanılan veritabanında `auth` şeması varsa ve yerel
uyumluluk katmanının (migration 0002) işaretini taşımıyorsa — yani büyük
olasılıkla Supabase ise — testler hiçbir şeye dokunmadan çıkış kodu 3 ile durur
(`tests/db_safety.py`). `.env`'e Supabase `DATABASE_URL`'i yazıldıktan sonra
yanlışlıkla `pytest` çalıştırmak bu korumadan önce gerçek kullanıcıların hepsini
silerdi; sahte bir Supabase veritabanında birebir gösterildi.

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
| `GET /api/projects?limit=50` | Kullanıcının projeleri, en yeni önce (en fazla 100) |
| `POST /api/projects` | Multipart: `result` (PNG), `thumbnail` (PNG/JPEG/WebP, ≤512 KB), `file_name`, `is_mocked`, `duration_seconds` → `201` |
| `GET /api/projects/{id}` | Tek proje |
| `DELETE /api/projects/{id}` | `204` |
| `DELETE /api/projects` | Kullanıcının tüm projeleri, `204` |

Yanıtlarda görseller süreli imzalı URL (`result_url`, `thumbnail_url`,
`expires_in` = `PROJECT_URL_EXPIRY_SECONDS`).

- **IDOR:** her sorgu `user_id = <token'daki kullanıcı>` filtresi taşıyor;
  başkasının projesi için `403` değil `404` dönüyor (varlığını doğrulamamak için).
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
  satırları `ON DELETE CASCADE` ile gidiyor, ama **R2 nesneleri gitmiyor** —
  önek `projects/<user_id>/` olduğu için tek komutla silinebilir; otomatik
  temizlik henüz yok.

### Veritabanı erişim modeli ve RLS

Backend Postgres'e tablo **sahibi** olarak bağlanıyor ve RLS onu etkilemiyor;
kullanıcı verisinin birinci koruması yukarıdaki sahiplik filtresi. RLS ikinci
katman: Supabase'in `anon` anahtarı herkese açık ve Data API (PostgREST)
tablolara ulaşabiliyor. Bu yüzden (migration 0003):

- `public` şemasındaki **her** tabloda RLS açık — `alembic_version` dahil
  (varsayılan grant'lerin olduğu bir projede `anon` ona yazabilirdi).
- `anon` ve `authenticated` rollerinin hiçbir tabloda yetkisi yok (`revoke all`).
  Supabase 28.04.2026'dan beri yeni tabloları Data API'ye otomatik açmıyor;
  eski projelerdeki varsayılan grant'lere karşı yine de açıkça geri alınıyor.
- `projects` için yalnızca "kendi satırını oku/sil" politikaları var (tablo
  ileride Data API'ye açılırsa geçerli olacak kurallar). **INSERT/UPDATE
  politikası bilinçli olarak yok:** istemci kendi satırına başka birinin R2
  anahtarını yazabilir ve backend o görsel için imzalı URL üretirdi.
- `admin_users` ve `backgrounds` için politika yok — tam ret.
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
| `REMBG_MODEL_NAME` | `birefnet-general` | Kullanılan segmentasyon modeli |
| `DATABASE_URL` | `postgresql+asyncpg://vitrin_ai:change_me_locally@localhost:5432/vitrin_ai` | Postgres bağlantı dizesi (yerelde `docker-compose.yml`'deki Postgres'e işaret eder) |
| `SUPABASE_URL` | boş | Supabase proje adresi (`https://<ref>.supabase.co`). Token'ların `iss`'i ve JWKS adresi buradan türetiliyor. Boşsa oturum gerektiren uç noktalar `503` döner. Faz 3'teki `ADMIN_SECRET` kaldırıldı |
| `SUPABASE_JWT_AUDIENCE` | `authenticated` | Beklenen `aud` değeri |
| `SUPABASE_LEGACY_JWT_SECRET` | boş | Yalnızca JWKS'ye geçmemiş eski projeler için HS256 secret'ı. Yeni projelerde boş kalmalı |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | Virgülle ayrılmış origin'ler; `*` ve yollu değerler reddedilir. Production alan adı belli olunca eklenmeli |
| `PROJECT_URL_EXPIRY_SECONDS` | `3600` | Proje görsellerinin imzalı URL süresi; yanıtta `expires_in` olarak da dönüyor |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` | boş | Cloudflare R2 kimlik bilgileri. Dördü de dolu olmadan R2 client'ı oluşturulmaz: eksik ayarları adlarıyla listeleyen bir `R2ConfigurationError` fırlatılır. Yalnızca gerçekten R2'ye dokunan yollar etkilenir — boş bir veritabanında `GET /api/backgrounds` hiç client oluşturmadığı için R2'siz yerel geliştirme çalışmaya devam eder |
| `BACKGROUND_URL_EXPIRY_SECONDS` | `3600` | `GET /api/backgrounds` presigned URL geçerlilik süresi. Aynı değer yanıtta `expires_in` alanı olarak da dönüyor — istemci yenileme zamanını buradan öğrenir, kendi tarafına sabitlemez |

Frontend'in yükleme kısıtları (`ALLOWED_CONTENT_TYPES` / `MAX_FILE_SIZE_MB`) bu
değerlerle elle senkron tutulmalı (bkz. kök `CLAUDE.md`). Karşılığı Faz 2'de
`frontend/src/lib/upload-constraints.ts` içinde yazıldı — buradaki bir değer
değişirse o dosya da güncellenmeli.

Desteklenen formatlar: JPEG, PNG, WebP, HEIC/HEIF.

## Kaynak tüketimi korumaları

`POST /api/remove-background` şu anda auth/kota kontrolü olmadan herkese açık.
Faz 4'te kimlik doğrulama geldi ama bu uç noktaya **bilinçli olarak
bağlanmadı**: arayüzdeki "Deneyin" akışı oturum açmadan çalışıyor ve bunu
kapatmak bir ürün kararı (kredi sistemi Faz 5'te; kota muhtemelen oraya
bağlanacak). Bu ara dönemde kaynak tüketimini sınırlayan üç bağımsız katman var:

1. **`BodySizeLimitMiddleware`** (`app/middleware/body_size_limit.py`) — saf
   ASGI middleware, `receive()` akışını sararak toplam istek gövdesi
   `MAX_REQUEST_BODY_BYTES` sınırını aşarsa Starlette'in multipart parser'ı
   gövdeyi tamamlamadan `413` döner. Bu sınır ayrı, açıkça yapılandırılabilir
   bir ayardır (`max_request_body_bytes`, env `MAX_REQUEST_BODY_BYTES`);
   verilmezse `max_file_size_mb + 64KB` (multipart zarf overhead payı) olarak
   otomatik hesaplanır. Bu, uygulama-seviyesi bir yedektir — en erken/ucuz red
   reverse proxy'de (`SECURITY.md` 2.3) olmalı.
2. **Piksel sınırı** (`app/validation/upload.py`) — `MAX_IMAGE_PIXELS`, küçük
   byte boyutlu ama devasa çözünürlüklü ("decompression bomb") görselleri
   reddeder; PIL'in kendi `Image.MAX_IMAGE_PIXELS` global'ine güvenilmiyor.
   Görsel decode/verify aşamasında PIL'in fırlatabileceği tüm istisnalar
   (`SyntaxError`, `struct.error` vb. dahil — sadece `OSError`/
   `UnidentifiedImageError` değil) yakalanıp `UploadValidationError`'a çevrilir;
   bozuk/kasıtlı olarak bozulmuş dosyalar 500 yerine her zaman 400 üretir.
3. **`EndpointAdmissionLimiterMiddleware`** (`app/middleware/admission_limiter.py`)
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
