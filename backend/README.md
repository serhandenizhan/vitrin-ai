# backend

FastAPI uygulaması, AI inference servisi (BiRefNet) burada yaşıyor. Celery worker'ları
ve arka plan meta verisi Faz 3'te eklenecek.

**Durum:** Faz 1 tamamlandı — `POST /api/remove-background` endpoint'i çalışıyor,
birim testleri yeşil, gerçek mücevher fotoğraflarıyla (HEIC + WhatsApp JPEG) doğrulandı,
Docker build başarıyla derleniyor ve container düzgün başlıyor. Ayrıca `GET /health`
endpoint'i var — sadece süreç canlılığını doğrular, model yüklü mü diye bakmaz (model
ilk çağrıda gecikmeli yüklenir, health check bunu tetiklerse ilk kontrol ~30-35sn sürerdi).

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

## Docker

```bash
docker build -t vitrin-ai-backend .
docker run -p 8000:8000 --env-file .env vitrin-ai-backend
```

Container root olmayan bir kullanıcıyla (`appuser`) çalışır.

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
