# Vitrin AI

**Kuyumcular için yapay zekâ destekli ürün görseli platformu.**

Telefonla çekilmiş tek bir fotoğraftan satışa hazır ürün görseli üretir: yapay
zekâ arka planı ince zincirlere ve yansıtıcı taşlara kadar temiz kenarlarla
kaldırır, ardından kullanıcı kesimi hazır bir zeminin üzerine yerleştirip
ölçekler, döndürür, gölge ve ışık ekler, istediği ölçüde indirir.

Önce web uygulaması, uzun vadeli hedef mobil uygulama.

```
fotoğraf yükle  →  arka plan kalksın  →  zemine yerleştir  →  satışa hazır görseli indir
```

---

## İçindekiler

- [Ürün](#ürün) · [Durum](#durum) · [Ölçümler](#ölçümler)
- [Teknoloji](#teknoloji) · [Mimari kararlar](#mimari-kararlar)
- [Kurulum](#kurulum) · [Testler](#testler)
- [Depo yapısı](#depo-yapısı) · [Dokümantasyon](#dokümantasyon)
- [Ekip](#ekip) · [Lisans](#lisans)

## Ürün

| | |
| --- | --- |
| **Arka plan kaldırma** | BiRefNet ile yüksek kenar hassasiyeti; ince zincir, tırnak montür ve küçük taşlar korunur |
| **Kompozisyon stüdyosu** | Üç adım: boyut ve zemin, ürün (sürükle/ölçekle/döndür; parlaklık, kontrast, doygunluk; gölge, yansıma), bitir |
| **Hazır ölçüler** | A4 katalog sayfası, Instagram (kare, dikey, hikâye), pazaryeri 2000×2000 beyaz zemin |
| **Baskıya uygun çıktı** | ICC profili gömülü CMYK TIFF/JPEG |
| **Marka öğeleri** | Logo yerleşimi, ürün etiketi (ayar, gram, ürün kodu) |
| **Hesap ve geçmiş** | Supabase Auth ile giriş; çalışmalar sunucuda saklanır, cihazdan bağımsız |
| **Abonelik ve kota** | iyzico ile aylık paket; dönem başına fotoğraf hakkı, fatura geçmişi |

Hedef kitle Türkiye'deki kuyumcular; arayüz, yasal metinler ve ödeme altyapısı
buna göre seçildi.

## Durum

**Faz 0–4 tamamlandı. Faz 5 (ödemeler ve kredi sistemi) uygulandı, canlı açılış
bekliyor.**

| Faz | Kapsam | Durum |
| --- | --- | --- |
| 0 | Kurulum ve planlama | ✅ |
| 1 | AI motoru — `POST /api/remove-background` | ✅ |
| 2 | Web arayüzü MVP | ✅ |
| 3 | Zemin kütüphanesi ve kompozisyon stüdyosu | ✅ |
| 4 | Veritabanı, hesaplar, sunucuda geçmiş | ✅ |
| 5 | Ödemeler, abonelik ve kota | ✅ uygulandı — canlı açılış kapıları açık |
| 6 | Admin paneli | ⏳ |
| 7 | Test, optimizasyon, sağlamlaştırma | ⏳ |
| 8 | Mobil uygulama | ⏳ |

Faz 5'in kodu hazır ve testleri yeşil; ücretli satın alma **varsayılan olarak
kapalı**. Açılmadan önce gerçek iyzico merchant sandbox turu ile e-posta ve ters
proxy ayarları tamamlanmalı. Ayrıntı:
[ödeme kurulum ve işletim rehberi](docs/billing-runbook.md).

### Ölçümler

Hepsi bu depoda ölçülmüş gerçek değerlerdir; tahmin yoktur.

| | |
| --- | --- |
| BiRefNet CPU inference | ~15 sn/fotoğraf, ilk istekte ~30–35 sn (model yükleme) |
| BiRefNet tepe RAM | **12–14 GB** — 8 GB'lık sunucu bu modeli kaldırmaz |
| Arayüz ilk yükleme | **386 KB** (JS 176 · font 131 · görsel 56 · CSS 12 · HTML 11) |
| Editör (Konva) | **312 KB, ayrı parça** — stüdyo açılınca yükleniyor |
| Yükleme sınırı | 20 MB, 40 megapiksel |
| Eşzamanlılık | Aynı anda tek inference (`MAX_CONCURRENT_INFERENCES=1`) |
| Responsive | 320–1920 px arası yatay taşma yok; 32 px altında dokunma hedefi yok |
| Testler | backend **286** (pytest + gerçek PostgreSQL/Redis) · frontend **270** (Vitest) |
| Kompozisyon çıktısı | 2000×2000 · 1240×1754 · 1080×1080 · 1080×1920 · 1080×1350 |

RAM ve süre ölçümlerinin geçmişi `ROADMAP.md` bölüm 2'de, arayüz ölçümleri
`frontend/README.md` içinde.

## Teknoloji

| Katman | Seçim |
| --- | --- |
| Backend | Python · FastAPI · SQLAlchemy · Alembic |
| AI | BiRefNet (`ZhengPeng7/BiRefNet`, MIT ağırlıklar) · onnxruntime |
| Veritabanı | PostgreSQL (production: Supabase) |
| Nesne depolama | Cloudflare R2, imzalı URL |
| Frontend | Next.js · TypeScript · Tailwind · shadcn/ui · Konva.js |
| Kimlik doğrulama | Supabase Auth (JWKS ile doğrulanan JWT) |
| Ödemeler | iyzico (abonelik, V3 webhook) |
| Kuyruklar | PostgreSQL tabanlı kalıcı kuyruk + systemd timer |
| Test | pytest · Vitest · Playwright (Faz 7) |
| Mobil (Faz 8) | React Native · Expo |

## Mimari kararlar

Bu kararlar tartışılıp kapatıldı; gerekçeleri `ROADMAP.md` ve `CLAUDE.md`
içinde ayrıntılı.

- **AI modeli BiRefNet, yalnızca orijinal MIT ağırlıklarıyla.** BRIA'nın "RMBG"
  ağırlıkları aynı mimariyi kullanıyor ama ticari kullanıma kapalı; bu alanda
  sık düşülen bir tuzak olduğu için açıkça elendi.
- **Tüm iş mantığı FastAPI'de.** Next.js yalnızca arayüz ve vekil; mobil
  uygulama aynı API'yi kullanacak.
- **Row Level Security zorunlu.** Supabase'in `anon` anahtarı tasarım gereği
  herkese açık olduğundan, RLS'siz bir tablo internete açık tablo demektir;
  tablo ve politikası her zaman aynı migration'da gider.
- **Ödeme kanıta dayanır.** Erişim yalnızca sağlayıcıdan doğrulanmış ödemeyle
  açılır; callback tek başına kanıt sayılmaz, mali kayıtlar değişmezdir.
- **Uygulanmış migration yerinde düzenlenmez;** şema değişikliği her zaman yeni
  bir revizyon olarak eklenir.
- **Arayüz tasarım dili apple.com/tr ürün sayfalarından uyarlandı** (ölçek,
  ritim, dönüşümlü koyu/açık bölümler); vurgu rengi altın, hedef kitle kuyumcu.

## Kurulum

Gereksinimler: Docker, Python 3.11+, Node.js 20+.

```bash
git clone https://github.com/serhandenizhan/vitrin-ai.git
cd vitrin-ai
docker compose up -d          # PostgreSQL + Redis
```

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # değerleri doldurun
alembic upgrade head
uvicorn app.main:app --reload
```

**Frontend**

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev                   # http://localhost:3000
```

Tek komutla ikisi birden: repo kökünde `./execute.sh` (macOS/Linux) ya da
VS Code'da <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>.

**Ortam değişkenleri.** Giriş yapabilmek için `frontend/.env.local` içine
Supabase proje adresi ve publishable anahtarı, `backend/.env` içine Supabase
ayarları gerekir. **Arka plan kaldırma R2 ister:** başarılı sonuç idempotency
için geçici bir R2 nesnesi olarak saklanmadan kredi tüketilmez, bu yüzden
`R2_*` ayarları yerelde de gereklidir. Yalnızca arayüzü denemek için
`frontend/.env.local` içinde `USE_MOCK_BACKEND=true` yeterlidir. Tam liste:
`backend/README.md` → "Ortam değişkenleri".

## Testler

```bash
cd backend && pytest             # 286 test — yerel PostgreSQL ve Redis ister
cd frontend && npm test          # 270 test
cd frontend && npm run kontrol   # lint + test + build
```

Backend testleri gerçek bir PostgreSQL'e karşı çalışır ve **bağlandıkları
veritabanını sıfırlar**. `tests/db_safety.py` adresi ve şemayı kontrol eder;
hedef yerel bir test veritabanı değilse oturum hiçbir şeye dokunmadan durur.

## Depo yapısı

```
backend/     FastAPI uygulaması, AI inference, ödeme servisleri, migration'lar
frontend/    Next.js arayüzü, kompozisyon stüdyosu, katalog editörü
mobile/      React Native uygulaması (Faz 8)
docs/        Ödeme runbook'u, tasarım kayıtları, araştırma notları
```

## Dokümantasyon

| Dosya | İçerik |
| --- | --- |
| [`ROADMAP.md`](ROADMAP.md) | Fazlar, teknoloji kararlarının gerekçeleri, ölçüm geçmişi |
| [`CLAUDE.md`](CLAUDE.md) | Geliştirme rehberi, kalıcı kurallar, çıkarılan dersler |
| [`SECURITY.md`](SECURITY.md) | Katman katman güvenlik standartları ve launch kontrol listesi |
| [`docs/billing-runbook.md`](docs/billing-runbook.md) | Ödeme kurulumu, işletim, kurtarma ve açılış kapıları |
| [`backend/README.md`](backend/README.md) | API, ortam değişkenleri, kimlik doğrulama, kota sözleşmesi |
| [`frontend/README.md`](frontend/README.md) | Tasarım dili, bileşenler, test kapsamı |

## Ekip

| | | |
| --- | --- | --- |
| **Serhan Denizhan** | Backend, AI/ML, veritabanı, ödemeler, altyapı | [@serhandenizhan](https://github.com/serhandenizhan) |
| **Kaan Şencan** | Frontend, kompozisyon editörü, kullanıcı deneyimi | [@kaaannnsencan](https://github.com/kaaannnsencan) |

İş bölümünün gerekçesi `ROADMAP.md` bölüm 5'te.

## Lisans

Bu depo özel bir projedir. **Tüm hakları saklıdır.** Kodun kopyalanması,
dağıtılması ya da türev çalışma üretilmesi için yazılı izin gerekir.

Üçüncü taraf bileşenler kendi lisanslarına tabidir; BiRefNet ağırlıkları MIT
lisanslıdır ve ticari kullanıma açıktır.
