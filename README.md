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
  indirme. Üzerine apple.com'dan uyarlanan tasarım dili, sol panel (çalışma
  geçmişi + ayarlar), logo ve Vitest testleri geldi. Ayrıntı için
  `frontend/README.md`.

**Kilometre taşı 1 tamamlandı:** fotoğraf yükle → arka plan kalksın → indir
akışı uçtan uca çalışıyor.

### Ölçümler

| | |
| --- | --- |
| BiRefNet CPU inference | ~15 sn/fotoğraf, ilk istekte ~30-35 sn (model yükleme) |
| BiRefNet tepe RAM | **12–14 GB** — 8 GB'lık sunucu bu modeli kaldırmaz |
| Arayüz ilk yükleme | **342 KB** (JS 160 · font 131 · görsel 42 · CSS 9) |
| Yükleme sınırı | 20 MB, 40 megapiksel |
| Eşzamanlılık | Aynı anda tek inference (`MAX_CONCURRENT_INFERENCES=1`) |
| Responsive | 320–1920 px arası yatay taşma yok; 32 px altında dokunma hedefi yok |
| Testler | backend 6 dosya (pytest) · frontend 27 test (Vitest) |

RAM ve süre ölçümlerinin tam geçmişi için `ROADMAP.md` bölüm 2; arayüz
ölçümleri için `frontend/README.md`.

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

### VS Code ile tek tıkla

Projeyi VS Code'da açıp **`Ctrl+Shift+B`** — backend ve frontend birlikte kalkar,
her biri kendi terminalinde. Durdurmak için ilgili terminalde `Ctrl+C`.
Tanımlar: `.vscode/tasks.json`.

Diğer görevler `Ctrl+Shift+P` → "Tasks: Run Task" altında: yalnızca frontend
(demo modu, backend gerekmez) ve "Kontrol: lint + test + build".

### Elle

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
