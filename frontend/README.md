# frontend

Vitrin AI'ın Next.js web uygulaması. **Faz 2 (web frontend MVP) tamamlandı.**

Akış: fotoğraf seç → önizle → arka planı kaldır → önce/sonra karşılaştırması →
PNG indir.

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
| `USE_MOCK_BACKEND` | `true` | Demo modu — backend hiç çağrılmaz, sabit bir örnek kesim döner. |

> **`USE_MOCK_BACKEND` uyarısı:** bu değer `true` kaldığı sürece gerçek backend
> ayakta olsa bile arayüz **hep aynı örnek görseli** gösterir. Önceki iterasyonda
> tam olarak bu unutulup "neden sonuç hep aynı" karışıklığına yol açmıştı (bkz.
> kök `CLAUDE.md` ders 10). Bu yüzden yanıt `X-Mock-Response` başlığı taşıyor ve
> arayüz sonucun altında açıkça **"Demo modu"** yazıyor — sessizce sahte sonuç
> gösterilmiyor. Gerçek uçtan uca test için `false` yapıp dev sunucusunu yeniden
> başlatın (Next.js `.env.local`'i yalnızca açılışta okur).

## Neden sunucu tarafı vekil

Tarayıcı FastAPI'ye **doğrudan gitmiyor**; istek önce
`src/app/api/remove-background/route.ts` route handler'ına geliyor. İki sebep var:

1. Backend'de CORS middleware'i yok ve Faz 4'e kadar da eklenmeyecek (bkz. kök
   `CLAUDE.md` "Açık takip maddesi").
2. Faz 4/5'te auth ve kredi anahtarları devreye girdiğinde bunların tarayıcıya
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
| Zaman aşımı (180 sn) | "İşlem zaman aşımına uğradı." |

503 ayrı bir mesaj hak ediyor çünkü bir hata değil, geçici bir durum: backend
aynı anda tek inference'a izin veriyor (`MAX_CONCURRENT_INFERENCES=1`, BiRefNet'in
12–14 GB RAM ayak izi yüzünden). Kullanıcının yapması gereken tek şey biraz
beklemek.

## Yükleme kısıtları backend ile senkron tutulur

`src/lib/upload-constraints.ts` içindeki `MAX_FILE_SIZE_MB` (20) ve
`ALLOWED_CONTENT_TYPES`, `backend/app/core/config.py` ile **elle** senkron
tutulur. Biri değişirse diğeri de güncellenmeli — kök `CLAUDE.md` bunu açık bir
kural olarak listeliyor. İstemci tarafı doğrulama yalnızca kullanıcı deneyimi
içindir; asıl güvenlik sınırı backend'dir (magic-byte doğrulaması, piksel
sınırı, gövde boyutu middleware'i).

## HEIC

iPhone'un varsayılan formatı, hedef kitle telefonla çekiyor. Backend HEIC'i
sorunsuz işliyor ama **tarayıcılar HEIC'i görüntüleyemiyor** — bu yüzden
önizleme yerine bilgilendirici bir kart gösteriliyor ("Bu format tarayıcıda
önizlenemiyor"). Sonuç PNG olarak döndüğü için sonuç ekranı normal çalışıyor.

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
| < 640 px | Tek sütun. Üst çubuktaki menü bağlantıları gizlenir, logo + "Hemen deneyin" kalır. |
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
Hero (siyah)            → vaat + ürün görseli
Deneyin (açık gri)      → aracın kendisi
Öne çıkanlar (kömür)    → dört madde, taranmak için
Nasıl çalışır (açık)    → üç adım + çekim önerileri
Teknik bilgiler (siyah) → formatlar, sınırlar, süre, gizlilik
Footer (açık gri)       → model sınırlamaları, dipnotlar
```

Durum taşıyan tek parça `background-remover.tsx`; diğer bölümlerin hepsi sunucu
bileşeni, yani istemciye hiç inmiyor.

## Üst çubuk

Marka **en solda**, hemen yanında panel düğmesi; bağlantılar markanın
devamında; "Giriş yap" ve "Hemen deneyin" en sağda. Çubuk 56 px, bağlantılar
14 px.

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

Vitest. Kapsam bilinçli olarak **saf mantık ve sunucu kodu**: yükleme
kısıtları (`upload-constraints`) ve arka plan kaldırma vekili (`route.ts`).
İkisi de projenin en kolay sessizce bozulabilecek yerleri — biri backend ile
elle senkron tutulan sabitler, diğeri backend yanıtlarının kullanıcıya
çevrildiği yer.

27 test var. Özellikle korunanlar:

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

Bileşen testleri (React Testing Library) ve E2E (Playwright) bilinçli olarak
ertelendi; yol haritası ikisini de Faz 7'ye koyuyor ve arayüz hâlâ hızla
değişirken şimdi eklemek bakım yükü üretirdi.

**Bir tuzak:** testte dosya boyutunu `Object.defineProperty` ile sahtelemek
işe yaramıyor — dosya `FormData` + `Request` üzerinden geçerken yeniden
oluşturuluyor ve sahte `size` kayboluyor. Boyut gerçekten üretilmeli.

## Sol panel: çalışmalarım ve ayarlar

Üst çubuktaki panel düğmesi soldan kayan bir çekmece açıyor.

- **Gövde: çalışmalarım** — geçmiş sonuçlar; küçük önizleme, dosya adı, ne
  kadar önce yapıldığı. Tıklayınca sonuç ekranda geri açılır, çöp kutusuyla
  tek tek silinir.
- **Alt şerit: ayarlar, altında çıkış** — ayarlar geçmiş kaydını aç/kapat,
  hareketi azalt ve tümünü sil içeriyor; çıkış hesap sistemi gelene kadar
  soluk duruyor ve tıklanınca durumu açıklayan pencereyi açıyor.

Ayarlar önceden üstte bir sekmeydi; alta alınması paneli tek işli yapıyor
(gövde = çalışmalar) ve ayarı uygulamalarda beklenen yere koyuyor.

## "Giriş yap" — hesap sistemi henüz yok

Menüde giriş yeri **var** ama tıklayınca `sign-in-notice.tsx` açılıyor: hesap
sisteminin bir sonraki aşamada geldiğini ve şu anda kayıt gerekmediğini
söylüyor. Çalışmayan bir düğme koymak ya da sahte bir form açmak kullanıcıya
yalan söylemek olurdu; tamamen gizlemek ise tasarımı eksik bırakıyordu. Faz
4'te bu bileşen gerçek giriş/kayıt formuyla değişecek, çağrı noktası aynen
kalacak.

### Geçmiş şu anda tarayıcıda — bu geçici

`ROADMAP.md` proje geçmişini **Faz 4'e ve sunucuya** koyuyor. Kullanıcı Faz
2'de görünür olmasını istedi; Faz 4'ün şeması ve RLS'i henüz olmadığı için
geçmiş şimdilik **IndexedDB**'de tutuluyor. Riski sınırlayan dört karar:

1. Depo bir arayüzün arkasında (`src/lib/work-history.ts`). Faz 4'te yalnızca
   o dosyanın gövdesi sunucu çağrılarıyla değişecek; panel, sağlayıcı ve araç
   hiç değişmeyecek.
2. Panelde kullanıcıya açıkça yazıyor: *"yalnızca bu cihazda saklanıyor, hesap
   sistemi geldiğinde hesabınıza taşınacak."* Sessizce yapılmıyor.
3. Yalnızca **sonuç** saklanıyor, özgün fotoğraf değil — özgün dosyalar 20 MB'a
   kadar çıkabiliyor ve yirmi kaydın özgünüyle birlikte saklanması tarayıcı
   kotasını doldurur. Görünür sonucu: geçmişten açılan çalışmada önce/sonra
   karşılaştırması değil yalnızca sonuç gösterilir.
4. En fazla 20 kayıt; ayarlardan kapatılabilir ve silinebilir.

Depolama açılamazsa (gizli pencere, kota dolu, eski tarayıcı) geçmiş sessizce
devre dışı kalır — kesim ve indirme akışı bundan etkilenmez.

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
src/components/sign-in-notice.tsx           "hesap sistemi yakında" penceresi
src/components/workspace-provider.tsx       panel/geçmiş/ayarlar context'i
src/components/work-sidebar.tsx             sol çekmece (çalışmalarım + ayarlar)
src/components/site-header.tsx              yapışkan üst çubuk
src/components/site-footer.tsx              dipnotlar
src/components/marketing/hero.tsx           açılış bölümü
src/components/marketing/highlights.tsx     öne çıkanlar
src/components/marketing/how-it-works.tsx   üç adım + çekim önerileri
src/components/marketing/specs.tsx          teknik bilgiler
src/components/marketing/hero-visual.tsx    açılıştaki önce/sonra görseli
src/lib/upload-constraints.ts               backend ile senkron yükleme kısıtları
src/lib/work-history.ts                     geçmiş deposu (GEÇİCİ — IndexedDB)
src/lib/settings-store.ts                   ayarlar (useSyncExternalStore kaynağı)
public/mock/sample-cutout.png               örnek kesim ("sonra")
public/mock/sample-photo.png                aynı ürün kadife zeminde ("önce")
scripts/generate-mock-cutout.py             ikisini de üreten betik (ek bağımlılık yok)
```

## Açılıştaki ürün fotoğrafları

`public/photos/atolye.webp` ve `vitrin.webp` — **gerçek ürün fotoğrafları**,
telifi bize ait. Kullanıcının sağladığı tek kare (2816×1536, 3,6 MB) ikiye
bölünüp küçültülerek üretiliyor: `node scripts/prepare-photos.mjs`.

Etiketler bilinçli olarak "Önce / Sonra" **değil**, "Atölyede / Vitrinde":
sağdaki kare bu aracın çıktısı değil, ayrı bir çekim. "Sonra" demek,
kullanıcıya bu sonucu bu aracın ürettiğini söylemek olurdu. İkisi birlikte
ürünün **vaadini** anlatıyor; aracın gerçek çıktısını kullanıcı birkaç ekran
aşağıda kendi fotoğrafıyla görüyor.

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
| **Toplam aktarılan** | **342 KB** |
| JavaScript | 160 KB |
| Font (Inter, latin + latin-ext) | 131 KB |
| Görseller | 42 KB |
| CSS | 9 KB |
| Belge | 9 KB |

Görseller `next/image` ile 384 px sürümlerine iniyor: 900 px'lik kaynaklar
ekranda 31 KB + 12 KB olarak servis ediliyor.

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

İlk istek modeli belleğe yüklediği için ~30-35 saniye sürebilir; sonrakiler
~15 saniye (bkz. kök `CLAUDE.md` "Bilinen kısıt"). Bekleme ekranı geçen süreyi
sayıyor ve 20 saniyeden sonra bunun ilk istek olabileceğini açıklıyor — donmuş
gibi görünen bir ekranda kullanıcı sekmeyi kapatıyor.

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

**Gölge ve ışık havuzu** ölçüleri sahne koordinatında (1000 birim) veriliyor,
sabit piksel değil: ürün büyüdükçe gölge de büyüyor. Işık havuzu ürünün değil
**zeminin** üstünde — ürüne düşen bir vinyet onu soluklaştırırdı.

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
