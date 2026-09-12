# frontend

Vitrin AI'ın Next.js web uygulaması. **Faz 2 (web frontend MVP), Faz 3 (stüdyo) ve
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
| `CMYK_ICC_PATH` | boş | Baskı (CMYK) dönüşümünün ICC profili; boşsa `/api/cmyk` 503 döner. |

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

**Footer'daki boş yerler.** Sosyal medya adresleri henüz yok (`site-footer.tsx`
→ `SOSYAL` dizisinde `href: null`, simgeler tıklanamaz görünüyor). KVKK
aydınlatma metni, gizlilik politikası ve kullanım koşulları da henüz yazılmadı;
"yakında" olarak işaretli. Ödeme (Faz 5) açılmadan önce yazılmaları gerekiyor.

Durum taşıyan tek parça `background-remover.tsx`; diğer bölümlerin hepsi sunucu
bileşeni, yani istemciye hiç inmiyor.

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

**188 test** (Faz 4 sonu). Faz 2-3 dosyaları:

| dosya | kapsam |
| --- | --- |
| `lib/upload-constraints.test.ts` | Yükleme kısıtları — backend ile elle senkron tutulan sabitler |
| `app/api/remove-background/route.test.ts` | Arka plan kaldırma vekili — backend yanıtlarının kullanıcıya çevrildiği yer |
| `app/api/backgrounds/route.test.ts` | Zemin vekili — hiç 5xx dönmemesi, bozuk kayıt eleme, `expires_in` yokluğu |
| `lib/backgrounds.test.ts` | Yenileme zamanlaması ve yer tutucuya düşme |
| `lib/composition.test.ts` | Sığdırma geometrisi, açı normalizasyonu, merkeze yakalama, dışa aktarma oranı |
| `app/api/cmyk/route.test.ts` | CMYK yükleme boyutu/piksel sınırları ve profil yapılandırması |
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
| `lib/password-policy.test.ts` | Parola kuralı (8+, küçük, büyük, rakam; Türkçe büyük harfin Supabase gibi sayılmaması) |
| `lib/profile.test.ts`, `lib/turkey-cities.test.ts` | Ad/şirket adı/telefon doğrulaması, metadata okuma, ekranda görünen ad (şirket/bireysel), 81 il |
| `components/auth-dialog.test.ts` | Kayıt formu: şirket alanlarının yalnızca şirket seçilince görünmesi, bireysel hesapta şirket bilgisinin Supabase'e yazılmaması, zorunlu alanlar |
| `lib/overlays.test.ts` | Logo/etiket yerleşimi, gram biçimi, ürün kodu temizliği, aynı köşede üst üste binmeme |
| `components/marketing/hero-before-after.test.ts` | Açılıştaki önce/sonra kaydıracı |

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
testi öne alındı. Daha geniş bileşen kapsamı ve Playwright E2E, Faz 7'de
planlandığı gibi devam ediyor.

**Bir tuzak:** testte dosya boyutunu `Object.defineProperty` ile sahtelemek
işe yaramıyor — dosya `FormData` + `Request` üzerinden geçerken yeniden
oluşturuluyor ve sahte `size` kayboluyor. Boyut gerçekten üretilmeli.

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
| Yeni parola | `src/app/auth/yeni-parola/`, `components/new-password-form.tsx` | Sıfırlama bağlantısının açtığı sayfa; başarıda diğer cihazlardaki oturumlar kapanır |
| Hesap sayfası | `src/app/hesap/`, `components/account-panel.tsx` | Profil, parola değiştirme (mevcut parola istenir), tüm cihazlardan çıkış, hesap silme |
| Hoş geldin | `components/welcome-toast.tsx` | Girişte ya da e-posta bağlantısından dönüşte bir kez |
| Vekil yardımcısı | `src/lib/backend-proxy.ts`, `lib/supabase/access-token.ts` | Token'ı `Authorization` ile iletme, 401 → `auth_required`, backend'e ulaşılamazsa 502 |

**Kayıt iki adım:** (1) ad, soyad, e-posta, parola, parola tekrar; (2) **hesap türü
(bireysel / şirket)** — şirkette şirket adı + işletme türü —, şehir (81 il), isteğe
bağlı telefon, zorunlu kullanım koşulları + KVKK onayı, ayrı ve isteğe bağlı ticari
e-posta izni. Değerler Supabase `user_metadata`'da (`lib/profile.ts`); yalnızca
görünüm için, yetki kararında kullanılmıyor. Ekranda görünen ad: şirket hesabında
şirket adı, bireyselde kişinin adı (hesap türü seçilmemiş eski hesapta kişinin adı —
yerine karar verilmiyor).

**Parola kuralı** Supabase ayarıyla birebir: en az 8, küçük + büyük harf + rakam
(`lib/password-policy.ts`, ASCII — Supabase "Ş"yi büyük harf saymıyor). Yazarken canlı
liste (`components/password-checklist.tsx`).

**Kullanıcı numaralandırması kapalı:** yanlış parola ile kayıtsız e-posta aynı
mesajı veriyor (`lib/auth-errors.ts`); kayıtlı adresle kayıtta ve sıfırlamada da
"e-postanızı kontrol edin" ekranı çıkıyor.

**Arka plan kaldırma giriş istiyor** (ürün kararı). Fotoğraf seçip önizlemek serbest;
"Arka planı kaldır"a basınca oturum yoksa giriş penceresi açılıyor, seçilen dosya
yerinde kalıyor. Vekil oturumu 20 MB'lık gövdeyi okumadan önce kontrol ediyor.

**Supabase paneli:** Redirect URLs'e `http://localhost:3000/auth/callback`
(sıfırlama bağlantısı `?next=` eklediği için yerelde `http://localhost:3000/**`),
parola kuralı ve e-posta bağlantı süresi ayarlanmalı.

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
- Küçük resimler R2'nin süreli adresi; panel açıldığında süresi dolmuş kayıt varsa
  liste yenileniyor.
- Silme sunucuda başarısız olursa kayıt listeden çıkarılmıyor.
- Kayıt başarısız olursa (ör. backend'de R2 yapılandırılmamış) sessizce atlanıyor;
  kesim ve indirme akışı etkilenmiyor.

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

İlk istek modeli belleğe yüklediği için ~30-35 saniye sürebilir; sonrakiler
~15 saniye (bkz. kök `CLAUDE.md` "Bilinen kısıt"). Bekleme ekranı geçen süreyi
sayıyor ve 20 saniyeden sonra bunun ilk istek olabileceğini açıklıyor — donmuş
gibi görünen bir ekranda kullanıcı sekmeyi kapatıyor.

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

### Logo, ürün etiketi, boyutlar, WhatsApp (öne alınan iş, 13.09.2026)

Geometri ve doğrulama `src/lib/overlays.ts`'te, Konva'dan bağımsız (testli).

- **Logo:** PNG/JPEG/WebP (SVG reddediliyor: dış kaynak çağırabilir, tuvali
  kirletebilir). Yüklenince uzun kenarı 600 px'e küçültülüp PNG veri URL'i olarak
  **tarayıcıda** (`localStorage`, `vitrin-ai:logo`) saklanıyor — hesaba kaydetmek R2
  isterdi. Veri URL'i aynı kökenden sayıldığı için tuval kirlenmiyor. Köşe, boyut
  (kısa kenarın %8-35'i) ve saydamlık ayarlanıyor.
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
