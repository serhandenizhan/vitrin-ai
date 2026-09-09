# vitrin-ai

Kuyumcular için AI destekli ürün fotoğrafı platformu. Kullanıcı bir ürün fotoğrafı
(yüzük, kolye vb.) yükler; AI çok yüksek kenar hassasiyetiyle arka planı kaldırır,
ardından kullanıcı kesimi özel arka plan tasarımlarından birinin üzerine yerleştirip
ölçeklendirebilir, döndürebilir ve yeniden konumlandırabilir. Önce web uygulaması
(MVP), uzun vadeli hedef mobil uygulama.

Bu, projenin ikinci iterasyonudur — kod tabanı sıfırdan yazılıyor, ancak önceki
iterasyonda alınan teknik kararlar (bkz. `CLAUDE.md` ve `ROADMAP.md`) geçerliliğini
koruyor.

## Durum

**Faz 0 — Kurulum**, **Faz 1 — backend/AI motoru** ve **Faz 2 — web frontend MVP**
tamamlandı.

- Faz 1: `POST /api/remove-background` endpoint'i çalışıyor, birim testleri yeşil,
  gerçek mücevher fotoğraflarıyla doğrulandı, Docker build başarıyla derleniyor.
- Faz 2: Next.js arayüzü — sürükle-bırak yükleme, istemci tarafı doğrulama,
  sunucu tarafı vekil, demo (mock) modu, önce/sonra karşılaştırması ve PNG
  indirme. Ayrıntı için `frontend/README.md`.

**Kilometre taşı 1 tamamlandı:** fotoğraf yükle → arka plan kalksın → indir
akışı uçtan uca çalışıyor.

Faz 3 (arka plan kütüphanesi ve kompozisyon editörü) sırada.

## Ekip

- **Serhan** — Backend, AI/ML, veritabanı, ödemeler, altyapı
- **Kaan** — Frontend, canvas editörü, kullanıcı deneyimi

## Teknoloji yığını

- Backend: Python, FastAPI, Celery/RQ + Redis
- AI modeli: BiRefNet (`ZhengPeng7/BiRefNet`, MIT lisanslı ağırlıklar)
- Veritabanı: PostgreSQL (production'da Supabase)
- Nesne depolama: Cloudflare R2
- Frontend: Next.js, TypeScript, Tailwind, shadcn/ui, Konva.js
- Kimlik doğrulama: Supabase Auth
- Ödemeler: iyzico

Tam gerekçe ve karar geçmişi için `ROADMAP.md`, güvenlik standartları için
`SECURITY.md`, geliştirme rehberi için `CLAUDE.md` dosyalarına bakın.

## Depo yapısı

```
/backend    FastAPI uygulaması, AI inference servisi (Faz 1 tamamlandı — bkz. backend/README.md)
/frontend   Next.js web uygulaması (Faz 2 tamamlandı — bkz. frontend/README.md)
/mobile     React Native uygulaması (Faz 8'de eklenecek)
```

## Yerel geliştirme

```bash
cp .env.example .env   # değerleri düzenleyin
docker compose up -d   # yerel PostgreSQL'i başlatır
```

Frontend'i başlatmak için:

```bash
cd frontend
npm install
cp .env.example .env.local   # USE_MOCK_BACKEND=true ile backend olmadan çalışır
npm run dev
```

Gerçek uçtan uca akış için backend'i ayrı bir terminalde başlatın ve
`frontend/.env.local` içinde `USE_MOCK_BACKEND=false` yapın. Ayrıntılar için
`backend/README.md` ve `frontend/README.md`.
