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

## Sol panel: çalışmalarım ve ayarlar

Üst çubuktaki panel düğmesi soldan kayan bir çekmece açıyor. İki sekmesi var:

- **Çalışmalarım** — geçmiş sonuçlar; küçük önizleme, dosya adı, ne kadar önce
  yapıldığı. Tıklayınca sonuç ekranda geri açılır, çöp kutusuyla tek tek
  silinir.
- **Ayarlar** — geçmiş kaydını aç/kapat, hareketi azalt, tümünü sil.

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
