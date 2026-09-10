# Proje Yol Haritası — Mücevher Ürün Fotoğrafı AI Platformu

**Ekip:** 2 kurucu (görev bölüşümü aşağıda)
**Hedef platform sırası:** Önce web uygulaması (MVP) → Mobil uygulama (asıl uzun vadeli hedef)

> **Bu, projenin ikinci iterasyonudur.** Aynı iki kişi (Serhan, Kaan), aynı roller ve aynı ürün
> vizyonuyla kod tabanı sıfırdan yeniden yazılıyor. Aşağıdaki teknik kararlar ve gerçek ölçüm
> bulguları **önceki iterasyonda doğrulandı ve tekrar tartışılmayacak** — kod yeniden yazılsa
> bile bu kararlar geçerliliğini koruyor (aksi belirtilmedikçe). Faz durumları bu doküman için
> sıfırdan başlıyor; "önceki iterasyonda doğrulandı" notu olan bulgular referans olarak
> kullanılır, ama kodun kendisi henüz yazılmamıştır.

> **Güvenlik notu:** Güvenlik, Faz 7'ye ertelenen ayrı bir konu değildir — her fazın kendi
> güvenlik gereksinimleri o fazın açıklamasının altında listelenir. Kapsamlı katman katman
> güvenlik standartları (sunucu, ağ, veritabanı, dosya yükleme, ödeme/PCI, KVKK) için bkz.
> `SECURITY.md`.

## 1. Proje özeti

Kuyumcular için AI destekli bir araç. Bir ürün fotoğrafı (yüzük, kolye vb.) yüklenir, AI çok yüksek hassasiyetle ürün sınırlarını tespit eder ve arka planı kaldırır, geriye şeffaf arka plan üzerinde yalnızca ürün kalır. Kullanıcı ardından kesilmiş ürünü bize ait birçok özel arka plan tasarımından birinin üzerine yerleştirir ve serbestçe ölçeklendirebilir, döndürebilir, yeniden konumlandırabilir. Konsepti doğrulamak için önce web uygulaması inşa edilir; mobil uygulama asıl nihai hedeftir.

## 2. Kritik karar: Arka plan kaldırma için AI modeli

**Seçilen model: BiRefNet (ZhengPeng7'nin orijinal ağırlıkları) — kilitli karar, tekrar tartışılmayacak**

| Gereksinim | BiRefNet bunu nasıl karşılıyor |
| --- | --- |
| Ücretsiz | Evet — açık ağırlıklar, kendi sunucunda barındırırken görüntü başına API maliyeti yok |
| Ticari kullanıma izinli | Evet — kod ve orijinal ağırlıklar MIT lisanslı |
| İnce/yansıtıcı kenarlarda yüksek doğruluk | Evet — dikotom (iki değerli) görüntü segmentasyonu için tasarlanmış; saç, cam, ince zincirler ve diğer ince yapılarda güçlü, bu da mücevher fotoğrafçılığıyla örtüşüyor |
| Kendi sunucunda barındırılabilir | Evet — PyTorch modeli, daha hızlı inference için ONNX'e aktarılabilir |

**Kaçınılması gereken önemli lisans tuzağı:** BRIA tarafından yayınlanan "RMBG" ağırlıklarını KULLANMAYIN (BiRefNet mimarisini paylaşsalar bile) — bu spesifik ağırlıklar özel veriyle eğitilmiştir ve yalnızca ticari olmayan kullanım için lisanslıdır. Her zaman açık MIT lisanslı DIS5K veri setiyle eğitilmiş ve ticari kullanım için güvenli olan orijinal `ZhengPeng7/BiRefNet` ağırlıklarını yükleyin.

**Uygulama planı (bu iterasyonda tekrar edilecek adımlar):**
1. `rembg` Python kütüphanesiyle hızlıca prototip oluştur (BiRefNet'i backend olarak destekliyor).
2. `POST /api/remove-background` endpoint'ini yaz, gerçek mücevher fotoğraflarıyla (WhatsApp gibi sıkıştırmadan geçmemiş, doğrudan telefon çıkışı) doğrula.
3. `birefnet-general`'ı üretim modeli olarak kullan (aşağıdaki önceki iterasyon bulgularına göre zaten en iyi tercih olduğu doğrulanmış durumda — `birefnet-general-lite` ve `u2net` yeniden test edilmesine gerek yok, elenmiş durumdalar).
4. Tamamen otomatik segmentasyonun aşırı yansıtıcı/şeffaf taşlarda %100 mükemmel olmayabileceğini kabul et — manuel rötuş aracını MVP'yi bloklayan bir şey değil, daha sonraki bir optimizasyon kalemi olarak planla.

### Önceki iterasyondan taşınan bulgular (referans — kod yeniden yazılacak, ama bu ölçümleri tekrar keşfetmeye gerek yok)

**Bellek ve hız (üç ayrı ölçümle doğrulandı):**
- `birefnet-general-lite` (daha hafif varyant bile), tek bir CPU inference çağrısında 3.4 GB'ın üzerinde RAM kullandı ve 4 GB/1 çekirdekli bir makineyi OOM ile öldürdü. `u2net` 200 MB altında çalıştı ama kalitesi gerçek ürün kullanımı için yetersiz — ikisi de elendi.
- `birefnet-general` (üretim modeli), 16 GB RAM'li bir makinede 32 gerçek fotoğrafla test edildi: ortalama ~15sn/görüntü (10.7–21sn aralığı), ilk çağrıda ~6.9 GB, art arda çok sayıda görüntü işlendiğinde ~8.7 GB'a kadar tepe RAM.
- **Üçüncü ve en güncel ölçüm, çalışan servisin kendisi üzerinde yapıldı** (32 GB RAM'li makine, i7-12700KF): uvicorn süreci tek bir HEIC fotoğrafla **12.0 GB tepe RSS**'e çıktı; ilk istek (model belleğe yüklenirken) 34.3sn, sonraki istekler ~8.4sn sürdü.
- **Sonuç — deployment kararı için esas alınacak rakam: CPU inference için en az 12–14 GB RAM bütçelenmeli. 8 GB'lık bir sunucu bu modeli kaldırmaz.** Trafik arttıkça GPU serverless'a (Modal/RunPod) geçiş değerlendirilmeli.

**Kalite:**
- Gerçek mücevher fotoğraflarıyla (hem WhatsApp sıkıştırmalı düşük çözünürlük hem doğrudan iPhone HEIC tam çözünürlük — 3024x4032) test edildi: ince zincir halkaları, küçük taşlar, yansıtıcı yüzeyler temiz kenarlarla korunuyor. Yüksek çözünürlükte kenar bulanıklığı yok.
- Önceki iterasyonda "kalite düşük" algısı, modelin kendisinden değil, WhatsApp'ın uyguladığı agresif sıkıştırmadan kaynaklanıyordu — pipeline giriş/çıkış çözünürlüğünü birebir koruyor.

**Bilinen sınırlamalar (ürün kararı gerektirir, model hatası değil):**
- **Elde tutulan ürünlerde tutarsız davranış:** model bazen eli ürünle birlikte ön plan sayıp koruyor, bazen sadece ürünü bırakıp eli tamamen kaldırıyor — davranış öngörülemez. Kullanıcıya ürünü masa/kadife üzerinde, elsiz çekmesi önerilebilir; ya da ileride ayrı bir el tespiti + tutarlı maskeden çıkarma adımı eklenebilir.
- **Örtülme (occlusion):** parmak veya başka bir nesne tarafından fiziksel olarak kapatılan ürün kısımları çıktıda da eksik kalır — temel bir 2D segmentasyon kısıtı, kaynak fotoğrafta hiç görünmeyen piksel üretilemez. Çözüm modelde değil, çekim rehberliğinde.

Bu bulgular Faz 1'de tekrar doğrulanabilir (yeniden yazılan koda karşı hızlı bir sağlık kontrolü olarak faydalı olur) ama sıfırdan bir araştırma/karar süreci olarak ele alınmamalı — hedef zaten belli.

## 3. Teknoloji yığını

Aşağıdaki tüm satırlar önceki iterasyonda karara bağlandı ve doğrulandı; bu iterasyonda yeniden tartışılmayacak.

| Katman | Seçim | Gerekçe |
| --- | --- | --- |
| AI model sunumu | BiRefNet (`rembg` üzerinden, ONNX) | Bkz. bölüm 2 |
| Backend | Python + FastAPI | AI + backend'i tek dilde tutar, MVP için ayrı bir inference mikroservisinden kaçınır |
| Asenkron iş kuyruğu | Celery veya RQ + Redis | Görüntü işleme birkaç saniye sürebilir; istek thread'ini bloklamamalı |
| Veritabanı | PostgreSQL (production'da Supabase) | İlişkisel veri: kullanıcılar, krediler, arka plan meta verisi, işlemler. Supabase seçilince ayrı bir DB sağlayıcısına gerek kalmadı |
| Nesne depolama | Cloudflare R2 (S3 uyumlu) | Ürün fotoğrafları ve arka plan tasarımları; S3'e göre daha düşük çıkış (egress) maliyeti. Önceki iterasyonda gerçek hesaba karşı uçtan uca doğrulandı (yükleme → imzalı URL → indirme) |
| Frontend (web) | Next.js + TypeScript + Tailwind + shadcn/ui | Hızlı iterasyon, modern geliştirici deneyimi, admin paneli aynı uygulamada yaşayabilir |
| Canvas / kompozisyon editörü | Konva.js (react-konva) | React'te sürükle/ölçeklendir/döndür manipülasyonu için olgun kütüphane |
| Kimlik doğrulama | **Supabase Auth** | Sıfırdan auth inşa etmekten kaçınır; DB ile aynı sağlayıcıda toplanır. Clerk önceki iterasyonda değerlendirilip elendi. Oturum `@supabase/ssr` ile çerezde tutulur; **RLS zorunlu** (bkz. Faz 4 ve `SECURITY.md` 3.2) |
| Ödemeler / kredi sistemi | iyzico (birincil) | Türk pazarına güçlü uyum, iyi dokümantasyon, PayPal'a ait |
| CI/CD ve barındırma (MVP) | GitHub Actions + Railway/Fly.io | 2 kişilik ekip için düşük operasyonel yük |
| GPU inference (MVP sonrası ölçekleme) | Modal veya RunPod Serverless | Kullandıkça öde, boşta GPU maliyeti yok; MVP trafiği için CPU yeterli |
| Test | pytest (backend), Vitest (frontend), Playwright (E2E) | Standart, iyi desteklenen araçlar |
| Mobil (sonraki faz) | React Native + Expo | Web uygulamasıyla çoğu iş mantığını/API çağrısını paylaşır |

## 4. Yol haritası fazları

Bu faz dökümü çalışan bir plandır, sabit bir sözleşme değil — gerçek testler bir kısıt veya kapsamı değiştiren bir karar ortaya çıkardığında, ilgili fazı olduğu yerde güncelleyin, orijinal metni değişmez kabul etmek yerine. Bu, önceki iterasyonda birebir yaşandı (bellek bulgusu, el sınırlaması, Supabase kararı) ve doküman her seferinde güncellendi.

### Faz 0 — Kurulum ve planlama (ortak) — ✅ Tamamlandı

- Repository, dallanma (branching) stratejisi, `.env` yönetimi, yerel geliştirme için Docker Compose
- `CLAUDE.md` oluştur ve her adımda güncel tut
- Kodlama standardı: kod İngilizce, yorumlar sadece Türkçe (bkz. `CLAUDE.md`)
- Tüm push'lar gerçekleşmeden önce onay gerektirir; PR'lar birleştirilmeden önce incelenir

### Faz 1 — Temel AI motoru (Serhan liderliğinde) — ✅ Tamamlandı

- `POST /api/remove-background` endpoint'i: görüntü girer → segmentasyon → şeffaf PNG çıkar
- Content-type + dosya boyutu + **magic-byte doğrulaması** baştan itibaren eklenir (önceki iterasyonda sonradan yama olarak eklenmişti — bu sefer Faz 1'in bir parçası, bkz. `SECURITY.md` bölüm 4)
- Model olarak doğrudan `birefnet-general` kullan — `-lite` ve `u2net` önceki iterasyonda elendi, yeniden karşılaştırmaya gerek yok (bkz. bölüm 2)
- Gerçek mücevher fotoğraflarıyla (WhatsApp sıkıştırmasından geçmemiş, doğrudan telefon çıkışı) hızlı bir doğrulama yap — tam 32-fotoğraflık benchmark'ı tekrarlamaya gerek yok, önceki bulgular geçerli, ama yeniden yazılan kodun aynı sonucu verdiğini teyit et
- HEIC desteği baştan eklenir (`pillow-heif` + `register_heif_opener()`) — hedef kitle iPhone'dan çekiyor, önceki iterasyonda bu sonradan eklenmişti
- Docker'a al, root olmayan kullanıcıyla çalıştır (`SECURITY.md` bölüm 1.2), `.dockerignore` ekle
- **Çıktı:** CLI/Postman üzerinden test edilebilir çalışan bir segmentasyon API'si, gerçek fotoğraflarla doğrulanmış

### Faz 2 — Web frontend MVP (Kaan liderliğinde, Faz 1 ile paralel yürür) — ✅ Tamamlandı

- Next.js iskeleti, sürükle-bırak yükleme, istemci tarafı dosya doğrulaması (backend kısıtlarının aynısı), yüklenme durumu, önce/sonra karşılaştırması (dama deseni üzerinde, şeffaflığın görünmesi için), PNG indirme
- **Sunucu tarafı vekil kullan** (`/api/remove-background/route.ts` gibi) — tarayıcı FastAPI'ye doğrudan gitmesin; backend'de CORS yok ve ileride secret'ların tarayıcıya sızmaması gerekiyor
- **Demo (mock) modu ekle** (`USE_MOCK_BACKEND=true`) — BiRefNet 12-14 GB RAM istediği için frontend geliştirmesi backend'i ayakta tutmaya bağımlı olmamalı; sonuç ekranında açıkça "Demo modu" işaretlenir
- **Kilometre taşı 1:** Faz 1 + Faz 2 birlikte = ilk çalışan demo ("fotoğraf yükle → arka plan kaldırılsın")

**Sonuç (Kaan).** Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui (base-nova) iskeleti kuruldu;
sürükle-bırak yükleme, istemci tarafı doğrulama, bekleme ekranı, önce/sonra karşılaştırması ve
PNG indirme tamamlandı. Ayrıntılı gerekçeler `frontend/README.md` dosyasında.

**Frontend testleri eklendi (Vitest, 27 test).** Yığın tablosu Vitest'i listeliyordu ama Faz 2'nin
ilk turunda frontend'de hiç test yoktu — backend'de Faz 1'den altı test dosyası varken. Kapsam
bilinçli olarak saf mantık ve sunucu kodu: yükleme kısıtları ve arka plan kaldırma vekili.
Bileşen testleri ve Playwright E2E, yol haritasının koyduğu yerde (Faz 7) bırakıldı — arayüz hâlâ
hızla değişirken şimdi eklemek bakım yükü üretirdi. `@types/node` bu sırada 20'den 24'e çekildi;
makinede zaten Node 24 çalışıyordu ve Vitest 5 bunu şart koşuyor.

Bu fazda ortaya çıkan ve dokümana yazılmaya değer noktalar:

- **Backend'de `/health` endpoint'i yok.** Arayüzde "backend ayakta mı" göstergesi bu yüzden
  yapılmadı — uydurma bir gösterge yanlış bilgi verirdi. Servisin kapalı olduğu, ilk gerçek
  istekte açık bir hata mesajıyla anlaşılıyor ("Arka plan servisine ulaşılamadı"). Böyle bir
  gösterge istenirse backend'e küçük bir sağlık endpoint'i eklenmesi gerekir (Serhan).
- **Eşzamanlılık sınırı arayüze yansıtıldı.** Backend `MAX_CONCURRENT_INFERENCES=1` ile aynı anda
  tek inference'a izin veriyor ve kapasite dolunca 503 dönüyor. Bu bir hata değil geçici bir
  durum olduğu için ayrı ve açık bir mesajla gösteriliyor ("Sistem şu anda meşgul… birkaç saniye
  sonra tekrar deneyin") — genel hata metni kullanıcıya ne yapacağını söylemiyordu.
- **Dosya boyutu sınırı 20 MB** (`backend/app/core/config.py`); frontend sabitleri bununla elle
  senkron tutuluyor.
- **`create-next-app`'in ürettiği `.gitignore` `.env.example`'ı da yutuyordu** (`.env*` deseni,
  negasyon yok). Fark edilmeseydi yeni bir geliştirici hangi ortam değişkenlerine ihtiyaç
  olduğunu göremezdi — `!.env.example` eklendi. `CLAUDE.md` ders 12'nin aynı sınıftan bir
  tekrarı.
- **Next.js 16 varsayılan olarak `frontend/` altına `AGENTS.md` ve `CLAUDE.md` üretiyor.**
  Kök `CLAUDE.md` tek doğru kaynak olduğu için `next.config.ts` içinde `agentRules: false`
  ile kapatıldı; aksi halde iki CLAUDE.md kaçınılmaz olarak birbirinden ayrışırdı.

**Sol panel, geçmiş ve ayarlar (Kaan, kullanıcı isteği) — kısmen Faz 4'ten öne alındı.**
Kullanıcı, geçmiş çalışmaların ve ayarların görünür olduğu bir sol panel istedi. Panel, geçmiş
listesi (küçük önizleme + tek tıkla geri açma + tek tek silme) ve ayarlar (geçmiş kaydını
aç/kapat, hareketi azalt, tümünü sil) içeriyor.

**Dikkat — bilinçli geçici çözüm:** geçmiş şu anda **tarayıcıda** (IndexedDB) tutuluyor.
Bu fazın planında yoktu ve Faz 4 "proje geçmişi baştan sunucuda" diyor. Faz 4'ün şeması ve
RLS'i henüz olmadığı için tek seçenek tarayıcıydı. Riski sınırlamak için:

- Depo bir arayüzün arkasında (`frontend/src/lib/work-history.ts`); Faz 4'te yalnızca o
  dosyanın gövdesi sunucu çağrılarıyla değişecek, arayüzün geri kalanı aynı kalacak.
- Panelde kullanıcıya açıkça yazıyor: "yalnızca bu cihazda saklanıyor, hesap sistemi
  geldiğinde hesabınıza taşınacak."
- Yalnızca **sonuç** saklanıyor, özgün fotoğraf değil (özgün dosyalar 20 MB'a kadar
  çıkabiliyor ve yirmi kaydın özgünüyle birlikte saklanması tarayıcı kotasını doldurur).
  Bunun görünür sonucu: geçmişten açılan bir çalışmada önce/sonra karşılaştırması değil
  yalnızca sonuç gösteriliyor.
- En fazla 20 kayıt tutuluyor.

**Faz 4'te yapılacak:** `work-history.ts` sunucuya bağlanacak ve bu madde kapanacak. Var olan
tarayıcı kayıtlarının hesaba taşınıp taşınmayacağı ürün kararı — taşınmayacaksa kullanıcıya
önceden bildirilmeli.

**Gerçek ürün fotoğrafları ve sayfa ağırlığı (Kaan).** Açılıştaki üretilmiş yüzük yer tutucusu,
kullanıcının sağladığı gerçek bir ürün fotoğrafıyla değiştirildi (telifi bize ait). Tek kare
(2816×1536) ikiye bölünüp küçültülerek `atolye.webp` + `vitrin.webp` üretiliyor
(`frontend/scripts/prepare-photos.mjs`, `sharp` zaten Next.js ile kurulu).

Etiketler bilinçli olarak "Önce / Sonra" **değil**, "Atölyede / Vitrinde": sağdaki kare bu aracın
çıktısı değil, ayrı bir çekim. "Sonra" demek kullanıcıya o sonucu bu aracın ürettiğini söylemek
olurdu. İkisi birlikte ürünün **vaadini** anlatıyor; gerçek çıktı birkaç ekran aşağıda
kullanıcının kendi fotoğrafıyla görülüyor.

İki optimizasyon hatası bulunup düzeltildi:
- **Kaynak JPEG `public/` altındaydı**, yani 3,6 MB'lik ham dosya olduğu gibi *yayınlanıyordu* —
  Next.js `public/` altındaki her şeyi sunuyor ve dağıtıma dahil ediyor. `photo-source/` dizinine
  taşındı (sunulmuyor). Bkz. `SECURITY.md` bölüm 7.
- **Hedef genişlik 1400 px seçilmişti** ve atölye karesi 532 KB'a çıkmıştı; paneller ekranda
  ~384 CSS px kaplıyor. 900 px'e indirildi.

Ayrıca `tw-animate-css` kaldırıldı (sağladığı sınıfların hiçbiri kullanılmıyordu; sırf iskelet
üreticisi eklemişti).

**Ölçüldü — üretim derlemesi, ilk yükleme: toplam 342 KB** (JS 160 · font 131 · görsel 42 ·
CSS 9 · belge 9). Görseller `next/image` ile 384 px sürümlerine iniyor: 31 KB + 12 KB.

**Arayüz tasarım dili (Kaan, kullanıcı kararı).** Arayüz, kullanıcının referans olarak verdiği
**apple.com/tr** ürün sayfalarından uyarlandı: tam genişlikte dönüşümlü koyu/açık bölümler,
600 ağırlıklı ve negatif harf aralıklı büyük başlıklar, Apple'ın tipografi ölçeği (hero 64/68 px,
bölüm 48/52, gövde 17/21), 112 px dikey ritim, hap biçimli düğmeler ve kaydırınca ortaya çıkan
kısa `ease-out` geçişler. **Kopyalanan şey metin, görsel ya da font değil, ölçülebilir tasarım
dili** — SF Pro Apple'a ait ve lisanslı olduğu için Inter kullanıldı. Vurgu rengi Apple'ın mavisi
yerine altın: hedef kitle kuyumcu.

Yapısal fark: Apple'da ürün bir fotoğraf, bizde **çalışan aracın kendisi**. Bu yüzden araç
tanıtım bölümlerinin sonuna değil, açılıştan hemen sonraya konuldu. Ayrıntı ve ölçüm tablosu
için `frontend/README.md` → "Tasarım dili".

### Faz 3 — Arka plan kütüphanesi ve kompozisyon editörü — ✅ Tamamlandı

- Serhan: arka plan meta veri modeli (Postgres + Alembic), yükleme API'si (`POST /api/admin/backgrounds`, `GET /api/backgrounds`), R2 depolama entegrasyonu (boto3, S3-uyumlu, presigned URL — **public-read değil**)
- Kaan: Konva.js tabanlı editör — arka plan seç, kesilmiş ürünü sürükle/ölçekle/döndür, PNG/JPEG (2000×2000) olarak dışa aktar
- Bu en karmaşık frontend parçası — zamanı buna göre bütçelendir
- Depolama anahtarı sunucuda üretilen UUID'den gelmeli, orijinal dosya adından değil (path traversal koruması, `SECURITY.md` bölüm 4)
- Backend boş liste dönerse (henüz gerçek zemin yoksa) editör yer tutucu (placeholder) zeminlere sessizce düşmeli, hiç kırılmamalı
- Zemin görsellerinin R2'den gelen imzalı URL'leri süreli (örn. 1 saat) — editör uzun süre açık kalırsa yeniden fetch/refresh mekanizması gerekir (önceki iterasyonda bu atlanıp sessiz bir hata haline gelmişti, bu sefer baştan tasarlanmalı)

**Sonuç (Serhan) — backend kısmı tamamlandı.** `backgrounds` tablosu (Postgres) +
Alembic migration eklendi; `POST /api/admin/backgrounds` (dosya doğrulaması aynı
Faz 1 katmanlarından geçiyor, R2'ye UUID tabanlı `r2_key` ile yükleniyor, geçici bir
`X-Admin-Secret` paylaşılan secret header'ıyla korunuyor — bkz. kök `CLAUDE.md` ders 8
ve "Açık takip maddesi") ve `GET /api/backgrounds` (herkese açık, her kayıt için
süreli presigned URL ile döner) yazıldı. R2 depolama servisi (boto3, S3-uyumlu)
`backend/app/services/storage.py` içinde. Şema bilinçli olarak minimal tutuldu —
kategori/etiket alanı yok, MVP için gerek görülmedi; ihtiyaç ortaya çıkarsa ayrı bir
migration ile eklenir. **Gerçek bir Cloudflare R2 bucket'ına karşı uçtan uca elle
doğrulandı**: yükle (`POST /api/admin/backgrounds`) → listele (`GET /api/backgrounds`)
→ dönen presigned URL'den gerçek dosya indirildi ve piksel/boyut olarak yüklenen
görselle birebir eşleştiği doğrulandı. Test sırasında oluşan geçici nesneler ve DB
kaydı temizlendi. **Sonuç (Kaan) — kompozisyon editörü tamamlandı.** Kesim hazır olduktan sonra
aynı ekranda açılan Konva.js sahnesi: zemin seç, ürünü sürükle/ölçekle/döndür,
2000×2000 PNG veya JPEG olarak indir. Yol haritasının işaretlediği iki tuzak
baştan çözüldü:

- **Boş liste / backend yok.** `GET /api/backgrounds` vekili (`frontend/src/app/api/backgrounds/route.ts`)
  hiçbir koşulda 5xx dönmüyor; backend kapalıysa da 200 + boş liste dönüyor ve
  `X-Backgrounds-Source` başlığıyla verinin nereden geldiğini söylüyor. Editör
  tek bir yolu (boş liste) ele alıyor, iki ayrı hata dalını değil. Yer tutucu
  zeminler listeden hiç çıkmıyor, dolayısıyla "zemin listesi boş" diye bir durum
  hiç oluşmuyor. Yer tutucular dosya değil, kod içinde gradyan tanımı — kaynağı
  olmayan ikili dosya commit edilmiyor (bkz. kök `CLAUDE.md`).
- **İmzalı URL süresi.** Liste, backend'in `expires_in` alanına göre ömrünün
  %75'inde yenileniyor; hesap listedeki **en erken ölen** URL'e göre yapılıyor.
  Sekme uzun süre arka planda kalırsa zamanlayıcı kısılabildiği için
  `visibilitychange` ikinci bir tetikleyici. Seçili zemin nesneyle değil **id**
  ile tutuluyor; böylece yenileme kullanıcının seçimini sıfırlamıyor.

Doğrulama sırasında dört hata bulunup düzeltildi (dördüncüsü: stüdyo katmanı
site başlığıyla aynı `z-index`'teydi ve DOM'da ondan önce geldiği için üst 56
px'teki "Geri"/"Ana menü" düğmeleri görünüyor ama basılamıyordu — ders 13'ün
aynı sınıfı, eşitlikte kazananı sıra belirler); kesirli `pixelRatio` yüzünden
çıktının 2000 yerine 1999 px olması, ölçümün `ResizeObserver`'a bırakılması
(kare üretmeyen bir bağlamda hiç tetiklenmiyor) ve grid öğesinin `min-width: auto`
yüzünden kendi içeriğini ölçmesi. Üçü de kalıcı ders olarak `CLAUDE.md`'ye
eklenecek (PR #7 birleştikten sonra, ders numaraları çakışmasın diye).

Editörün arayüzü ayrıca cilalandı: seçim çerçevesi Konva'nın kalın varsayılanı
yerine 1 px kesikli altın çizgi + 9 px yuvarlak tutamak, döndürme 15° kademelerine
yakınsıyor, yan panelde boyut kaydıracı ile "Ortala" ve "15°" düğmeleri var.
Dönüşüm durumu sahnede değil editörde tutuluyor ki kontroller ile tuval aynı
veriyi paylaşsın.

**Öne alınan iş — kullanıcı kararı (09.09.2026).** Kaan, editöre ürün üzerinde
ton ayarları ve basit efektler istedi. Bu özellikler `ROADMAP.md`'de **hiçbir fazda
yoktu** (Faz 5 ödemeler, Faz 6 admin, Faz 7 test/optimizasyon, Faz 8 mobil) — yani
ertelenmiş değil, hiç planlanmamış yeni özelliklerdi. Kural 6 gereği önce uyarıldı;
Kaan isteği yineledi ve iş Faz 3'e alındı. Eklenenler:

- **Görünüm ayarları:** parlaklık, kontrast, doygunluk (Konva'nın kendi filtreleri,
  node `cache()`'lenerek), ürün altına gölge, zemine ışık havuzu
- **Ayrı çalışma alanı (stüdyo):** kompozisyon artık ana sayfanın içinde değil, tam
  ekran bir katmanda — solda tuval, sağda özellikler. Ayrı bir rota değil çünkü
  girdisi bellekteki bir `blob:` URL; rota değişimi bunu taşımak için IndexedDB ya
  da global bir depo gerektirirdi
- **İnceleme ekranı:** kesim hazır olduğunda önce/sonra sürgüsü (aynı pikselde
  karşılaştırma), kesim detayları (çözünürlük, format, süre) ve "Arka plan ekle"
  düğmesiyle stüdyoya geçiş
- **Bekleme ekranı:** bulanık önizleme üzerinde tarama ışığı ve gerçek aşama
  metinleri. Yüzde göstergesi bilinçli olarak YOK — backend ara ilerleme
  bildirmiyor, uydurma bir çubuk hiçbir şey göstermemekten kötü
- **"Vitrin AI" düğmesi:** özellik henüz yok, düğme açıkça "yakında" diyor ve
  basılınca ne yapacağını anlatıyor (ders 8 deseni)

Ayrıca kullanıcı isteğiyle ana sayfaya iki tanıtım bölümü eklendi (10.09.2026):
**uygulama turu** (yatay kayan, uygulamanın kendi arayüzünün DOM ile kurulmuş
dört ekranı — bitmap ekran görüntüsü değil, böylece arayüz değiştiğinde sessizce
eskimiyor) ve **misyon/vizyon**. İkisi de sunucu bileşeni, istemciye hiç inmiyor.
Kaydırmaya bağlı animasyon `animation-timeline: view()` ile, JavaScript'siz;
desteklemeyen tarayıcıda kartlar düz duruyor, hiçbir şey kaybolmuyor. Bu ekleme
`CLAUDE.md`'deki "araç açılıştan hemen sonra" kilitli kararını revize ediyor;
karar orada da kayıtlı.

Kullanıcının kendi zeminini yüklemesi ve dışa aktarma ölçü seçenekleri **eklenmedi**:
zemin yönetimi Faz 6'da, çıktı ölçüsü yol haritasında `2000×2000` olarak sayıyla
sabit.

**İkinci öne alınan iş — kullanıcı kararı (10.09.2026).** Ana sayfa dışında iki
sayfa eklendi ve bir özellik bilinçli olarak *yalnızca düğme* bırakıldı:

- **`/paketler`** — üç plan (Deneme / Atölye / Mağaza). **Fiyat yok**: ödeme
  sistemi Faz 5'te, buraya sayı yazmak karşılığı olmayan bir taahhüt olurdu.
  Paketlerin ne içereceği yazılı, fiyat "belirleniyor" olarak işaretli. Faz 5
  geldiğinde ödeme akışı bu sayfaya bağlanacak.
- **`/katalog`** — hazırlanan görselleri iki şablona (İkili vitrin, Kapak)
  yerleştirip A4 oranında (1240×1754, 150 dpi) PNG indirme. **Tamamen istemci
  tarafında**: backend'e, veritabanına ya da herhangi bir faza dokunmuyor,
  girdisini var olan çalışma geçmişinden (IndexedDB) veya dosya seçiminden
  alıyor. Bu yüzden projenin seyrini değiştirmiyor — kullanıcının şartı buydu.
  Önizleme ile çıktı **tek bir ölçü tablosundan** besleniyor; ikisi ayrı
  kodlansaydı kaçınılmaz olarak ayrışır ve "ekranda böyle görünmüyordu"
  sonucunu doğururdu.
- **Baskıya uygun (CMYK) dışa aktarma — GERÇEKTEN eklendi (10.09.2026).**
  Önce yalnızca düğme olarak konmuştu; sonra ölçüldü ve fazları etkilemeden
  yapılabileceği görüldü. Dönüşüm `sharp` (libvips + littleCMS) ile **Next'in
  kendi sunucusunda** yapılıyor (`/api/cmyk`); Python backend'ine, veritabanına
  ya da Serhan'ın tarafına hiç dokunmuyor.

  Doğrulandı: çıktı 4 kanallı, `cmyk` renk uzayında ve hedef baskı koşulunun
  ICC profili dosyaya gömülü — hem TIFF (matbaanın tercihi, LZW kayıpsız) hem
  JPEG. Saydam alanlar beyaza düzleştiriliyor; CMYK'nın alfa kanalı yok.

  **Ertelenmiş açık madde — sahibi: Kaan.** Profil yolu `CMYK_ICC_PATH` ile
  veriliyor ve varsayılanı yok. Profilsiz bir "CMYK" çevrimi matbaada yanlış
  renk verir, bunu sessizce yapmak özelliği hiç sunmamaktan kötüdür.
  Geliştirmede işletim sisteminin profili kullanılıyor; **üretime çıkmadan
  depoya serbest lisanslı bir profil konmalı** (örneğin ECI'nin
  `ISOcoated_v2_eci.icc`) ya da matbaanın kendi profili alınmalı. Bu iş
  mevcut fazdan çıkarıldı; Kaan'ın ayrı bir PR'ında, profil lisansı ve hedef
  baskı koşulu doğrulanarak tamamlanacak.

  **Kod standardı — Türkçe identifierlar İngilizceye taşındı (10.09.2026).**
  Kompozisyon editörü, katalog, zemin kaynağı ve stüdyo sözleşmesindeki
  değişken, tip, alan ve bileşen adları `CLAUDE.md` dil kuralına uyduruldu;
  kullanıcı metinleri ve Türkçe yorumlar değişmedi. İndirilen dosya adları
  kullanıcıya göründüğü için Türkçe kaldı (`fileSlug`: `yuzuk-kare.png`,
  `katalog-ikili.png`). `/katalog` rotası bir URL olduğu için değişmedi.

  **Dışa aktarma hatası artık sessiz değil (10.09.2026).** `toDataURL` hata
  atarsa sahne boyutu/ölçeği ve Transformer'lar `finally` ile geri yükleniyor
  ve kullanıcıya mesaj gösteriliyor. Gerçek tarayıcıda ölçülen tuzak: Konva
  "tainted" tuvalde hatayı fırlatmıyor, boş string döndürüyor — bu da hata
  sayılıyor. İkisi için de regression testi var.

  **R2 CORS — kısmen doğrulandı, sahibi: Serhan.** Sahte bir CORS'lu ve bir
  CORS'suz origin'le gerçek tarayıcıda smoke test yapıldı: kural varken
  2000×2000 çıktı zeminle birlikte doğru; kural yokken zemin sessizce
  gradyana düşüyor. Gerçek bucket'a karşı doğrulama R2 kimlik bilgileri
  olmadığı için yapılmadı; `backend/scripts/check_r2_cors.py` ve kural şablonu
  (`backend/README.md` → "R2 CORS") hazır. Production alan adı belirlenince
  tamamlanacak (bkz. `CLAUDE.md` açık takip maddesi 5).

**Çıktı boyutu seçenekleri eklendi (10.09.2026, kullanıcı isteği).** Stüdyo
artık dört biçim sunuyor: Kare 2000×2000, Katalog (A4 oranı) 1240×1754,
Instagram gönderi 1080×1080 ve hikâye 1080×1920. Yol haritası çıktıyı
`2000×2000` diye sabitlemişti; bu, o sayının **genişletilmesi** — kare biçim
varsayılan ve değişmedi. Sahnenin mantıksal ölçüsü her biçimde çıktının tam
yarısı tutuluyor ki dışa aktarma oranı tam 2 kalsın (kesirli oran bir piksel
kaybına yol açıyor, bkz. yukarıdaki 1999 px hatası).

Faz 3 bu iş parçasıyla tamamlandı.

**İnceleme düzeltmeleri (Kaan).** Backend birleştirildikten sonra yapılan
incelemede üç madde düzeltildi:

1. **Admin secret karşılaştırması non-ASCII secret'larda çalışmıyordu.** Starlette
   header baytlarını `latin-1` ile decode ediyor; karşılaştırmanın her iki tarafını
   `utf-8` ile encode etmek gelen baytları ikinci kez kodluyordu (double-encode) ve
   `ADMIN_SECRET` içinde Türkçe karakter varsa DOĞRU secret gönderildiğinde bile
   kalıcı 401 üretiyordu. Mevcut test yalnızca "500 değil 401" diye baktığı için
   bozuk sürüm de yeşil geçiyordu; doğru secret'ın 201 döndürdüğünü doğrulayan test
   eklendi. (PR #5'te GitHub Copilot incelemesinin yakaladığı bulgu.)
2. **`GET /api/backgrounds` artık `expires_in` alanı da dönüyor.** İmzalı URL'nin
   ömrü sunucuda `BACKGROUND_URL_EXPIRY_SECONDS` ile yapılandırılabiliyor; bu alan
   olmadan editörün tek seçeneği süreyi kendi tarafına sabitlemek olurdu ve sunucu
   ayarı değiştiğinde sessizce süresi dolmuş URL'lerle çalışırdı — yukarıdaki
   "sessiz hata" uyarısının tam olarak tarif ettiği durum.
3. **R2 ayarları eksikken artık açıkça hata veriliyor.** Boş `R2_ACCOUNT_ID` ile
   boto3 sessizce `https://.r2.cloudflarestorage.com` endpoint'i üretiyor ve
   "geçerli görünen ama çalışmayan" imzalı URL'ler dönüyordu; yanlış yapılandırma
   sunucuda değil kullanıcının tarayıcısında kırık görsel olarak ortaya çıkardı.
   (Copilot incelemesinin ikinci bulgusu.)

### Faz 4 — Veritabanı ve kullanıcı hesapları — 🔄 Sürüyor (Serhan'ın backend kodu yazıldı; Supabase projesi ve Kaan'ın arayüzü bekliyor)

- Serhan: Supabase projesi kurulumu, kullanıcı/proje şeması, **RLS politikaları** (tablo ile aynı migration'da — RLS'siz tablo asla oluşturulmaz), FastAPI'de Supabase JWT doğrulaması, CORS middleware'i
- **Not:** Faz 3'te oluşturulan `backgrounds` tablosunun henüz RLS politikası yok — Faz 3'te sadece yerel Postgres kullanıldığı için (Supabase henüz devrede değil) bu kabul edilebilirdi. Bu migration gerçek Supabase projesine karşı çalıştırıldığında, tablo `anon` anahtarıyla PostgREST üzerinden herkese açık hale gelir — bu yüzden `backgrounds` için de RLS politikası Faz 4'ün Supabase migration işinin bir parçası olarak eklenmeli (bkz. kök `CLAUDE.md` kural 7)
- Kaan: giriş/kayıt arayüzü, parola sıfırlama, kullanıcı paneli, proje geçmişi (sunucuda). **Not:** geçmiş, kullanıcı isteğiyle Faz 2'de geçici olarak tarayıcıya (IndexedDB) kondu — bkz. Faz 2 notları. Bu fazda `frontend/src/lib/work-history.ts` sunucuya bağlanacak ve geçici çözüm kalkacak; arayüzün geri kalanı değişmeyecek çünkü depo zaten bir arayüzün arkasında
- Oturum çerezde tutulur (`@supabase/ssr`), localStorage'da değil
- Middleware yetkilendirme sayılmaz — sadece yönlendirme kolaylığı; gerçek denetim RLS'te ve sunucu bileşenlerinde ikinci kez kontrol edilir
- Parola sıfırlamada kullanıcı numaralandırması engellenir, callback'te açık yönlendirme kapatılır

**Güvenlik gereksinimleri (bkz. `SECURITY.md` bölüm 3) — bu fazda ertelenemez, şema yanlış tasarlanırsa sonradan düzeltmek pahalıdır:**
- Şifreler asla plaintext saklanmaz — Supabase Auth kullanıldığı için hash'leme onların sorumluluğunda
- **RLS her tabloda açık olmalı** — `anon` anahtarı herkese açık, tabloyu koruyan tek şey RLS
- Her endpoint'te IDOR koruması: kaynağın gerçekten `current_user`'a ait olduğu DB seviyesinde doğrulanır
- Session/JWT tasarımı kısa ömürlü access + refresh token deseniyle yapılır
- CORS middleware'i bu fazda mutlaka eklenir

**Ara sonuç (Serhan, 10.09.2026) — backend kodu yazıldı, gerçek Supabase projesi
yok.** Dal: `feature/faz4-veritabani-hesaplar`. Ayrıntılar `backend/README.md` →
"Kimlik doğrulama ve yetkilendirme".

- **JWT doğrulaması:** Supabase access token'ı projenin JWKS'iyle (ES256/RS256)
  yerelde doğrulanıyor; `iss`, `aud=authenticated`, `role=authenticated`, süre ve
  imza kontrol ediliyor, anonim oturumlar reddediliyor. HS256 yalnızca açıkça
  verilen legacy secret'la. Algoritma karıştırma saldırısı (genel anahtarı HMAC
  secret'ı gibi kullanmak) için ayrı test var. `SUPABASE_URL` boşsa oturum
  gerektiren uç noktalar 503 döner — sessizce açık kalmaz.
- **Şema (migration 0003):** `projects` (geçmiş çalışmalar — `work-history.ts`'in
  `WorkRecord` alanlarıyla birebir) ve `admin_users`. `auth.users`'a
  `ON DELETE CASCADE` FK. Kullanıcıya göre listeleme, RLS ve cascade'i tek
  bileşik indeks karşılıyor.
- **RLS:** `public`'teki **her** tabloda açık — `backgrounds` (yukarıdaki not) ve
  gözden kaçabilecek `alembic_version` dahil. `anon`/`authenticated`'ın hiçbir
  tabloda yetkisi yok. `projects` için yalnızca "kendi satırını oku/sil"
  politikası var; INSERT/UPDATE politikası bilinçli olarak yok (istemci başka
  birinin R2 anahtarını kendi satırına yazıp imzalı URL'sini alabilirdi).
  Supabase 28.04.2026'dan beri yeni tabloları Data API'ye otomatik açmıyor, ama
  eski projelerin varsayılan grant'lerine karşı yine de açıkça geri alınıyor.
- **IDOR:** backend tablo sahibi olarak bağlandığı için RLS onu etkilemiyor;
  birinci katman her sorgudaki `user_id` filtresi. Başkasının projesi 404
  (403 değil — varlığını doğrulamamak için). Testlerin gerçekten iş gördüğü
  mutasyonla kanıtlandı: sahiplik filtresi sökülünce IDOR testleri kırmızı yandı.
- **Yerel uyumluluk (migration 0002):** düz Postgres'te Supabase'in `auth`
  şeması, `auth.uid()` ve rolleri yok; 0002 bunları yalnızca yoksa oluşturuyor,
  Supabase'de no-op. RLS politikaları böylece yerelde ve testlerde de sınanıyor.
- **Yönetici yetkisi:** Faz 3'teki geçici `X-Admin-Secret` (kök `CLAUDE.md` ders
  8) **kaldırıldı**; `POST /api/admin/backgrounds` artık Supabase oturumu +
  `admin_users` kaydı istiyor. JWT'deki `app_metadata` bilinçli olarak
  kullanılmadı (token yenilenene kadar bayat — yetkisi alınan yönetici token
  süresince yönetici kalırdı). `ROADMAP` Faz 6'daki admin paneli bu tabloyu
  kullanacak.
- **Projeler API'si:** `GET/POST /api/projects`, `GET/DELETE /api/projects/{id}`,
  `DELETE /api/projects` — `work-history.ts`'in dört fonksiyonuyla birebir.
  R2 anahtarı `projects/<user_id>/<uuid>/…`; kullanıcının dosya adı anahtara
  girmiyor. Görseller Faz 1 doğrulamasından (magic-byte + piksel) geçiyor.
- **CORS:** `CORSMiddleware`, `CORS_ALLOWED_ORIGINS` ile; `*` ve yollu değerler
  başlangıçta reddediliyor, `allow_credentials` kapalı.

**Bekleyenler (kullanıcı hesabı ya da kararı gerektiriyor):**
- Supabase projesinin kurulması, migration'ların uygulanması, ilk yöneticinin
  eklenmesi (adımlar kök `CLAUDE.md` açık takip maddesi 4'te).
- Ürün kararları: tarayıcıdaki eski kayıtlar hesaba taşınacak mı; sunucuda özgün
  fotoğraf da saklanacak mı; `POST /api/remove-background` oturum isteyecek mi
  (şu an bilinçli olarak herkese açık — kota Faz 5'e bağlanabilir).
- Kaan: giriş/kayıt arayüzü, vekilin `Authorization` başlığını iletmesi,
  `work-history.ts`'in `/api/projects`'e bağlanması.
- Bilinen sınır: kullanıcı silinince veritabanı kayıtları cascade ile gidiyor ama
  R2'deki proje görselleri gitmiyor (önek `projects/<user_id>/`, tek komutla
  silinebilir; otomatik temizlik yok).

### Faz 5 — Ödemeler ve kredi sistemi — ⏳ Planlanan

- Serhan: kredi modeli mantığı, iyzico entegrasyonu, webhook'lar, kullanım bazlı düşüm
- Kaan: satın alma akışı arayüzü, kredi bakiyesi gösterimi, fatura/geçmiş sayfası

**Güvenlik gereksinimleri (bkz. `SECURITY.md` bölüm 5):**
- Kredi kartı bilgisi hiçbir zaman kendi backend'imize dokunmaz; iyzico'nun hosted checkout/tokenization akışı kullanılır (PCI-DSS SAQ-A seviyesinde kalmak için)
- Webhook'lar HMAC imza doğrulamasından geçmeden işlenmez
- Webhook endpoint'i idempotent olmalı
- Kart bilgisi hiçbir log'a yazılmaz

### Faz 6 — Admin paneli — ⏳ Planlanan

- Serhan: admin API endpoint'leri (kullanıcılar, krediler, kullanım istatistikleri)
- Kaan: rol tabanlı `/admin` arayüzü, arka plan yükleme/yönetim paneli
- **Güvenlik gereksinimi:** `is_admin` rol kontrolü backend'de yapılır, frontend'de değil

### Faz 7 — Test, optimizasyon ve sağlamlaştırma — ⏳ Planlanan

- Backend: yük testi, model hız optimizasyonu (ONNX/TensorRT), hata izleme (Sentry)
- Frontend: E2E testleri, görüntü sıkıştırma/tembel (lazy) yükleme
- Ortak: güvenlik incelemesi, yükleme doğrulaması, hız sınırlama (rate limiting)
- Tam kontrol listesi için `SECURITY.md` bölüm 9'a bakın (rate limiting, CORS sıkılaştırma, dependency audit, KVKK metinleri, IDOR testleri, backup/restore testi)

### Faz 8 — Mobil uygulama ve kamera entegrasyonu — ⏳ Planlanan

- React Native + Expo'ya geçiş, web iş mantığını yeniden kullan
- Kamera entegrasyonu: telefondan doğrudan çekim, canlı önizleme
- Büyük bir faz — muhtemelen tek kişiye ait olmak yerine iki kişi arasında bölünecek

## 5. Görev bölüşümü gerekçesi

**Serhan — Backend, AI/ML, altyapı:** model seçimi/entegrasyonu, API geliştirme, veritabanı, ödemeler backend'i, admin API'leri, DevOps.

**Kaan — Frontend, ürün deneyimi:** web arayüzü, canvas editörü (en kritik UX parçası), kullanıcı akışları, admin arayüzü, sonrasında mobil arayüz.

Gerekçe: AI sunumu doğası gereği backend ağırlıklı, bu yüzden backend işiyle birlikte tutmak bağlam değiştirmeyi azaltır. Görsel manipülasyon ve kullanıcı deneyimi, uçtan uca tek kişi tarafından sahiplenildiğinde tutarlı kalır.

## 6. Sonraki adımlar

1. Yeni depoyu oluştur, `CLAUDE.md` + `ROADMAP.md` + `SECURITY.md` dosyalarını kök dizine koy
2. Faz 0'ı başlat: repo/branch stratejisi, `.env` yönetimi, Docker Compose
3. Faz 1 ve Faz 2'yi paralel yürüt (bölüm 4)
