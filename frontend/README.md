# frontend

Vitrin'in Next.js web uygulaması. **Faz 2 (web frontend MVP), Faz 3 (stüdyo) ve
Faz 4'ün arayüzü (hesaplar, sunucuda geçmiş) tamamlandı.**

Akış: giriş yap → fotoğraf seç → önizle → arka planı kaldır → önce/sonra
karşılaştırması → stüdyoda zemine yerleştir (logo, ürün etiketi) → PNG/JPEG indir ya da
WhatsApp'ta paylaş. Sonuç hesaptaki geçmişe kaydedilir.

## Çalıştırma

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

`http://localhost:3000` adresinde açılır.

### Ortam değişkenleri

| Değişken | Varsayılan | Ne işe yarar |
| --- | --- | --- |
| `BACKEND_URL` | `http://localhost:8000` | FastAPI servisinin adresi. Tarayıcı buraya doğrudan bağlanmaz. |
| `USE_MOCK_BACKEND` | `true` | Demo modu — backend hiç çağrılmaz, sabit bir örnek kesim döner. Giriş yine gerekir. |
| `NEXT_PUBLIC_SUPABASE_URL` | boş | Supabase proje adresi (`https://<ref>.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | boş | Supabase publishable (anon) anahtarı; tarayıcıya gitmek için tasarlandı, veriyi RLS koruyor. Boşsa site açılır ama giriş yapılamaz. `service_role`/secret anahtar buraya asla yazılmaz. |
| `NEXT_PUBLIC_DATA_CONTROLLER_NAME` | boş | KVKK veri sorumlusu ve hizmet sağlayıcının gerçek kişi/tüzel kişi unvanı. |
| `NEXT_PUBLIC_LEGAL_CONTACT_EMAIL` | boş | KVKK başvurusu, destek ve sözleşme iletişim e-postası. |
| `NEXT_PUBLIC_LEGAL_ADDRESS` / `NEXT_PUBLIC_LEGAL_PHONE` | boş | Yasal metinlerde yayımlanan merkez adresi ve telefon. |
| `NEXT_PUBLIC_LEGAL_KEP` | boş | Varsa KEP adresi. |
| `NEXT_PUBLIC_LEGAL_REGISTRY_NUMBER` | boş | Şirket için MERSİS; gerçek kişi işletmesi için ilgili sicil/vergi bilgisi. |
| `NEXT_PUBLIC_SITE_URL` | boş | Sitenin dış adresi (paylaşım önizlemesi, `robots`, site haritası; `lib/site-url.ts`). Boşsa Vercel'in adresi, o da yoksa `http://localhost:3000`. **Alan adı belli olunca production'da verilir** (ROADMAP Faz 7.5 ölçüm listesi madde 11). |
| `CMYK_ICC_PATH` | boş | Baskı (CMYK) dönüşümünün ICC profili; boşsa `/api/cmyk` 503 döner. Kullanılan profil ECI **PSO Coated v3** (eci.org → `pso-coated_v3.zip` → `PSOcoated_v3.icc`). **Depoya konmaz:** lisansı gömmeye izin veriyor ama dağıtmaya izin vermiyor, depo herkese açık. Dosyayı depo dışına indirip yolunu buraya yazın (ayrıntı: kök `CLAUDE.md` açık takip maddesi 1). |

> **`USE_MOCK_BACKEND` uyarısı:** bu değer `true` kaldığı sürece gerçek backend
> ayakta olsa bile arayüz **hep aynı örnek görseli** gösterir. Önceki iterasyonda
> tam olarak bu unutulup "neden sonuç hep aynı" karışıklığına yol açmıştı (bkz.
> kök `CLAUDE.md` ders 10). Bu yüzden yanıt `X-Mock-Response` başlığı taşıyor ve
> arayüz sonucun altında açıkça **"Demo modu"** yazıyor — sessizce sahte sonuç
> gösterilmiyor. Gerçek uçtan uca test için `false` yapıp dev sunucusunu yeniden
> başlatın (Next.js `.env.local`'i yalnızca açılışta okur).

**Telefondan denemek:** telefon bilgisayarla aynı Wi-Fi'da olmalı. `.env.local`'e
bilgisayarın yerel IP'sini yazın (`DEV_ALLOWED_ORIGINS=192.168.1.10`), dev
sunucusunu yeniden başlatın ve telefonda `http://<ip>:3000` açın. Bu satır olmadan
Next.js 16 localhost dışından gelen geliştirme isteklerini engelliyor: sayfa açılır
ama düğmeler çalışmaz. Windows ilk açılışta sorarsa Node.js'e **özel ağ** izni verin.
E-posta bağlantıları (doğrulama, sıfırlama) Supabase Redirect URLs'te yalnızca
localhost kayıtlı olduğu için telefondaki IP adresine dönmez; şifreyle giriş çalışır.

## Hata izleme (Faz 7, 26.09.2026)

`@sentry/nextjs` 11.0.0, **sihirbazsız, elle** kuruldu (kök `CLAUDE.md` ders
12: sihirbaz `next.config`'i ve birkaç dosyayı kendiliğinden değiştiriyor).
`NEXT_PUBLIC_SENTRY_DSN` boşken SDK **hiç yüklenmez**: çağrılar dinamik
`import()` ile ve DSN koşuluyla yazıldı. Üretim derlemesinde ölçüldü: SDK
parçaları yalnız webpack'in gerektiğinde-yükle haritasında, hiçbir sayfanın
HTML'inde yok; gerçek tarayıcıda `/kvkk` açıldığında 15 parçanın hiçbiri
Sentry değildi. DSN'li derlemede parçalar hata anında yüklendi.

| Dosya | Görev |
| --- | --- |
| `src/lib/error-tracking.ts` | Ortak ayarlar + temizleyiciler (tarayıcı, Next sunucusu, edge) |
| `src/instrumentation-client.ts` | Tarayıcıda başlatma |
| `src/instrumentation.ts` | Next sunucusu/edge başlatma + `onRequestError` (vekil ve render hataları) |
| `src/app/global-error.tsx` | Kök düzen dahil çöküş ekranı; hatayı bildirir. **Next 16'da prop `retry`** (eski `reset` değil — eski örneklerden yazılsa "Tekrar dene" hiçbir şey yapmazdı) |

**Gitmeyenler** (backend `app/core/monitoring.py` ile aynı kurallar):
istek gövdesi ve çerezler, kimlik bilgisi başlıkları, adreslerdeki sorgu
dizesi (şifre sıfırlama kodu, e-posta, `next` orada), **tıklama/klavye
kırıntıları** (düğmenin metni — ör. ürün adı — taşınabiliyor), kullanıcı
bilgisi, oturum kaydı (Replay eklenmedi), performans izi (`tracesSampleRate`
bilinçli olarak verilmedi) ve sunucu tarafında yerel değişkenler
(`includeLocalVariables: false` — Node SDK'sında `LocalVariablesAsync`
entegrasyonu yüklü geliyor). Kalan metinde e-posta, JWT, `Bearer` ve Supabase
oturum çerezi maskelenir. Not: sunucu SDK'sı hatanın çevresindeki KAYNAK kod
satırlarını da gönderir (kullanıcı verisi değil, bizim kodumuz).

**Doğrulama:** gerçek tarayıcıda DSN'li üretim derlemesi sahte bir Sentry
sunucusuna bağlandı; sorgu dizesinde e-posta ve kod, bir oturum çerezi ve
metinli bir düğme tıklamasıyla hata atıldı. Tek olay ulaştı:
`kayit basarisiz [e-posta]`, adres sorgusuz, çerez/kod/düğme metni/kullanıcı
hiçbir yerde yok. `error-tracking.test.ts` aynı yolu gerçek SDK ve sahte
taşıyıcıyla sınar; beş bozma denendi (temizleyicinin kaldırılması, tıklama
filtresinin kaldırılması, kırıntı temizleyicisinin ayardan düşmesi, kullanıcının
silinmemesi, istek adresinden sorgunun atılmaması), her biri kırmızı yaktı.

**Lisans notu:** `@sentry/nextjs`'in derleme eklentileri `sentry` (Sentry CLI)
paketini getiriyor; lisansı **FSL-1.1-Apache-2.0** (Sentry'ye rakip ürün
dışında her kullanım serbest, iki yıl sonra Apache-2.0). Yalnız derleme
aracı, kullanıcıya dağıtılmıyor; bizim kullanımımız serbest. Kaynak haritası
yükleme (`withSentryConfig` + auth token) şimdilik **kurulmadı** — yığın
izleri küçültülmüş kodu gösterir; karar Faz 7.5'te.

## Neden sunucu tarafı vekil

Tarayıcı FastAPI'ye **doğrudan gitmiyor**; istek önce
`src/app/api/remove-background/route.ts` route handler'ına geliyor. İki sebep var:

1. Backend CORS'u yalnızca açıkça izin verilen origin'lere doğrudan erişim
   sınırını çizer; normal tarayıcı akışı yine backend adresini dışarı açmaz.
2. Auth ve ileride kredi anahtarları devreye girdiğinde bunların tarayıcıya
   sızmaması gerekiyor — vekil o sınırı şimdiden kuruyor.

Vekil ayrıca iki iş daha yapıyor:

- **Content-type düzeltmesi.** Windows'ta tarayıcı `.heic` dosyaları için çoğu
  zaman boş ya da `application/octet-stream` bir content-type bildiriyor; backend
  ise beyan edilen türün izin verilen kümede olmasını şart koşuyor. Vekil türü
  uzantıdan çözüp dosyayı düzeltilmiş content-type ile yeniden paketliyor.
- **Hata çevirisi.** Backend'in doğrulama hataları (`{"detail": ...}`) zaten
  Türkçe olduğu için olduğu gibi aktarılıyor; altyapıya dair olanlar (413, 503)
  kullanıcının anlayacağı bir cümleye çevriliyor.

## Hata durumları

| Durum | Kullanıcı ne görüyor |
| --- | --- |
| Desteklenmeyen tür / çok büyük dosya | İstemcide anında, istek hiç gönderilmeden |
| Backend 400 | Backend'in kendi Türkçe açıklaması |
| Backend 413 | "Dosya çok büyük. En fazla 20 MB olabilir." |
| Backend 503 (kapasite dolu) | "Sistem şu anda meşgul — aynı anda yalnızca bir fotoğraf işlenebiliyor." |
| Backend'e ulaşılamıyor | "Arka plan servisine ulaşılamadı. Servis çalışmıyor olabilir." |
| Zaman aşımı (yükleme, 120 sn) | "İşlem zaman aşımına uğradı." |

503 ayrı bir mesaj hak ediyor çünkü bir hata değil, geçici bir durum. Faz 7'den
beri kesimler kuyruğa girdiği için "aynı anda tek fotoğraf" diye bir red yok;
503 yalnız kuyruk üst sınırda (`queue_busy`) ya da altyapı geçici olarak
kullanılamıyorken gelir ve `lib/cutout-job.ts` bunları kullanıcıya göstermeden
`Retry-After` kadar bekleyip yeniden dener.

## Kesim kuyruğu ve yoklama (Faz 7, 27.09.2026)

`POST /api/remove-background` artık `202 {job_id}` döner; `lib/cutout-job.ts`
işi `/api/remove-background/jobs/[id]` üzerinden 1,5 sn'de bir yoklar ve PNG
gelince bileşene verir. Karar (Serhan): yoğunluk **müşteriye hissettirilmez** —
sıra numarası yok; 30 sn'den sonra bekleme ekranında (`processing-state.tsx`)
yalnız nötr bir cümle çıkar. Kredisi iade edilmiş GEÇİCİ hatalar (`worker_lost`,
`job_expired`…) yeni anahtarla sessizce en fazla iki kez yeniden
denenir; kalıcı hata (`processing_failed`) gösterilir. Anahtar kuralı
değişmedi: yeni anahtara yalnız `retry_safe`'te geçilir. `queue_busy` ve POST
`queue_unavailable` aynı anahtarla yeniden yüklenir; yoklamadaki Redis
kesintisinde işin kredisi hâlâ ayrılmış olabilir. Bu durumda aynı anahtarla
en fazla beş kez yeniden yoklanır, ardından hata gösterilir ve anahtar korunur.
**Sessiz yeniden
deneme, backend'in `retry_safe`'i yalnız kredi GERÇEKTEN iade edildiğinde
yazmasına dayanır.** 27.09.2026'ya kadar bu garanti yoktu: kredisi tüketilmiş
bir iş, işçi yeniden denediğinde `reservation_released` olarak dönebiliyordu
ve buradaki yeniden deneme müşteriye ikinci bir kredi harcatıyordu (Codex
incelemesi; düzeltme backend'de, `backend/README.md` → "Kesim kuyruğu"). **Kullanıcı ekrandan
ayrılsa da yoklama sürer:** kredi harcanıyor ve sonuç geçmişe yazılmalı (ekran
güncellemesi oturum sayacıyla atlanır). Testler sahte zamanlayıcıyla
(`cutout-job.test.ts`, 17 test; beş bozma denendi).

## Yükleme kısıtları backend ile senkron tutulur

`src/lib/upload-constraints.ts` içindeki `MAX_FILE_SIZE_MB` (20) ve
`ALLOWED_CONTENT_TYPES`, `backend/app/core/config.py` ile **elle** senkron
tutulur. Biri değişirse diğeri de güncellenmeli — kök `CLAUDE.md` bunu açık bir
kural olarak listeliyor. İstemci tarafı doğrulama yalnızca kullanıcı deneyimi
içindir; asıl güvenlik sınırı backend'dir (magic-byte doğrulaması, piksel
sınırı, gövde boyutu middleware'i).

## HEIC

iPhone'un varsayılan formatı, hedef kitle telefonla çekiyor. Backend HEIC'i
sorunsuz işliyor ama Chrome, Firefox ve Edge HEIC'i `<img>` ile gösteremiyor
(Safari 17+ gösterebiliyor). Önizleme `src/lib/heic-preview.ts` ile üretiliyor:

1. HEIC değilse doğrudan `URL.createObjectURL`.
2. HEIC ise önce tarayıcının kendi çözücüsü deneniyor (`img.decode()`); Safari'de
   ek bir şey indirilmiyor.
3. Olmazsa [`heic-to`](https://www.npmjs.com/package/heic-to) (libheif'in
   WebAssembly derlemesi) **yalnızca bu anda** dinamik `import()` ile yükleniyor.
   ~3 MB'lık ayrı bir parça; HEIC seçmeyen ziyaretçi onu hiç indirmiyor.
4. O da başarısız olursa bilgi kartı ("Önizleme gösterilemedi") çıkıyor; arka
   plan kaldırma yine çalışıyor.

Önizleme yalnızca gösterim için: backend'e her zaman kullanıcının özgün dosyası
gidiyor. Karşılaştırma ekranının "önce" tarafı da artık HEIC'te çalışıyor.

**Lisans:** `heic-to` **LGPL-3.0** (içindeki libheif'ten geliyor). Değiştirilmeden
ve ayrı bir parça olarak dinamik yüklendiği için LGPL'in "kütüphane olarak
kullanma" koşulu sağlanıyor. Yayına çıkmadan önce lisans metninin ve kaynak
bağlantısının bir "Açık kaynak lisansları" sayfasında gösterilmesi gerekiyor
(Faz 7'deki yasal metinlerle birlikte).

## Şeffaflık neden dama deseninde gösteriliyor

Kesim şeffaf olduğu için düz bir zeminde, özellikle açık renkli ürünlerde, arka
planın gerçekten kalkıp kalkmadığı ayırt edilemiyor. Dama deseni
(`globals.css` → `checkerboard`) bu soruyu ortadan kaldırıyor: desen
görünüyorsa orası gerçekten şeffaf.

## Tasarım dili

Sayfa, kullanıcının referans olarak verdiği **apple.com/tr** ürün sayfalarından
uyarlandı. Kopyalanan şey metin, görsel ya da font **değil** — ölçülebilir
tasarım dili:

| Öğe | Apple'da ölçülen | Bizdeki karşılığı |
| --- | --- | --- |
| Tipografi | SF Pro, ağırlık 600; hero 64/68 px (`-0.576px`), bölüm 48/52 px, alt başlık 28/32 px, gövde 17/21 px (`-0.374px`) | Aynı ölçek ve negatif harf aralığı, **Inter** ile (`display-hero`, `display-section`, `display-feature`, `lede`, `fine-print`) |
| Renk | `#000` / `#1d1d1f` koyu, `#f5f5f7` / `#fff` açık bölümler; mavi `#2997ff` vurgu | Aynı yüzeyler (`surface-black`, `surface-charcoal`, `surface-mist`, `surface-white`); vurgu mavi yerine **altın** — hedef kitle kuyumcu |
| Ritim | Tam genişlik bölümler, 112 px dikey boşluk, koyu/açık dönüşümlü | `section-rhythm` (dar ekranda 56 px'e iner) |
| Hareket | 0.2–0.35 sn `ease-out`; kaydırınca opaklık + kayma | `reveal` + `IntersectionObserver`, `press` |

**SF Pro kullanılmadı** — Apple'a ait ve lisanslı. Inter aynı sınıfta bir
neo-grotesk ve aynı ölçekte doğru duruyor.

Punto değerleri `clamp` ile akışkan. Apple sabit kırılma noktaları kullanıyor
(64px → 32px); bu dar ekranda başlığı gövdeye göre orantısız bırakıyor. Alt ve
üst sınırlar Apple'ın mobil/masaüstü değerleriyle aynı.

**Yüzey renkleri bilinçli olarak sabit**, token değil: bir bölüm "koyu" diye
işaretlendiğinde açık temada da koyu kalmalı — sayfa boyunca süren dönüşümlü
ritim bunun üzerine kurulu.

### Responsive davranış

320 px ile 1920 px arasında on üç genişlikte ölçüldü: **hiçbirinde yatay taşma
yok** ve görünümün dışına taşan öğe yok.

| Genişlik | Davranış |
| --- | --- |
| < 1024 px | Üst çubuktaki bağlantılar "Menü" düğmesinin açtığı panele geçer; açılış bölümü tek sütun (metin üstte, görsel altta). |
| < 640 px | Tek sütun. "Giriş yap" yazısı gizlenir, ikonu kalır. |
| ≥ 640 px | Öne çıkanlar ve teknik bilgiler iki sütuna, üç adım üç sütuna geçer; menü bağlantıları görünür. |
| ≥ 1024 px | Teknik bilgiler üç sütun. |
| ≥ 1280 px | Tipografi üst sınıra oturur (hero 64 px); daha geniş ekranlarda içerik 1024 px'te ortalanır, büyümeye devam etmez. |

Başlık ve gövde `clamp` ile akışkan: hero 40 px (mobil) → 64 px (masaüstü),
gövde 16 px → 17 px. Sabit kırılma noktası yok, ara genişliklerde de oran
korunuyor.

**Dokunma hedefleri ölçülerek düzeltildi.** İlk halinde üst çubuktaki
"Hemen deneyin" 26 px, hero'daki ikincil bağlantı 23 px, logo 23 px
yüksekliğindeydi — telefonda isabet ettirmesi zor. Şimdi üst çubuktaki her
tıklanabilir öğe çubuğun tam yüksekliğini kaplıyor, birincil eylemler ve
indirme düğmesi en az 44 px. Ölçüldü: 320–1440 px arasında 32 px'in altında
tıklanabilir öğe kalmadı. Görsel olarak hiçbir şey büyümedi, yalnızca tıklama
alanı genişledi.

### Sayfa kurgusu

Apple'da ürün bir fotoğraf; bizde **çalışan aracın kendisi**. Bu yüzden araç
tanıtım bölümlerinin sonuna değil, açılıştan hemen sonraya konuldu — ziyaretçi
önce deneyip sonra okuyabilsin.

```
Hero (siyah)            → vaat solda, ürün görseli sağda; tam bir ekran
Deneyin (açık gri)      → aracın kendisi
Zeminler (siyah)        → aynı kesim üç zeminde
Öne çıkanlar (kömür)    → dört madde, taranmak için
Nasıl çalışır (açık)    → üç adım + çekim önerileri
Teknik bilgiler (siyah) → formatlar, sınırlar, süre, gizlilik
Footer (kömür)          → marka, bağlantılar, yasal, sosyal medya, dipnotlar, telif
```

**Açılış tam bir ekran (11.09.2026).** Önceki sürümde her şey üst üste
ortalanmıştı; toplam ~1400 px ediyor ve 900 px'lik dizüstünde görsellerin
yarısı ilk ekranın dışında kalıyordu. Şimdi geniş ekranda iki sütun ve görselin
genişliği ekran **yüksekliğinden** türetiliyor (`hero-visual.tsx`), 1440×900'de
iki kare de bütün olarak görünüyor.

**Footer.** Sosyal medya adresleri henüz yok (`site-footer.tsx` → `SOSYAL`
dizisinde `href: null`, simgeler tıklanamaz görünüyor). KVKK Aydınlatma,
Gizlilik, Kullanım Koşulları ve Çekim Rehberi gerçek sayfalara bağlıdır.

Durum taşıyan tek parça `background-remover.tsx`; diğer bölümlerin hepsi sunucu
bileşeni, yani istemciye hiç inmiyor.

## Stüdyo düzeni (güncel: 19.09.2026)

**Masaüstü aşamalı akış** (`composition-editor.tsx` → `desktopLayout`):

| Aşama | Solda | Ortada | Sağda / altta |
|---|---|---|---|
| 1 Sahne | — | tuval | geniş zemin kütüphanesi + biçimler (`stage-backgrounds.tsx` → `BackgroundLibrary`), ✓ |
| 2 Düzenle | dik zemin barı (`BackgroundRail`) | tuval | panel: Yerleşim · Görünüm · Marka; ‹ Sahne / ✓ Tamamla |
| 3 Tamamla | — | tuval (temiz görünüm, tutamaçsız) | altında çıktı barı (PNG, JPEG, CMYK, WhatsApp, taslak, Birden fazla boyut), ‹ Düzenle |

**21.09.2026 eklemeleri (öne alınan iş, ayrıntı `ROADMAP.md` Faz 6):**

- **Otomatik kayıt** — editör ayarları değişiklikten 1,5 sn sonra ve stüdyo/sekme
  kapanırken (`keepalive`) `onSave` ile gider; açılışta yazmaz.
- **Zemin önizleme** — `BackgroundLibrary`/`BackgroundRail` kartlarında `onPreview`
  (yalnız fare). Sahne `previewBackground ?? selectedBackground` çizer; kayıt,
  indirme ve Tamamla her zaman seçili zemini kullanır.
- **"Önerilen" rafı** — `use-suggested-backgrounds.ts` + `lib/background-suggestions.ts`:
  kesimin opak piksellerinin ve zemin önizlemelerinin ortalama rengi; renkler
  `localStorage`'ta (`vitrin-ai:background-colors`). R2 CORS yoksa raf oluşmaz.
- **Birden fazla boyut** — `multi-format-export.tsx`: ekran dışı ikinci `EditorStage`,
  `onRenderReady` gelince `toDataURL`, 10 sn'de gelmezse hata (zeminsiz dosya
  inmez). Yerleşim `mapTransformToStage`; Pazaryeri düz beyaz.
- **Akıllı kılavuz** — ürün ve logo sahne ortasına yapışır, pembe çizgi yalnız
  sürüklerken (`editor-stage.tsx` → `snapCenter`).
- **Ürün etiketi** kutusuz tek satır; "Yazı rengi" segmenti. **Teşekkür kartı**
  her indirmeden sonra.

- Açılış perdesi `stage-curtain.tsx` (CSS: `globals.css` → "Stüdyo açılış perdesi"):
  YALNIZCA stüdyo açılırken; kapalı başlar, ~1,5 sn'de kalkar. Yedek zaman aşımı
  var (gizli sekmede animasyon ilerlemese de perde kalkar). "Hareketi azalt"ta
  yok. ✓/geri geçişlerindeki perde 19.09.2026'da kaldırıldı ("her adımda
  yorucu"). Aşama geçişi 20.09.2026'da seçildi (`stage-transition.ts`):
  View Transitions + panel kayması birlikte, 1,1 sn; süre ve eğri tek kaynaktan
  (`--stage-transition-ms` / `--stage-transition-ease`) bütün gruplara. Her aşama panelinin ayrı
  `key`'i duruyor: yoksa React Sahne ve Düzenle `<aside>`'ını aynı düğüm olarak
  kullanıyor ve panele verilecek giriş animasyonu oynamıyor (kök `CLAUDE.md` ders 29).
- Masaüstünde tuval sütununun ve `.stage-fit`'in genişlik geçişi YOK: her kare
  Konva'yı yeniden çizdiriyordu. Tuval aşama değişince tek seferde boyutlanır.
- Aşama 3 çıktı barı genişliğini içerikten alır (`w-fit`): üst satırdaki çıktı
  düğmeleri belirler, alt satır (‹ Düzenle · CMYK ne demek?) onlara hizalı,
  açılan CMYK açıklaması barı genişletmez. Tuval sütunundan geniş olabilir,
  ortalanıp iki yana taşar; dar ekranda düğmeler kaydırmasız sarar.
- Zemin seçicilerde seçim halkası (2px + 2px ofset) kutunun dışına taşar;
  kaydırma alanlarında bunun için iç pay var. Seçilen zemin artık yalnızca
  GÖRÜNMÜYORSA kaydırılıyor — tıklanan zemin imlecin altından kaçmıyor.
- Tuval sütunu her aşamada aynı konumda; `--panel-w` ve `--studio-reserved-lg`
  aşamaya göre inline veriliyor.
- Üst bar adımları masaüstünde yalnız geri (`navigateRef`); "Dışa Aktar" gizli.
- Aşağıdaki panel/zemin barı açıklamaları Aşama 2'nin paneli ve telefon için geçerli.

**Masaüstü (`lg` ve üstü):** ortada tuval, hemen yanında sağda tek bir panel
kartı, tuvalin altında ince zemin barı. Üst bar, panel ve zemin barı aynı cam
(`liquid-glass`), arka plan `.studio-backdrop`.

- **Panel:** üstte eşit sekmeli segment kontrolü (Boyut · Yerleşim · Görünüm ·
  Marka · İndir) + kapat; altında yalnız seçili aracın gruplu listesi
  (`PANEL_GROUP` / `PANEL_ROW`, `dock.tsx`). Bileşenler (`DockAction`, `Toggle`,
  `Slider`, `CornerRow`, `DockStrip`) `useDockVariant()` ile panelde satır
  biçimine geçiyor. Görünüm'de üç kaydıraç birlikte açık.
- **Tuval:** sütun genişliği biçimin en/boy oranından (`.stage-column`,
  `--stage-ratio`); dikey pay `--studio-reserved-lg` (tek kaynak). Panel
  kapanınca `--panel-w` küçülür, tuval büyür. Altında biçim künyesi.
- **Zemin barı:** seçili zeminin görseli + adı + **favori kalbi**, kategori
  segmentleri, yuvarlak örnekler; oklar iki yandaki kenar payında.
- **Favoriler (öne alınan iş, geçici):** yalnızca bu tarayıcıda
  (`lib/favorite-backgrounds.ts`). Favoriler rafından seçim kullanıcıyı
  kendi kategorisine atlatmıyor.
- **Üst bar:** geri, `01 Sahne · 02 Düzenle · 03 Tamamla` adımları
  (`studio-steps.ts`), kısayollar, ana menü, altın **Dışa Aktar** (İndir'i açar).
- **Test:** jsdom'da `matchMedia` yok → `useIsDesktop()` hep telefon döner;
  masaüstü testleri `matchMedia`'yı taklit ediyor.

**Telefon:** aşağıdaki "ince bar + menü kartı" düzeni geçerli (zemin artık
bardaki bir araç değil, tuvalin altındaki bar).

### Telefon: ince bar + menü kartı (18.09.2026)

Stüdyo **beyaz bir çalışma alanı**, koyu camlı yüzen navbar ve fotoğrafın
altında **ince bir Liquid Glass bar** ile onun üstünde açılan **menü kartı**
kullanır. Örnek iPhone Fotoğraflar'ın düzenleme ekranı (Kaan, 18.09.2026).
Aynı gün dört kez yinelendi; her turun sebebi bir sonrakinin kuralı oldu:

1. Sağda yüzen denetçi + altta dock → her değişiklikte göz ve fare iki yere gidiyordu.
2. Tuvalin altında tek panel, içerik boyunda → bar her araçta birkaç piksel kayıyor,
   geri dönmek için düğme her seferinde yeniden aranıyordu.
3. Aynı panel sabit 12,5rem → bar kalınlaştı, görsel bütünlük bozuldu.
4. Geri tuşu kartı kapatıyordu → "geri" araçlar arasında gezinmek içindir;
   kartı kapatmak ayrı bir "küçült" düğmesinin işi.

**Şimdiki yapı** (`dock.tsx`, `tool-bar.tsx`):

- **Bar (3,25rem) HİÇ KIPIRDAMAZ.** Solda ‹ geri, ince ayraç, altı araç, sağda ⌄ küçült; araçlar
  simge + küçük adla; adımlar (Sahne · Düzenle · Tamamla — Kaan, 17.09) ince
  ayraçlarla gruplu, "Devam" yok. Seçili aracın altında bir cam **mercek
  kayarak** yer değiştirir.
- **Menü kartı** barın üstündeki SABİT yükseklikli (10,5rem) alanın altına
  hizalı açılır: kart büyüse de küçülse de bar yerinde kalır. Uzun içerik
  kartın içinde kayar. Açılışta Zemin menüsü açık.
- **Geri tuşu araçlar arasında gezer:** bir önceki araca döner (gezinme
  geçmişi; geçmiş boşsa sırada bir önceki araç — Zemin → Boyut). Görünüm'de
  kaydıraç açıksa önce Görünüm menüsüne. Kartı kapatmaz; gidilecek yer yoksa pasif.
- **Küçült tuşu** kartı ve barı tek bir küçük hapa ("⌃ Zemin") indirir; tuval
  o yeri alarak BÜYÜR. Bar ile tuval aynı eğriyle (520 ms) birlikte hareket
  eder: kart alanı yüksekliği sıfıra iner (`.dock-card-area`), tuvalin
  `--studio-reserved` payı küçülür (`.stage-fit-collapsed`; masaüstünde
  25rem → 11,5rem; ince kartta 23,5rem) ve hesaplanan `max-width` geçişle kayar. Hapa ya da bir
  araca basınca geri açılır.
- **Geçişler:** kart açılırken barın üzerinden "camdan büyür" (ölçek + bulanıktan
  netleşme, `glass-morph-in`); menü içinde katman değişince yalnızca içerik
  bulanıktan netleşir (`glass-content-in`). Eğri iOS'un yay hissine yakın
  (`cubic-bezier(0.32, 0.72, 0, 1)`), "hareketi azalt"ta kapalı.

**Liquid Glass tonlaması** (`.liquid-glass`, `.liquid-glass-pill`): ton,
üstteki navbar'ın camıyla (`glass-panel`) **aynı kömür grisi** (Kaan, 18.09.2026).
Sırasıyla denenip bırakılanlar: koyu ilk sürüm ("Apple'dakine benzemiyor"),
açık beyaz (beyaz çalışma alanında kayboldu), açık gri ("sadece gri değil" —
hâlâ beyaz okundu). Liquid Glass hissi tondan değil katmanlardan geliyor:
bulanıklık + doygunluk, üstte parlak iç çizgi ve ışık lekesi, `::before` ile
köşelerde parlayan gradyan kenar, seçili aracın altında kayan cam mercek.
**Premium tur:** üstte ince ışık bandı, alttan sıcak altın bir iç parıltı,
keskin üst specular + çok ince iç kontur, sol üstte beyazdan sağ altta markanın
altınına dönen kenar, iki katmanlı derin gölge; cam damlaları (mercek, geri/
küçült) parlak üst yarım küreli.

| Grup | Araç | Menü kartındaki içerik |
| --- | --- | --- |
| Sahne | Boyut · **Zemin** | biçim kartları / kategori sekmeleri + adlarıyla yatay zemin şeridi |
| Düzenle | Yerleşim · Görünüm | hızlı eylemler + boyut kaydıracı / hazır ayarlar, gölge, yansıma; ayar seçilince tek kaydıraç |
| Tamamla | Marka · İndir | logo, etiket, saydamlık, ayar, gram, kod / çıktı türleri, CMYK, WhatsApp, kaydet |

### Zemin seçici

- **İnce kart (Zemin, Boyut):** kategori sekmeleri kartın BAŞLIK satırında
  (ayrı satır kartı büyütüyordu); kart alanı 10,5 → 9rem, tuval aynı miktarda
  büyür (`.stage-fit-compact`, masaüstünde `--studio-reserved` 25 → 23,5rem),
  ikisi aynı eğriyle birlikte hareket eder. Adlar TEK satır: iki satırlık ad
  kartın alt kenarında kesiliyor ve gizli kaydırma çubuğu yüzünden hiç
  görünmüyordu. Uzun ad `title` ile tamamen okunur.
- **Yumuşak geçişler:** seçim halkası, büyüme, gölge ve ad rengi aynı uzun
  eğriyle (500 ms); seçilen zemin şeridin ortasına yumuşak kayar (ilk açılışta
  anında). Kategori değişince seçim camı sekmeler arasında süzülür
  (`glass-lens.tsx` — araç çubuğuyla ortak) ve şerit bulanıktan netleşir.
  Palet kategoriye göre `key` ile yeniden kurulur: anahtar şeridin kendisine
  verilseydi tekerlek/ok dinleyicileri eski öğede kalırdı.
- **Kategori sekmeleri + adlarıyla YATAY şerit** (18.09.2026). Arada dikey
  ızgara denendi ve bırakıldı: kart büyüdü, adlar kayboldu, sağda ikinci bir
  kaydırma çubuğu çıktı (Kaan: "aşağı yukarı değil sağa sola"). Yatay şeridin
  asıl kusuru fare tekerleğiydi: artık **tekerlek şeridi sağa/sola kaydırıyor**
  (`use-horizontal-wheel.ts` — dikey hareketi yataya çevirir, şerit ucunda
  olayı sayfaya bırakır, dokunmatik yüzeyin yatay hareketine dokunmaz). Aynı
  davranış paneldeki bütün şeritlerde ve araç çubuğunda.
- **Kaydırma çubukları gizli** (`.dock-strip`, `.dock-scroll`); devamın olduğunu
  sağ kenardaki solma (`palette-fade`) söylüyor.
- Seçili zemin **altın halka VE adıyla** belli (ad her örneğin altında, seçilide
  altın ve kalın); yalnızca renge güvenilmiyor.
- Seçili zemin yalnızca şeridin kendi kaydırmasıyla ortaya gelir; sayfanın
  konumu değişmez.
- **Sağ/sol oklar** (`scroll-arrows.tsx`): şeridin iki kenarında cam oklar;
  bir ok yalnızca o yönde gidilecek yer varsa görünür, her basış görünen
  genişliğin ~%80'i kadar kaydırır (son kart bir sonraki sayfada da görünsün).
  Aynı oklar paneldeki diğer yatay şeritlerde de var.
- **Zeminler arası çapraz geçiş** (`editor-stage.tsx`): yeni zemin eskisinin
  üstünde 0,42 sn'de saydamlıktan belirir; eski zemin geçiş boyunca geçici bir
  Konva düğümü olarak altta durur, bitince silinir. "Hareketi azalt"ta geçiş
  yok. **Çıktı güvenliği:** geçiş ortasında indirme yapılırsa dosyaya iki
  zeminin karışımı girerdi — `renderStage` dışa aktarmadan önce
  `finishBackgroundFade` (`background-fade.ts`) ile geçişi anında bitiriyor.
  Yüklenemeyen zemin (ders 23) `useLoadedImage`'den `null` döndüğü için geçiş
  hiç başlamaz. Test ortamındaki sahte sahnenin `find`'ı artık gerçek Konva
  gibi seçiciye göre dönüyor (önceden her seçiciye tutamak dönüyordu).
- 93 katalog zemininin renk/desen adı `src/lib/background-names.ts` içinde
  kimliğe bağlıdır; sunucu sırası değişse de isim değişmez.

### Hazır görünüm ayarları

`appearance-presets.ts`: Doğal · Parlak · Sıcak · Net · Yumuşak. Değerler
kaydıraçların kendi sınırları içinde. Kaydıraç elle oynatılınca seçili ön ayar
işareti **kalkıyor** — arayüzün "Parlak" derken değerlerin başka bir şey olması,
ekranın söylediğiyle dosyanın içindekinin ayrışması demekti. Gölge ve yansımaya
ön ayar dokunmuyor: ikisi de kullanıcının kendi açtığı/kapattığı şeyler.

### Tuval, dock ve telefon düzeni (17.09.2026 güncellemesi)

Stüdyo çalışma alanı ve kesim sonuç kartı beyazdır. Navbar koyu, bulanık camlı,
kenarlardan boşluklu bir kapsüldür. Başlık, yan düğmelerin genişliğinden bağımsız ortalanır.
Tuval ekranın ortasındadır; sağda artık ayrı bir kart yok. Panel ayrı satırda ve ekran merkezindedir;
fotoğrafın hiçbir bölümünü örtmez ve sürükleme sırasında kaybolmaz.
Yerleşim ve görünüm paletinin düğmeleri kendi satırlarında ortalanır.

Telefonda tuval ve panel normal akışta yer alır; araç çubuğu dar ekranda yatay kayar. Tuval yapışkan
değildir; uzun araçlar sayfa kaydırılarak kullanılır. `--studio-reserved` telefonlarda
`max(15rem, 48dvh)`, masaüstünde `25rem` (bar + menü kartı alanı için 21rem'den büyütüldü) olarak fotoğrafa ayrılan yüksekliği sınırlar.
Ölçüm hook'u dar kapsayıcılarda 240 px altına da inebilir; sahne kapsayıcıdan taşmaz.

## Üst çubuk

**11.09.2026'dan beri yüzen bir kapsül** (kullanıcı: "soluk ve eski moda
duruyor"). Kenarlardan 12 px içeride, 48 px yüksekliğinde, tam yuvarlak ve
gölgeli; en fazla 1152 px genişliyor. Sayfanın üstüne biniyor (`-mb-15`), bu
yüzden açılıştaki koyu bölüm çubuğun arkasından başlıyor. Sayfaların ilk bölümü
çubuğun kapladığı 60 px'i `page-top` sınıfıyla geri alıyor. Bulunulan sayfa
(Katalog, Paketler) dolu bir hap olarak görünüyor. Paneller çubukla aynı
genişlikte, altında açılan yüzen kartlar.

Sıra: panel düğmesi, marka, bağlantılar, en sağda "Giriş yap", "Hemen deneyin"
ve (< 1024 px) "Menü". Aşağıdaki ölçüm notları önceki şerit sürümünden.

İlk sürümde gövde `max-w-5xl` ile ortalanıyordu ve 1877 px'lik bir ekranda
logo sayfanın ortasına yakın duruyor, solda kocaman bir boşluk kalıyordu;
bağlantılar da 12 px'ti ve çevresindeki 64 px'lik başlıkların yanında
okunmuyordu. İkisi de ekran görüntüsü üzerinden ölçülerek düzeltildi.

Dar ekranda sırayla: bağlantılar (< 1024 px), "Giriş yap" yazısı (< 640 px,
ikon kalır), marka yazısı (< 380 px, işaret kalır) gizleniyor. 320 px'te
çubuk içeriği 305 px — taşma yok.

Panel düğmesi **aç/kapat**: açıkken tekrar basılınca kapanıyor ve
`aria-expanded` ile durumu bildiriyor. İlk sürümde yalnızca açıyordu.

Çekmece **yumuşak kayıyor**: `cubic-bezier(0.32, 0.72, 0, 1)`, açılış 460 ms,
kapanış 360 ms. Açılma kapanmadan uzun — açılırken paneli tanımak için zaman
gerekiyor, kapanırken kullanıcı zaten oradan ayrılmış oluyor. Karartma da
opaklıkla geliyor; koşullu mount/unmount ile kapanırken hiçbir geçiş
çalışmıyor, öğe bir anda yok oluyordu.

Menü bağlantıları **yumuşak kaydırıyor** (`scroll-behavior: smooth`).
`scroll-padding-top: 3.5rem` yapışkan çubuğun yüksekliği kadar — olmadan
hedef bölümün başlığı çubuğun altında kalıyor. "Hareketi azalt" ayarı ve
işletim sistemi tercihi bunu kapatıyor; uzun sayfalarda yumuşak kaydırma bazı
kullanıcılarda baş dönmesi yapıyor.

## Logo

`brand-mark.tsx`: yuvarlatılmış bir kare çerçeve (vitrin camı) ve içinde
briyan kesim bir taş. İkisi birlikte hem sektörü hem ürünü anlatıyor —
"bir şeyi çerçeveleyip öne çıkarmak". Tek renk SVG, `currentColor` ile
geliyor; 20 px'te de 200 px'te de aynı netlikte.

## Testler

```bash
npm test          # tek sefer
npm run test:watch
```

Vitest. Kapsam saf mantık ve sunucu koduna ek olarak kritik React bileşen
senaryolarını da içerir: R2 imzalı URL yenilemesi, kullanıcının zemin seçiminin
liste yenilendikten sonra korunması ve dışa aktarma başarısız olduğunda sahnenin
geri yüklenip hatanın kullanıcıya gösterilmesi.

**516 test** (03.10.2026: kuyruk kartında geç gelen eski yanıtın yeni sonucu ezmemesi +1 test; 02.10.2026: yönetim paneli kuyruk kartı +12 bileşen ve +3 vekil testi, kesim yoklamasında 429 için +2 test, 498'den; 01.10.2026, `main`'de `npm test` ve CI ile sayıldı. Belgedeki önceki 480, Kaan'ın dalında PR #39/#40/#41 henüz birleşmeden sayılmıştı; `main`'de dönüm noktaları: #44 sonrası 478 → #39 482 (`studio-attach.test.ts`) → #40 489 (`faq-item.test.ts`, `upload-dropzone.test.ts`) → #42 491 (`studio-host.test.ts`) → #41 498 (`legal-texts.test.ts`). 30.09.2026: stüdyo kodunun yalnız açılınca yüklendiğini sınayan `studio-host.test.ts` ile 478'den; kalan krediye bonus kredilerin sayı olarak eklendiğini sınayan test — backend `bonus_credits`'i `{ available, expires_at }` döndürüyor, eski test sahte yanıtta sayı verdiği için ekrandaki "6[object Object]" görünmüyordu, `components/billing-panel.test.ts`; 29.09.2026'da 460 sayılmıştı; Redis yoklaması kesintisinde ikinci POST açılmasını engelleyen üç test eklendi; 28.09.2026: Kaan'ın PR #30 incelemesiyle kesim işinin anahtarını ekrandan ayıran `bindJobKey` testleri eklendi — `lib/cutout-job.test.ts`; 27.09.2026: /cso incelemesiyle CMYK oturum/hız sınırı, `lib/change-password.test.ts` ve OWASP ZAP bulgusuyla `lib/forms-post-method.test.ts` eklendi; aynı gün kesim kuyruğu yoklama yardımcısı `lib/cutout-job.test.ts` ve `jobs/[id]` vekili eklendi; aynı gün hata izleme temizleyicileri ve gerçek SDK'dan geçen uçtan uca test eklendi —`src/lib/error-tracking.test.ts`; 21.09.2026: editör ayarlarının otomatik kaydı ve kapanışta hemen gönderilmesi, `mapTransformToStage`, "Önerilen" zemin sıralaması ve benzer renklerin geriye itilmesi, teşekkür kartı, indirmenin gizli tutamaçları geri getirmemesi; bülten; katalog renkleri, 6 şablon; stüdyo adımları, biçim yönü, yansıma; zemin kategorileri ve baskı uyarısı; indirme sonrası soru, serbest logo, kataloğa aktarma, 17.09.2026; PR #18 incelemesiyle: zemin yüklenemediğinde önceki zeminin gösterilmemesi ve "hazırlanıyor" ile "yüklenemedi" ayrımı; stüdyo odak döngüsü, Escape katman önceliği ve canlı Deneme kotası; PR #22 incelemesiyle: tamamlanmış çalışmanın taslak kaydıyla "Yarım kalan"a düşmemesi, Çalışmalarım'da ürün adını değiştirme ve vekilin yalnız adı iletmesi; 19.09.2026: stüdyonun aşamalı akışı, geçiş perdesi, zemin favorileri, gölge boyutu/yoğunluğu, yansıma mesafesi ve admin listesi/mutasyon yarışı; aynı gün ikinci tur: perdenin yalnız açılışta çıkması, zeminlerin düzden karmaşığa sırası, Çalışmalarım'da silme onayı, admin zemin süzgeçleri, Günlük sekmesi ve vekili, Admin anahtarı, varsayılan zeminin listenin ilki olması, aşama paneli değişince yeni düğüm kurulması, `useStageSize`'ın kapsayıcı değişince gözlemciyi taşıması; 20.09.2026: stüdyoda ilk döndürmede ürün boyutunun %100 kalması — sahte sahne artık kesim ölçüsünü de bildiriyor, yoksa yerleşim araçları testte hiç etkin olmuyordu).

**Paylaşılan hook'lar (PR #18 incelemesi, 17.09.2026):** logo akışı (yükleme,
renk çevirme, ayar, kaldırma) stüdyo ve katalogda ayrı ayrı yazılıydı; ikisi de
artık `lib/use-logo.ts` kullanıyor (`useLogo` durum, `useLogoBox` kataloğun
oransal kutusu). Stüdyodan ayrıca sahne ölçüsü
(`components/composer/use-stage-size.ts`), zemin seçimi/kategori sekmeleri
(`use-background-selection.ts`) ve görsel yükleme (`use-loaded-image.ts`) ayrı
modüllere çıkarıldı — `composition-editor.tsx` 1667 → 1536,
`catalog-editor.tsx` 1015 → 935 satır. JSX'e ve tasarım diline dokunulmadı.

Faz 2-3 dosyaları:

| dosya | kapsam |
| --- | --- |
| `lib/upload-constraints.test.ts` | Yükleme kısıtları — backend ile elle senkron tutulan sabitler |
| `app/api/remove-background/route.test.ts` | Arka plan kaldırma vekili — backend yanıtlarının kullanıcıya çevrildiği yer |
| `app/api/backgrounds/route.test.ts` | Zemin vekili — hiç 5xx dönmemesi, bozuk kayıt eleme, `expires_in` yokluğu |
| `lib/backgrounds.test.ts` | Yenileme zamanlaması ve yer tutucuya düşme |
| `lib/composition.test.ts` | Sığdırma geometrisi, açı normalizasyonu, merkeze yakalama, dışa aktarma oranı |
| `app/api/cmyk/route.test.ts` | CMYK yükleme boyutu/piksel sınırları, profil yapılandırması, oturum/hız sınırı (gövde okunmadan), CSRF, biçim kontrolü |
| `components/composer/use-backgrounds.test.ts` | Sekme yeniden görünür olduğunda R2 imzalı URL yenilemesi |
| `components/composer/composition-editor.test.ts` | Yenilenmiş listede seçili zeminin `id` ile korunması; `toDataURL` hata attığında ya da Konva boş veri URL'i döndürdüğünde (tainted tuval) sahne boyutu/ölçeği ve Transformer'ların geri yüklenmesi, hatanın gösterilmesi, CMYK isteğinin hiç atılmaması; Pazaryeri → beyaz zemin, WhatsApp paylaşımı (telefon ve masaüstü yolu), SVG logo reddi, geçersiz gram uyarısı |

Faz 4'te eklenenler:

| dosya | kapsam |
| --- | --- |
| `app/api/remove-background/route.test.ts` (ek) | Oturum yoksa backend'e gitmeden `401 auth_required`, demo modunda da; token'ın `Authorization` ile iletilmesi; backend 401'inin yine `auth_required`e çevrilmesi |
| `app/api/projects/route.test.ts`, `app/api/projects/[id]/route.test.ts` | Geçmiş vekilleri: oturum zorunluluğu, yanıtın arayüz kaydına çevrilmesi, yalnızca bilinen alanların iletilmesi, UUID olmayan kimliğin backend'e hiç gönderilmemesi |
| `app/api/account/route.test.ts` | Hesap silme vekili |
| `lib/project-record.test.ts` | Backend kaydı → arayüz kaydı, kimlik doğrulaması |
| `lib/safe-redirect.test.ts` | Açık yönlendirme: `//`, `/\`, mutlak adres, kontrol karakteri reddi |
| `lib/auth-errors.test.ts` | Supabase hatalarının Türkçe mesajları; yanlış parola ile kayıtsız e-postanın ayırt edilmemesi |
| `lib/password-policy.test.ts` | Parola kuralı (8+, küçük, büyük, rakam, sembol; Türkçe büyük harfin Supabase gibi sayılmaması) |
| `lib/profile.test.ts`, `lib/turkey-cities.test.ts` | Ad/şirket adı/telefon doğrulaması, metadata okuma, ekranda görünen ad (şirket/bireysel), 81 il |
| `components/auth-dialog.test.ts` | Kayıt formu: şirket alanlarının yalnızca şirket seçilince görünmesi, bireysel hesapta şirket bilgisinin Supabase'e yazılmaması, zorunlu alanlar |
| `lib/overlays.test.ts` | Logo/etiket yerleşimi, gram biçimi, ürün kodu temizliği, aynı köşede üst üste binmeme |
| `components/marketing/hero-before-after.test.ts` | Açılıştaki önce/sonra kaydıracı |
| `lib/logo-storage.test.ts`, `lib/work-history.test.ts` | Logo görünümü kalıcılığı; cursor ve bekleyen mutasyonların kullanıcıya bağlanması |
| `lib/legal-config.test.ts` | Yasal sürüm tek kaynağı ve production'da eksik veri sorumlusu bilgisinin build'i durdurması |

Faz 5 incelemesinde eklenenler:

| dosya | kapsam |
| --- | --- |
| `components/background-remover.test.ts` | Idempotency anahtarı: belirsiz ağ hatasında korunuyor, kesin sunucu hatasında yenileniyor, `request_in_progress`'te korunuyor, başka fotoğrafta yenileniyor |
| `app/api/backgrounds/session-fallback.test.ts` | Token reddedilirse temel zeminlerin oturumsuz istenmesi; ikisi de başarısızsa yer tutucu |
| `lib/backend-proxy.test.ts` | Devam eden satın almanın adresinin arayüze geçirilmesi, yabancı adresin geçirilmemesi (açık yönlendirme), paylaşılan Origin kontrolü |
| `app/api/account/route.test.ts` (ek) | Hesap silmede Origin kontrolü — yabancı origin backend'e hiç gitmiyor |
| `components/checkout-page.test.ts` (ek) | Bekleyen ödemenin iptali ve sağlayıcı doğrulanamazken oturumun AÇIK kalması (fail-closed) |
| `components/billing-plans.test.ts` (ek) | `checkout_pending` hatasında devam eden ödemeye bağlantı gösterilmesi |

Özellikle korunanlar:

- **HEIC yolu.** Windows'ta tarayıcı `.heic` için boş content-type bildiriyor
  ve backend beyan edilen türü şart koşuyor; bu düzeltme sessizce bozulursa
  iPhone'dan gelen her fotoğraf reddedilir.
- **503'ün ayrı mesajı.** 503 bir hata değil geçici bir durum; genel hata
  metnine düşerse kullanıcı ne yapacağını bilemez.
- **Zaman aşımı ile bağlantı hatasının ayrılması.** Birinde beklemek,
  diğerinde birini uyarmak gerekiyor.
- **Demo modunda backend'in hiç çağrılmaması** ve `X-Mock-Response` başlığı —
  bu başlık olmadan arayüz sahte sonucu gerçek sanar.
- **Sınır üstü dosyanın backend'e hiç gönderilmemesi.**

React Testing Library ile R2 yenileme/seçim davranışını koruyan iki bileşen
testi öne alındı. Daha geniş bileşen kapsamı Faz 7'de planlandığı gibi devam ediyor.

**Faz 7 kapanış turu (30.09.2026, Kaan).** (1) **E2E'nin kalanı:** `e2e/cikti.spec.ts` — CMYK TIFF (sunucuya `tiff` istenir, `-cmyk.tif` iner), CMYK hatası (mesaj görünür, dosya inmez), WhatsApp (paylaşım menüsü varsa JPEG dosyası paylaşılır; yoksa JPEG iner + WhatsApp Web açılır + yönlendirme mesajı), birden fazla boyut (her boyut ayrı dosya, adlar çakışmaz), logo (yükle → tuval değişir → kaldır) ve etiket (kod/gram tuvale yazılır, geçersiz gram `aria-invalid`). Marka 2. aşamada (\"Yerleşim · Görünüm · Marka\" sekmeleri), etiket alanları \"Ürün etiketi\" anahtarı açılınca görünür. (2) **CI'a eklendi** (`.github/workflows/ci.yml` → \"Frontend E2E (Playwright)\"): **zorunlu kontrol DEĞİL** (\"protect main\" kural setine eklenmedi, karar Serhan'ın); hermetik: sahte Supabase adresi derlemeye gömülür, `BACKEND_URL` ulaşılamaz, `.env.local` yok — bu koşulla üretim derlemesinde yerelde 84 test geçti. (01.10.2026: `npx playwright test --list` **100 test** listeler; CI'da `main` için **84 geçti, 16 atlandı** — atlananlar bilerek: `sayfalar.spec.ts` taşma testi yalnız telefon projesinde, `cikti.spec.ts` ve `studyo.spec.ts` aşamalı stüdyo testleri yalnız masaüstü projesinde koşar. Yani 84 hâlâ doğru sayı; PR #39 dalında listelenen 90'dı, `agirlik.spec.ts` ve `kapi.spec.ts` (PR #40) 10 tane daha ekledi.) Yedek zeminler (Kadife siyah, Sis beyazı, Düz beyaz, Altın hale, Sıcak gri) backend kapalıyken stüdyoda görünen zeminlerdir; testler bunlara dayanır. (3) **Sayfa ağırlığı** (üretim derlemesi, ana sayfa, gerçek aktarım boyutu CDP ile): ilk yüklemede 1,18 MB — JS 633 KB, görsel 294 KB (23 görsel, hepsi WebP), font 131 KB, CSS 25 KB; kaydırınca yalnız +23 KB. Ekran altındaki görsellerin hepsi `loading=\"lazy\"` (Chrome hızlı bağlantıda yaklaşan görselleri önceden çeker). `three.js` (~244 KB sıkıştırılmış) ilk yüklemede boşta iner — bilinçli (Serhan: tıklayınca bekleme olmasın; yavaş/2G-3G ve veri tasarrufunda atlanır, `hero-showcase.tsx`). Koruma: `e2e/agirlik.spec.ts` (görsellerin toplamı < 450 KB, tek görsel < 160 KB, ekranın çok altındaki büyük görseller tembel). JS/font bütçesi testte YOK (geliştirme sunucusu açılmamış JS sunar). (4) **Bileşen testleri:** `faq-item`, `upload-dropzone` ve `lib/studio-attach` (ders 38'in düzeltmesi saf fonksiyona çıkarıldı); üçü de koruma bozulunca kırmızı yanıyor (doğrulandı). (5) `UploadDropzone` dosya girdisinin tıklaması kapsayıcıya yayılmaz (seçici iki kez açılmaya çalışmasın).

**Playwright E2E (30.09.2026):** `npm run e2e` (ilk kez: `npx playwright install chromium`). Testler `e2e/` altında; iki proje çalışır — masaüstü ve 375 px telefon. **Gerçek Supabase hesabı gerekmez.** Girişsiz akışlar olduğu gibi, oturumlu akışlar sahte oturum çerezi (`e2e/oturum.ts`; tarayıcı oturumu çerezden okuyor) ve taklit `/api/*` yanıtlarıyla sınanır. Bu, arayüzün oturumlu davranışını sınar; Supabase entegrasyonunu ve JWT/IDOR'u değil (backend testleri kapsıyor). Kapsam: herkese açık sayfalar ve 404, `robots`/site haritası, telefonda yatay taşma yok, hesap ekranlarının giriş istemi, vekil uçların oturumsuz 401'i, giriş penceresi (açma/kapama/kip geçişi; form gönderilmez, production Supabase'e istek atılmaz), desteklenmeyen/20 MB üstü dosyanın reddi; oturumlu: hesap menüsü ve çıkış, çalışmalar listesi (liste alınamazsa "çalışma yok" DEĞİL), yükleme → kesim → stüdyo (masaüstünde üç aşama) ve kesim hatası. Sunucu açıksa (`execute.sh`) onu kullanır, değilse `npm run dev` başlatır; farklı adres için `E2E_BASE_URL`. CI'da ayrı bir iş olarak koşar (zorunlu değil; bkz. "Faz 7 kapanış turu"). Stüdyonun aşama içi araçları yalnız masaüstünde sınanır (`e2e/studyo.spec.ts`): biçim ve zemin seçimi, 90° döndürme, aşamalar arası gezinme, PNG/JPEG indirmenin gerçek dosya imzası (Konva kirlenmiş tuvalde hata vermeden boş döndüğü için boyut ve imza bakılır) ve otomatik taslak kaydı. **Bulunan ve düzeltilen hata (30.09.2026):** sonuç sunucuya kaydedilip çalışma kimliği gelmeden "Arka plan ekle"ye basılırsa stüdyo kimliksiz açılıyor, otomatik kayıt ve "tamamlandı" işareti bütün oturum boyunca çalışmıyordu; ayrıca kayıt açılmadan yapılan düzenleme "zaten kayıtlı" sayılıp hiç yazılmıyordu. Artık kimlik gelince açık stüdyoya bağlanıyor (`attachStudioWork`) ve temel açılıştaki taslaktır. Test (`çalışma kimliği gelmeden…`) POST'u 4 sn bekleterek bunu sınar; iki düzeltmenin her biri geri alınınca kırmızı yandı. Diğer stüdyo testleri kayıt yanıtını bekler. CMYK, WhatsApp, çoklu boyut, logo ve etiket `e2e/cikti.spec.ts`'te sınanır.

**Bir tuzak:** testte dosya boyutunu `Object.defineProperty` ile sahtelemek
işe yaramıyor — dosya `FormData` + `Request` üzerinden geçerken yeniden
oluşturuluyor ve sahte `size` kayboluyor. Boyut gerçekten üretilmeli.

**Faz 7'de kalan ön yüz işleri (Kaan, 01.10.2026 kapanış denetimi; ayrıntı ve
kabul ölçütleri kök `CLAUDE.md` açık takip 12).** (1) **E2E'de testsiz akışlar:**
ödeme (`/paketler` → `/odeme/{id}` yoklaması), oturumlu admin paneli, kuyrukta
bekleme mesajı, katalog editörü, hesap silme, vitrin 3D (WebGL yok / hareketi
azalt dalları); gerçek Supabase + backend ile uçtan uca test staging
gerektirdiği için Faz 7.5'te. (2) **Ön yüz güvenlik başlıkları** (`next.config.ts`
`headers()`: CSP, `frame-ancestors`, `nosniff`, `Permissions-Policy`,
`Referrer-Policy`, COOP/CORP, `poweredByHeader: false`) — **CSP önerisi
(Claude'dan, yöntemi Kaan seçer):** önce `Report-Only` açılır, ÜRETİM
derlemesinde (`next start`) sayfalar ve stüdyo akışı gezilip konsol ihlalleri
toplanır, kaynak listesi bunlardan çıkarılır, sonra zorlayıcı kipe geçilir;
başlıkların geldiğini doğrulayan test eklenir ve E2E'nin yeşil kaldığı görülür. (3) **Zemin değişiminde kalan
takılma:** zemini ekranda tuval boyutuna küçültmek; dışa aktarma çıktısı
önce/sonra piksel olarak karşılaştırılır (bkz. "Stüdyo düzeni" ve ROADMAP Faz 7).

## Sol panel: çalışmalarım ve ayarlar

Üst çubuktaki panel düğmesi soldan kayan bir çekmece açıyor.

- **Gövde: çalışmalarım** — geçmiş sonuçlar; küçük önizleme, dosya adı, ne
  kadar önce yapıldığı. Tıklayınca sonuç ekranda geri açılır, çöp kutusuyla
  tek tek silinir.
- **Alt şerit: ayarlar, hesabım, çıkış** — ayarlar geçmiş kaydını aç/kapat,
  hareketi azalt ve tümünü sil içeriyor. Giriş yapılmışsa "Hesabım" (`/hesap`) ve
  "Çıkış yap", yapılmamışsa "Giriş yap" görünüyor; gövdede de liste yerine giriş
  çağrısı çıkıyor.

Ayarlar önceden üstte bir sekmeydi; alta alınması paneli tek işli yapıyor
(gövde = çalışmalar) ve ayarı uygulamalarda beklenen yere koyuyor.

## Hesaplar (Faz 4)

Supabase Auth, `@supabase/ssr` ile. Oturum **çerezde** (localStorage değil):
sunucu bileşenleri, route handler'lar ve `src/proxy.ts` aynı oturumu okuyabiliyor.

| Parça | Dosya | İş |
| --- | --- | --- |
| İstemciler | `src/lib/supabase/{client,server,env}.ts` | Tarayıcı ve sunucu istemcisi; env yoksa `null` (site çalışır, giriş yapılamaz) |
| Oturum yenileme | `src/proxy.ts` | Next.js 16'da `middleware.ts`nin adı. Süresi dolan token'ı her istekte yeniliyor. **Yetkilendirme değil** |
| E-posta dönüşü | `src/app/auth/callback/route.ts` | PKCE `code` ya da `token_hash`; `next` yalnızca site içi yol (`lib/safe-redirect.ts`). Geçersizse `/auth/hata` |
| Giriş / kayıt / sıfırlama | `src/components/auth-dialog.tsx` | Tek pencere, üç ekran; `openSignIn("signup")` doğrudan kayıtta açar |
| Yeni parola | `src/app/auth/yeni-parola/`, `components/new-password-form.tsx` | Sıfırlama bağlantısının açtığı sayfa; başarıda diğer cihazlardaki oturumlar kapanır. Form yalnızca bağlantıdan gelinmişse açılır: `/auth/callback` başarılı sıfırlamada 10 dakikalık `httpOnly` bir çerez yazar (`lib/password-recovery.ts`). Aksi hâlde oturumu açık bir bilgisayarda adresi yazan biri mevcut parolayı bilmeden parolayı değiştirebilirdi; giriş yapmış kullanıcı Hesabım'a yönlendirilir |
| Hesap sayfası | `src/app/hesap/`, `components/account-panel.tsx` | Profil, parola değiştirme (mevcut parola istenir), tüm cihazlardan çıkış, hesap silme |
| Hoş geldin | `components/welcome-toast.tsx` | Girişte ya da e-posta bağlantısından dönüşte bir kez |
| Vekil yardımcısı | `src/lib/backend-proxy.ts`, `lib/supabase/access-token.ts` | Token'ı `Authorization` ile iletme, 401 → `auth_required`, backend'e ulaşılamazsa 502 |

**Kayıt iki adım:** (1) ad, soyad, e-posta, parola, parola tekrar; (2) **hesap türü
(bireysel / şirket)** — şirkette şirket adı + işletme türü —, şehir (81 il), isteğe
bağlı telefon, zorunlu kullanım koşulları + KVKK onayı, ayrı ve isteğe bağlı ticari
e-posta izni. Değerler Supabase `user_metadata`'da (`lib/profile.ts`); yalnızca
görünüm için, yetki kararında kullanılmıyor. Yasal bildirim/kabul sürümü ayrıca
backend'in istemciye kapalı, sunucu zamanlı `user_consents` tablosuna yazılır.
Ekranda görünen ad: şirket hesabında
şirket adı, bireyselde kişinin adı (hesap türü seçilmemiş eski hesapta kişinin adı —
yerine karar verilmiyor).

**Parola kuralı** Supabase ayarıyla birebir: en az 8, küçük + büyük harf + rakam + sembol
(`lib/password-policy.ts`, ASCII — Supabase "Ş"yi büyük harf saymıyor). Yazarken canlı
liste (`components/password-checklist.tsx`).

**14.09.2026 düzeltmesi:** istemci kontrolü sembol kuralını unutmuştu — Dashboard'daki
gerçek ayar "lowercase, uppercase letters, digits **and symbols**" iken kod yalnızca
ilk üçünü kontrol ediyordu. Sonuç: checklist tamamen yeşil görünüyor ama Supabase
sunucu tarafında `weak_password` ile reddediyordu (kullanıcı bildirdi). Bkz. kök
`CLAUDE.md` ders 19.

**Kullanıcı numaralandırması kapalı:** yanlış parola ile kayıtsız e-posta aynı
mesajı veriyor (`lib/auth-errors.ts`); kayıtlı adresle kayıtta ve sıfırlamada da
"e-postanızı kontrol edin" ekranı çıkıyor.

**Arka plan kaldırma giriş istiyor** (ürün kararı). Fotoğraf seçip önizlemek serbest;
"Arka planı kaldır"a basınca oturum yoksa giriş penceresi açılıyor, seçilen dosya
yerinde kalıyor. Vekil oturumu 20 MB'lık gövdeyi okumadan önce kontrol ediyor.

**Supabase paneli:** access token süresi canlı projede `900` saniye ve
`admin_users` tablosunda ilk yönetici kaydı doğrulandı (14.09.2026). Redirect
URLs'e `http://localhost:3000/auth/callback`
(sıfırlama bağlantısı `?next=` eklediği için yerelde `http://localhost:3000/**`),
parola kuralı ve e-posta bağlantı süresi ayarlanmalı.

**E-posta teslimi — gerçek kullanıcılara HİÇ ulaşmıyor (17.09.2026'da
doğrulandı).** Resend'in gönderen adresi hâlâ `onboarding@resend.dev`; bu
alan adı yalnızca Resend hesap sahibinin kendi e-postasına teslimat yapıyor.
Yerelde başka bir kullanıcıyla kayıt/parola sıfırlama denenirse Supabase
Auth Logs'ta `/auth/v1/signup` veya `/auth/v1/recover` **500**, Resend
Logs'ta karşılık gelen istek **403** görünür — 14.09.2026'daki "doğrulama"
hesap sahibinin kendi adresiyle yapılmıştı, sandbox kısıtına hiç çarpmamıştı.
Kök sebep, kaynaklar ve geçici kilit açma yolu (Supabase yönetici API'siyle
parolayı e-postasız doğrudan ayarlamak) kök `CLAUDE.md` açık takip maddesi
5'te.

### Geçmiş sunucuda

`src/lib/work-history.ts`'in fonksiyonları aynı, gövdesi `/api/projects`
vekillerine gidiyor (Faz 2'deki IndexedDB geçici çözümü kapandı).

- **Eski tarayıcı kayıtları taşınmıyor** (ürün kararı); eski IndexedDB deposu
  siliniyor ki cihazda kimsenin göremediği fotoğraf sonuçları kalmasın.
- **Yalnızca sonuç saklanıyor**, özgün fotoğraf değil.
- Kayıtlı sonuç görseli R2'nin imzalı adresi yerine **aynı kökenden**
  (`/api/projects/[id]/result`) veriliyor: stüdyo ve katalog görseli tuvale çiziyor,
  başka kökenden gelen görsel tuvali kirletip dışa aktarmayı bozardı.
- Liste **kullanıcıya bağlı** tutuluyor (`workspace-provider.tsx`): çıkışta ya da
  başka hesaba geçişte önceki kullanıcının listesi bir an bile görünmüyor.
- Backend ve Next.js cursor'ı uçtan uca taşır; ilk 100 kayıttan sonra panel
  "Daha eski çalışmaları yükle" ile bir sonraki sayfayı ister.
- Uzun inference sırasında A hesabından çıkılıp B hesabına girilirse bekleyen
  kayıt/silme mutasyonu, başlatan kullanıcı kimliği JWT'deki güncel kullanıcıyla
  uyuşmadığı için `409` alır; A'nın görseli B'ye kaydedilemez.
- Küçük resimler R2'nin süreli adresi; panel açıldığında süresi dolmuş kayıt varsa
  liste yenileniyor.
- Silme sunucuda başarısız olursa kayıt listeden çıkarılmıyor.
- Geçmişe kayıt başarısız olursa (ör. R2 o an yanıt vermedi) sessizce atlanıyor;
  ekrandaki kesim ve indirme akışı etkilenmiyor. **R2'nin hiç yapılandırılmamış
  olması artık bu duruma düşmez:** Faz 5'ten beri arka plan kaldırmanın kendisi
  R2 istiyor (idempotency sonuç deposu) ve kesim o durumda hiç başlamaz.

### Durum nerede tutuluyor

`workspace-provider.tsx` bir context sağlıyor: panel açık/kapalı, geçmiş
listesi, ayarlar. Sağlayıcı çocuklarını **prop olarak** aldığı için tanıtım
bölümleri sunucu bileşeni olarak kalmaya devam ediyor.

İki nokta React Compiler kurallarının (`react-hooks/set-state-in-effect`)
yönlendirmesiyle şöyle kuruldu:

- **Ayarlar `useSyncExternalStore` ile okunuyor** (`src/lib/settings-store.ts`),
  `useState` + efekt ile değil. Ayarlar localStorage'da, yani React dışı bir
  kaynakta; efekt gövdesinde setState çağırmak hem zincirleme render hem
  hidrasyon uyuşmazlığı riskiydi.
- **"Çalışma açıldı" bir olay, kalıcı bir durum değil.** Context'te state
  olarak tutulup efektte okunsaydı yine efekt gövdesinde setState olurdu;
  bunun yerine abonelik deseni var — efekt yalnızca abone oluyor, setState
  olayın geri çağrısında çalışıyor.

### Çekmecenin konumu neden animasyonsuz

Açık/kapalı konum hiçbir harekete bağlı **değil** — iki düz CSS kuralı ve
bileşik seçici (`.drawer.drawer-open`). Önce `transition`, sonra `@keyframes`
ile denendi; ikisinde de tarayıcıda ölçülen sonuç aynıydı: sınıf doğru
değişiyor ama hesaplanan `transform` eski değerde takılı kalıyor ve panel
"açık" işaretlendiği hâlde ekran dışında kalıyordu. Hareket ilerlemek için
kare üretilmesini gerektiriyor; kare üretilmediği anda (arka plan sekmesi, çok
yavaş cihaz) kullanıcı paneli hiç açamıyor. Ayrıntılı gerekçe
`globals.css` içinde yazılı.

## Klasör yapısı

```
src/app/page.tsx                            sayfa kurgusu (sunucu bileşeni)
src/app/api/remove-background/route.ts      sunucu tarafı vekil + demo modu
src/app/globals.css                         tasarım dili (tipografi, yüzeyler, hareket)
src/components/background-remover.tsx       aracın durum makinesi (tek istemci parçası)
src/components/upload-dropzone.tsx          sürükle-bırak yükleme
src/components/processing-state.tsx         bekleme ekranı (geçen süre sayacı)
src/components/comparison-view.tsx          önce/sonra + PNG indirme
src/components/reveal.tsx                   kaydırınca ortaya çıkma sarmalayıcısı
src/components/brand-mark.tsx               logo (SVG)
src/components/auth-dialog.tsx              giriş / kayıt (iki adım) / parola sıfırlama
src/components/account-panel.tsx            /hesap sayfasının kartları
src/components/welcome-toast.tsx            "Hoş geldiniz" bildirimi
src/components/workspace-provider.tsx       panel/geçmiş/ayarlar/oturum context'i
src/components/work-sidebar.tsx             sol çekmece (çalışmalarım + ayarlar)
src/components/site-header.tsx              yüzen üst çubuk + telefon menüsü
src/components/nav-panel.tsx                üst çubuktan açılan panel kabuğu
src/components/site-footer.tsx              bağlantılar, sosyal medya, dipnotlar, telif
src/components/marketing/hero.tsx           açılış bölümü
src/components/marketing/highlights.tsx     öne çıkanlar
src/components/marketing/how-it-works.tsx   üç adım + çekim önerileri
src/components/marketing/specs.tsx          teknik bilgiler
src/components/marketing/hero-visual.tsx    açılış görselinin çerçevesi (sunucu bileşeni)
src/components/marketing/hero-before-after.tsx  sürüklenebilir önce/sonra (istemci)
src/proxy.ts                                her istekte Supabase oturumunu yeniler
src/app/auth/                               callback, geçersiz bağlantı, yeni parola
src/app/hesap/                              hesap sayfası
src/app/api/projects/, api/account/         geçmiş ve hesap silme vekilleri
src/lib/supabase/                           Supabase istemcileri, access token
src/lib/backend-proxy.ts                    oturumlu vekillerin ortak kısmı
src/lib/profile.ts, password-policy.ts      kayıt alanları ve parola kuralı
src/lib/overlays.ts                         stüdyoda logo ve ürün etiketi geometrisi
src/lib/upload-constraints.ts               backend ile senkron yükleme kısıtları
src/lib/heic-preview.ts                     HEIC önizlemesi (yerel çözücü, yoksa heic-to)
src/lib/work-history.ts                     geçmiş deposu (sunucuda, /api/projects)
src/lib/settings-store.ts                   ayarlar (useSyncExternalStore kaynağı)
public/mock/sample-cutout.png               örnek kesim ("sonra")
public/mock/sample-photo.png                aynı ürün kadife zeminde ("önce")
scripts/generate-mock-cutout.py             ikisini de üreten betik (ek bağımlılık yok)
```

## Açılıştaki önce/sonra (13.09.2026)

Açılışta, aracın **gerçek çıktısıyla** sürüklenebilir bir karşılaştırma var
(`marketing/hero-before-after.tsx`). Önceden burada iki sabit fotoğraf
("Atölyede / Vitrinde") duruyordu; sağdaki aracın çıktısı değil ayrı bir çekimdi, bu
yüzden "Önce / Sonra" denmemişti. Artık "sonra" gerçekten aracın sonucu.

- `public/showcase/once.webp` ve `sonra.webp` (900×900) **birebir hizalı**:
  `backend/.venv/Scripts/python frontend/scripts/prepare-before-after.py` modeli
  doğrudan çağırıyor (HTTP değil — `/api/remove-background` artık oturum istiyor).
  BiRefNet'in ham çıktısı kaynakla aynı piksel ölçüsünde olduğu için ikisi aynı
  pencereden kırpılıyor; ölçekleme ya da kaydırma yok. Hizalama ölçüldü: ürün
  piksellerinde ortalama renk farkı ~2, kesim 12 px kaydırılınca ~25.
- Mevcut `showcase/kesim.webp` bu iş için **kullanılamadı**: kesimi kırpıp karenin
  ortasına büyütüyor, fotoğrafla aynı kadrajda değil. Kaydıraç iki görseli üst üste
  koyduğu için kolye iki tarafta farklı yerde durur ve karşılaştırma yanıltıcı olurdu.
- `public/photos/atolye.webp` ve `vitrin.webp` hâlâ üretiliyor (kaynak
  `vitrin.webp`); gerçek ürün fotoğrafları, telifi bize ait. Kullanıcının sağladığı
  tek kare (2816×1536, 3,6 MB) ikiye bölünüp küçültülüyor:
  `node scripts/prepare-photos.mjs`.

**Kaynak dosya `public/` dışında** (`photo-source/`). İlk denemede
`public/photos/_kaynak/` altındaydı ve bu, 3,6 MB'lik ham JPEG'in olduğu gibi
**yayınlanması** demekti — Next.js `public/` altındaki her şeyi sunuyor ve
dağıtıma dahil ediyor. Kimse adresi bilmese de dosya sunucuda duruyor.

Hedef genişlik 900 px: paneller masaüstünde her biri ~384 CSS px kaplıyor,
2× retina için 768 yetiyor. İlk denemede 1400 px seçilmişti ve atölye karesi
532 KB'a çıkmıştı (ahşap damarı ve talaş dokusu sıkışmıyor) — ekranda hiç
kullanılmayan çözünürlük için ödenen bayt.

## Sayfa ağırlığı

Üretim derlemesinde ölçüldü (`next start`, ilk yükleme):

| | |
| --- | --- |
| **Toplam aktarılan** | **386 KB** |
| JavaScript | 176 KB |
| Font (Inter, latin + latin-ext) | 131 KB |
| Görseller | 56 KB |
| CSS | 12 KB |
| Belge | 11 KB |

Görseller `next/image` ile 384 px sürümlerine iniyor: 900 px'lik kaynaklar
ekranda 31 KB + 12 KB olarak servis ediliyor.

**Konva (312 KB) bu tablonun içinde değil ve olmamalı.** Editör
`next/dynamic` + `ssr: false` ile ayrı bir parçada; ana sayfayı açan ziyaretçi
onu indirmiyor, yalnızca stüdyoyu açan indiriyor. Ölçülerek doğrulandı: ilk
yüklemenin kaynak listesinde Konva yok. Faz 3'te sayfa ağırlığının 342'den
386 KB'a çıkması bu kütüphaneden değil, yeni bölümlerin görselleri ve
CSS'inden geliyor.

`tw-animate-css` kaldırıldı — sağladığı sınıfların (`animate-in`, `fade-in`,
`slide-in-*`, `zoom-in`) hiçbiri kullanılmıyordu; sırf iskelet üreticisi
eklediği için duruyordu. Hareket bu projede kendi sınıflarımızla kuruluyor
(`.reveal`, `.drawer`, `.press`).

Tanıtım bölümlerinin tamamı sunucu bileşeni; istemciye inen tek durum taşıyan
parça `background-remover.tsx` ve panel/sağlayıcı.

## Örnek görseller nasıl üretiliyor

`scripts/generate-mock-cutout.py` iki dosya çıkarıyor: şeffaf kesim ("sonra")
ve aynı ürünün kadife zemin üzerindeki hâli ("önce"). Ek bağımlılık yok, PNG
yazıcı betiğin içinde.

Görselin kalitesi neden bu kadar önemsendi: ilk sürüm düz diffuse+specular
kullanıyordu ve sonuç plastik oyuncak gibi duruyordu. **Metali metal yapan şey
ışık değil yansıma.** Şu anki sürüm bir stüdyo ortamı (softbox + karanlık
çevre + zemin sıçraması) tanımlayıp yansıma vektörüyle örnekliyor, Fresnel
ekliyor ve 2× süperörnekleme ile kenarları yumuşatıyor.

Yol boyunca üç hata yapıldı ve üçü de betikte yazılı:

1. **Pozlama yoktu** → altının düşük mavi kanalı ton eşlemesinden sonra
   eziliyor, sarı altın zeytin yeşiline kaçıyordu.
2. **Ortam neredeyse düzdü** → her yönde benzer değer; metalin okunması için
   gereken parlak/koyu kontrastı yoktu, sonuç bej plastikti.
3. **Ton eşleme kanal başına yapılıyordu** → yüksek değerlerde tüm kanallar
   1'e sıkışıyor, kanallar arası oran bozuluyor ve renk doygunluğunu
   kaybediyordu. Şimdi **parlaklık** üzerinden ton eşleniyor, renk oranı
   korunuyor.

**Bunlar gerçek ürün fotoğrafı değildir.** Yer tutucudur; gerçek bir fotoğraf
her zaman daha iyi olur. Gerçek bir ürün fotoğrafı eklenirse bu betik
tamamen kaldırılabilir.

## Demo modunun örnek kesimi

`public/mock/sample-cutout.png` gerçek bir BiRefNet çıktısı **değildir**; şeffaf
arka planlı, kenarı yumuşak geçişli bir yer tutucudur.
`scripts/generate-mock-cutout.py` ile üretilir — ikili bir dosyayı kaynağı
olmadan commit etmek "bu nereden geldi, nasıl değiştirilir" sorusunu cevapsız
bırakırdı.

## Bilinen kısıt

Bir kesim CPU'da ~12–15 saniye sürer (bkz. kök `CLAUDE.md` "Bilinen kısıt");
Faz 7'den beri işçi modeli iş almadan önce yüklediği için "ilk istek" gecikmesi
yok, ama yoğunlukta sırada beklenebilir. Bekleme ekranı geçen süreyi sayıyor ve
30 saniyeden sonra nötr bir "biraz daha uzun sürebilir" cümlesi gösteriyor — donmuş
gibi görünen bir ekranda kullanıcı sekmeyi kapatıyor.

## Açılış vitrini (28–30.09.2026)

**\"Ürün nasıl kesilir\" kaydırma hikâyesi — İPTAL EDİLDİ (30.09.2026, Kaan: \"animasyonu fazla beğenmedim\").** Referans videodan (sabit sahne + kaydırmaya bağlı geçiş) esinlenilen dört sahneli bir hikâye yapılıp denendi, sonra kaldırıldı (`cutout-story.tsx` ve `e2e/hikaye.spec.ts` silindi; git geçmişinde yok, hiç commit'lenmedi). Öğrenilenler, benzer bir iş tekrar istenirse: `sticky` atalarında `overflow` olmamalı; yarı saydam iki zemin katmanının çapraz geçişi ortada siyah boşluk bırakır, katmanlar üst üste binmeli; görseller yeniden boyutlandırılmadan (`<img>`, Next optimizasyonu olmadan) verilirse çözünürlük korunur.

**Kolye zincirinin uçları (30.09.2026, Kaan: ekran görüntüsüyle bildirdi).** Takısız yapay zekâ eliyle (`build-hero-hands.py`) kesim (`sahne2-kesim.webp`) birleşince zincir iki ucunda havada/derinin üstünde kesik bitiyordu (sol: başparmağın yanında boşluktan başlıyor; sağ: deriye oturup düzensiz kesiliyor). `scripts/fix-necklace-chain.py`: **sol** şerit halka deseni (ölçülen periyot 42 px, 2 halka = 84 px) tekrarlanarak yukarı uzatılır ve el parlaksa (başparmak) zincir silinir — zincir başparmağın ARKASINDAN çıkıyor gibi görünür; **sağ** şerit uzatılmaz (uzantı başparmağın yanındaki boşluğa, yanlış yöne gidiyordu, ekran görüntüsüyle görüldü), ucu 70 px boyunca deri kıvrımına doğru eritilir. Özgün kesim `photo-source/hero-el/sahne2-kesim.original.webp`'ye yedeklenir; betik her zaman yedekten okur (idempotent). `prepare-hero-scenes.py` kesimi yeniden üretirse yedek silinip betik yeniden çalıştırılır; ardından `npm run hero:versions`. Başka sahnelerde aynı türden kesik uç varsa aynı yöntem kullanılabilir.

**\"Tek fotoğraf, 93 zemin\" galerisi (30.09.2026, Kaan).** Sade, Desen ve Lüks sekmelerindeki zeminler daha güçlü olanlarla değiştirildi (Doğal aynı kaldı). Eskiler: düz siyah/kahve/bej, daire lekesi, gri gürültü, soluk mavi. Yeniler (hepsi kütüphanedeki zeminlerin KENDİSİ, ziyaretçi stüdyoda aynısını bulur): **Sade** — şeftali geçiş, buzlu ışık, çelik mavisi geçiş; **Desen** — su yansıması, gümüş su dokusu, koyu petrol dokusu; **Lüks** — inci damlalı kaide, yeşil zeminde altın toz, siyah su dalgaları. Seçim `scripts/prepare-hero-backdrops.py` `GALLERY`'de (R2'den yalnız okur); kartlar 900 → **1200 px** ve kalite 80 → 86'ya çıkarıldı. **Kimlikleri bulma yöntemi:** kütüphane kimlikleri dosya adından türetilemedi (kütüphane başka adlarla yüklenmiş); yerel kaynak JPEG'ler R2'deki görsellerle küçük imza karşılaştırmasıyla eşleştirildi (fark ≈0,1; yanlış eşleşme ≥11). Kategoriler `background-catalog.ts`'ten okundu: fotoğraflı zeminlerin hepsi Doğal/Lüks'te, Sade ve Desen'in güçlü örnekleri düz-renk/doku bölümünde. Eski 9 görsel silindi; `npm run hero:versions` yenilendi.

**Yükleme kartı, Apple dili (30.09.2026, Kaan).** `upload-dropzone.tsx` + `background-remover.tsx`: önceki kartın çift çerçevesi (dış kart + iç çizgi) kaldırıldı; **tek yüzey**: koyu kart (`#0c0b0a`, üstten inen yumuşak altın spot ışığı: `upload-stage-backdrop.tsx`), büyük ve sıkışık harf aralıklı başlık \"Fotoğrafınızı bırakın.\" (2,75 rem, `-0.03em`; sürüklerken \"Bırakın, gerisini biz yapalım.\"), tek net eylem (açık hap düğme \"Fotoğraf seçin\"), küçük biçim notu. **İmleci izleyen ince ışık** (`--x/--y` CSS değişkenleri, `onPointerMove`; yeniden çizim yok, yalnız `before:` katmanı). Kartın altında hairline ile ayrılmış **üçlü adım satırı** (yükleyin / arka plan kalksın / zemine yerleştirin; ince çizgi ikonlar `Upload`/`Scissors`/`Layers`, altın; ekran okuyucuya \"N. adım\" metni). Yükleme davranışı, doğrulama ve `aria-label=\"Fotoğraf yükle\"` değişmedi. 1280 px ve 375 px'te ekran görüntüsüyle bakıldı; hover ışığı doğrulandı.

**Deneme bölümü: geçiş sahnesi YOK (30.09.2026, Kaan; \"A\" seçeneği).** "Kendi fotoğrafınızla deneyin" bölümü baştan açık ve normal akışta (`app/page.tsx`); kapak, logo sahnesi ve yenilemede yeniden oynayan geçiş yok. Yalnız **kaydırmaya bağlı yumuşak oturma**: yükleme kartı (`.dene-settle`, `globals.css`) bölüme girerken 56 px aşağıda, %93 ölçekte ve %35 opaklıkta başlar, bölümün ortasına yaklaşınca tam boyuta oturur (CSS scroll-driven animation: `animation-timeline: view()`, `animation-range: entry 5% cover 38%`; desteklemeyen tarayıcıda ve \"hareketi azalt\"ta düz durur). **Tuzak (ölçülerek bulundu):** bölüm `overflow-hidden` olursa bir kaydırma kabı oluşur ve `view()` sayfayı değil onu izler — animasyon hiç oynamaz (değerler hep 1,00); bölüm `overflow-clip` kullanır. Ölçüm (kart ekranın altından girerken): opaklık/ölçek 0,40/0,94 → 0,68/0,97 → 0,90/0,99 → 1,00/1,00. **Denenip bırakılanlar (Kaan'ın yönlendirmesiyle sekiz tur):** şeride ulaşınca zamanlı animasyon, ilk kaydırma girdisinde zamanlı, kaydırmaya bağlı (scrub) açılma, ayrılan serit, dairesel açılış (logo büyüyüp solar), logo şeklinde delikten geçme (\"zoom-through\": altın logo görünümü ağır bulundu, yazılım render'ında paralel E2E'yi zaman aşımına soktu) — hepsi kaldırıldı, `try-gate.tsx` silindi; git geçmişinde. Alternatifler (vitrin kapıları, ışıltı + perde, elmas fasetleri, odak çekme, üst üste binen kart, sürükle-bırak alanında canlı örnek) önerildi, yapılmadı. **Ders:** bölümü gizleyen/geciktiren her sahne, yükleme akışını sınayan testleri de (önceden açık kancası) ve erişilebilirliği (`inert`) karmaşıklaştırdı; sade akış hepsini ortadan kaldırdı.

**Sık sorulanlar akordeonu (30.09.2026, Kaan):** Serhan'ın eklediği `<details>` satırları `tak` diye açılıyordu; `marketing/faq-item.tsx` (yumuşak: `grid-template-rows 0fr→1fr` + opaklık, 0,5 sn, sitenin eğrisi; kapalıyken cevap `inert`; "hareketi azalt"ta geçişsiz). Aynı türden başka "tak diye açılan" öğe bulunursa aynı desen kullanılır.

**Açık bölümlerde çok hafif işleme (30.09.2026, Kaan).** Ana sayfanın açık dört bölümü (`#dene`, `#zeminler`, `#ozellikler`, `#teknik`) `light-veil` sınıfını taşır (`globals.css`): üstte altın bir kıl çizgi, kenarlara doğru silinen yumuşak nokta dokusu ve köşede belli belirsiz altın ışık. Yeni renk yok (`#d6a756`, `#1a1917`); içeriğin arkasında (`isolate` + `-z-10`), koyu bölümlere uygulanmaz (onların kendi atmosferi var); yüksek kontrast modunda daha da silik. Yeni açık bölüm eklenirken aynı sınıf verilir.

**"Kendi fotoğrafınızla deneyin" yükleme kartı (30.09.2026, Kaan; öne alınan iş).** Düz beyaz, tek ikonlu kart yerine **koyu sahne kartı**: bölüm AÇIK kalır (vitrin koyu, stüdyo koyu; deneme bölümü de koyu olsaydı üç koyu bölüm art arda gelip koyu/açık ritmi bozulurdu), kartın kendisi koyudur (`background-remover.tsx`, yalnız bekleme durumunda; önizleme/işleniyor/sonuç ekranları eskisi gibi). **Apple dili (Kaan: \"çok Android temalı\" bulundu):** dört deneme yapıldı — vitrinin yüzük fotoğrafı (aynı yüzük üç yerde tekrarlandı), saydamlık ızgarası + elmas + tarama çizgisi (kalabalık), büyük silik logo + köşe işaretleri (dekoratif, Android gibi) — ve sonunda dekor tamamen kaldırıldı. Şimdi: koyu kart (`upload-stage-backdrop.tsx`: yalnız üstten inen yumuşak bir spot ışığı), içinde ince çizgili tek yüzey; ortada küçük Vitrin işareti (`BrandMark`, `h-9`, yalnız ince bir altın ışıltı 5 sn'de nefes alır: `globals.css` `upload-logo`; \"hareketi azalt\" ve `prefers-reduced-motion`'da durur), \"Fotoğrafınızı bırakın\" başlığı, tek net eylem düğmesi (açık hap \"Fotoğraf seçin\"), küçük biçim notu; sürüklerken çizgi altına döner. Kartın altında tek satır \"Yükleyin · Arka plan kalksın · Zemine yerleştirin\". Saf CSS, görsel indirmesi yok. Yükleme davranışına (doğrulama, giriş isteme, testler) dokunulmadı; yalnız görünüm. 1280 px ve 375 px'te ekran görüntüsüyle bakıldı; gerçek sürüklemenin animasyonu tarayıcıda gözle değerlendirilmeli.

**El katmanı yapay zekayla üretilmiş takısız elden (30.09.2026, Kaan).** Eskiden `<sahne>-el.webp`, takının bölgesi zeminle doldurularak üretiliyordu; takının önünden geçtiği parmak uçları fotoğrafta olmadığı için yüzük kalkınca parmaklar "ısırılmış" görünüyordu (2B onarım denendi, geri alındı). Şimdi her sahnenin takılı fotoğrafı ChatGPT'ye "yalnız takıyı sil, parmakların gizli iç yüzünü tamamla" diye verilip çıkan **takısız el** kullanılıyor (kaynak: `photo-source/hero-el/<sahne>-temiz-el.png`). `scripts/build-hero-hands.py` onu SIFT + benzerlik dönüşümüyle takılı fotoğrafa hizalar (ölçek ≈ 1,00, kayma birkaç piksel; dışına çıkarsa durur) ve `<sahne>-el.webp`'yi (opak RGB) üretir; ardından `npm run hero:versions`. **Bu tek dosya HEM sayfada HEM yakınlaşmada kullanılır** (`pageHandSrc` = `handSrc`); yüzük kesimi (`<sahne>-kesim.webp`) onun üstünde durur. İlk sürümde yalnız yakınlaşma eli değişmiş, takının bölgesi bir maskeyle gizlenmişti: gecis anlarında (yakınlaşmanın başı, sahne değişimi) sayfadaki eski kesik el ve maske geçişi yine görünüyordu (Kaan'ın gözlemi) — maske kaldırıldı. **Katmanlama:** el takının ARKASINDA (`hero-zoom.tsx`: düzlem z=-4'te, ekranda aynı boyut için büyütülmüş; takının opak katmanı derinlik yazar) — orijinal fotoğrafta da yüzük parmak uçlarının önünden geçiyor. `photo-source/hero-el/<sahne>-referans-sayfa.webp` eski (kesik) sayfa eli: yalnız hizalama referansı olarak durur, sitede kullanılmaz. `prepare-hero-scenes.py` `-el.webp`'yi ESKİ yöntemle yazar: çalıştırılırsa `build-hero-hands.py` yeniden çalıştırılır. Ölçüm başsız Chrome + adım adım kare yakalamayla, gerçek oynatmada gözle değerlendirilmeli. **Bilezikli sahne (alyansın yerine) vazgeçildi** (Kaan): vitrin alyansla kalıyor.

**İlk sahne görselleri `unoptimized` + `loading="eager"` (30.09.2026, Kaan).** React, tembel olmayan bir `<img>`'i kendiliğinden preload ediyor; telefonda (375 px, 2,6×) preload etiketindeki `sizes` görselin kendisinden FARKLI bir genişlik seçiyor ve ilk sahnenin iki görseli için 3840 + 2048 px'lik iki ayrı dosya iniyordu (üretim derlemesinde ölçüldü; `priority`, `fetchPriority` ve `sizes` sadeleştirmesi işe yaramadı). Dosyalar zaten hazır 1600 px'lik webp olduğundan `unoptimized` tek adres veriyor: telefonda ilk sahne ~160 KB → 101 KB ve tek istek; **bedeli:** masaüstünde ~49 KB → 101 KB. Chrome'un LCP öğesi ilk sahnenin kesim katmanıydı (`RingLift`) ve tembel yükleniyordu, artık `eager`. Ölçüm başsız Chrome + Pixel 7 taklidiyle; gerçek telefonda doğrulanmadı.

Ana sayfanın ilk ekranı: `marketing/hero.tsx` (sunucu bileşeni; başlık ve düğmeler) içinde `hero-showcase.tsx` (kaydırma, istemci) ve `hero-zoom.tsx` (three.js, `next/dynamic`, `ssr:false`). Saf mantık `src/lib/hero-*.ts` içinde ve testli: `hero-carousel` (yay fiziği, tekerlek kuralı), `hero-zoom-timeline`, `hero-backdrops` (zemin yerleşimi), `hero-asset` (sürümlü adresler), `hero-scenes` (sahne verisi).

- **Sahne eklemek:** (1) Blender betiği `scripts/hero-3d/<ad>.py` → `.glb` (`jewelry_lib.py` ortak yardımcılar); (2) Gemini ile el fotoğrafı → `~/vitrin-ai-hero-kaynak/el/sahneN.jpg` (depo dışı); (3) `prepare-hero-scenes.py` içine `PRODUCT_REGIONS` girdisi, betiği çalıştır (BiRefNet ~12 GB RAM; kesim işçisi kapalı olmalı); (4) `hero-scenes.ts`'e sahne; (5) `npm run hero:versions`.
- **Kaydırma yalnız yatay/sürükleme/ok/klavye;** dikey tekerlek sayfayı kaydırır. Sahne ölçeği `sceneLayout` ile ürünleri sahne 1'in yüzüğüne yakın boyda hizalar.
- **Yakınlaşma:** el katmanı (yüzüğü silinmiş `*-el.webp`) iner, 3D takı ilk karede fotoğraftaki yerinde belirir ve bir tam tur dönerek odağa gelir. Zemin katmanı 3D tuvalin arkasında, aynı hesabı (`zoomFocus`) kullanır. Pırlanta: `MeshRefractionMaterial` (renk kanalları ayrı, 5 iç yansıma; telefonda 3) + faset ışıltısı (`DiamondGlints`).
- **Performans/güvenlik:** varlıklar `?v=` sürümlü; `public/hero/` yalnız yayınlanacak dosyalar (ham 4K ve el fotoğrafları depo dışı — SECURITY.md 7). Veri tasarrufunda yakınlaşma kodu önceden inmez.
- **Safari:** geliştirme sunucusunda (3001) Safari'ye özgü bir görünüm sorunu görüldü, üretim derlemesinde yok (CLAUDE.md ders 39); Safari kontrolü `npm run build && npx next start` ile yapılır.

## Katalog (`/katalog`)

Şablon galerisi → çalışma alanı. Üç şablon: İkili vitrin, Kapak, Üçlü ızgara.
"Örnek ile başlayın" hazır bir sayfa açıyor — boş sayfayla karşılaşmak fikri
anlatmıyor.

**Her şablon yalnızca KUTULARDAN oluşuyor** (`src/lib/catalog-templates.ts`),
0–1 arası oranlarla. Önizleme bu oranları yüzdeye, dışa aktarma aynı oranları
piksele çeviriyor. Önceki sürümde her şablonun iki ayrı uygulaması vardı (JSX
yerleşimi + canvas fonksiyonu) ve ikisinin aynı kalacağını hiçbir şey garanti
etmiyordu; yerleşim değiştiğinde birini güncelleyip diğerini unutmak an
meselesiydi.

**Görseller kendi kutularında kırpılıyor.** Kullanıcı görseli büyüttüğünde
metin bandına taşması mümkün değil — önceki sürümde yerleşim akışa bırakıldığı
için büyük bir görsel başlığı aşağı itebiliyordu.

**Boyut ve konum kaydıraçları** yuvanın kendi kutusuna göre oran veriyor;
`slotPlacement()` hem önizlemede hem dışa aktarmada aynı fonksiyon.

**Tuzak:** yuvadaki `<img>` etiketine `max-width: none` verilmesi zorunlu.
Tailwind'in temel katmanı tüm görsellere `max-width: 100%` uyguluyor ve bu,
%100'ün üzerindeki her ölçeği **sessizce** kırpıyordu: kaydıraç değeri ve
`style.width` doğru güncelleniyor, görsel büyümüyordu.

Kâğıt rengi saf beyaz değil kırık beyaz (`#f4f1ec`): saf beyaz sayfa ekranda
çevresindeki arayüzden parlak duruyor ve göz önce ona gidiyor.

## Logo

`brand-mark.tsx`, kullanıcının verdiği logonun **yazısız** hâli. Dalga rastgele
bir süs değil, markanın adını yazıyor:

| parça | harf |
| --- | --- |
| baştaki iniş ve çıkış | **V** |
| ortadaki yüksek tepe | **A** |
| sondaki kısa yükseliş | **ı** |
| soldaki ayrı nokta | **İ**'nin noktası |

Bu yüzden oranlar keyfi değil: ortadaki tepe belirgin şekilde daha **yüksek**
(harf olarak okunması buna bağlı), soldaki vadi derin ve dar, sağdaki daha
kısa. Bunları eşitlemek işareti anlamsız bir dalgaya çevirir. Nokta çizgiye
**değmemeli** — değdiği anda ayrı bir harf işareti olmaktan çıkıp çizginin
parçası gibi okunuyor.

Ekran görüntüsü değil, yeniden çizilmiş SVG — her ölçüde net, `currentColor`
ile bulunduğu yerin rengini alıyor (üst çubukta altın), ayrı bir dosya
indirilmiyor.

**İşaret geniş (≈1.5:1), kare değil.** Kullanım yerlerinde yükseklik veriliyor
ve genişlik `w-auto` ile geliyor; `size-*` gibi kare bir sınıf işareti ezer.

## Menü ve "Hakkında" paneli

Menüde iki bağlantı var: **Deneyin** ve **Nasıl çalışır**. Önceden dört vardı
(Öne çıkanlar ve Teknik bilgiler de) ama dördü de aynı sayfanın alt alta duran
bölümlerine gidiyordu — menü bir *seçim* sunmuyor, sayfanın içindekilerini
tekrar ediyordu. Kalan iki bağlantı gerçekten ayrı iki niyete karşılık geliyor:
"denemek istiyorum" ve "önce nasıl çalıştığını anlamak istiyorum". Diğer
bölümler sayfada duruyor, kaydırınca geliniyor.

**Amaç, misyon ve vizyon sayfa bölümü değil, üst çubuktan açılan bir panel**
(`about-panel.tsx`). Bu üç metin aracı kullanmak için gerekli değil; sayfaya
bölüm olarak konduklarında ziyaretçinin araca ulaşması bir ekran gecikiyordu.
Panel, isteyen için bir tıklama uzakta; istemeyen için hiç yok. Escape ile ve
dışına tıklayarak kapanıyor.

## Tanıtım görselleri gerçek çıktı

`scripts/prepare-showcase.mjs`, `public/photos/vitrin.webp`'i **çalışan
backend'e gönderip** kesimi üretiyor ve altın zemin üzerine yerleştiriyor
(`public/showcase/`). Yani turda "işte sonuç" derken gösterilen şey stok
fotoğraf ya da elle rötuşlanmış bir temsilî görsel değil, kullanıcının alacağı
şeyin ta kendisi.

Kaynak olarak ham `photo-source/urun-foto.jpg` **kullanılmıyor**: o karede
ürünün yanında kuyumcu testeresi ve serbest bir zincir de var, BiRefNet salient
object segmentasyonu yaptığı için onları da koruyor ve kesimde havada duran bir
testere kalıyor (kök `CLAUDE.md`'deki bilinen sınırlama). Tek konulu kare
kullanıldığında sonuç temiz.

Çalıştırmak (backend :8000'de ayakta olmalı):

```bash
npm run gorselleri-hazirla
```

## Akış: inceleme → stüdyo (Faz 3)

Arka plan kaldırıldıktan sonra **inceleme ekranı** açılıyor: önce/sonra sürgüsü
(iki görsel üst üste, üstteki `clip-path` ile soldan kırpılıyor — genişlik
değiştirmek görseli yeniden ölçekler ve aynı pikselde karşılaştırma imkânsız
olurdu), kesim detayları ve üç eylem. Birincil eylem indirme değil **"Arka plan
ekle"**: ürünün asıl vaadi satışa hazır görsel, saydam bir PNG değil.

**"Vitrin AI" düğmesi inceleme ekranında**, kesim biter bitmez: kullanıcının
"şimdi ne yapayım" diye düşündüğü an tam bu an. Önce stüdyonun içindeydi, ama
orada kullanıcı zaten elle bir sahne kurmaya başlamış oluyor — teklif geç
kalıyordu. Özellik henüz yok; düğme açıkça "yakında" diyor ve basılınca ne
yapacağını anlatıyor.

**Akışın sonunda "Ana menü"** — stüdyo başlığında. "Geri" inceleme ekranına
dönüyor; iş bittiğinde (görsel indirildikten sonra) oraya dönmek bir çıkmaz,
aynı fotoğrafın sonucu. "Ana menü" stüdyoyu kapatıyor, aracı boş duruma alıyor
ve sayfayı başa kaydırıyor. Sıfırlama olay olarak yayılıyor (`subscribeToReset`),
state olarak değil — sıfırlanma bir an, kalıcı bir durum değil; state tutulsaydı
araç bunu bir efektin gövdesinde okuyup `setState` çağırmak zorunda kalırdı.

Kompozisyon **ayrı bir alanda** — tam ekran stüdyo katmanı. Ayrı bir rota değil
çünkü girdisi bellekteki bir `blob:` URL; rota değişimi bunu taşımak için
IndexedDB'ye yazıp geri okumayı ya da global bir depo kurmayı gerektirirdi.
Katman sayfanın tamamını kapatıyor (kullanıcı için "başka bir alan"), arkadaki
durum korunuyor, `Escape` ve "Geri" ile çıkılıyor.

**Bekleme ekranında yüzde göstergesi yok.** Backend ara ilerleme bildirmiyor,
dolayısıyla bir yüzde çubuğu uydurma olurdu — %80'de donan bir çubuk hiçbir şey
göstermemekten kötü. Onun yerine kullanıcının fotoğrafı bulanık bir önizleme
olarak duruyor ve üzerinden tarama ışığı geçiyor; aşama metinleri backend'in
gerçekten yaptığı sırayı anlatıyor.

## Kompozisyon editörü (Faz 3)

Kesim hazır olduktan sonra aynı ekranda açılıyor (`src/components/composer/`).
Konva.js sahnesi; zemin seçimi, sürükle/ölçekle/döndür ve 2000×2000 dışa aktarma.

**Sahne her zaman kare ve mantıksal ölçüsü sabit (1000).** Ekranda kapsayıcısına
sığacak kadar küçük çiziliyor, ama tüm koordinatlar mantıksal ölçü üzerinden
tutulup Konva'nın kendi `scale`'i ile küçültülüyor. İki faydası var: kullanıcının
yerleşimi ekran boyutundan bağımsız (telefonda konumlandırılan ürün masaüstünde
aynı yerde), ve dışa aktarma sırasında oran tam sayı oluyor.

**Dışa aktarma sırasında sahne geçici olarak mantıksal ölçüsüne alınıyor**
(`scale = 1`), böylece oran `2000 / 1000 = 2`. Doğrudan `2000 / ekranGenişliği`
kullanıldığında ekran genişliği yuvarlak olmadığı için (ör. 434 px) sonuç
2000 değil **1999** px çıkıyordu — bu, elle ölçülmeden fark edilmeyen bir hata.
Transformer tutamakları dışa aktarmadan önce gizleniyor, sonra geri alınıyor.

**Dönüşüm durumu (konum/ölçek/açı) sahnede değil, `CompositionEditor`'da**
tutuluyor. Sahne `donusum` prop'unu çizip kullanıcı sürükledikçe geri bildiriyor.
Böylece yandaki kontroller (boyut kaydıracı, "Ortala", "15°") ile tuvalin kendisi
aynı veriyi paylaşıyor — kaydıracın gösterdiği yüzde ile tuvaldeki gerçek ölçek
sessizce ayrışamıyor. Konva örneğini dışarı açıp imperative çağırmak mümkündü ama
o zaman iki ayrı doğruluk kaynağı olurdu.

**Seçim çerçevesi bilinçli olarak hafif:** 1 px kesikli altın çizgi ve 9 px
yuvarlak tutamaklar. Konva'nın varsayılanı (kalın, parlak mavi, kare tutamaklı)
ürünün önüne geçiyor; kullanıcı sonucu değerlendirmeye çalışırken gözü önce seçim
kutusuna takılıyordu. Çizgi ve tutamak ölçüleri sahne ölçeğine bölünüyor ki her
ekran genişliğinde aynı kalınlıkta görünsünler. Döndürme 15° kademelerine
yakınsıyor (`rotationSnaps`) — serbest açı hâlâ mümkün, ama düz durması istenen
bir ürünü elle tam 0'a getirmek zor bir istekti.

**Geometri `src/lib/composition.ts` içinde**, Konva ve React'ten bağımsız: sığdırma
hesabı, açı normalizasyonu ve dışa aktarma oranı orada. `editor-stage.tsx` içinde
kalsalardı test etmek Node ortamında `konva` + canvas yüklemeyi gerektirirdi.

**Görünüm ayarları** Konva'nın kendi filtreleriyle (`Brighten`, `Contrast`,
`HSL`). Filtreler yalnızca `cache()`'lenmiş bir node üzerinde çalışıyor; cache bir
kez kuruluyor (görsel değiştiğinde), filtre parametreleri değiştiğinde Konva
önbelleği kendisi yeniden işliyor — her kaydırac hareketinde `cache()` çağırmak
büyük görsellerde gözle görülür takılma yaratırdı.

**Gölge** ölçüleri sahne koordinatında (1000 birim) veriliyor, sabit piksel
değil: ürün büyüdükçe gölge de büyüyor. (Faz 3'teki "ışık havuzu" 17.09.2026'da
kaldırıldı, yerine yansıma geldi; aşağıdaki güncel bölüme bakın.)

**Merkeze yakalama:** sürüklerken merkeze 12 birimden yakınsa değer tam merkeze
çekiliyor. Fareyle tam ortayı tutturmak neredeyse imkânsız ve 1-2 piksellik kayma
2000 px'e büyütülmüş çıktıda göze batıyor.

**Zeminler** (`src/lib/backgrounds.ts`):

- Yer tutucular kod içinde gradyan tanımı, dosya değil — kaynağı olmayan ikili
  dosya commit edilmiyor ve dört zemin sıfır bayt ediyor.
- Sunucudan gelen zeminler `/api/backgrounds` vekilinden. Vekil **hiç 5xx
  dönmüyor**: backend kapalıysa da 200 + boş liste dönüyor, `X-Backgrounds-Source`
  başlığı (`backend` / `unavailable`) verinin nereden geldiğini söylüyor. Editör
  tek bir yolu ele alıyor, iki ayrı hata dalını değil.
- İmzalı URL'ler süreli. Liste, backend'in `expires_in` alanına göre ömrünün
  **%75'inde** yenileniyor; hesap listedeki en erken ölen URL'e göre yapılıyor.
  Sekme arka planda kalırsa zamanlayıcı kısılabildiği için `visibilitychange`
  ikinci bir tetikleyici. Seçili zemin **id** ile tutuluyor, nesneyle değil —
  yenileme kullanıcının seçimini sıfırlamıyor.

**İlk boyut ölçümü `ResizeObserver`'a bırakılmıyor**, `getBoundingClientRect()`
ile senkron yapılıyor: observer geri çağrıları "update the rendering" adımının
parçası ve kare üretmeyen bir bağlamda (gizli sekme) hiç teslim edilmeyebiliyor.
Ölçülen kapsayıcıya `min-w-0` verilmesi de şart — yoksa grid öğesinin
`min-width: auto` değeri yüzünden ölçüm kullanılabilir alanı değil kendi
içeriğini ölçüyor ve sahne kapsayıcısından taşıyor.

### Logo, ürün etiketi, boyutlar, WhatsApp (öne alınan iş, 13.09.2026)

Geometri ve doğrulama `src/lib/overlays.ts`'te, Konva'dan bağımsız (testli).

- **Logo:** PNG/JPEG/WebP (SVG reddediliyor: dış kaynak çağırabilir, tuvali
  kirletebilir). Yüklenince uzun kenarı 600 px'e küçültülüp PNG veri URL'i olarak
  **tarayıcıda** (`localStorage`, `vitrin-ai:logo`) saklanıyor — hesaba kaydetmek R2
  isterdi. Veri URL'i aynı kökenden sayıldığı için tuval kirlenmiyor. Köşe, boyut
  (kısa kenarın %8-35'i) ve saydamlık da ayrı, doğrulanan bir localStorage
  kaydında tutulur; bozuk/sınır dışı değerler varsayılana döner.
- **Ürün etiketi:** ayar (8K-24K), gram ("3,45" ya da "3.45"; en fazla iki ondalık),
  ürün kodu (en fazla 24 karakter, izinli karakterler) tek satırda:
  "22K · 3,45 gr · Kod A-102". Köşe ve koyu/açık görünüm seçiliyor. Metnin genişliği
  Konva'ya ölçtürülüyor; yazı tipi, `next/font`'un karma adı yüzünden gövdenin
  hesaplanmış stilinden alınıyor. Logoyla aynı köşeye konursa etiket logonun iç
  tarafına kayıyor.
- İkisi de **en üst katmanda ve `listening={false}`**: ürünü seçmeyi engellemiyor,
  sahnenin parçası oldukları için PNG/JPEG/CMYK/WhatsApp çıktılarının hepsine giriyor.
- **Boyutlar:** Instagram dikey 1080×1350 ve Pazaryeri 2000×2000 eklendi
  (`lib/composition.ts`). Pazaryeri seçilince zemin **düz beyaza** (`placeholder-white`,
  gradyansız `#ffffff`) geçiyor; başka zemin seçilirse "Beyaza dön" uyarısı çıkıyor.
- **WhatsApp'ta paylaş:** sahne JPEG olarak çiziliyor ve veri URL'i **senkron** dosyaya
  çevriliyor (araya `await` girerse tarayıcı "kullanıcı etkileşimi" sayılmayan paylaşımı
  reddedebiliyor). `navigator.canShare({ files })` varsa (telefon) paylaşım menüsü
  görselin kendisiyle açılıyor; yoksa (masaüstü — WhatsApp Web'e bağlantıyla dosya
  eklenemiyor) görsel indiriliyor, WhatsApp Web açılıyor ve ne yapılacağı yazıyor.

### Zemin kütüphanesi: kategoriler ve baskı uyarısı (öne alınan iş, 17.09.2026)

- **Kategoriler:** stüdyodaki zemin seçici 4 sekmeye ayrıldı — Sade, Desen,
  Doğal, Lüks. Tanımlar `src/lib/background-categories.ts`. Boş
  kategori sekmesi çizilmez; yalnızca bir kategori doluysa (ör. sunucu zemini yokken)
  sekme hiç yoktur. Hazır gradyanlar ve katalogda olmayan her zemin "Sade" sayılır.
- **Kategori nerede tutuluyor:** veritabanında DEĞİL. `src/lib/background-catalog.ts`
  zemin kimliği → kategori / baskı uyarısı eşlemesi ve `backend/scripts/upload_backgrounds.py
  --catalog-out` ile üretilir; elle düzenlenmez. Yeni zemin yüklenince betik yeniden
  çalıştırılıp dosya commit edilir.
- **Önizlemeler:** seçicideki yuvarlaklar tam boyutlu zemini değil ~480 px önizlemeyi
  (`thumbnailUrl`) tembel yükler; önizleme yoksa tam boyutlu görsele düşer. Önizleme olmadan
  bir sekme yüzlerce MB indiriyordu.
- **Baskı uyarısı:** katalogda `printWarning` olan zemin seçiliyken CMYK (TIFF/JPEG)
  düğmesi önce onay penceresi açar: "Bu görsel baskıya önerilmiyor. Yine de onaylıyor
  musunuz?" — Vazgeç hiçbir şey indirmez, "Evet, indir" normal akışa devam eder. Kontrol
  arayüzde; `/api/cmyk` yalnızca çizilmiş sahneyi alır.
- **`/api/cmyk` oturum ister ve hız sınırlıdır (27.09.2026, /cso incelemesi):** rota
  isteğin gövdesini okumadan önce backend'e sorar (`POST /api/cmyk/permit`: oturum +
  kullanıcı başına 10 dakikada 20 dönüşüm). Oturumsuz istek `401 auth_required`, sınırı
  aşan `429` + `Retry-After` alır; başka bir siteden gelen istek (CSRF) 403. Sonuç:
  girişsiz bir ziyaretçi Katalog'da CMYK indiremez, "Bu işlem için giriş yapın." görür.
  Testler `app/api/cmyk/route.test.ts` (gövdenin hiç okunmadığı da ölçülüyor).
- **Yerelde zeminler görünmüyorsa:** artık ilk şüpheli Redis DEĞİL. PR #18'e kadar
  Redis yokken `GET /api/backgrounds` 500 veriyor ve vekil
  `X-Backgrounds-Source: unavailable` ile boş liste döndürüyordu; zemin listelemenin
  hız sınırı artık fail-open olduğu için Redis kapalıyken de liste geliyor. Liste
  hâlâ boşsa sırayla bakılacaklar: backend ayakta mı, `R2_*` ayarları dolu mu,
  bucket'ın CORS kuralı bu origin'i içeriyor mu. Vekil sebebi hep
  `X-Backgrounds-Source` başlığında söylüyor ve arayüz "yüklenemedi" mesajıyla
  tekrar deneme sunuyor.

### Stüdyo adımları, biçim yönü, yansıma; katalog çıktısı (öne alınan iş, 17.09.2026)

- **Adımlar:** `composition-editor.tsx` paneli üç adıma bölündü — 1 Boyut ve zemin, 2 Ürün
  (yerleşim, parlaklık/kontrast/doygunluk, gölge, yansıma), 3 Bitir (logo, etiket, PNG/JPEG,
  WhatsApp, CMYK). Biçim ilk adımda çünkü zemin listesini o belirliyor.
- **Biçimler:** stüdyo A4 (`DEFAULT_FORMAT_NAME = "catalog"`) ile açılır; "Kare 2000×2000"
  kaldırıldı, beyaz zeminli Pazaryeri (2000×2000) duruyor.
- **Zemin esnetilmiyor:** `editor-stage.tsx` zemini `coverCrop` (lib/composition.ts) ile
  ortadan kırparak kaplatıyor; önceden doğrudan sahne ölçüsüne zorlanıyor, hikâyede
  "çekiştirilmiş" görünüyordu.
- **Biçim yönüne göre zemin:** katalogdaki `orientation` (yükleme betiği ölçüden üretir) ile
  dikey biçimlerde (A4, hikâye, Instagram dikey) dikey, gönderi ve pazaryerinde yatay zeminler
  listelenir; **Sade her biçimde** (`fitsOrientation`). Biçim değişince uymayan seçili zemin
  ilk uyan zemine geçer.
- **Yansıma:** ayrı Konva katmanında aynalanmış kopya, `destination-in` gradyanıyla aşağı doğru
  silikleşir (aynı katmanda ürünü de silerdi). Sürüklerken anlık takip eder; geri alma yığınına
  yalnızca bırakınca yazılır. Eksen, kesimin saydam kenarları hariç görünür ürün
  sınırlarından hesaplanır; boşluklu PNG dosyalarında yansıma ürünün altına bitişir.
- **Gölge:** `SHADOW` sabiti (bulanıklık 50, kayma 34, opaklık %55). Eski değer Konva'da
  ölçüldü ve koyu zeminde görünmüyordu; önbellek gölgeyi kesiyor sanılmıştı, ölçüm bunu
  çürüttü. Önbelleğe yine de gölge payı veriliyor.
- **Katalog:** PNG yerine JPEG indirme ve baskıya uygun CMYK (TIFF/JPEG); logo ekleme
  (stüdyoyla aynı `lib/logo-storage.ts` deposu, önizlemede ve çıktıda aynı `logoBox`
  geometrisi). CMYK akışı iki yerde ortak: `lib/print-download.ts`.
- **Eski çalışmalar her sayfadan açılıyor:** ana sayfa dışında bir çalışmaya tıklanınca
  çalışma `sessionStorage`'a yazılır ve ana sayfaya gidilir; araç abone olunca açar
  (`workspace-provider.tsx`). Sağlayıcı her sayfada `SiteShell` ile yeniden kurulduğu için
  bellekte tutmak yetmez.

## Yönetim paneli (`/admin`, Faz 6)

Kaan, 18.09.2026. Backend: Serhan'ın admin API'si (`backend/README.md` →
admin uçları). **Yetki backend'de** (`require_admin`); arayüzdeki her ekran
seçimi yalnızca gösterim — sayfa elle açılsa da veri gelmez.

- **Yöneticilik bilgisi:** `components/admin/use-admin-status.ts` →
  `GET /api/admin/me`. Kullanıcı değişince yeniden sorulur; cevap gelene kadar
  "kontrol ediliyor" (bağlantı bir an görünüp kaybolmasın). Hesap menüsünde
  yalnız yöneticiye "Yönetim paneli" bağlantısı.
- **Vekiller** (`app/api/admin/**`, ortak tip ve sınırlar `lib/admin-api.ts`):
  kimlik UUID mi, sayılar backend sınırlarında mı; gövde bilinen alanlarla
  yeniden kuruluyor (istemcinin fazladan alanı backend'e gitmiyor); kredi,
  geri alma ve silmede Origin kontrolü.
- **Kesim kuyruğu kartı (02.10.2026):** Genel bakışın EN ÜSTÜNDE
  (`components/admin/admin-cutout-queue.tsx`, vekil `app/api/admin/cutout-queue`,
  backend `GET /api/admin/cutout-queue`). Kesim işçisi çalışmıyorsa müşteriler
  hata görmez, sırada bekler; kart bunu yöneticiye gösterir: `ok` (yeşil),
  `stalled` (sarı, ilerlemesizlik süresi ve eşik), `no_worker` ve `unavailable`
  (kırmızı; `unavailable`'da sayaç gösterilmez çünkü backend göndermiyor, eksik
  veri "0" gibi görünmesin). İstatistik yüklemesinden BAĞIMSIZ yüklenir (biri
  hata verirse diğeri çalışır) ve 30 sn'de bir kendini yeniler; yenilemede
  önceki veri ekranda kalır, yenileme başarısız olursa "değerler eski olabilir"
  der. Sağlıklıyken `role="status"`, sağlıksızken `role="alert"`; durum yalnız
  renkle değil başlık ve ikonla da anlatılır. Tanımadığı bir `status` (backend'e
  yeni durum eklenirse ya da yanıt bozuksa) kartı ya da paneli çökertmez, hata
  sayılır. E2E: `e2e/admin-kuyruk.spec.ts` (sahte yönetici oturumu; "hareketi
  azalt" ile — giriş animasyonu `opacity:0`'dan başladığı için Playwright öğeyi
  "görünür" sayıp soluk ekran görüntüsü alıyordu, ders 13/26).
- **Genel bakış:** sayaçlar, günlük kesim ve kayıt grafikleri
  (`daily-bars.tsx` — tek seri, altın, 2px aralıklı ince barlar, üzerine
  gelince ipucu, ekran okuyucu tablosu; altının koyu yüzeydeki kontrastı
  betikle ölçüldü), abonelik durumları, bonus kredi bakiyesi, gelir
  hareketleri, bekleyen operasyon. Başarısız iş ORANI gösterilmiyor (payda
  sıfırken yanıltıcı olur), iki sayı ayrı.
- **Kullanıcılar:** "E-posta ile ara" (ad araması Faz 7'ye ertelendi),
  sayfalama (toplam sayı yok; sonraki sayfa, satır sayısı sayfa boyuna
  eşitse var sayılır).
- **Kullanıcı ayrıntısı:** özet, dönemler, ödemeler, onaylar, bekleyen
  sağlayıcı işleri; **bonus kredi** (dönem kotasını büyütmez) — form
  idempotency anahtarını hata sonrası KORUR, başarıdan sonra YENİLER;
  **geri alma** (onaylı); **hesap silme** — e-posta birebir yazılmadan düğme
  kapalı, yönetici hesabında hiç sunulmuyor (backend de `409 admin_target`).
- **Yönetici ekleme/çıkarma (19.09.2026, PR #25 incelemesi — Codex'in bulduğu
  eksik: `admin_add`/`admin_remove` denetim eylemleri tanımlıydı ama kullanan
  bir uç/arayüz yoktu).** Kullanıcı başlığının yanında "Yönetici yap" /
  "Yöneticiliği kaldır" düğmesi; hesap silmedeki aynı desen — hedefin
  e-postası birebir yazılana kadar onay düğmesi kapalı. `POST`/`DELETE
  /api/admin/users/{id}/admin`'e gidiyor; son yöneticinin kaldırılması
  backend'de `409 last_admin` ile reddedilir, arayüz bunu olduğu gibi
  gösterir (kendi tarafında ayrı bir "son yönetici" kontrolü YOK — asıl
  kontrol backend'de).
- **Etiketler kaynağından:** abonelik durumları ve tahsilat türleri
  migration CHECK kısıtlarından birebir (ders 19).
- **Zeminler (19.09.2026):** yükleme formu (JPEG/PNG/WebP/HEIC, 20 MB, paket
  seviyesi) + kütüphane ızgarası. Liste `GET /api/admin/backgrounds`ten geliyor
  ve **pasif zeminleri de** gösteriyor (kullanıcıya giden listeden farkı bu).
  Önizleme adresleri süreli imzalı R2 URL'leri; liste `expires_in` dolmadan
  kendini yeniliyor (süre istemciye sabitlenmiyor). **Güncelleme/silme yok** —
  kategori ve baskı uyarısı burada değil `lib/background-catalog.ts`'te.
  Her kartta **paket seçici** (Temel / Tüm paketler) ve **Yayında** anahtarı
  var; ikisi de `PATCH` ile gidiyor ve ekrana **sunucunun döndürdüğü** değer
  yazılıyor (istemcinin tahmini değil — ayrışırlarsa kullanıcı yanlış paketi
  görürdü). **Silme iki adımlı** (çöp kutusu → "Sil"/"Vazgeç") ve geri
  alınamaz; sunucu reddederse kart listede kalır ve hata görünür.

## Ödemeler (Faz 5)

**`/paketler` tasarımı geri getirildi (15.09.2026).** PR #17'nin ilk hali bu
sayfayı (393 satır) üç düz beyaz kartlık bir listeye indirmişti; tasarım dili
Faz 2'de kilitli bir karar olduğu için hero (koyu zemin + altın ışık),
karşılaştırma tablosu ve SSS bölümleri geri alındı. Fark: kartlar artık statik
değil. **Sunum** (özet, madde listesi, hangi planın önerildiği) `paketler/page.tsx`
içinde statik kalıyor — bunlar pazarlama metni, veritabanında yoklar. **Fiyat,
kota ve satın alınabilirlik** yalnızca `GET /api/plans`ten geliyor; yayımlanmamış
bir plan "Yakında / Fiyat belirleniyor" olarak durur ve çalışır gibi görünen bir
düğme almaz. Depoda uydurma fiyat bulunmaz.

`/paketler` backend'in yayımladığı fiyat/kota sürümlerini gösterir; kabul edilen
sözleşme hash'leri ve görülen plan sürümüyle checkout başlatır. `/odeme/{id}`
iyzico HTML formunu izole iframe'de sunar, sonucu backend'den sorgular.
`/hesap` kalan kredi, dönem, iptal ve sayfalı mali/fatura geçmişini gösterir.
Hesap değişince önceki hesabın mali ekranı kaldırılır. Next.js rotaları auth ve
Origin kontrolü yapan vekillerdir; kota/ödeme iş mantığı backend'dedir.
Hesap silme yanıtı 202 bekleyen taleptir, tamamlanmış silme olarak gösterilmez.
Yükleme vekili `Idempotency-Key`, billing hataları ve `Retry-After` bilgisini taşır.

**Idempotency anahtarı iş oturumu başınadır, istek başına değil**
(`components/background-remover.tsx`). Her `fetch`te yeni anahtar üretmek iki
hızlı tıklamada iki kredi açıyordu. Anahtar artık seçilen dosyaya bağlı ve
yenileme kuralı TEK: backend yanıtında **`retry_safe: true`** varsa yeni anahtar
üretilir; bu bayrak, kredinin hiç tüketilmediğini ya da iade edildiğini
sunucunun açıkça söylemesidir. Başka her durumda — bağlantı koptu, iş hâlâ
sürüyor, sonuç artık saklanmıyor — anahtar KORUNUR. Backend aynı anahtar için
başarılı sonucu 24 saat sakladığından, yanıtı ulaşmamış bir işlem aynı anahtarla
saklanan PNG'yi geri verir; yeni bir anahtar ikinci krediyi yakardı. Kural
istemci tarafında tahmin EDİLMEZ (kök `CLAUDE.md` ders 19): bayrağın tek kaynağı
backend, vekil yalnız aktarır.

**Zemin listesi ödeme durumundan bağımsızdır.** Backend kota/abonelik hatasında
listeyi boşaltmıyor; vekil de token reddedilirse (401) temel zeminleri bir kez
oturumsuz istiyor. Editörün gradyan yer tutucuya düşmesi artık yalnızca backend
gerçekten erişilemezken oluyor.

**Devam eden satın alma görünür.** `checkout_pending`/`idempotency_conflict`
hatası `checkout_url` taşıyor; `/paketler` kullanıcıyı oraya yönlendiriyor ve
`/odeme/{id}` "bu işlemi iptal et, yeni plan seç" seçeneği sunuyor. İptal
fail-closed: sağlayıcı doğrulanamıyorsa veya dönen abonelik kanıtı
conversation/müşteri/planla uyuşmuyorsa oturum kapatılmıyor, hata gösteriliyor.
Yalnızca sağlayıcının kesin "checkout oluşmadı" sonucu yeni plan seçimini açıyor.

**Hesap silme vekilinde de ödeme mutasyonlarıyla aynı Origin kontrolü var**
(`lib/backend-proxy.ts::foreignOrigin`) — kontrol ayrı ayrı yazıldığı için
geri döndürülemez olan işlemde eksik kalmıştı.
Canlı açılış ve gerçek iframe/3DS testi için [ödeme runbook'u](../docs/billing-runbook.md).
