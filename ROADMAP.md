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
| Asenkron iş kuyruğu | Celery veya RQ + Redis | Görüntü işleme birkaç saniye sürebilir; istek thread'ini bloklamamalı. Redis, Faz 4 kapanışında dağıtık yükleme hız sınırlaması için öne çekilip kuruldu (`docker-compose.yml`); Celery/RQ kuyruğunun kendisi henüz kurulmadı |
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

- **Backend'de `GET /api/health` eklendi** (`backend/app/api/routes/health.py`, `{"status": "ok"}`
  döner — diğer tüm uç noktalarla aynı `/api` öneki altında, tutarlılık için). Sadece süreç
  canlılığını doğrular — model ilk çağrıda gecikmeli yüklendiği için model durumunu kontrol
  etmiyor, aksi halde ilk sağlık kontrolü ~30-35sn sürerdi. `backend/Dockerfile`'a bu uç noktayı
  kullanan bir `HEALTHCHECK` eklendi (önceden yazılıp hiçbir yere bağlanmamıştı). Arayüzde bunu
  kullanan bir "backend ayakta mı" göstergesi henüz yok; servisin kapalı olduğu hâlâ ilk gerçek
  istekte açık bir hata mesajıyla anlaşılıyor ("Arka plan servisine ulaşılamadı").
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
  **Güncelleme (16.09.2026):** profil seçildi, ECI **PSO Coated v3** (FOGRA51,
  kuşe kâğıda ofset; ECI'nin güncel profili, `ISOcoated_v2` artık "eski
  sürümler"de). Lisans doğrulandı: profil gömülebilir ve paylaşılabilir ama
  ECI'nin yazılı izni olmadan **dağıtılamaz**; depo herkese açık olduğu için
  **depoya konmadı** (`*.icc` `.gitignore`'da), depo dışında durup
  `CMYK_ICC_PATH` ile veriliyor. Kalan: canlı sunucuya profilin konması
  (Vercel'de yerel yol okunamaz — kök `CLAUDE.md` açık takip maddesi 1).

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
  tamamlanacak (bkz. `CLAUDE.md` açık takip maddesi 2).

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

### Faz 4 — Veritabanı ve kullanıcı hesapları — ✅ Tamamlandı (13.09.2026; Serhan'ın backend'i ve Kaan'ın arayüzü tek PR'da, Kaan uçtan uca denedi)

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
- **Kod incelemesi (11.09.2026) — beş bulgu, her biri önce kırmızı yanan bir
  testle düzeltildi:**
  1. Test paketi `.env`'deki `DATABASE_URL` Supabase'i gösterirse gerçek
     kullanıcıları silerdi (her testten sonra `delete from auth.users`, sonda
     `downgrade base`) — sahte bir Supabase veritabanında birebir gösterildi.
     Artık `auth` şeması yerel katmanın işaretini taşımıyorsa oturum hiçbir
     şeye dokunmadan durduruluyor. PR #12 incelemesinden sonra (13.09.2026)
     bağlanmadan önce adres de kontrol ediliyor: sunucu yerel değilse
     (`VITRIN_ALLOW_REMOTE_TEST_DB=1` verilmedikçe) bağlantı hiç açılmıyor.
  2. JWKS anahtarları süresiz önbellekteydi; Supabase'de iptal edilen bir
     anahtar süreç yeniden başlatılana kadar geçerliydi. Artık en geç 10
     dakikada reddediliyor.
  3. Bilinmeyen `kid` her istekte JWKS'yi yeniden çektiriyordu (oturumsuz
     birinin Supabase'e istek yağdırabilmesi); artık en fazla dakikada bir.
  4. `duration_seconds=inf` kaydedilip kullanıcının proje listesini kalıcı
     500'e düşürüyordu; route ve veritabanı kısıtı artık sonlu değer istiyor.
  5. Silinmiş kullanıcının hâlâ geçerli token'ıyla yapılan kayıt 500 dönüp
     R2'de yetim görsel bırakıyordu; artık 401 ve görseller geri siliniyor.

**Supabase projesi kuruldu (Serhan, 11.09.2026).** Proje Kaan'ın hesabında
(`ilfemklwjmlofeacbdsr.supabase.co`), Serhan Owner rolüyle organizasyona eklendi.

- **JWT:** proje zaten asimetrik anahtarla (ES256, JWKS) geliyordu — Supabase'in
  01.05.2025 sonrası açılan projelerde varsayılanı bu; ayrı bir geçiş adımı
  gerekmedi.
- **Bağlantı:** Direct connection (`db.<ref>.supabase.co`) yalnızca IPv6 `AAAA`
  kaydı veriyor ve IPv6'sız ağda `getaddrinfo` hatasıyla bağlanamadı — **Session
  pooler**'a geçilerek çözüldü (IPv4 uyumlu, `aws-0-<bölge>.pooler.supabase.com`,
  port 5432; Transaction pooler kullanılmadı, asyncpg ile uyumsuz).
- **Migration:** `alembic upgrade head` ile üç migration da uygulandı; `public`
  şemasındaki dört tablonun (`projects`, `admin_users`, `backgrounds`,
  `alembic_version`) dördünde de RLS'in gerçekten açık olduğu
  `pg_class.relrowsecurity` sorgusuyla canlı projede doğrulandı.
- İlk yönetici eklendi, access token süresi 900 saniyeye (15 dk) çekildi.

**Kaan'ın arayüzü (12-13.09.2026) — tamamlandı, gerçek Supabase + R2 ile uçtan uca denendi.**
Dal: `feature/faz4-kaan-arayuz` (PR #12'nin dalı üzerine; tek PR'da birleşiyor).

- **Ürün kararları (Kaan):** tarayıcıdaki eski geçmiş hesaba taşınmıyor (eski IndexedDB
  deposu siliniyor); sunucuda yalnızca sonuç saklanıyor; **arka plan kaldırma giriş
  istiyor** (backend `get_current_user`, vekil oturumu gövdeyi okumadan önce kontrol
  ediyor, demo modunda da).
- **Supabase bağlantısı:** `@supabase/ssr` ile çerezde oturum, tarayıcı ve sunucu
  istemcileri, her istekte oturumu yenileyen `src/proxy.ts` (Next.js 16'da
  `middleware.ts`nin yeni adı; yetkilendirme sayılmaz), `/auth/callback` (PKCE kodu ve
  `token_hash`; `next` parametresi açık yönlendirmeye karşı yalnızca site içi yol kabul
  ediyor) ve geçersiz bağlantı sayfası.
- **Kayıt ve giriş:** iki adımlı kayıt — hesap (ad, soyad, e-posta, parola, parola tekrar)
  ve hesap türü (**bireysel / şirket**; şirkette şirket adı + işletme türü), şehir (81
  il), isteğe bağlı telefon, zorunlu kullanım koşulları + KVKK onayı, ayrı ve isteğe bağlı
  ticari e-posta izni. Doğum tarihi, cinsiyet, T.C. kimlik no, adres bilinçli olarak
  sorulmuyor (KVKK ölçülülük). Hesap türü `user_metadata.account_type`; ileride paketler
  buna göre ayrışacak. Şirket hesabında ekranda şirket adı, bireyselde kişinin adı
  görünüyor; girişte "Hoş geldiniz, …" bildirimi.
- **Parola:** en az 8 karakter, küçük + büyük harf + rakam + sembol (Supabase ayarıyla
  birebir — 14.09.2026'da düzeltildi, önceki sürüm sembolü unutmuştu, bkz. kök `CLAUDE.md`
  ders 19; yazarken canlı liste). Hata mesajları kullanıcı numaralandırmasına kapalı (yanlış parola
  ile kayıtsız e-posta aynı mesaj; kayıtlı adresle kayıt ve sıfırlamada da "e-postanızı
  kontrol edin").
- **Parola sıfırlama:** "Parolamı unuttum" → e-posta → `/auth/yeni-parola` (iki alan);
  başarıda diğer cihazlardaki oturumlar kapanıyor. Form yalnızca sıfırlama bağlantısından
  gelinmişse açılıyor (callback'in yazdığı 10 dakikalık `httpOnly` çerez); aksi hâlde oturumu
  açık bir bilgisayarda adresi yazan biri mevcut parolayı bilmeden parolayı değiştirebilirdi
  (Faz 4 son incelemesinde bulundu).
- **Geçmiş sunucuda:** `work-history.ts` → `/api/projects` vekilleri; sonuç görseli
  `/api/projects/[id]/result` ile aynı kökenden (tuval kirlenmiyor, R2 CORS gerekmiyor);
  liste kullanıcıya bağlı (çıkışta önceki kullanıcının listesi bir an bile görünmüyor);
  küçük resim adreslerinin süresi dolunca liste yenileniyor.
  Liste cursor tabanlı sayfalanıyor; ilk 100 kayıttan sonra kullanıcı "Daha eski
  çalışmaları yükle" ile devam ediyor, tek istekte sınırsız geçmiş çekilmiyor.
- **Hesap sayfası (`/hesap`):** profil bilgileri (hesap türü dahil), mevcut parolayla
  parola değiştirme, tüm cihazlardan çıkış, e-posta yazarak hesap silme. Silme backend'de
  (`DELETE /api/account`): önce kullanıcının R2 görselleri (`projects/<user_id>/`), sonra
  Supabase kullanıcısı (Admin API, `SUPABASE_SECRET_KEY`); yapılandırma eksikse hiçbir şey
  silinmiyor.
- **Metinler:** "kayıt gerekmiyor", "bu cihazda saklanır", "fotoğraflar saklanmaz" gibi
  artık doğru olmayan cümleler (ana sayfa, Paketler, Teknik bilgiler, Hakkında) düzeltildi.
- **Backend düzeltmesi:** `config.py` `.env`'yi çalışılan klasörden değil kendi
  konumundan buluyor (kök `CLAUDE.md` ders 18).
- **Testler:** frontend 72 → 203. Backend'e oturum, hesap silme, test veritabanı adres
  koruması, cursor, erken auth, hesap-değişimi ve hız sınırı testleri eklendi
  (160 → 201); tamamı izole yerel PostgreSQL üzerinde geçti.

**Faz 4 kapanış düzeltmeleri (14.09.2026):** hesap silmede yazılan e-posta artık
backend'de de doğrulanıyor; bekleyen sonuç/silme işlemleri başlatan kullanıcı
kimliğine bağlanıyor; upload endpoint'lerinde IP + doğrulanmış kullanıcı hız
sınırı ve multipart'tan önce JWT kontrolü var. Logo görseliyle beraber köşe,
boyut ve saydamlık da tarayıcıda kalıyor. KVKK/Gizlilik/Kullanım Koşulları ile
çekim rehberi sayfaları eklendi. Yasal bildirim/kabul sürümü sunucu zamanlı
`user_consents` tablosunda tutuluyor ve eski metadata kayıtları migration'da
backfill ediliyor.

**PR #13 inceleme takibi (14.09.2026) — dağıtık hız sınırlaması öne alındı.**
Kullanıcı onayıyla: yükleme hız sınırlayıcısı (yukarıdaki madde) `SECURITY.md`'de
Faz 7'ye bırakılmış "dağıtık (çok worker/instance) rate limiting" maddesiydi —
process içi bellekten Redis'e taşındı, artık birden fazla worker/instance aynı
sayacı paylaşıyor (bkz. `backend/app/services/rate_limit.py`,
`backend/README.md` "Kaynak tüketimi korumaları"). `docker-compose.yml`'e bu
amaçla Redis eklendi; asenkron iş kuyruğu (Celery/RQ) henüz kurulmadı, bu
Redis örneği şimdilik yalnızca hız sınırlaması için kullanılıyor. Dağıtık
davranışı doğrudan sınayan bir test eklendi (o gün 160 → 201 → **202**; güncel
sayı için kök `README.md`'ye bakın): iki ayrı
`RequestRateLimiter` nesnesi (iki ayrı worker'ı taklit eder) aynı Redis
anahtarını paylaşınca sınırın da paylaşıldığını doğruluyor — process içi eski
implementasyona karşı çalıştırılsaydı bu test kırmızı yanardı, çünkü iki ayrı
Python nesnesi birbirinden habersizdi.

**PR #13 birleştikten sonra bulunan üretim hatası — parola kuralına sembol
eklendi (14.09.2026).** Kullanıcı gerçek ortamda kayıt olamadı: checklist'in
tamamı yeşil görünüyordu ama Supabase `weak_password` ile reddediyordu.
Sebep: `frontend/src/lib/password-policy.ts`, Supabase Dashboard'ın parola
ayarının "küçük + büyük harf + rakam" olduğunu doğrulanmadan varsaymıştı;
canlı ayar aslında "...and symbols (recommended)" idi. İstemci kontrolüne
sembol kuralı eklendi, ilgili tüm dokümanlar ve testler (203 → **210**)
güncellendi. Bkz. kök `CLAUDE.md` ders 19.

**Bekleyenler (launch anına bağlı, Faz 7'ye taşındı — kullanıcı kararı
14.09.2026):** R2 CORS'a production alan adı eklenmesi ve production veri
sorumlusu/hukukçu onayı, ikisi de henüz gerçekleşmemiş dış girdilere
(alan adı, hukukçu) bağlı olduğu için Faz 7 "launch öncesi son kapı"
kontrol listesine taşındı — bkz. aşağıda Faz 7 ve kök `CLAUDE.md` açık
takip maddeleri 2-3.

**Kapatıldı (Faz 5, 14.09.2026):** Supabase'e özel SMTP sağlayıcısı olarak
Resend bağlandı; dahili e-posta servisi bir kayıt denemesinde e-postayı hiç
teslim etmemişti (kök CLAUDE.md açık takip maddesi 5). **Sandbox aşaması**
(hesap + API key + Supabase'e bağlama) 14.09.2026'da hesap sahibinin KENDİ
adresiyle test edildi — e-posta ulaştı, Resend Logs'ta kayıt görüldü.

**Düzeltme (17.09.2026): o test yanıltıcıydı, sandbox gerçekte HİÇBİR
harici kullanıcıya e-posta iletmiyor** — "spam'e düşüyor" değil, `onboarding@resend.dev`
Resend'in yalnızca hesap sahibinin kendi adresine teslimat yapan test alan
adı olduğu için Kaan'ın gerçek kayıt/parola sıfırlama denemesinde Resend
403, Supabase 500 döndü. Kök sebep ve geçici kilit açma çözümü kök
`CLAUDE.md` açık takip maddesi 5'te.

**Tam üretim aşaması** (alan adı doğrulama) ise R2 CORS gibi alan adına
bağlı — bu kısım Faz 7'nin launch listesine ekleniyor (bkz. kök
`CLAUDE.md` açık takip maddesi 5).

**Öne alınan iş — kullanıcı kararı (11.09.2026): Serhan'dan arayüz
güncellemeleri.** Faz 4'ün kapsamı dışında (kök `CLAUDE.md` kural 6 uyarısı
yapıldı, kullanıcı onayladı). Kaan o sırada çalışmadığı için çakışma yok; ayrı
dalda (`feature/ui-guncellemeleri`) yapılıp PR #12'ye eklendi.
- Üst çubuk yüzen kapsüle çevrildi, bulunulan sayfa işaretleniyor, telefonda menü paneli eklendi.
- Footer: marka, sayfa bağlantıları, KVKK/Gizlilik/Kullanım Koşulları ve çekim
  rehberi bağlantıları, sosyal medya simgeleri (adresler sonra eklenecek), telif satırı.
- HEIC önizlemesi tarayıcıda (`heic-to`, LGPL-3.0, yalnızca HEIC seçilince yükleniyor).
- Paketler sayfası yeniden düzenlendi, karşılaştırma tablosu eklendi.
- Açılış bölümü iki sütuna alındı, 1440×900'de tek ekrana sığıyor.
- Yapay zekâ ağzıyla yazılmış izlenimi veren metinler elden geçirildi; "Nasıl çalışır" panelinden model adı (BiRefNet) ve "ilk istek uzun sürer" notu çıkarıldı.
- ~~Hakkında panelinde ve teknik bilgilerde "fotoğraflar saklanmaz" metni~~ — geçmiş sunucuya bağlanınca güncellendi (13.09.2026).
- **İkinci tur (11.09.2026):** Katalog sayfası Paketler'in diliyle uyumlu hale getirildi (koyu, ışıklı bir açılış bölümü + `page-top`); şablon galerisindeki onizleme kartları artık boş değil, site zeminlerinden örnek görsellerle dolu (`catalog-editor.tsx` → `galleryPreviewSlots`) — özellikle koyu "Kapak" şablonu önceden düz bir siyah dikdörtgen gibi durup sayfayı eksik gösteriyordu. Kaydırınca beliren bölümlerin geçiş süresi biraz uzatıldı (0.7s → 0.85s, kullanıcı: "çok çok az arttıralım, smooth olsun") — yalnızca süre değişti, eğri ve mesafe aynı kaldı.

**Öne alınan iş — kullanıcı kararı (13.09.2026): öneriler 1-5 yapıldı.** Faz 4'ün
kapsamı dışında (kök `CLAUDE.md` kural 6 uyarısı yapıldı, kullanıcı onayladı). Fazlarda
karşılığı olmadığı için burada "öne alınan iş" olarak kayıtlı. Hepsi backend
gerektirmiyor; kullanıcı dördünü de denedi.

1. ✅ **Logo:** stüdyoda logo yükleniyor (PNG/JPEG/WebP; SVG reddediliyor), köşe, boyut
   ve saydamlık ayarlanıyor; tarayıcıda hatırlanıyor (hesaba kaydetmek R2 ister).
2. ✅ **Ürün etiketi:** ayar (8K-24K), gram, ürün kodu tek satırlık bir etiket; köşe ve
   koyu/açık görünüm seçiliyor, logoyla aynı köşeye konursa üst üste binmiyor.
3. ✅ **Hazır çıktı boyutları:** Instagram dikey 1080×1350 ve **Pazaryeri** (2000×2000;
   seçilince zemin düz beyaza geçiyor, başka zemin seçilirse uyarı). Kare ve hikâye zaten
   vardı.
4. ✅ **"WhatsApp'ta paylaş":** telefonda paylaşım menüsü görselin kendisiyle açılıyor;
   bilgisayarda WhatsApp Web'e dosya eklenemediği için görsel indiriliyor, WhatsApp Web
   açılıyor ve ne yapılacağı yazıyor. Logo ve etiket tüm çıktılarda.
5. ✅ **Açılışta etkileşimli önce/sonra:** açılıştaki iki sabit fotoğrafın yerine aracın
   gerçek kesimiyle sürüklenebilir karşılaştırma. Eski `showcase/kesim.webp` fotoğrafla
   aynı kadrajda olmadığı için yeni çift `scripts/prepare-before-after.py` ile üretildi;
   hizalama ölçüldü (ürün piksellerinde ortalama renk farkı ~2, 12 px kaydırınca ~25).

Aynı gün: sitenin genelinde yumuşak açılma geçişleri (`soft-enter` / `soft-fade`, kök
`CLAUDE.md` "Arayüz tasarım dili").

**Öneriler:**

6. ✅ **Çekim rehberi sayfası:** `/cekim-rehberi`, telefonla mücevher çekiminde
   zemin, yumuşak ışık, kadraj, elde tutmama, netlik ve özgün dosya önerileri.
7. **Ücretsiz planda filigran (11.09.2026, kullanıcı isteğiyle eklendi):** Deneme planında
   indirilen kesim/kompozisyona küçük bir "Vitrin AI" filigranı eklenir; ücretli planlarda
   filigransız iner. Hem ücretsiz kullanımı belli eder hem ücretli plana geçişi teşvik eder —
   ama filigran ürünün kendisini (ürün fotoğrafını) örtmemeli, yalnızca köşede durmalı.

### Faz 5 — Ödemeler ve kredi sistemi — Uygulandı; canlı açılış bekliyor (15.09.2026)

- Dönem snapshot'ları, atomik kota rezervasyonu, ücretsiz aylık yenileme ve son
  10 proje saklama sınırı; backend basic/full zemin yetkisi.
- Doğrulanmış iyzico plan sürümleri, tek checkout/trial rezervasyonu, V3 webhook,
  kayıp callback kurtarma, iptal/plan değişimi ve kalıcı provider kuyrukları.
- Tam iade, chargeback kanıtları, değişmez mali kayıtlar, hesap silmede provider
  iptali ve kimlikten ayrıştırılmış saklama; günlük ödeme/iptal/iade mutabakatı.
- `/paketler`, `/odeme/{id}` ve `/hesap` kredi/ödeme geçmişi arayüzleri.
- **PR #17 incelemesinden gelen düzeltmeler (15.09.2026):** zemin listesi
  kota/ödeme kapısından ayrıldı (hata artık listeyi boşaltmıyor, `basic`e
  düşüyor); istemcinin idempotency anahtarı iş oturumu başına ve belirsiz ağ
  hatasında korunuyor; `past_due` için 3 günlük erişim penceresi + "kartınızı
  güncelleyin" e-postası (ürün kararına dönüş); ödeme callback'i ve zemin
  listesi hız sınırına alındı; ters proxy arkasında gerçek istemci IP'si
  (`TRUSTED_PROXY_IPS`); ücretsiz planın son yayımlanmış sürümü DB kısıtıyla
  korunuyor; devam eden satın alma kullanıcı tarafından (fail-closed) iptal
  edilebiliyor; yalnızca sağlayıcının kesin "oluşmadı" sonucu oturumu kapatıyor,
  kanıt uyuşmazlığı alarm verip oturumu açık tutuyor. Gönderilemeyen
  `past_due` e-postası da başarılı sayılmıyor; retry/manual incelemeye kalıyor.
  Ayrıca: eski tahsilatın iadesi/itirazı güncel aboneliği
  kapatmıyor, DB silme koruması belirsiz initialization'ı da kapsıyor, hesap
  silme işi çökme sonrası PII temizliğini tamamlıyor, hesap silme vekilinde de
  Origin kontrolü var, `subscription_periods` DB seviyesinde değişmez, silme
  kuyruğundaki proje doğrudan GET'te de 404, ve arka plan kaldırmada gerçek
  idempotency sözleşmesi: başarılı sonuç 24 saat geçici R2 nesnesinde saklanıyor,
  aynı anahtar inference'ı hiç çalıştırmadan onu döndürüyor, kredi anahtar başına
  yalnızca bir kez tüketiliyor. Düzeltmeler `0005` yerinde değiştirilmeden yeni
  `0006_billing_review_fixes` migration'ında; test hem boş DB'den hem "`0005`
  uygulanmış DB" yolundan upgrade'i doğruluyor.
  Her bulgu için regresyon testi eklendi ve testler eski koda karşı
  çalıştırılıp kırmızı yandığı doğrulandı (ders 15). Son bağımsız
  incelemenin checkout fail-closed regresyonuyla backend 286, frontend 235.
- **Fix doğrulamasında bulunan ölü özellik (16.09.2026):** checkout iptalini
  fail-closed yapan düzeltme oturumu yalnızca `CheckoutAbsent` yakalandığında
  kapatıyordu, ama bu istisna üretim kodunda HİÇ fırlatılmıyordu (yalnız tanım,
  `except` ve testteki sahte `side_effect`). Sonuç: gerçek sağlayıcıyla iptal
  her koşulda 409 döner, yani 7. madde çözülmemiş kalır ve her deneme bir
  operatör alarmı üretirdi; yeşil test bunu gizliyordu (ders 22). `verify_checkout`
  artık kesin "oluşmadı" durumunu yanıtın yapısından türetip `CheckoutAbsent`
  fırlatıyor; testler sahte istisna yerine gerçek sağlayıcı gövdesi veriyor.
- **Tarayıcıda uçtan uca doğrulama (15.09.2026, yerel Postgres + gerçek Supabase
  Auth + gerçek R2):** giriş ve kredi göstergesi, arka plan kaldırmada tam bir
  kredi, bekleyen ödemenin iptalinde fail-closed (sağlayıcı yokken 503, token
  hiç alınamamışken 409; iki durumda da oturum `pending` kaldı), zemin listesinin
  askıdaki abonelikte boşalmaması ve `full` zeminin yalnız hak edene gelmesi.
  Tur iki hata yakaladı ve ikisi de düzeltildi: `/odeme/{id}`'de iptal hatası
  5 saniyelik durum yoklamasıyla aynı state'i paylaştığı için yazılır yazılmaz
  siliniyordu (ders 21); `/paketler` ise PR'ın ilk halinde 393 satırlık
  tasarımından düz bir listeye inmişti, geri getirildi (ders 20).
- **Açılış kapıları:** gerçek merchant sandbox/3DS testi, fiyatların yayını,
  hukuk/fatura/saklama süreçlerinin teyidi, systemd timer ve alarm izleme kurulumu.
  Checkout varsayılan kapalı. Ayrıntı: [ödeme runbook'u](docs/billing-runbook.md).
- **Öne alınan iş — zemin kütüphanesi (Kaan'ın onayı, 17.09.2026).** Zemin
  yükleme/yönetim paneli Faz 6'da (Kaan); ilk kütüphane panel olmadan yüklendi.
  Faz dışı olduğu önceden söylendi ve onaylandı (kural 6).
  - 93 zemin (bir kısmı Gemini/ChatGPT ile üretildi; görünür filigran yok) R2 +
    `backgrounds` tablosuna, hepsi `basic`, `backend/scripts/upload_backgrounds.py`
    ile. Aynı çözünürlükte JPEG %92 (225 MB → 75 MB) ve 480 px önizlemeler.
  - **Veritabanı yapısı değişmedi** (Kaan'ın kararı). Kategori ve baskı uyarısı
    `frontend/src/lib/background-catalog.ts`'te; Faz 6 paneli gelince tabloya
    taşınması değerlendirilmeli.
  - Stüdyoda 4 kategori sekmesi: Sade (41), Doku & desen (22), Doğal & çiçekli (16),
    Lüks & koyu (14). Düşük çözünürlüklü 4 ChatGPT zemininde CMYK indirmeden önce
    onay penceresi.
  - **PR #18 inceleme düzeltmeleri (17.09.2026, Codex incelemesi + bağımsız doğrulama):**
    - Backend testleri yerel Postgres + Redis ile çalıştırıldı: **299 test geçiyor**
      (yeni: önizleme yüklemesinin hata yolu, DB hatasında temizlik, Redis arızası,
      toplu yükleme betiği). Frontend **281 test**, lint ve `next build` de geçti.
    - Redis çökerse `GET /api/backgrounds`'ın 500 verip kütüphaneyi sessizce
      gradyanlara düşürmesi **kapatıldı**: zemin listelemenin hız sınırı artık
      fail-open (para/webhook yüzeyleri fail-closed kalıyor, `limits.py`). Ayrıca
      arayüz "kütüphane hazırlanıyor" ile "yüklenemedi"yi ayırıyor ve tekrar
      deneme sunuyor; geçici arızada eldeki liste silinmiyor.
    - Zemin yüklenemediğinde sahnenin ÖNCEKİ zemini süresiz göstermesi kapatıldı
      (CLAUDE.md ders 23) — kullanıcı seçtiğinden başka bir zeminle dosya
      indirebiliyordu.
    - Önizleme yüklemesi ya da DB yazma patladığında R2'de kalan yetim nesne
      temizleniyor (ders 25); betiğin yeniden çalıştırma güvenliği manifest
      yerine determinist kimliğe (UUIDv5) bağlandı (ders 24).
    - Ayrıca kopya logo akışı ortak hook'a alındı ve stüdyodan üç sorumluluk ayrı
      modüllere çıkarıldı (JSX'e dokunulmadan; `frontend/README.md`).
    - **Tarayıcı doğrulaması tamamlandı** (Playwright, gerçek oturum ve 93
      gerçek R2 zemini; 1440 ve 375 px). Doğrulananlar: editörün açılması ve
      sahne ölçümü (tuval 665×940, yani 240 başlangıç değerinin üstünde),
      kategori sayımları (Sade 46 / Doku 17 / Doğal 5 / Lüks 2 — A4 dikeyde
      yön süzmesi doğru), zemin geçişlerinde tuvalin değişmesi, üç adım,
      gölge ve yansıma (katman bazında ölçüldü), logonun sürüklenmesi
      (`position` yazılıyor) ve köşeden boyutlandırılması (`size` 0.18 → 0.29),
      indirme sonrası iki soru ("şablona eklemek ister misiniz" → "ana menüye
      dönmek ister misiniz"), telefonda gerçek dokunma olaylarıyla sürükleme,
      hiçbir turda konsol hatası olmaması. Katalog tarafında logo akışı
      (yükleme, çevirme, köşeler, kaldırma) ve `useLogoBox` geometrisi
      (dört köşe 0.04/0.78 × 0.028/0.908) ayrıca ölçüldü.
    - **Redis düzeltmesi canlı yığında kanıtlandı:** Redis durdurulduğunda
      düzeltmeli kod 93 zemini döndürüyor ve uyarı log'luyor; düzeltme
      geçici olarak geri alındığında backend 500, vekilden 0 zemin.
    - **R2 denetimi:** bucket DB'ye karşı tarandı (ana 94 / önizleme 93 /
      DB 93). Tek yetim nesne (`backgrounds/efde7ee1-….webp`, önizlemesi yok,
      uzantısı `.webp` olduğu için admin ucundan gelmiş) kullanıcı onayıyla
      silindi; sonuç 93/93. Ters yönde eksik yok (DB'de olup R2'de olmayan: 0).
    - **Yönetici hesabı** `admin_users` tablosuna eklendi (Serhan, 17.09.2026):
      UUID elle yazılmadan e-postadan seçen, tekrar çalıştırmaya güvenli
      `insert … on conflict do nothing` ile.
    - **Ölçüm tuzakları — üç kez yanlış alarm verildi ve üçü de ölçüm
      aracından çıktı** (ders 13'ün aynı sınıfı): (1) Konva her katman için
      ayrı `<canvas>` üretiyor, yalnızca ilkine bakmak gölge/yansımayı
      "çalışmıyor" gösteriyor; (2) `getClientRect()` zaten görüntü pikseli
      döndürüyor, bir kez daha sahne ölçeğiyle çarpmak logo tutamağını
      ıskalatıyor (tutamak ayrıca yalnızca logo SEÇİLİ iken çiziliyor);
      (3) JavaScript'in `/i` bayrağı Türkçe **İ** (U+0130) ile `i`'yi
      eşleştirmiyor, "İndirme işlemi başarıyla tamamlandı" metni aranan
      yerde duruyor olmasına rağmen bulunamıyor.
    - **İkinci inceleme turu (17.09.2026) — düzeltmelerin kendisi iki yeni
      high üretmişti, ikisi de doğrulanıp kapatıldı:**
      - `useLoadedImage` hata işaretini `onerror`'da koyuyor ama `onload`'da
        silmiyordu: geçici bir hatadan sonra o zemine geri dönen kullanıcı,
        imzalı URL yenilenene kadar zemini hiç göremiyordu. "Yanlış zemin"
        hatasının yerine "hiç zemin yok" hatası geçmişti.
      - Determinist kimlik yalnız dosya ADINA dayandığı için, başka bir
        partide aynı adı taşıyan farklı bir görsel var olan zeminin nesnesini
        sessizce ezebiliyordu (içerik 535 → 542 bayt değiştiği ölçüldü);
        kategori ve baskı uyarısı eski görsele ait kalıyordu. Rastgele UUID
        ile bu mümkün değildi, yani düzeltme yeni bir hata sınıfı açmıştı.
        Çözüm: `--batch` kalıcı parti ad alanı + kimlik zaten varsa içerik
        karşılaştırması (aynıysa yükleme tekrarlanmaz, farklıysa betik durur;
        bilinçli değiştirme için `--allow-overwrite`).
    - **Açık bırakılan (bilinçli):** Türkçe iç anahtarlar
      (`sade`/`doku`/`dogal`/`luks`, bülten ve katalog sekme değerleri) —
      kod incelemesi bunları dil kuralı ihlali olarak raporladı, kullanıcı
      17.09.2026'da bu hâliyle kabul etti, yeniden adlandırılmayacak.
- **Öne alınan iş — stüdyo ve katalog düzenlemeleri (Kaan'ın onayı, 17.09.2026).** Stüdyo
  ve katalog Faz 3'te bitmişti; faz dışı olduğu önceden söylendi ve onaylandı.
  - Stüdyo A4 ile açılıyor, "Kare 2000×2000" kaldırıldı; düzenleme üç adım (Boyut ve zemin →
    Ürün → Bitir); daha geniş, ortalanmış ve ekran yüksekliğine sığan tuval.
  - Zemin artık esnetilmiyor (ortadan kırparak kaplıyor). Fotoğraf/desenli zeminler biçimin
    yönüne göre listeleniyor (32 dikey, 61 yatay); Sade her biçimde. Sonuç: dikey biçimlerde
    "Lüks & koyu" yalnızca 2 zemin gösteriyor.
  - "Işık havuzu" yerine yansıma; gölge ölçülerek güçlendirildi (eski gölge koyu zeminde
    görünmüyordu).
  - Katalog: PNG yerine JPEG ve baskıya uygun CMYK (TIFF/JPEG), logo ekleme.
  - Hata düzeltmesi (Faz 4): sol panelden eski çalışma Paketler/Katalog sayfalarında açılmıyordu.
  - Sonraki turlar: indirme sonrası soru (ana menü / kataloğa aktar), katalogda "Tam sayfa" dahil
    6 şablon, sayfa ve metin rengi, sürükle/köşeden boyutlandır logo, logo renklerini çevirme;
    stüdyoda gölge kapalı başlıyor. Logo ve favicon elmaslı işaretle yenilendi.
- **Öne alınan iş — Bülten (Kaan'ın onayı, 17.09.2026).** Üst çubukta `/bulten`: görselli
  paylaşımlar (güncelleme notu, duyuru, yakında) ve gözden kaçabilecek özellikler. İçerik kodda
  (`frontend/src/lib/bulletin.ts`), veritabanına dokunmuyor. Altın kuru eklenip KALDIRILDI:
  ücretsiz ve izinsiz kullanılabilen resmi kaynak yok (TCMB ticari kullanım için yazılı izin,
  Harem ve Borsa İstanbul sözleşme istiyor). Kaan kuralı: lisans/ücret/izin isteyen kaynak eklenmez.

### Faz 6 — Admin paneli — 🔄 Sürüyor

- Serhan: admin API endpoint'leri (kullanıcılar, krediler, kullanım istatistikleri)

**Serhan'ın backend'i — PR 1 uygulandı (17.09.2026).** Dal
`feature/faz-6-admin-api`, migration `0007`. Kullanıcı onayıyla kapsam dört
madde genişletildi (zemin yönetimi uçları, denetim günlüğü, yönetici
ekleme/çıkarma, admin adına hesap silme); ilk üçü PR 2'ye kaldı.

- **Kredi modeli kararı — bonus krediler ayrı tabloda (`credit_grants`).**
  `subscription_periods.quota_snapshot`, `0006`'daki `period_snapshot`
  trigger'ıyla değişmez; dönem bir kanıt kaydı ve öyle kalıyor. Admin'in
  verdiği kredi dönemin DIŞINDA durur ve yalnız dönem kotası tükendiğinde
  harcanır. Erişimi kapalı (`suspended`/`expired`) bir aboneliği **diriltmez** —
  kredi bir erişim kapısı değil, bir bakiye. `usage_reservations.grant_id`
  kaynağı tutuyor: başarısız bir iş kredisini **alındığı** kovaya iade ediyor
  (aksi hâlde dönem sayacı olduğundan düşük kalır ve kullanıcı aynı dönemde bir
  kredi fazla kullanırdı).
- **`used_this_period`'i elle düşürmek bilinçli olarak EKLENMEDİ.** "Yanlış
  harcanan krediyi geri ver" ihtiyacı bonus kredi verilerek karşılanıyor; dönem
  sayacı gerçekte ne olduğunu anlatmaya devam ediyor ve düzeltmenin izi
  `credit_grants` + `admin_audit_log`'ta kalıyor.
- **`admin_audit_log` yalnızca eklemeye açık** (DB trigger'ı). `actor_id`'nin
  FK'si yok: kredi vermiş bir yöneticinin hesabı silinse de iz kalmalı.
  `credit_grants.granted_by` ise `ON DELETE SET NULL` olduğu için değişmezlik
  kuralından NULL yönüne muaf — yasaklansaydı o yöneticinin hesabı hiç
  silinemezdi (testler bu hatayı yakaladı).
- **PR #22 incelemesi (18.09.2026) düzeltmeleri:** yönetici hesapları
  panelden silinemiyor (`409 admin_target`), son yönetici kendi hesabını
  silemiyor; denetim satırı yalnız durumu değiştiren istekte yazılıyor
  (idempotent tekrar ikinci satır üretmiyor); `POST /api/support-requests`
  kullanıcı başına saatte 5 istekle sınırlandı (fail-open) ve
  `PATCH /api/projects/{id}` ile destek ucu testlendi.
- **Kullanıcı e-postaları Supabase'in yönetici API'sinden** okunuyor; `auth`
  şemasını doğrudan sorgulamama kararı (Faz 4) korundu.
- **Arama davranışı iki kez doğrulandı (17.09.2026): önce `supabase/auth`
  kaynağından, sonra canlı projeye karşı.** Ders 19 "muhtemelen böyledir"
  demeyi yasakladığı için varsayım yerine önce kaynak okundu, sonra Serhan
  `SUPABASE_SECRET_KEY`'i verince yalnızca okuma yapan bir çağrıyla ölçüldü.
  **Canlı ölçüm:** `filter='serhande'` 1 sonuç, `filter='SERHANDE'` 0 sonuç;
  `full_name` taşıyan kullanıcı 0. İki sürpriz:
  1. GoTrue'nun `filter`'ı e-postada `ILIKE` değil **`LIKE`** kullanıyor, yani
     büyük/küçük harfe duyarlı. E-postalar `strings.ToLower` ile saklandığı
     için sorgu artık bizden küçük harfe çevrilerek gidiyor — yoksa "Musteri"
     yazan yönetici hiçbir sonuç görmezdi.
  2. `filter`'ın ad dalı `raw_user_meta_data->>'full_name'` alanına bakıyor;
     bizim uygulamamız `first_name`/`last_name`/`business_name` yazıyor, yani
     **ada göre arama fiilen yok**. Bilinçli karar: dönen sayfayı adlara göre
     de süzmek EKLENMEDİ — aranan kişi başka sayfadaysa sessizce "sonuç yok"
     derdi. Arama e-posta ve tam kullanıcı kimliğiyle sınırlı, arayüz etiketi
     bunu söylemeli (Kaan).
  Dönen sayfa yine de sunucuda süzülüyor: barındırılan `auth` sürümü daha eski
  olup `filter`'ı yok sayarsa sonuç eksik olabilir ama yanlış olamaz.
- Testler: 25 yeni backend testi (toplam 324). `0006 uygulanmış DB → 0007`
  yolu ayrıca doğrulandı; kredi iadesinin doğru kovaya gittiğini sınayan test
  eski (bozuk) davranışa karşı çalıştırılıp kırmızı yandığı görüldü.
- Kaan: rol tabanlı `/admin` arayüzü, arka plan yükleme/yönetim paneli
  - **Arama kutusunun etiketi "E-posta ile ara" olmalı, "kullanıcı ara"
    değil.** Backend araması e-posta ve tam kullanıcı kimliğiyle sınırlı; ada
    göre arama bilinçli olarak Faz 7'ye ertelendi (gerekçesi orada).
    "Kullanıcı ara" yazıp ada göre çalışmaması, çalışmadığını söylemekten
    kötüdür — sonuç boş liste olarak döner, hata mesajı olarak değil.
- **Kaan — baskı (CMYK) profili işi buraya alındı (kullanıcı kararı,
  17.09.2026, PR #18 incelemesi sırasında).** PR #18'de kapsam dışı bırakıldı:
  ödeme/zemin düzeltmeleriyle ilgisi yok ve tamamı baskı alanına ait. Sahibi
  **Kaan** — PR #18'in yorumunda iş Serhan'dan istenmişti, sahiplik burada
  netleşiyor (kök `CLAUDE.md` açık takip maddesi 1 ile aynı sahip).
  - **Profil seçimi zaten kapalı:** ECI **PSO Coated v3** (16.09.2026, Kaan —
    kök `CLAUDE.md` açık takip maddesi 1). `ISOcoated_v2` yalnızca ECI'nin
    "eski sürümler" bölümünde duran önceki öneri; yeniden tartışılmaz. Burada
    kalan iş profili SEÇMEK değil, doğrulamak ve üretime koymak.
  - Profil dosyası depoya konmaz (lisansı gömmeye izin veriyor, dağıtmaya
    vermiyor; depo herkese açık). Sunucuya konup `CMYK_ICC_PATH` ayarlanır;
    Vercel kullanılacaksa dosyanın çalışma anında nereden alınacağına karar
    verilir (henüz yazılmadı).
  - Profil yerine konduktan sonra doğrulanacaklar: TIFF'in Acrobat/Photoshop
    preflight kontrolü, TAC'ın %300'ü aşmadığının teyidi, matbaadan prova,
    matbaanın gerçekten PSO Coated v3 istediğinin teyidi, gömülü profilin
    2,2 MB'lik boyutunun kabul edilip edilmeyeceği kararı ve 40 MP dönüşümün
    canlı sunucudaki süre/bellek yükünün ölçülmesi. (Renk doğruluğu şimdiye
    kadar yalnızca sayısal olarak kontrol edildi.)
  - **Zaten doğrulanmış olan (PR #18, 17.09.2026):** profil ayarlı değilken
    `POST /api/cmyk` doğru mesajla 503 dönüyor
    (`"Baskı profili yapılandırılmamış. Sunucuda CMYK_ICC_PATH ayarlanmalı."`).
    Route'un ikinci 503 dalı (yol geçersiz) da mevcut.
  - Faz 7'deki "launch öncesi son kapı" maddesi bu işin **üretime çıkmasını**
    bekletiyor; buradaki madde ise doğrulamaların Faz 6'da yapılacağını
    söylüyor. İkisi aynı işin iki aşaması, çelişki değil.
- **Güvenlik gereksinimi:** `is_admin` rol kontrolü backend'de yapılır, frontend'de değil

### Faza ait olmayan iş — stüdyo arayüzü yeniden düzenlendi (17.09.2026, Serhan)

Bir fazın kapsamında değil; Serhan'ın açık isteğiyle yapıldı (kural 6 gereği
önce söylendi). Stüdyonun sağındaki düz beyaz panel kaldırılıp yerine **koyu
araç yüzeyi + sağda yüzen denetçi + altta camlı dock** kondu; bekleme ve
inceleme ekranları da aynı yüzeye alındı. Tasarım dili iptal edilmedi, yanına
"araç yüzeyi" diye ayrı bir madde eklendi (kök `CLAUDE.md`).

Yeni: hazır görünüm ayarları (Doğal/Parlak/Sıcak/Net/Yumuşak). Kaydıraç elle
oynatılınca ön ayar işareti kalkıyor. Ayrıntı ve tarayıcıda alınan ölçümler:
`frontend/README.md` → "Stüdyo düzeni".

### Faz 7 — Test, optimizasyon ve sağlamlaştırma — ⏳ Planlanan

- Backend: yük testi, model hız optimizasyonu (ONNX/TensorRT), hata izleme (Sentry)
- Frontend: E2E testleri, görüntü sıkıştırma/tembel (lazy) yükleme
- Ortak: güvenlik incelemesi, yükleme doğrulaması, hız sınırlama (rate limiting)
- Tam kontrol listesi için `SECURITY.md` bölüm 9'a bakın (rate limiting, CORS sıkılaştırma, dependency audit, KVKK metinleri, IDOR testleri, backup/restore testi)
- **Admin panelinde ADA GÖRE arama — bilinçli olarak ertelendi (Serhan'ın
  sorusu üzerine karar, 17.09.2026).** Faz 6'da arama e-posta ve tam kullanıcı
  kimliğiyle sınırlı kaldı. Üç gerekçe:
  1. **Ölçülen kullanıcı sayısı 2** (canlı projede, ikisi de ekip). Arama
     kutusunun kendisi bile henüz bir sorunu çözmüyor; ada göre arama olmayan
     bir sorunun çözümü olurdu.
  2. **Her iki uygulama yolu da "sessizce eskiyen ikinci kopya" üretiyor.**
     GoTrue'nun `filter`'ı yalnız `email` ve `raw_user_meta_data->>'full_name'`
     alanlarına bakıyor; bizim profil anahtarlarımız `first_name` /
     `last_name` / `business_name`. Çalışması için ya `user_metadata`'ya bir de
     `full_name` yazılmalı (ad iki yerde durur, biri güncellenip diğeri
     kalırsa arama sessizce yanlışlanır) ya da ad kendi veritabanımıza
     kopyalanmalı (profil verisi iki sistemde, KVKK yüzeyi büyür, sayfalama
     melezleşir). İki kullanıcı için bu takas kötü.
  3. **Arayüz henüz yazılmadı.** Arama sözleşmesini kimse listeyi kullanmadan
     tasarlamak tahmin olurdu.
  **Geri dönüş koşulu:** gerçek müşteri sayısı listede gezmeyi zorlaştırdığında.
  O noktada doğru soru "ada göre arama ekleyelim mi" değil, **"profil verisi
  nerede yaşamalı"**dır (Supabase `user_metadata` mı, kendi veritabanımız mı);
  cevap ikincisiyse ada göre arama ikinci bir kopya gerektirmeden zaten gelir.
- **Launch öncesi son kapı, dış girdiye bağlı olduğu için buraya taşındı
  (kullanıcı kararı 14.09.2026):**
  - R2 CORS kuralına production alan adı eklenmesi (kök `CLAUDE.md` açık
    takip maddesi 2) — production alan adı belirlenince.
  - Production veri sorumlusu unvanı/başvuru e-postası ve hukukçu son
    kontrolü (kök `CLAUDE.md` açık takip maddesi 3) — hukukçu onayı
    verilince.
  - Baskı (CMYK) profili üretime konması (kök `CLAUDE.md` açık takip
    maddesi 1, Faz 3'ten kalma) — profil lisansı/matbaa koşulu doğrulanınca.
  - **Zemin görsellerinin kaynak ve lisans teyidi (ekip, PR #18'den).**
    93 zeminin bir kısmı Gemini ve ChatGPT ile üretildi; bu servislerin
    güncel **ticari kullanım** koşulları doğrulanmadı. Kalan **66 görselin
    kaynağı ve lisansı** da teyit edilmedi. Kaynağı belirsiz bir zemin
    yayına alınmaz: teyit edilemeyen görsel kütüphaneden çıkarılır
    (`backgrounds.is_active = false` yeterli, DB'den silmek gerekmez).
    Bu iş dış girdiye bağlı olduğu için launch kapısında.
  - **Hukukçuya sorulacak iki soru (PR #18'den, veri sorumlusu
    görüşmesiyle birlikte):** (1) ticari bir sitede HEIC/HEVC çözmek patent
    lisansı gerektiriyor mu — gerekiyorsa HEIC desteği kaldırılıp JPEG
    istenebilir; (2) yapay zekâyla üretilmiş zeminler ticari sitede
    kullanılabilir mi. Lisans tarafı ayrıca incelendi ve ücret/ayrı anlaşma
    isteyen bir kod kütüphanesi bulunmadı (npm ~685, Python 80 paket);
    açık olan yalnızca bu iki patent/kullanım sorusu.
  - Resend'de alan adı doğrulama (SPF/DKIM) ve gönderen adresinin kendi
    alan adına çevrilmesi — Faz 5'te yalnızca sandbox (kendi hesabına
    gönderim) kapatıldı; gerçek müşterilere e-posta ancak bu adımdan
    sonra gider. **17.09.2026'da doğrulandı: bu adımdan önce gerçek
    kullanıcıların hiçbiri e-posta alamıyor** (spam değil, sandbox'ın
    hesap sahibi dışına hiç göndermemesi) — bkz. kök `CLAUDE.md` açık
    takip maddesi 5.

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
