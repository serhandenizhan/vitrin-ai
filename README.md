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

**Faz 0 — Kurulum**, **Faz 1 — backend/AI motoru**, **Faz 2 — web frontend MVP**
ve **Faz 3 — arka plan kütüphanesi + kompozisyon editörü** tamamlandı.

- Faz 1: `POST /api/remove-background` endpoint'i çalışıyor, birim testleri yeşil,
  gerçek mücevher fotoğraflarıyla doğrulandı, Docker build başarıyla derleniyor.
- Faz 2: Next.js arayüzü — sürükle-bırak yükleme, istemci tarafı doğrulama,
  sunucu tarafı vekil, demo (mock) modu, önce/sonra karşılaştırması ve PNG
  indirme. Üzerine apple.com'dan uyarlanan tasarım dili, sol panel (çalışma
  geçmişi + ayarlar), logo ve Vitest testleri geldi. Ayrıntı için
  `frontend/README.md`.
- Faz 3 (backend): `backgrounds` tablosu (Postgres + Alembic), Cloudflare R2
  depolama (presigned URL, sunucuda üretilen UUID anahtar), `POST /api/admin/backgrounds`
  ve `GET /api/backgrounds`. Gerçek bir R2 bucket'ına karşı uçtan uca doğrulandı.
- Faz 3 (frontend): kesim hazır olduğunda önce/sonra sürgüsüyle inceleme ekranı;
  "Arka plan ekle" ile açılan tam ekran **stüdyo** — zemin seç, ürünü
  sürükle/ölçekle/döndür, parlaklık/kontrast/doygunluk ayarla, gölge ve ışık
  havuzu uygula, 2000×2000 PNG/JPEG indir. Backend zemin döndürmediğinde
  ya da hiç ayakta olmadığında yer tutucu zeminlere sessizce düşüyor; imzalı
  URL'ler ömrünün %75'inde yenileniyor.

**Kilometre taşı 1 tamamlandı:** fotoğraf yükle → arka plan kalksın → indir
akışı uçtan uca çalışıyor. **Faz 3 ile ürünün tam vaadi kapandı:** fotoğraf
yükle → arka plan kalksın → zemine yerleştir → satışa hazır görseli indir.

### Ölçümler

| | |
| --- | --- |
| BiRefNet CPU inference | ~15 sn/fotoğraf, ilk istekte ~30-35 sn (model yükleme) |
| BiRefNet tepe RAM | **12–14 GB** — 8 GB'lık sunucu bu modeli kaldırmaz |
| Arayüz ilk yükleme | **386 KB** (JS 176 · font 131 · görsel 56 · CSS 12 · HTML 11) |
| Editör (Konva) | **312 KB, ayrı parça** — ilk yüklemede inmiyor, stüdyo açılınca geliyor |
| Yükleme sınırı | 20 MB, 40 megapiksel |
| Eşzamanlılık | Aynı anda tek inference (`MAX_CONCURRENT_INFERENCES=1`) |
| Responsive | 320–1920 px arası yatay taşma yok (üç sayfada da 320 px'te doğrulandı); 32 px altında dokunma hedefi yok |
| Testler | backend 160 test (pytest) · frontend 72 test (Vitest) |
| Kompozisyon çıktısı | Kare 2000×2000 · Katalog 1240×1754 · Instagram 1080×1080 ve 1080×1920 (dördü de ölçülerek doğrulandı) |
| Baskı çıktısı | CMYK TIFF/JPEG, ICC profili gömülü |
| Katalog sayfası | A4 oranı 1240×1754 (150 dpi) |

RAM ve süre ölçümlerinin tam geçmişi için `ROADMAP.md` bölüm 2; arayüz
ölçümleri için `frontend/README.md`.

**Faz 4 (veritabanı ve kullanıcı hesapları) sürüyor.** Backend tarafı yazıldı:
Supabase JWT doğrulaması (JWKS), kullanıcı projeleri API'si (`/api/projects` —
tarayıcıdaki geçmişin sunucu karşılığı), `admin_users` ile gerçek yönetici yetkisi
(Faz 3'ün geçici `X-Admin-Secret`'ı kaldırıldı), `public`'teki her tabloda RLS ve
CORS. Gerçek Supabase projesi henüz kurulmadı; giriş/kayıt arayüzü ve geçmişin
sunucuya bağlanması Kaan'da. Ayrıntı: `backend/README.md` ve `ROADMAP.md` Faz 4.

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
/frontend   Next.js web uygulaması (Faz 2-3 tamamlandı — bkz. frontend/README.md)
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
