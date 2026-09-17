# Faz 3 — Arka plan kütüphanesi backend tasarımı (Serhan'a ait kısım)

**Tarih:** 2026-09-09
**Kapsam:** `ROADMAP.md` Faz 3'te Serhan'a ait kısım — arka plan meta veri modeli (Postgres +
Alembic), yükleme API'si (`POST /api/admin/backgrounds`, `GET /api/backgrounds`), R2 depolama
entegrasyonu. Kaan'ın Konva.js editörü bu spec'in kapsamı dışında.

## Bağlam ve kilitli kararlar

- Backend'de şu an DB bağlantısı, migration aracı ya da R2 istemcisi yok — bu, sıfırdan
  kurulan bir alt sistem.
- Tech stack (`ROADMAP.md` bölüm 3) zaten SQLAlchemy + Alembic ve boto3 (S3-uyumlu R2) olarak
  kilitli; burada kararlaştırılan yalnızca sync/async tercihi.
- **Kullanıcı kararı (bu spec'e özgü, brainstorming sırasında alındı):**
  - R2: gerçek bir Cloudflare R2 bucket'ına karşı geliştirilecek (yerel MinIO stub'ı değil).
  - DB katmanı: **async SQLAlchemy + asyncpg** — kod tabanındaki tüm route'lar zaten
    `async def`, native async DB sorguları event loop'u bloklamaz, ekstra
    `run_in_threadpool` sarmalamaya gerek kalmaz.
  - R2 istemcisi: **sync boto3 + `run_in_threadpool`** — `generate_presigned_url` zaten yerel
    bir imzalama işlemi (ağ çağrısı yok), sadece gerçek `put_object` (yükleme) çağrısı
    threadpool'a alınır. Ek bağımlılık (`aioboto3`) eklenmez, kod tabanındaki mevcut
    "bloklayan işi threadpool'a taşı" deseniyle (BiRefNet inference, `validate_upload`)
    tutarlı kalır.
  - Şema: **minimal** — `id`, `r2_key`, `created_at`, `is_active`. Kategori/etiket alanı
    eklenmez; MVP'yi bloklamıyor, sonradan kolayca migration ile eklenebilir.
  - **Faz disiplini:** kullanıcının standing tercihi gereği (bkz. proje hafızası
    `phase-completion-discipline`) Faz 3, Faz 4'ün getireceği gerçek Supabase Auth'u
    beklemeden kendi içinde tam bitirilir. Yükleme endpoint'i bu fazda, geçici bir
    `X-Admin-Secret` header koruması ile yazılır (önceki iterasyonda aynı durumda kullanılan
    desen, `CLAUDE.md` ders 8'e göre açıkça geçici olarak işaretlenir).

## Şema

`backgrounds` tablosu (Alembic migration'ı ile oluşturulur):

| Alan | Tip | Not |
| --- | --- | --- |
| `id` | UUID, PK | sunucuda üretilir |
| `r2_key` | str, unique, not null | R2'deki nesne anahtarı; kullanıcı dosya adından değil, sunucuda üretilen UUID'den türetilir (path traversal koruması) |
| `is_active` | bool, default `true` | `false` yapılan kayıtlar `GET /api/backgrounds` listesinde görünmez (soft-disable, silme değil) |
| `created_at` | timestamptz, default `now()` | |

Bu proje henüz RLS kullanmıyor (RLS, Faz 4'te Supabase Auth ile birlikte gelecek) — bu tablo
Faz 3'te backend'in kendi DB bağlantısı üzerinden, uygulama katmanında korunuyor
(admin secret + genel okuma herkese açık).

## Modüller

- **`app/core/db.py`** — async SQLAlchemy engine (`create_async_engine`, asyncpg driver) +
  `async_sessionmaker`. `get_db_session()` — FastAPI `Depends` ile kullanılacak async
  generator, her istekte bir session açıp response sonunda kapatır.
- **`app/models/background.py`** — `Background` SQLAlchemy ORM modeli (yukarıdaki şema).
- **`alembic/`** — migration altyapısı; `env.py` async engine ile çalışacak şekilde
  yapılandırılır (`asyncio.run` içinde `run_sync`).
- **`app/services/storage.py`** — `R2StorageService`:
  - `async def upload(self, key: str, content: bytes, content_type: str) -> None` — sync
    boto3 `put_object` çağrısını `run_in_threadpool` ile sarar.
  - `def generate_presigned_url(self, key: str) -> str` — sync boto3
    `generate_presigned_url`, ağ çağrısı yapmadığı için doğrudan çağrılır (threadpool
    gerekmez).
  - boto3 client, `functools.lru_cache` ile process başına bir kez oluşturulur (mevcut
    `background_removal.py`'deki `_get_session` deseniyle tutarlı).
- **`app/api/routes/backgrounds.py`**:
  - `POST /api/admin/backgrounds` — `X-Admin-Secret` header'ı `settings.admin_secret` ile
    karşılaştırılır (eşleşmezse 401). Dosya, mevcut `validate_upload` (magic-byte + boyut +
    piksel sınırı) ile doğrulanır — arka plan görselleri de aynı kısıtlara tabi. UUID tabanlı
    `r2_key` üretilir (örn. `backgrounds/{uuid4()}.{ext}`), önce R2'ye yüklenir, **yalnızca
    yükleme başarılıysa** DB'ye satır yazılır (yetim DB kaydı oluşmasın diye sıra önemli).
    Başarıda `201` + oluşturulan kaydın `id`'si döner.
  - `GET /api/backgrounds` — herkese açık, kimlik doğrulama gerektirmez. `is_active=true`
    kayıtları `created_at` sırasına göre döner, her biri için
    `settings.background_url_expiry_seconds` (varsayılan 3600sn) süreli presigned URL
    üretilir. Boş tabloda `[]` döner — editör tarafı (Kaan'ın işi) bunu placeholder zeminlere
    sessizce düşerek karşılayacak.

## Ayarlar (`app/core/config.py` + `.env.example`)

Yeni ayarlar:
- `admin_secret: str` — zorunlu, boş/varsayılan bırakılmaz (üretimde eksikse uygulama
  başlarken hata vermeli, sessizce açık kapı bırakılmamalı).
- `r2_account_id`, `r2_access_key_id`, `r2_secret_access_key`, `r2_bucket_name` — R2
  kimlik bilgileri, `.env`'den okunur, asla commit edilmez.
- `background_url_expiry_seconds: int = 3600`
- `database_url: str` — asyncpg bağlantı dizesi, yerelde `docker-compose.yml`'deki Postgres'e
  işaret eder.

Bu ayarlardan biri diğer dokümanlarda (README'ler) da geçiyorsa `CLAUDE.md` ders 9 gereği
hepsi birlikte güncellenir.

## Hata ve uç durumlar

- Admin secret yok/yanlış → `401`.
- Geçersiz dosya (magic-byte uyuşmazlığı, boyut/piksel sınırı aşımı) → `400`, mevcut
  `UploadValidationError` → `HTTPException` çevirisiyle aynı desen.
- R2 upload hatası (ağ, kimlik bilgisi) → `502`, DB'ye hiç yazılmaz.
- DB insert hatası (R2 upload başarılı olduktan sonra) → `500`; R2'de yetim bir nesne kalır,
  bu Faz 3 kapsamında kabul edilen bir sınırlama (temizlik job'ı gelecek bir faz konusu,
  MVP'yi bloklamıyor).
- Boş tablo → `GET /api/backgrounds` `[]` döner, hata değil.

## Test planı

- `pytest`, mevcut test yapısına uyumlu (`backend/tests/`):
  - Model/migration: migration'ın gerçek bir test DB'sinde başarıyla uygulandığını doğrulayan
    bir test.
  - `R2StorageService`: mock'lanmış boto3 client ile `upload` ve `generate_presigned_url`
    davranışı.
  - Endpoint testleri: admin secret yok/yanlış → 401; geçersiz dosya → 400; mutlu yol → 201 +
    DB'de satır + R2'ye yüklenmiş içerik (mock storage ile); `GET /api/backgrounds` boş/dolu
    liste, presigned URL'lerin varlığı, `is_active=false` kayıtların listede görünmediği.

## Dokümantasyon (kural 5 — PR öncesi tek tek kontrol edilecek)

- `backend/.env.example`, `backend/README.md` — yeni ortam değişkenleri.
- Kök `CLAUDE.md` — admin secret'ın geçici olduğu notu (ders 8 deseni), yeni endpoint'ler.
- `ROADMAP.md` — Faz 3 sonuç notu.
- `SECURITY.md` — gerekirse bölüm 4 (dosya yükleme) ve bölüm 8 (roadmap entegrasyonu) satırı;
  admin secret geçici çözümünün güvenlik notu.
- `frontend/README.md`, `mobile/README.md` — bu spec kapsamında değişiklik gerekmiyorsa PR
  açıklamasında açıkça "değişiklik gerekmedi" denir.

## Kapsam dışı (bilinçli olarak bu spec'e dahil değil)

- Kaan'ın Konva.js editörü (ayrı, paralel bir iş parçası).
- Presigned URL refresh mekanizması editör tarafında (ROADMAP'te not düşülmüş, frontend işi).
- Kategori/etiketleme (minimal şema kararı gereği).
- Gerçek Supabase Auth / RLS (Faz 4).
