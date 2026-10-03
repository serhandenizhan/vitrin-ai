# Ön yüz kararları: vitrin, tasarım dili, stüdyo düzeni

> **Bu belge ne:** kök `CLAUDE.md`'nin eski "Açılış vitrini", "Arayüz tasarım dili", "Araç yüzeyi" ve
> "Geçmiş çalışmalar" bölümleri, **birebir** buraya taşındı (02.10.2026). Bunlar KİLİTLİ kararlardır
> (yeniden tartışılmaz); `CLAUDE.md`'de özetleri durur. **Arayüz, stüdyo, ana sayfa ya da tasarım diline
> dokunmadan önce** okuyun. Ölçüm tabloları ve ayrıntı: `frontend/README.md`.

## Açılış vitrini ve ana sayfa düzeni (kilitli karar — 28–30.09.2026, Serhan)

Ana sayfanın ilk ekranı bir **vitrin**: alttan yükselen el + takı sahneleri (tek taş yüzük, kutulu yüzük, damla kolye, alyans çifti), aralarında sürükleyerek/oklarla/klavyeyle geçilir; **dikey tekerlek asla yakalanmaz** (10.09'da yatay galeri bu yüzden kaldırılmıştı). "Yakından inceleyin" ya da fotoğrafa tıklamak: el yüzüğü bırakıp aşağı iner ve solar, takı havada bir tam tur dönerek 3D olarak odağa gelir; kapanış bunun tersi. Yakınlaşmada ürün adı takının altında büyük harfle, sağ panelde yalnız zemin seçimi (kütüphaneden), kesim/özgün karşılaştırması ve "Kendi fotoğrafınızı deneyin".

**Kurallar:**
1. **Varlıklar betikle üretilir, elle değil.** Takı modelleri Blender başsız betikleriyle (`frontend/scripts/hero-3d/*.py`, meshopt `.glb`, macOS: `/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P …`). El fotoğrafları Serhan'ın **Gemini (Pro aboneliği) ile ürettiği** görsellerdir (`~/vitrin-ai-hero-kaynak/el/`, **depo dışında**; görünür Gemini filigranı zemin gibi BiRefNet ile kesildiği için gider, görünmez SynthID kalır). Hazırlık: `prepare-hero-scenes.py` (BiRefNet ürün bölgesine uygulanır, el katmanları, zemin tonu), `prepare-hero-backdrops.py` (kütüphaneden zemin kopyaları — R2'den yalnız okur), `prepare-showcase-composites.py` (katalog/bülten kareleri). Sonra `npm run hero:versions`. **El katmanı** yapay zekayla üretilmiş takısız elden `scripts/build-hero-hands.py` ile kurulur (kaynak `photo-source/hero-el/`, ayrıntı `frontend/README.md` → "Açılış vitrini"); `prepare-hero-scenes.py` çalıştırılırsa bu betik de yeniden çalıştırılır.
2. **Adresler içerik özetiyle sürümlüdür** (`heroAsset()`, `?v=<özet>`); sürüm dosyası eskiyse test kırmızı yanar. Next 16 sorgu dizeli yerel görseli ancak `images.localPatterns`'ta izin varsa kabul eder (yalnız `/hero/**`).
3. **Yakınlaşma kodu (three.js, ~307 KB) açılışta inmez**: `next/dynamic` + boş anda önceden indirme (veri tasarrufu/2G-3G'de atlanır); modeller ve HDRI yalnız yakınlaşmada iner. Telefonda `dpr ≤ 1.5` ve pırlantada 3 iç yansıma (masaüstü 5). "Hareketi azalt" ve WebGL yokluğunda animasyon yerine yumuşak geçiş/statik kesim.
4. **Model elde tutulan ürünü kesince eli korur ve halkanın İÇİNİ DOLDURUR** (bilinen sınırlama, aşağıda genişletildi). Bu yüzden model fotoğrafın **ürün bölgesine** uygulanır (`PRODUCT_REGIONS`), maske elle düzeltilmez. Yakın plan karşılaştırmasında **halka yüzükte parmakların örttüğü yerler elips oturtularak onarılır** (`RING_BAND_REPAIR`); bu ELLE yapılmış bir düzeltmedir, panelin metni bu yüzden kesimin "ham model çıktısı" olduğunu söylemez.
5. **Ürün adı için Archivo (geniş kesim) yazı tipi** yalnız yakınlaşmada, Serhan'ın isteğiyle eklendi (OFL; Inter kilitli kararı bozulmadı, `preload:false`).
6. **Uygulamanın adı artık "Vitrin"** (30.09.2026); "Vitrin AI" adı ileride gelecek bir özelliğe ayrıldı ("Sahneyi Vitrin AI kursun" düğmesi bilerek kaldı; **özellik Faz 7.2'de, canlıya çıkıştan önce yapılacak** — 02.10.2026, ayrıntı aşağıdaki "Vitrin AI" bölümü ve `ROADMAP.md` Faz 7.2). **Yasal metinlerde (KVKK/gizlilik/kullanım koşulları) ad da "Vitrin" yapıldı** (30.09.2026, Kaan'ın onayıyla; hukukçu kontrolü ayrıca sürüyor): yasal sürüm `2026-09-27` → `2026-09-30`, "Yürürlük" tarihi 30 Eylül 2026. **Yalnız yeni kayıtlar** yeni sürümü kabul eder (`terms_version` kayıtta yazılır, backend değeri doğrulamaz; mevcut kullanıcılardan yeniden onay İSTENMİYOR, bilinçli). **Tuzak:** "Yürürlük" tarihi üç sayfada ELLE yazılı; `lib/legal-texts.test.ts` sürüm-tarih uyumunu ve eski adın kalmadığını doğrular.
7. **Ana sayfa sırası** (koyu/açık dönüşümlü): vitrin → dene → **stüdyo turu** (canlı önizleme, kütüphane zeminleri) → **zeminler** (kategori sekmeleri, `home-gallery.json`, sayı katalogdan) → üç adım → ayrıntılar → **SSS** → teknik → **kapanış çağrısı**. "Tasarım yaklaşımımız" bölümü Apple'ı adıyla andığı için kaldırıldı.

## Arayüz tasarım dili (kilitli karar — Faz 2)

Web arayüzü, kullanıcının referans olarak verdiği **apple.com/tr** ürün sayfalarından uyarlandı. Bu bir stil tercihi değil, kullanıcının açık kararı — yeniden tartışılmayacak, yeni bölümler de aynı dile uyacak.

**Uyarlanan (ölçülebilir) şeyler:** tipografi ölçeği ve negatif harf aralığı (hero 64/68 px, bölüm 48/52, alt başlık 28/32, gövde 17/21), 600 ağırlıklı başlıklar, tam genişlikte dönüşümlü koyu/açık bölümler (`#000` / `#1d1d1f` / `#f5f5f7` / `#fff`), 112 px dikey ritim, hap biçimli düğmeler, kaydırınca opaklık + kayma ile ortaya çıkan kısa `ease-out` geçişler.

**Palet 10.09.2026'da sıcak nötrlere çekildi** (kullanıcı kararı: "daha ilgi çekici ve göz yormayacak tonlar"). Apple'ın nötr grileri (`#000` / `#1d1d1f` / `#f5f5f7` / `#fff`) yerine `#0c0b0a` / `#1a1917` / `#f6f4f1` / `#fdfcfb`, koyu zeminde metin `#f3f0eb`. İki gerekçe: saf siyah zeminde saf beyaz metin büyük alanlarda yorucu (karşıtlık ~%92'ye indirildi, WCAG AAA'nın hâlâ çok üzerinde), ve altın vurgu sarımsı-nötr bir zeminde uyum kuruyor — mavi eğilimli `#f5f5f7` üzerinde hafif yeşilimsi duruyordu. Ölçek, ritim ve tipografi değişmedi.

**Büyük başlıklarda nokta kullanılmaz** (kullanıcı kararı, 10.09.2026). `display-hero`, `display-section` ve `display-feature` sınıflarını taşıyan her başlık noktasız biter. Apple'ın kendi başlıkları nokta kullanır ama kullanıcı bu ayrıntıda ayrıştı; kural burada geçerli.

**Menüdeki her öğe ya bir yere götürür ya bir şey açar, ikisi karışık değil.** `Deneyin`, `Katalog` ve `Paketler` bağlantı; `Nasıl çalışır` ve `Hakkında` panel açıyor (`nav-panel.tsx`) ve yanlarındaki ok bunu önceden söylüyor. **Üst çubuk 11.09.2026'dan beri yüzen bir kapsül** (kullanıcı: "soluk ve eski moda"): kenarlardan 12 px içeride, sayfanın üstüne biniyor; sayfaların ilk bölümü bu payı `page-top` sınıfıyla geri alıyor (`.section-rhythm.page-top`, bkz. `globals.css`). Yeni bir sayfa eklenirken ilk bölüme `page-top` konmazsa başlık çubuğun altında kalır. Paneller de çubukla aynı genişlikte yüzen kartlar; telefonda bağlantılar "Menü" panelinde. Panel içerikleri aracı kullanmak için gerekli olmadığından sayfaya bölüm olarak konmuyor — konduklarında ziyaretçinin araca ulaşması her biri için bir ekran gecikiyordu.

**Uyarlanmayanlar — bilinçli:**
- **SF Pro kullanılmaz.** Apple'a ait ve lisanslı; yerine Inter (aynı sınıfta neo-grotesk).
- **Apple'ın metinleri, görselleri ve marka öğeleri kopyalanmaz.** Sayfadaki her cümle ve sayı projenin kendi gerçeğine dayanır.
- **Vurgu rengi Apple'ın mavisi (`#2997ff`) değil, altın.** Hedef kitle kuyumcu.

**Yapısal fark:** Apple'da ürün bir fotoğraftır, bizde **çalışan aracın kendisi**. Bu yüzden araç tanıtım bölümlerinin sonuna değil, açılıştan hemen sonraya konuldu.

**Bu karar 10.09.2026'da iki kez sınandı ve sonunda korundu.** Önce aracın üstüne iki tanıtım bölümü eklendi (uygulama turu + misyon/vizyon); aynı gün ikisi de kaldırıldı. Tur, yatay kaydırmalı galeri olarak kurulmuştu ve kullanıcı hem kaydırmanın masaüstünde iyi çalışmadığını hem görüntünün referans kaliteye ulaşmadığını söyledi; misyon/vizyon ise panele taşındı. **Sonuç: araç yine açılıştan hemen sonra.** Tanıtım metinleri panellerde, görsel örnekler ise aracın ALTINDA (`backgrounds-showcase.tsx`) — kullanıcı kendi fotoğrafını denedikten sonra "başka ne yapabilirim" sorusunun cevabı olarak.

**Uygulama:** yardımcı sınıflar `frontend/src/app/globals.css` içinde (`display-hero`, `display-section`, `display-feature`, `lede`, `fine-print`, `surface-*`, `section-rhythm`, `reveal`, `press`). Yüzey renkleri bilinçli olarak **sabit**, token değil — bir bölüm "koyu" işaretlendiğinde açık temada da koyu kalmalı, dönüşümlü ritim buna dayanıyor. Punto değerleri `clamp` ile akışkan; alt/üst sınırlar Apple'ın mobil/masaüstü değerleriyle aynı. Ayrıntı ve ölçüm tablosu: `frontend/README.md` → "Tasarım dili".

**Durum taşıyan tek istemci bileşeni `background-remover.tsx`;** tanıtım bölümlerinin hepsi sunucu bileşeni ve istemciye hiç inmiyor. Yeni bölüm eklenirken bu ayrım korunmalı. (İstisnalar: 13.09.2026 — açılıştaki önce/sonra kaydıracı `marketing/hero-before-after.tsx` küçük bir istemci parçası, çerçevesi `hero-visual.tsx` sunucu bileşeni olarak kaldı. 15.09.2026 — `/paketler`'de yalnız kart ızgarası ve satın alma formu (`billing-plans.tsx`) istemcide, çünkü fiyat/kota `GET /api/plans`ten geliyor ve satın alma etkileşimli; hero, karşılaştırma tablosu ve SSS sunucu bileşeni olarak kaldı. `/odeme/{id}` sayfasının içi (`checkout-page.tsx`) de durum yoklaması yaptığı için istemcide.)

**Yumuşak geçişler (13.09.2026, kullanıcı isteği: "tak diye açılıyor").** Bir ekran, pencere ya da katman belirirken `soft-enter` (hafif yükselip belirme) ya da `soft-fade` sınıfları kullanılıyor; tanımlar `globals.css`'in sonunda. Yalnızca giriş animasyonu, eğri sitenin geri kalanıyla aynı (`cubic-bezier(0.16, 1, 0.3, 1)`), "hareketi azalt" açıkken kapalı. Yeni bir koşullu ekran eklenirken aynı sınıflar kullanılmalı. **Doğrulama tuzağı:** gömülü tarayıcı paneli gizliyken kare üretilmediği için bu animasyonlar ilerlemez ve öğe görünmez kalır gibi ölçülür (ders 13); ölçmek için Web Animations API ile zaman ilerletilir.

## Araç yüzeyi — koyu tema ve camlı katmanlar (17.09.2026, Serhan)

Yukarıdaki tasarım dili **iptal edilmedi**; bu, onun yanında duran ayrı bir
yüzey türü. Kural: **stüdyo ve ona giden çalışma ekranları koyu, site açık.**

**Gerekçe:** stüdyo bir sayfa değil bir ARAÇ. Koyu zemin ürünün kendi rengini
doğru gösteriyor (beyaz panelin yanındaki altın, ürünün üzerindeki altını
yanıltıyordu) ve camlı yüzeyler tuvali tamamen örtmeden üzerinde durabiliyor.
**Yeni renk uydurulmadı:** zemin `surface-black` (`#0c0b0a`), cam
`surface-charcoal` %78 + `backdrop-filter`, metin `#f3f0eb` / `#a8a29a`, kenar
`--color-hairline`, vurgu yine altın.

**Kapsam:** stüdyo katmanı (`studio.tsx`), bekleme ekranı ve inceleme ekranı.
Yükleme adımı açık kalıyor — orası hâlâ tanıtım sayfasının parçası, ve karar
"çalışmanın ortasında beyazdan koyuya sıçrama olmasın" üzerineydi.

**Düzen kuralı (18.09.2026, Kaan — iPhone Fotoğraflar düzeni):** stüdyonun
bütün kontrolleri tuvalin altında: **ince bir bar** (solda ‹ geri, sonra
Boyut · Zemin | Yerleşim · Görünüm | Marka · İndir — adımlar ince ayraçla
gruplu, "Devam" yok) ve barın ÜSTÜNDE açılan **menü kartı**. Bar HİÇ
KIPIRDAMAZ: kart, sabit yükseklikli bir alanın altına hizalı açılır. **Geri
tuşu (solda) ARAÇLAR ARASINDA gezer** — bir önceki araca (Boyut ↔ Zemin),
Görünüm'de açık kaydıraçtan önce Görünüm menüsüne; kartı KAPATMAZ. **Küçült
tuşu (sağda)** kartı ve barı tek bir küçük hapa indirir ve **tuval o yeri
alarak büyür** — ikisi aynı eğriyle birlikte hareket eder
(`.stage-fit-collapsed`, `.dock-card-area`). Dört kez yinelendi, sebepleri
kalıcı ders: sağda ayrı kart → göz iki yere gidiyordu; içerik boyunda panel →
bar her araçta kayıyordu; sabit kalın panel → görsel bütünlük bozuldu; geri
tuşu kartı kapatıyordu → "geri" gezinmedir, kapatmak ayrı bir düğmedir. **Masaüstü AŞAMALI akış (19.09.2026, Kaan):** stüdyo
masaüstünde üç gerçek aşama: **1 Sahne** (sağda geniş zemin kütüphanesi +
biçimler, ✓ ile ilerler) → **2 Düzenle** (solda dik zemin barı, sağda
Yerleşim · Görünüm · Marka paneli, altta ‹ Sahne / ✓ Tamamla) → **3 Tamamla**
(yalnızca indirme seçenekleri, görselin altında, iki satır: üstte bütün
çıktı düğmeleri KAYDIRMASIZ, altta solda ‹ Düzenle, sağda "CMYK ne demek?").
**Koyu perde YALNIZCA stüdyo açılışında** (`stage-curtain.tsx`; solda logo,
"0N / 03" ve aşama adı; "hareketi azalt"ta yok). Aşamalar arası perde
19.09.2026'da kaldırıldı (Serhan: "her adımda yorucu"). **Aşama geçişi
20.09.2026'da seçildi** (`stage-transition.ts`): tarayıcının sahne geçişi
(View Transitions) + panellerin yandan kayması BİRLİKTE, 1,1 sn — tuval eski
yerinden yeni yerine/boyutuna tarayıcı tarafından taşınırken eski panel gidilen
yönün tersine çıkar, yeni panel o yönden girer. Panel kayması DOM'da değil,
`::view-transition-old/new(studio-panel|studio-rail)` üzerindedir; geçiş boyunca
ekranda tarayıcının anlık görüntüleri vardır. **İki tuzak:** (1) bir geçiş adına
aynı anda yalnız BİR öge sahip olabilir — Aşama 2'de zemin barı ve sağ panel
ekranda olduğu için adları ayrı, aynı ad "snapshot capture failed" ile geçişi
iptal ettiriyor; (2) tuvalin yeni ölçüsü, görüntü ALINMADAN önce yazılmalı —
`useStageSize` ölçümü `ResizeObserver`'a bırakılmayıp geçiş geri çağrısında
senkron yapılıyor. Firefox'ta geçiş yok, aşama anında değişir. Denenip elenenler:
yönlü DOM kayması, karartma, bulanıklık, büyüme, yükselme, perde, dönme, yaklaşma.
Tamamla barının genişliği içerikten (`w-fit`): üst satırdaki
çıktı düğmeleri belirler, alt satır onlara hizalı. Üst
bardaki adımlar masaüstünde yalnızca GERİYE tıklanır (`EditorStatus.mode`,
`navigateRef` — efektten state değiştirilmez); "Dışa Aktar" masaüstünde gizli.
Tuval her aşamada aynı DOM konumunda (Konva yeniden kurulmuyor). Aşama 2'de iki yan esnek ve EŞİT (`flex-1`, 17–26rem): solda ince DİK zemin barı, yuvarlak zeminler İKİ SIRA (`BackgroundRail`, yuvanın tuvale bakan kenarında), sağda panel — tuval üst barla aynı eksende kalır; panel kapanınca iki yan da 4,75rem'e iner. Aşama 2'de tuvalin altındaki künyede **Önizle**: basılı tutulunca (ya da **Boşluk** basılıyken) tutamaçlar gizlenir (`cleanView`); yazı alanlarında Boşluk normal çalışır. Ayrı önizleme aşaması yok, Aşama 3 zaten temiz görüntü. Telefon
şimdilik eski düzende (kullanıcı kararı). **Önceki masaüstü düzeni (aynı gün;
tasarım Claude'a bırakılmıştı):** zeminler bir araç değil, tuvalin altında **sabit,
ince bir bar** (kategori segmentleri + yuvarlak örnekler, **Favoriler**
rafı). Kalan araçlar (Boyut · Yerleşim · Görünüm · Marka · İndir) **sağdaki
tek kartta** (`Dock` `variant="side"`, `lg` ve üstü): üstte eşit sekmeli
segment kontrolü, altında yalnızca seçili aracın **gruplu listesi**
(`PANEL_GROUP` / `PANEL_ROW`, iOS Ayarlar dili) — kaydırma gerektirmemeli.
Altın yalnızca SEÇİLİ durumda. Tuval ve panel ekranın ortasında bir grup;
tuval sütununun genişliği biçimden türüyor (`.stage-column`), tuval payı
TEK kaynaktan (`--studio-reserved-lg`). Panel kapanınca `--panel-w` küçülür
ve tuval büyür. Üst bar, panel ve zemin barı aynı cam (`liquid-glass`);
arka plan `.studio-backdrop` (sıcak fildişi + ışık + ince doku). Telefonda
alt bar düzeni duruyor. **Yeni araç `STEP_TOOLS`'a eklenir, ikinci bir panel
açılmaz.** Masaüstü düzeninin testleri `matchMedia` taklidiyle
(`composition-editor.test.ts` → "masaüstü düzeni") — jsdom'da `matchMedia`
yok, taklit edilmezse testler yalnızca telefon düzenini sınar. Zemin seçimi kategori
sekmeleri + ADLARIYLA YATAY şerit; paneldeki bütün şeritlerde fare tekerleği
SAĞA/SOLA kaydırır (`use-horizontal-wheel.ts`) ve kaydırma çubuğu gizli.
Dikey ızgara denendi ve bırakıldı: kart büyüdü, adlar kayboldu, ikinci bir
kaydırma çubuğu çıktı. Yatay şeridin asıl kusuru tekerlekti, şerit değil.
Şeritlerin iki yanında cam oklar (`scroll-arrows.tsx`; yalnızca o yönde yer
varsa görünür). **Zeminler arası çapraz geçiş** (`editor-stage.tsx`, 0,42 sn):
eski zemin geçici bir Konva düğümü olarak altta kalır. **Kural:** tuvale
eklenen her animasyon dışa aktarmadan ÖNCE bitirilmeli — `renderStage`
`finishBackgroundFade`'i çağırıyor, yoksa dosyaya iki zeminin karışımı girer
(ders 23'ün "yanlış çıktı" sınıfı). **Zemin ekranda küçük kopyayla çizilir,
dosyaya tam çözünürlükle girer** (03.10.2026, `use-display-background.ts`):
`renderStage` `swapToExportBackground`'u da çağırıyor; çağrılmazsa indirilen
zemin bulanıklaşır (ölçüldü, piksellerin %73–82'si değişiyor). **Tek satırlık menüler (Zemin, Boyut)
ince kartla açılır** ve tuval aynı miktarda büyür (`.stage-fit-compact`);
kategori sekmeleri kartın başlık satırında. Seçim geçişleri tek bir uzun eğriyle
(`cubic-bezier(0.32, 0.72, 0, 1)`, 500–560 ms); seçili sekme/araç altında
cam mercek süzülür (`glass-lens.tsx`, ortak).
Yüzey **Liquid Glass, üstteki navbar'ın camıyla aynı kömür grisi**
(`.liquid-glass`, `globals.css`) — açık ve açık-gri denemeler beyaz çalışma
alanında ya kayboldu ya navbar'la iki ayrı malzeme gibi durdu. Liquid Glass
hissi tondan değil katmanlardan: parlak iç çizgi, ışık lekesi, köşede parlayan
kenar, kayan cam mercek ve "camdan büyüyen" geçişler. Yeni bir araç
eklenirken sağa ayrı bir kart açılmaz, `STEP_TOOLS`'a eklenir. Ayrıntı ve
ölçümler: `frontend/README.md` → "Stüdyo düzeni".

**Üç şey tarayıcıda ÖLÇÜLEREK bulundu, tahminle değil:**
1. `backdrop-filter`'ın kare maliyeti **yok** (16,67 ms / 16,66 ms).
2. Açılışta seçili zemin altın halkayı taşıyor ama **kaydırma alanının
   dışında** kalıyordu; artık görünür duruma kaydırılıyor.
3. Telefonda yapışkan tuval iki kez bozuldu: kısa bir kapsayıcı içinde
   yapışkanlık hiç çalışmıyor, ve yapışkan (konumlandırılmış) öğe statik
   kardeşlerinin üzerine boyanıp alttaki paneli örtüyor.

## Vitrin AI — kullanıcı akışı ve ekran kararları (Faz 7.2, PLANLI; 02.10.2026, Serhan + Claude)

> Henüz kod yok. Tam kapsam ve sunucu tarafı: `ROADMAP.md` Faz 7.2; kurallar: `docs/backend-kurallar.md`.
> Bu bölüm **ön yüzün uyacağı** kararlardır (ekran metinleri ve düzen Kaan'ın, sunucu davranışı Serhan'ın).
> Tasarım dili yukarıdaki kilitli dile uyar; araç yüzeyi koyu temadır, ama Vitrin AI **stüdyonun içinde
> değil**, ayrı bir sayfadır ("Stüdyoya yeni araç eklerken ikinci panel açılmaz" kuralı bu yüzden
> uygulanmaz: Vitrin AI bir stüdyo aracı değildir, elle ayar içermez).

- **Giriş:** kesim sonrası inceleme ekranındaki mevcut "Vitrin AI" düğmesi gerçek akışa bağlanır (bugün
  "yakında" der); menüde ayrı bir **Vitrin AI sayfası** (yeni fotoğraf yükle ya da Çalışmalarım'dan kesim
  seç). **Ücretsiz Deneme planında** düğme görünür ama kilitli ve "Vitrin AI ücretli planlarda" der; bu
  yalnız bilgidir, asıl red sunucudadır.
- **Sıra:** ürün türü (yüzük, kolye, küpe, bilezik, Diğer; **tek tık, yapay zekâ tahmin etmez**) → yalnız
  uygunsa **Kadın/Erkek** anahtarı (sahnede erkek karşılığı varsa) → sahne seçimi → üretim → sonuç. Tür
  listesi ve her türün sahneleri sunucudan gelir (kodda sabit değil); testi geçmemiş tür hiç görünmez.
- **Sahne seçimi:** her türde kalıcı sahneler (başlangıçta 3) önizleme görseliyle durur; **dönemsel sahne**
  varsa listenin başında **rozetle** ve bitiş tarihiyle görünür ("Yılbaşı · 5 Ocak'a kadar"), bitişte
  kendiliğinden kalkar. Kullanıcıya serbest metin kutusu verilmez (prompt sunucuda).
- **Üretim öncesi:** "1 kredi, 2 deneme" **yazılmaz**. Kredi düşeceği, krediye ait diğer her yerdeki gibi
  gösterilir. **İlk kullanımda** tam uyarı + onay kutusu; uyarı metni (Serhan'ın cümlesi, KİLİTLİ):
  *"Yapay zeka ürünü yeniden çizer. Taş, kesim ve ince ayrıntılar gerçek üründen farklı olabilir. Birebir
  ürün görseli için stüdyo çıktısını kullanmanızı öneririz."* Sonraki üretimlerde ön uyarı çıkmaz.
- **Bekleme:** sayfada bekleme ekranı (kesim bekleme ekranının dili: gerçek aşama metinleri, **yüzde
  yok**); kullanıcı ayrılabilir, iş arka planda sürer, sonuç Çalışmalarım'da bekler ve bildirim gider.
- **Sonuç ekranı:** görsel, indir düğmesinin yanında **kalıcı kısa not** ("Yapay zekâ ile çizildi, ürünle
  karşılaştırın"), köşede **"yapay zekâ ile oluşturuldu" etiketi (kullanıcı kapatabilir; kapatması sunucuya
  bildirilir)**, ve ilk üretim bitince **"Tekrar dene (ücretsiz)"** (bir kez). İkinci sonuç gelince **iki
  sonuç yan yana** gösterilir, kullanıcı birini seçer, seçilmeyen silinir; seçmeden ayrılırsa 7 gün
  sonra SON üretilen kalır (süre sunucuda).
- **İndirme:** logo/etiket, çoklu boyut ve WhatsApp'ta paylaş çalışır; **CMYK baskı seçeneği Vitrin AI
  görselinde yoktur** (baskı yalnız stüdyo çıktısından). Birebir ana görsel her zaman stüdyodan çıkar.
- **Dışarıdan görünmeyenler:** dosyadaki görünmez işaret ve üretim kaydı sunucu işidir; ön yüzde karşılığı yok.
- **Açık:** Deneme planı filigranı bugün "Vitrin AI" yazıyor (özellik adıyla karışabilir, karar bekliyor,
  `ROADMAP.md` Faz 7.2 açık iş 7); kalıcı sahne sayısı büyürse sahne listesi düzeni.

## Geçmiş çalışmalar — Faz 2'nin geçici çözümü Faz 4'te kapandı

Faz 2'de kullanıcı isteğiyle tarayıcıda (IndexedDB) tutulan geçmiş, Faz 4'te **sunucuya** taşındı: `frontend/src/lib/work-history.ts`'in yalnızca gövdesi değişti, fonksiyon adları aynı kaldı. Ürün kararları (Kaan, 12.09.2026): eski tarayıcı kayıtları hesaba **taşınmıyor** (eski IndexedDB deposu siliniyor), sunucuda yalnızca **sonuç** saklanıyor, **arka plan kaldırma giriş istiyor**. Ayrıntı: `ROADMAP.md` Faz 4, `frontend/README.md` → "Geçmiş sunucuda".
