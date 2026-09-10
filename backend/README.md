# backend

FastAPI uygulaması, AI inference servisi (BiRefNet) burada yaşıyor. Celery worker'ları
ve arka plan meta verisi Faz 3'te eklenecek.

**Durum:** Faz 1 tamamlandı — `POST /api/remove-background` endpoint'i çalışıyor,
birim testleri yeşil, gerçek mücevher fotoğraflarıyla (HEIC + WhatsApp JPEG) doğrulandı,
Docker build başarıyla derleniyor ve container düzgün başlıyor. Faz 3'ün backend kısmı
(arka plan kütüphanesi: yükleme + listeleme + R2 depolama) da tamamlandı — ayrıntılar
aşağıda ve kök `ROADMAP.md` Faz 3 bölümünde.

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
| `ADMIN_SECRET` | yok (zorunlu) | `POST /api/admin/backgrounds` için geçici paylaşılan secret — Faz 4'te gerçek Supabase Auth ile değişecek |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` | boş | Cloudflare R2 kimlik bilgileri. **Dikkat:** bunlar boş bırakılırsa `GET /api/backgrounds` hata VERMEZ — geçerli görünümlü ama çalışmayan presigned URL'ler (`https://.r2.cloudflarestorage.com/...`) döner; bu, koddan bakmadan fark edilebilecek bir hata modu değildir |
| `BACKGROUND_URL_EXPIRY_SECONDS` | `3600` | `GET /api/backgrounds` presigned URL geçerlilik süresi |

Frontend'in yükleme kısıtları (`ALLOWED_CONTENT_TYPES` / `MAX_FILE_SIZE_MB`) bu
değerlerle elle senkron tutulmalı (bkz. kök `CLAUDE.md`). Karşılığı Faz 2'de
`frontend/src/lib/upload-constraints.ts` içinde yazıldı — buradaki bir değer
değişirse o dosya da güncellenmeli.

Desteklenen formatlar: JPEG, PNG, WebP, HEIC/HEIF.

## Kaynak tüketimi korumaları

`POST /api/remove-background` şu anda auth/kota kontrolü olmadan herkese açık
(kimlik doğrulama Faz 4'te Supabase Auth ile gelecek — bkz. kök `ROADMAP.md`).
Bu ara dönemde kaynak tüketimini sınırlayan üç bağımsız katman var:

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
