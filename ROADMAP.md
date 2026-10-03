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
  basılınca ne yapacağını anlatıyor (ders 8 deseni). **Kalkacağı faz: Faz 7.2**
  (Vitrin AI, 02.10.2026'da canlıya çıkıştan önceye alındı; düğme gerçek akışa bağlanır)

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
  (Vercel'de yerel yol okunamaz — `ROADMAP.md` bölüm 7, açık takip maddesi 1).

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
  tamamlanacak (bkz. `ROADMAP.md` bölüm 7, açık takip maddesi 2).

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

**Bekleyenler (launch anına bağlı, Faz 7'ye, 26.09.2026'da Faz 7.5'e taşındı — kullanıcı kararı
14.09.2026):** R2 CORS'a production alan adı eklenmesi ve production veri
sorumlusu/hukukçu onayı, ikisi de henüz gerçekleşmemiş dış girdilere
(alan adı, hukukçu) bağlı olduğu için Faz 7.5 "launch öncesi son kapı"
kontrol listesine taşındı — bkz. aşağıda Faz 7.5 ve `ROADMAP.md` bölüm 7, açık takip maddeleri 2-3.

**Kapatıldı (Faz 5, 14.09.2026):** Supabase'e özel SMTP sağlayıcısı olarak
Resend bağlandı; dahili e-posta servisi bir kayıt denemesinde e-postayı hiç
teslim etmemişti (`ROADMAP.md` bölüm 7, açık takip maddesi 5). **Sandbox aşaması**
(hesap + API key + Supabase'e bağlama) 14.09.2026'da hesap sahibinin KENDİ
adresiyle test edildi — e-posta ulaştı, Resend Logs'ta kayıt görüldü.

**Düzeltme (17.09.2026): o test yanıltıcıydı, sandbox gerçekte HİÇBİR
harici kullanıcıya e-posta iletmiyor** — "spam'e düşüyor" değil, `onboarding@resend.dev`
Resend'in yalnızca hesap sahibinin kendi adresine teslimat yapan test alan
adı olduğu için Kaan'ın gerçek kayıt/parola sıfırlama denemesinde Resend
403, Supabase 500 döndü. Kök sebep ve geçici kilit açma çözümü `ROADMAP.md` bölüm 7, açık takip maddesi 5'te.

**Tam üretim aşaması** (alan adı doğrulama) ise R2 CORS gibi alan adına
bağlı — bu kısım Faz 7.5'in launch listesine ekleniyor (bkz. `ROADMAP.md` bölüm 7, açık takip maddesi 5).

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
`docs/frontend-kararlar.md` \"Arayüz tasarım dili\").

**Öneriler:**

6. ✅ **Çekim rehberi sayfası:** `/cekim-rehberi`, telefonla mücevher çekiminde
   zemin, yumuşak ışık, kadraj, elde tutmama, netlik ve özgün dosya önerileri.
7. **Ücretsiz planda filigran (11.09.2026, kullanıcı isteğiyle eklendi):** Deneme planında
   indirilen kesim/kompozisyona küçük bir "Vitrin AI" filigranı eklenir; ücretli planlarda
   filigransız iner. Hem ücretsiz kullanımı belli eder hem ücretli plana geçişi teşvik eder —
   ama filigran ürünün kendisini (ürün fotoğrafını) örtmemeli, yalnızca köşede durmalı.
   **Ad notu (02.10.2026):** uygulamanın adı artık "Vitrin"; "Vitrin AI" adı Faz 7.2'deki
   özelliğe ayrıldı. Filigranın metni (şu an "Vitrin AI") özellik adıyla karışabilir; karar
   Faz 7.2'nin açık işlerinde (madde 7). **Karar (03.10.2026, Kaan + Serhan; PR #48
   yorumu):** filigran YAZI değil, sayfanın görünen bir yerinde **şeffaf Vitrin logosu**
   olacak; "Vitrin AI" adı yalnız Faz 7.2 özelliğinde kalır. Filigran henüz kodda yok
   (03.10.2026'da `frontend/src`'de arandı).

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
  **Canlı açılış kapısı olan zorunlu kabul testleri ve maliyet modeli**
  20.09.2026'da runbook'a taşındı (Faz 5 tasarım belgesi repodan çıkarılmıştı;
  o iki bölüm başka hiçbir dokümanda yoktu).
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
  - **Öne alınan iş — stüdyonun aşamalı akışı (Kaan'ın isteği, 19.09.2026).**
    Masaüstünde Sahne → Düzenle → Tamamla gerçek ekranlar ve geçiş perdesi
    (ayrıntı: `docs/frontend-kararlar.md` \"Araç yüzeyi\", `frontend/README.md` "Stüdyo düzeni").
    Telefon şimdilik eski düzende; aşamalı akışın telefona uyarlanması açık iş.
    - **1 Sahne:** sağda geniş zemin kütüphanesi + çıktı biçimleri, ✓ ile
      ilerler. **2 Düzenle:** solda dik zemin barı (yuvarlak zeminler iki
      sıra), sağda Yerleşim · Görünüm · Marka paneli, altta ‹ Sahne / ✓
      Tamamla. **3 Tamamla:** yalnız indirme seçenekleri, görselin altında.
    - Perde `stage-curtain.tsx` (solda logo, "0N / 03"; "hareketi azalt"
      açıkken yok) — 19.09.2026'dan beri YALNIZCA stüdyo açılışında (Serhan:
      aşamalar arası perde "her adımda yorucu"). Aşama geçişi 20.09.2026'da
      seçildi: tarayıcının sahne geçişi (View Transitions) + panellerin yandan
      kayması birlikte, 1,1 sn (`stage-transition.ts`; on aday denendi).
      Tuval her aşamada aynı DOM
      konumunda — Konva sahnesi yeniden kurulmuyor.
    - Üst bardaki adımlar masaüstünde yalnız GERİYE tıklanır (`navigateRef`;
      efektten state değiştirilmiyor).
    - **Önizle:** Aşama 2'de künye satırında; basılı tutunca ya da **Boşluk**
      basılıyken tutamaçlar gizleniyor (yazı alanlarında Boşluk normal).
    - **Görünüm'e üç yeni denetim:** gölge boyutu, gölge yoğunluğu ve yansıma
      mesafesi (`Appearance.shadowSize/shadowOpacity/reflectionGap`). Eski
      taslaklar `normalizeAppearance` ile varsayılanlara tamamlanıyor. Konva
      önbelleği bu değerler değişince de yeniden alınıyor (aynı `shadowEnabled`
      tuzağı).
    - **Düzen turları (19.09.2026, Kaan'ın ekran görüntüleriyle üç tur):**
      Aşama 1'de sağ panel tuvalle aynı dikey alanda (üstten `7vh` boşluk
      kaldırıldı); Aşama 2'de zemin barı yuvanın ortasında (ne tuvale yapışık
      ne en solda) ve satır yüksekliği `100dvh-5.25rem` + `pt-7` ile tuval
      yüzen üst bara değmiyor. Sağ panel kendi boyunda ve ortalı kaldı.
  - **Öne alınan iş — zemin favorileri (Kaan'ın onayı, 19.09.2026).** Kullanıcı
    beğendiği zemini zemin barındaki kalple işaretliyor, "Favoriler" rafı en başta
    çıkıyor. **Geçici çözüm:** yalnızca bu tarayıcıda (`localStorage`,
    `vitrin-ai:favorite-backgrounds`, `lib/favorite-backgrounds.ts`); başka
    cihazda görünmez. Hesaba bağlamak (tablo + RLS + API) ayrı bir iş, faz
    planlamasında ele alınacak. Faz dışı olduğu önceden söylendi ve onaylandı (kural 6).
  - **Öne alınan iş — stüdyo iyileştirmeleri (Kaan'ın onayı, 21.09.2026).** Faz 6'nın
    (yönetim paneli) kapsamı dışında; faz dışı olduğu önceden söylendi ve onaylandı
    (kural 6). Serhan'ın `feature/faz6-admin-studyo-ux-iyilestirmeleri` dalına eklendi.
    - **Otomatik kayıt:** editör ayarları (zemin, yerleşim, görünüm, etiket) her
      değişiklikten 1,5 sn sonra, stüdyo kapanırken ve sekme kapanırken (`keepalive`)
      kaydediliyor. Önceden yalnızca "Kaydet" ile gidiyordu; kazayla çıkan kullanıcı
      "Yarım kalan"da boş bir taslak buluyordu.
    - **Akıllı kılavuz:** ürün ve logo sürüklenirken sahne ortasına yapışıyor, pembe
      kılavuz çizgisi beliriyor (yalnız sürüklerken; çıktıya girmez).
    - **Sade ürün etiketi:** kutu/çerçeve kalktı, tek satır yazı + zıt gölge;
      "Açık yazı / Koyu yazı" tek seçici. "Ayar" listesi Windows'ta beyaz üstüne
      beyazdı (`color-scheme: dark`).
    - **Marka paneli sığıyor** (logo eylemleri ve etiket alanları tek satır);
      **Tamamla temiz görünüm** (tutamaçlar gizli, indirme sonrası da geri gelmiyor).
    - **Zemin önizleme:** fare kartın üzerindeyken tuval o zemini geçici gösteriyor;
      kayda ve çıktıya girmez, Tamamla'da ve dokunmatikte yok.
    - **"Önerilen" rafı:** kesimin ortalama rengine göre 6 zemin (açıklık farkı,
      nötr zemin artısı, aynı renk ailesi eksisi, neredeyse aynı renkler geriye).
      Zemin renkleri bir kez ölçülüp tarayıcıda saklanıyor; R2 CORS yoksa raf boş kalır.
    - **Birden fazla boyutta indirme:** Tamamla → "Birden fazla boyut". Görünmez
      ikinci `EditorStage` her biçimi mantıksal ölçüde çiziyor; yerleşim oranla
      taşınıyor (`mapTransformToStage`), Pazaryeri her zaman düz beyaz. Dosyalar
      sırayla iniyor (ZIP yok).
    - **Teşekkür kartı:** her indirmeden (PNG/JPEG/CMYK/çoklu) sonra logolu kart
      ve "ana menüye dön" sorusu.
    - **Yan çekmece gölgesi:** kapalıyken açık sayfalarda sol kenarda gri şerit
      bırakıyordu; gölge artık yalnız açıkken.
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

### Faz 6 — Admin paneli — ✅ Tamamlandı (19.09.2026; matbaa provası ve canlı sunucu ölçümü 26.09.2026'da Faz 7.5'e taşındı)

- Serhan: admin API endpoint'leri (kullanıcılar, krediler, kullanım istatistikleri)

**Serhan'ın backend'i — PR 1 uygulandı (17.09.2026).** Dal
`feature/faz-6-admin-api`, migration `0007`. Kullanıcı onayıyla kapsam dört
madde genişletildi (zemin yönetimi uçları, denetim günlüğü, yönetici
ekleme/çıkarma, admin adına hesap silme). Admin adına hesap silme PR 1'de
yapıldı; kalan üçü başlangıçta Serhan'ın "PR 2"sine planlanmıştı ama **PR 2
artık yok — üçü de başka yerde tamamlandı** (19.09.2026 itibarıyla):
- **Zemin yönetimi uçları** (`GET`/`PATCH`/`DELETE /api/admin/backgrounds`):
  Kaan, PR #25 (aşağıdaki "Zemin yönetim paneli" maddesi).
- **Denetim günlüğü:** YAZMA tarafı (`admin_audit_log` + her admin eyleminde
  satır) PR 1 ve PR #25'te; OKUMA tarafı (`GET /api/admin/audit` + panelde
  "Günlük" sekmesi) Faz 6 kapanış denetiminde eksik bulundu ve
  `feature/faz6-admin-studyo-ux-iyilestirmeleri` dalında eklendi (aşağıda).
- **Yönetici ekleme/çıkarma:** PR #25'in incelemesinde eksik bulundu (Codex) ve
  aynı PR'a eklendi: `POST`/`DELETE /api/admin/users/{id}/admin`, hedefin e-postası
doğrulanır (yanlış hesaba tıklanarak yapılamaz), son yönetici `409
last_admin` ile korunur, `admin_add`/`admin_remove` denetim satırları artık
gerçekten yazılıyor (önceden yalnızca `ACTIONS` listesinde tanımlıydılar,
kullanan bir uç yoktu). `admin_users`'a satır hâlâ **yalnızca** bu uçlar ya da
doğrudan veritabanı erişimiyle eklenebiliyor — kullanıcının kendini yönetici
yapabileceği bir yol yok (`app/models/admin_user.py`).

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
  - **`/admin` arayüzü — yapıldı (18.09.2026, Kaan).** Dal
    `feature/faz6-kaan-admin-arayuz` (PR #22'nin üstüne); Kaan'ın kararıyla
    main'e ara PR açılmıyor, **faz sonunda tek PR** (PR #22 main'e girdikten
    sonra dal main'e taşınarak — stacked PR yok, ders 17).
    - Backend: `GET /api/admin/me` (`{is_admin}`; 403 dönmez, yetkilendirme
      değil). Serhan'ın alanı — PR'da ayrıca belirtilecek. 3 test (iki rol,
      oturumsuz 401, geri alınan yetki anında `false`).
    - Vekiller (`app/api/admin/**`): kimlik UUID kontrolü, gövdeyi bilinen
      alanlarla yeniden kurma, geri dönüşü olmayan işlemlerde (kredi, geri
      alma, silme) Origin kontrolü — red ve kabul yolu ayrı test edildi,
      Origin kontrolü kaldırılınca testin kırmızı yandığı görüldü (ders 15).
    - Sayfa `/admin` (arama motorlarına kapalı), hesap menüsünde yalnız
      yöneticiye görünen "Yönetim paneli". Genel bakış (sayaçlar, günlük
      kesim/kayıt grafikleri, abonelikler, bonus krediler, gelir,
      operasyon), Kullanıcılar ("E-posta ile ara", sayfalama), kullanıcı
      ayrıntısı (bonus kredi ver/geri al, hesap silme — e-posta birebir
      yazılmadan düğme kapalı, yönetici hesabında hiç sunulmuyor).
    - Kredi formu idempotency anahtarı İŞİ tanımlar: hata sonrası tekrar
      denemede aynı anahtar, başarıdan sonra yeni anahtar (testli).
    - Arayüzdeki durum/tür etiketleri migration'daki CHECK kısıtlarından
      birebir alındı (ders 19); ilk taslakta tahminle yazılan `payment`
      gerçekte `charge`, `canceling` eksikti — ikisi de düzeltildi.
  - **Zemin yönetim paneli — yapıldı (19.09.2026, Kaan).** `/admin` →
    **Zeminler** sekmesi: yükleme (`POST /api/admin/backgrounds`, Faz 3'ten
    beri duran uç) ve kütüphane listesi. Backend'e yeni okuma ucu:
    `GET /api/admin/backgrounds` — kullanıcı ucundan iki farkı var, ikisi de
    bilinçli: pakete bakmıyor ve **pasif zeminleri de** döndürüyor (panelin
    işi, bir zeminin neden kullanıcıya gitmediğini gösterebilmek). Testi aynı
    veritabanında iki listeyi karşılaştırıyor, yoksa panel bir şey eklemiş
    olmazdı. Hız sınırı okuma ucu olduğu için fail-open.
    - **Güncelleme ve silme de eklendi (19.09.2026, Kaan'ın isteği).** İş
      Serhan'ın PR 2 kapsamındaydı; önce uyarıldı (kural 6), sonra her iki
      dalda da (`main`, `feature/faz-6-admin-api`) yazılmadığı doğrulanıp
      yapıldı — **PR'da Serhan'a ayrıca belirtilecek**.
      `PATCH /api/admin/backgrounds/{id}` paketi ve yayın durumunu,
      `DELETE` zemini kalıcı olarak değiştirir. Denetim eylemleri
      (`background_create`/`background_update`/`background_delete`)
      `admin_audit.ACTIONS` ile sınırlandırılır, migration gerekmez.
    - **Zeminlerin hepsi şimdilik `basic` kalıyor (Kaan'ın kararı,
      19.09.2026).** `full` seviyesinin karşılığı olan bir plan sürümü henüz
      yayımlanmadı (veritabanında yalnız Deneme v1 var, o da `basic`); bir
      zemini şimdi `full` yapmak onu yöneticiler dışında herkesten gizlerdi.
      Premium zemin ayrımı, ücretli plan sürümleri yayımlandığında ayarlanacak.
    - **Pasif, silinmiş değildir (Kaan'ın kararı):** bir zemini kütüphaneden
      çekmenin normal yolu pasife almak; satır ve dosyalar durur, istenince
      geri açılır. Silme geri alınamaz olduğu için arayüzde iki adımlı.
    - Kategori/baskı uyarısı panelde ayarlanmıyor; kaynak yine
      `frontend/src/lib/background-catalog.ts` (veritabanı yapısı bilinçli
      olarak değişmedi — Kaan, 17.09.2026).
    - Vekil (`app/api/admin/backgrounds/route.ts`) tür/boyut kontrolü yapıyor
      ve Windows'ta boş gelen `.heic` content-type'ını uzantıdan düzeltiyor
      (arka plan kaldırma vekiliyle aynı tuzak); testi eski bozuk koda karşı
      kırmızı yandı (ders 15).
  - **Hesap silme test hesabıyla denendi (19.09.2026, Kaan).** Panelden silme
    isteği → `deletion_requested_at`, kuyrukta `delete_account`, denetim
    günlüğünde TEK satır; worker çalıştırılınca Supabase Auth kullanıcısı
    gitti, `subscriptions.user_id` NULL oldu, denetim satırı okunabilir kaldı.
    **Silme EŞZAMANLI DEĞİL:** asıl işi `python -m app.services.billing.maintenance`
    yapıyor. Yerelde bu worker çalışmadığı için panel "işlem sırada" diyordu —
    canlıda periyodik çalıştırılmazsa hiçbir silme talebi tamamlanmaz
    (`ROADMAP.md` bölüm 7, açık takip maddesi).
  - **PR #25 → Serhan devralma listesi (19.09.2026):** açık ve Serhan'a
    atanmış tek yeni iş, production'da
    `python -m app.services.billing.maintenance` için tekil/periyodik bir
    çalıştırıcı kurmak, hata alarmını bağlamak ve gerçek bir kuyruk kaydının
    `succeeded` olduğunu doğrulamaktır. `GET /api/admin/me` ile zemin
    `PATCH`/`DELETE` uçları Serhan'ın alanı/PR 2 kapsamı diye işaretlenmiş olsa
    da PR #25'te Kaan tarafından tamamlandı; PR 2 bunları yeniden yazmayacak,
    yalnız dal çakışması kontrol edilecek. CMYK production profili Kaan'ın
    sorumluluğunda; tarayıcıdaki zemin favorilerini hesaba bağlama işi bu PR'da
    Serhan'a atanmış değildir.
  - **PR #25 bağımsız inceleme düzeltmeleri (19.09.2026):** zemin yükleme artık
    fail-closed admin hız sınırından geçiyor ve `background_create` audit izi
    yazıyor. Kayıtlı taslağın kullandığı zemin kalıcı silinemiyor (`409`, pasife
    alma öneriliyor); yeni taslaklarda `editor_state.backgroundId` aynı zamanda
    `projects.background_id` alanına yazılıyor. **27.09.2026'da değişti:**
    `/cso` incelemesi 409'un kötüye kullanılabildiğini gösterdi (herhangi bir
    kullanıcı bir zemini taslağına bağlayıp silinmesini engelleyebiliyordu);
    Serhan'ın kararıyla silme artık taslak bağlantısını temizleyip yapılıyor.
    (`background_id` sütununda yabancı anahtar kısıtı yok.) Genel bakıştaki açık bonus bakiye süresi dolmuş grant'leri
    dışlıyor; panelde mutasyondan önce başlamış liste cevabı yeni durumu artık
    geri alamıyor.
- **Faz 6 kapanış turu (19.09.2026, Serhan) — dal
  `feature/faz6-admin-studyo-ux-iyilestirmeleri`.**
  - **Denetim günlüğünü okuma (kapanış denetiminde bulunan eksik).**
    `GET /api/admin/audit` (yalnız okur, `require_admin`, hız sınırı okuma ucu
    olduğu için fail-open): en yeniden eskiye, `has_more` için bir satır fazla
    okunur (toplam sayılmaz), `action` yalnız `admin_audit.ACTIONS`'tan biri
    olabilir (aksi `422`). Eylemi yapanın e-postası Supabase yönetici
    API'sinden; okunamazsa `null`, sayfa yine gelir. Hesabı silinmiş
    yöneticinin satırı da listelenir (`actor_id`'nin FK'si yok). Panelde
    **Günlük** sekmesi: eylem türü süzgeci, "kim · ne yaptı · neye" cümlesi,
    Kullanıcılar sekmesiyle aynı sayfalama. Vekil bilinmeyen eylemi backend'e
    hiç göndermiyor. Üstte "Admin · Serhan | Kaan" anahtarı: tek bir
    yöneticinin kayıtlarını süzer (`?actor=`, sunucuda), anahtarda yalnız ad
    (`user_metadata.first_name`, yalnız gösterim) yazar. Günlük yalnız
    YÖNETİCİ eylemlerini tutar; kullanıcı işlemleri burada görünmez.
    6 backend + 5 frontend testi.
  - **Zeminler sekmesi:** stüdyodaki kategorilerle aynı süzgeç (Sade · Desen ·
    Doğal · Lüks) ve yayın süzgeci (Yayında / Yayında değil); kartlarda
    zeminin stüdyodaki adı ve kategorisi; bütün sayfada hover efektleri.
  - **Çalışmalar:** silme iki adımlı (kartın içinde "Bu çalışma silinsin mi?").
  - Stüdyo rötuşları (faz dışı değil, bu fazın stüdyo işinin devamı):
    zeminler kategori içinde düzden karmaşığa (`backend/scripts/rank_backgrounds.py`
    → `frontend/src/lib/background-order.ts`), aşamalar arası perde kaldırıldı
    (yalnız açılışta; aşama geçişi View Transitions + panel kayması olarak seçildi),
    adım düğmeleri gidilen adımın adını taşıyor, "Kısayollar" açılınca üst bar
    yazılarının kaybolması düzeltildi (kök `CLAUDE.md` ders 28).
  - **Faz 7'ye aday performans işi:** zemin değiştirirken takılma
    ölçüldü; Faz 7'de düzeltildi (03.10.2026, aşağıdaki Faz 7 maddesine bakın).
- **Kaan — baskı (CMYK) profili işi buraya alındı (kullanıcı kararı,
  17.09.2026, PR #18 incelemesi sırasında).** PR #18'de kapsam dışı bırakıldı:
  ödeme/zemin düzeltmeleriyle ilgisi yok ve tamamı baskı alanına ait. Sahibi
  **Kaan** — PR #18'in yorumunda iş Serhan'dan istenmişti, sahiplik burada
  netleşiyor (`ROADMAP.md` bölüm 7, açık takip maddesi 1 ile aynı sahip).
  - **Profil seçimi zaten kapalı:** ECI **PSO Coated v3** (16.09.2026, Kaan —
    `ROADMAP.md` bölüm 7, açık takip maddesi 1). `ISOcoated_v2` yalnızca ECI'nin
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
    canlı sunucudaki süre/bellek yükünün ölçülmesi. **18-19.09.2026: Kaan
    çıktıyı Photoshop'ta iki kez kontrol etti, CMYK olarak açılıyor —
    "matbaada bir sorun çıkmaz" (Kaan, 19.09.2026).** Kod tarafında iş
    kalmadı; fiziksel matbaa provası ve canlı sunucu ölçümü **Faz 7.5'e
    (canlıya çıkış) taşındı** (kullanıcı kararı, 26.09.2026) — ikisi de
    canlı sunucuya bağlı.
  - **Zaten doğrulanmış olan (PR #18, 17.09.2026):** profil ayarlı değilken
    `POST /api/cmyk` doğru mesajla 503 dönüyor
    (`"Baskı profili yapılandırılmamış. Sunucuda CMYK_ICC_PATH ayarlanmalı."`).
    Route'un ikinci 503 dalı (yol geçersiz) da mevcut.
  - Faz 7.5'teki "launch öncesi son kapı" maddesi bu işin **üretime çıkmasını**
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

**Kaan'ın incelemesi (18.09.2026, PR #22):** tarayıcıda bakıldı; genel
tasarım kabul edildi, üç değişiklikle (faz dışı iş olduğu söylendi, Kaan bu
PR'da yapılmasını onayladı — kural 6):
1. **Sağdaki denetçi kaldırıldı, iPhone Fotoğraflar düzeni:** bütün kontroller
   tuvalin altında tek panelde; altta araç çubuğu (adımlar ayraçla gruplu,
   "Devam" yok), üstünde seçili aracın ayarları; görünümde tek kaydıraç.
   Gerekçe: her değişiklik için sağa, sonra aşağıya gitmek gerekiyordu.
   İkinci tur: panel yüksekliği her araçta değiştiği için geri dönmek
   zorlaşıyordu → sabit yükseklik ve kenarda ‹ geri tuşu. Üçüncü tur: panel
   kalınlaştı, cam Apple'a benzemedi, zemin şeridi sağa kaydırma istiyordu →
   **ince bar (hiç kıpırdamaz) + üstünde açılan menü kartı**, açık (Apple
   tonunda) Liquid Glass ve "camdan büyüyen" geçişler, zemin için kategori
   sekmeleri + dikey ızgara. Dördüncü tur: geri tuşu kartı kapatıyordu →
   geri artık araçlar arasında gezer (Boyut ↔ Zemin); ayrı bir **küçült**
   düğmesi barı küçültür ve tuval o yeri alarak animasyonla büyür; cam
   temaya uygun gri tonda.
   Beşinci tur: cam hâlâ beyaz okunuyordu → ton, üstteki navbar'ın camıyla
   aynı kömür grisine çekildi (iki cam aynı malzeme ailesinden). Altıncı
   tur: dikey zemin ızgarası kartı büyütüp adları gizliyor ve ikinci bir
   kaydırma çubuğu çıkarıyordu → adlarıyla yatay şerit, fare tekerleği
   bütün şeritlerde sağa/sola kaydırır, kaydırma çubukları gizli. Yedinci
   tur: şeritlere sağ/sol cam oklar; zeminler arası çapraz geçiş (indirme
   geçişin ortasına denk gelirse geçiş önce bitiriliyor — dosyaya iki zeminin
   karışımı girmesin). Sekizinci tur: zemin adları kartta kesiliyordu → tek
   satır; Zemin/Boyut kartı inceldi ve tuval aynı oranda büyüdü; zemin ve
   kategori seçimleri tek uzun eğriyle, sekmeler arasında kayan cam mercek;
   Liquid Glass daha premium (ışık bandı, altın iç parıltı ve kenar).
2. **Çalışmalarım'da ürün adını değiştirme** (faz dışı — Faz 4 özelliği;
   önceden söylendi, Kaan bu PR'da yapılmasını onayladı): kartın başlığındaki
   kalemle yerinde düzenleme (Enter kaydeder, Escape vazgeçer).
   `PATCH /api/projects/{id}`'ye isteğe bağlı `file_name` eklendi; ad
   değiştirmek durumu ve indirme zamanını ellemez. Sahiplik, geçersiz ad ve
   başkasının çalışması için backend testleri; vekil ve arayüz testleri.
3. **Yeni sayfalara giriş animasyonu:** `/calismalar`, `/destek`, `/hesap` ve
   yasal sayfalar "tak diye" açılıyordu; diğer sayfalardaki `Reveal` deseni
   eklendi (çalışma sekmeleri ve stüdyo araç değişimi `soft-fade`).

İnceleme ayrıca bir hata buldu ve
düzeltildi: stüdyonun taslak kaydı her zaman `draft` gönderdiği için
**tamamlanmış (indirilmiş) bir çalışma** yeniden açılıp kaydedildiğinde ya da
aynı oturumda indirildikten sonra kaydedildiğinde "Yarım kalan"a düşüyor ve
indirme zamanı siliniyordu. Artık kayıt çalışmanın durumunu koruyor; backend
de `downloaded_at`'i yalnız ilk tamamlanmada yazıyor. Frontend ve backend
testleri eski koda karşı kırmızı yandı (ders 15). Aynı turda backend paketi
yerel Postgres ile çalıştırıldı: 350 geçti; kalan 2 kırmızı
(`test_billing.py` mutabakat testleri) `main`'de de aynı şekilde kırmızı,
yani bu PR'dan gelmiyor — Faz 5 alanında ayrıca bakılmalı (sahibi: Serhan).

### Faz 7 — Test, optimizasyon ve sağlamlaştırma — 🔄 Sürüyor (26.09.2026'da başladı)

- Backend: yük testi, model hız optimizasyonu (ONNX/TensorRT), hata izleme (Sentry)
- Frontend: E2E testleri, görüntü sıkıştırma/tembel (lazy) yükleme
  - **Faz 7 frontend maddeleri (30.09.2026, Kaan): ✅ tamamlandı** — E2E'nin kalanı (CMYK, WhatsApp, çoklu boyut, logo/etiket; 84 test; 02.10.2026'da kuyruk kartının 4 senaryosu eklendi, `playwright test --list` 108 test listeler), CI'a eklendi (zorunlu değil, hermetik), görsel bütçesi + tembel yükleme ölçüldü ve test altına alındı, bileşen testleri genişletildi. Ayrıntı `frontend/README.md` → "Faz 7 kapanış turu". Yasal metinlerde "Vitrin AI" → "Vitrin" ayrı bir PR'da yapıldı (`feature/yasal-metin-vitrin`, sürüm `2026-09-30`). Açık kalan: gerçek telefonda 3D ölçümü (Faz 7.5 ölçüm listesi madde 11). 01.10.2026'da `playwright test --list` 100 test listeler; CI'da 84 geçer, 16 bilerek atlanır (02.10.2026: kuyruk kartı için 4 senaryo × 2 proje = 8 test eklendi, atlanmaz: 108 listelenir) (proje başına koşan testler; ayrıntı `frontend/README.md` → "Faz 7 kapanış turu").
  - **E2E — ilk tur (30.09.2026, Kaan; kalan maddeler aynı gün kapandı, yukarıdaki satır):** Playwright kuruldu (`frontend/e2e/`, `npm run e2e`); girişsiz akışlar ve oturumlu akışlar (sahte oturum çerezi + taklit vekiller, gerçek Supabase'siz) masaüstü + 375 px'te sınanıyor. Stüdyonun aşama içi araçları (biçim/zemin, döndürme, gezinme, PNG/JPEG indirme, otomatik kayıt) da masaüstünde sınanıyor; bu testler bir hata buldu ve düzeltildi: sonuç kaydı bitmeden stüdyoya girilirse otomatik kayıt ve "tamamlandı" işareti hiç çalışmıyordu (`attachStudioWork`). **Bu turda açık görünen CMYK/WhatsApp/çoklu boyut indirme, logo/etiket ve CI'a ekleme sonradan yapıldı** (`e2e/cikti.spec.ts`, CI işi "Frontend E2E (Playwright)").
  - **E2E — Faz 7 kapanış turu (03.10.2026, Kaan; açık takip 12 madde 3).** Yeni
    dosyalar: `odeme.spec.ts` (paket seçimi → sözleşme onayı → `/odeme/{id}`,
    sahte saatle 5 sn'lik yoklamada "doğrulandı"; devam eden satın almada
    bağlantı; iptal hatasının yoklama turundan sonra da kalması — ders 21;
    iptal başarısı; süresi dolmuş oturum), `admin.spec.ts` (yönetici olmayana
    erişim uyarısı ve admin verisinin HİÇ istenmemesi; kullanıcı listesi,
    e-postayla arama, ayrıntı; bonus kredi ve hatadan sonra AYNI işlem
    anahtarı), `kesim-kuyrugu.spec.ts` (30 sn'yi aşan kuyrukta nötr cümle,
    hata ve sıra bilgisi yok, iş bitince sonuç), `katalog.spec.ts` (boş
    şablonda indirme kapalı; örnekle başlama, başlık; JPEG'in SOF başlığından
    okunan 1240×1754 ölçüsü; CMYK'ya PNG gitmesi, hata ve başarı),
    `hesap-silme.spec.ts` (e-posta onayı, 202 kabul mesajı, son yönetici 409,
    vazgeç), `vitrin-3d.spec.ts` (WebGL yokken tuvalsiz statik kesim ve açık
    panel; hareketi azalt'ta panelin 300 ms içinde açık olması, kapanışın
    anında olması). **Taklit biçimi (ders 22):** ödeme ve admin vekilleri
    başarılı yanıtı backend gövdesiyle AYNEN geçirir, hataları `{ error, code }`
    yapar; taklitler buna göre ve backend'deki gerçek mesaj/kodlarla yazıldı.
    Ortak taklitteki `/api/subscriptions/me` gövdesi backend'in hiç üretmediği
    bir biçimdeydi (`{ plan_id, status, remaining }`), gerçek biçime çevrildi.
    **Testlerin gücü (ders 15):** iptal hatasını yoklama state'ine yazan ve
    hatadan sonra yeni anahtar üreten iki mutasyon ayrı ayrı kırmızı yaktı;
    hareketi azalt testi animasyonlu kipte kırmızı yandı. Next'in sayfa
    duyurucusu her sayfada BOŞ bir `role="alert"` taşır; "uyarı yok" ölçümü
    yalnız içi dolu uyarıları sayar. Tam paket: 123 geçti, 19 atlandı (yalnız
    masaüstü/telefon), üretim derlemesinde.
- Ortak: güvenlik incelemesi, yükleme doğrulaması, hız sınırlama (rate limiting)
- Tam kontrol listesi için `SECURITY.md` bölüm 9'a bakın (rate limiting, CORS sıkılaştırma, dependency audit, KVKK metinleri, IDOR testleri, backup/restore testi)
- **Serhan'ın sırası (26.09.2026'da kararlaştırıldı):** (1) bağımlılık
  taraması + CI, (2) sistematik IDOR test paketi, (3) hata izleme, (4) yük
  testi, (5) model optimizasyonu; yedekleme/geri yükleme testi arada.
- **Süreç notu — PR #29, Kaan'ın incelemesi beklenmeden birleştirildi
  (Serhan'ın kararı, 26.09.2026).** Codex incelemesi ve düzeltmelerinden sonra
  birleştirildi ki güvenlik yükseltmesi beklemesin; bu, kök `CLAUDE.md`'deki
  "PR'lar diğer ekip üyesi tarafından incelenir" kuralının bilinçli bir
  istisnasıdır. **Kaan'ın incelemesi geriye dönük yapılır:** Faz 7'nin
  Serhan kısmını kapatan sonraki PR'ın açıklaması PR #29'un özetiyle başlar.
  Aynı açıklamada Kaan için ayrıca şu yazılır: `main` artık üç CI işi yeşil
  olmadan birleştirilemiyor (kural seti "protect main"), CI iş adı değişirse
  kural seti de güncellenmeli, yeni bir güvenlik açığı bulunduğunda kapatılana
  kadar hiçbir PR birleşmez, ve `./execute.sh` bir sonraki açılışta backend
  bağımlılıklarını kendiliğinden günceller (ayrıntı kök `CLAUDE.md` → "Git iş
  akışı").
- **Faz 7 kapanış denetimi — kalan işler ve sahipleri (01.10.2026).** Kod,
  PR'lar ve ROADMAP birlikte taranınca Faz 7'de yapılmamış yedi başlık çıktı;
  dağılımı Serhan onayladı (rol dayanağı: bölüm 5). **Bu maddeler bitmeden Faz 7
  kapanmaz, Faz 7.2'ye (Vitrin AI) ve 7.5'e geçilmez.** Ayrıntı ve kabul ölçütleri `ROADMAP.md` bölüm 7, açık takip 11 (Serhan) ve 12 (Kaan).
  - **Serhan:** (1) ~~hız sınırı kapsamı~~ ✅ (02.10.2026): `projects`/`account`
    dışında ödeme geçmişi, abonelik, checkout okuma, kesim yoklaması ve admin
    faturalama yazma uçları da sınırsız çıktı (davranış taramasıyla); hepsi
    sınıflandırıldı ve bağlandı, `test_rate_limit_coverage.py` her ucu limit
    dolu / Redis düştü durumunda sınar (sınır geri alınınca 37 test kırmızı);
    yükleme middleware'lerinin ve fail-closed bağımlılıkların Redis arızası
    ham 500 yerine temiz 503 oldu; (2) ~~ZAP'ın ön yüz OTURUMLU
    taraması~~ ✅ (02.10.2026, aşağıda "Dinamik tarama" → "İkinci tur"; Kaan'ın
    `e2e/oturum.ts` çerezi yerine yerel sahte JWKS ile, kit
    `backend/scripts/zap/`); (3) ~~işçi
    sağlığı görünürlüğü~~ ✅ (02.10.2026): `GET /api/admin/cutout-queue` (canlı
    işçi, kuyruk, işlenen, en eski bekleyenin yaşı; durum `ok`/`no_worker`/
    `stalled`/`unavailable`) + işçi yokken ya da kuyrukta iş varken 2 dk'dan
    uzun süredir HİÇBİR iş tamamlanmadıysa (ilerleme eksikliği; uzun ama ilerleyen
    kuyruk tıkalı sayılmaz) `error` günlüğü (API'nin 60 sn'lik kendi
    gözlemcisiyle — bakım cron'una bağlı değil —, her bakım turunda ve yönetici
    ucu çağrılınca; aynı sorun 10 dk'da bir) + admin panelinde Genel bakışın
    en üstünde "Kesim kuyruğu" kartı (30 sn'de bir yenilenir; ön yüz kodu
    `components/admin/admin-cutout-queue.tsx`); (4) ~~Mac bellek sıkışıklığı~~ ✅
    (02.10.2026: boşta kalmış işçiyle ilk kesim 12,3 sn, 27.09'daki 30,1 sn
    tekrarlanmadı; ayrıntı `backend/README.md` → "Kesim kuyruğu"); (5) ~~backend güvenlik başlıkları (`nosniff`, CORP)~~ ✅
    (02.10.2026, `app/middleware/security_headers.py`; tüm yanıtlarda, CORS ön
    kontrolü ve 401/404 dahil — gerçek süreçte doğrulandı; ZAP backend taraması
    tekrarlandı, iki eksik başlık kuralı artık PASS).
    **Kaan'ın incelemesi (03.10.2026, PR #46):** Windows'ta tam paketler, E2E ve
    admin kartına tarayıcıda bakıldı; kod incelemesi 10 bulgu verdi, hepsi
    doğrulanıp Serhan'ın onayıyla aynı PR'da düzeltildi (`4d4d355`): ilerleme
    işareti iş alımında değil BİTİŞİNDE (yeniden kuyruğa konma döngüsü tıkanmayı
    gizliyordu), kaydı silinmiş bekleyen iş en az `JOB_TTL` yaşında (30 dk'yı aşan
    tıkanmada uyarı susuyordu), kayıt kümesinde olmayan canlı işçi de sayılır,
    hesap silme sınırı e-posta onayından SONRA, iptal uçları satın almadan ayrı
    kova (`limit_checkout_cancel`), geçersiz oturumda Redis kapalıyken de 401,
    admin kartında geç gelen eski yanıt yeni sonucu ezmez. Yeni testlerin 12'si
    eski kodda kırmızı (ayrıntı `docs/lessons.md` ders 44, `backend/README.md` →
    "Kesim kuyruğu").
  - **Kaan** (Serhan'a sorulacak noktalar `ROADMAP.md` bölüm 7, açık takip 12'nin
    başındaki nottadır; Kaan'ın Claude'u için): (1) ✅ (03.10.2026) stüdyoda zemin değişiminde kalan takılma — zemini ekranda
    tuval boyutuna (× dpr) küçültülmüş kopyayla çizmek, dışa aktarmada tam
    çözünürlük (yukarıdaki "Stüdyoda zemin değiştirirken takılma" maddesi;
    çıktı kalitesi önce/sonra ölçülerek korunur); (2) → **Faz 7.5'e taşındı
    (03.10.2026, Kaan + Serhan ortak kararı; açık takip 10 madde 7)** ön yüz güvenlik başlıkları
    — CSP, tıklama tuzağı koruması, `nosniff`, `Permissions-Policy`,
    `Referrer-Policy`, COOP/CORP, `poweredByHeader: false`. **CSP önerisi
    (Claude'dan; yöntemi Kaan seçer):** önce `Content-Security-Policy-Report-Only`
    olarak açılır, ÜRETİM derlemesinde (`next start`; geliştirme sunucusu
    üretimle aynı değildir, kök `CLAUDE.md` ders 39) sayfalar ve stüdyo akışı
    gezilip konsoldaki ihlaller toplanır, kaynak listesi (Supabase, R2 imzalı
    görseller, Sentry DSN'i verilmişse, Konva ve HEIC WASM, three.js ve HDRI,
    `blob:`/`data:`) bu ihlallerden çıkarılır; ancak ondan sonra zorlayıcı
    kipe geçilir. Başlıkların geldiğini doğrulayan bir test eklenir ve
    zorlayıcı CSP'nin E2E'yi bozmadığı görülür; (3) ✅ (03.10.2026) E2E'de testsiz
    akışlar — ödeme (`/paketler` → `/odeme/{id}` yoklaması), oturumlu admin
    paneli, kuyrukta bekleme mesajı, katalog editörü, hesap silme, vitrin 3D
    (WebGL yok / hareketi azalt dalları). **Kaan'ın Faz 7 kapanış işleri bitti
    (03.10.2026): (1) ✅, (2) Faz 7.5'e taşındı, (3) ✅.**
  - **Güvenlik başlıkları Faz 7.5'ten Faz 7'ye çekildi (Serhan'ın onayı,
    01.10.2026).** Aynı fazın içinde yer değişikliği, kapsam aşımı değil: HSTS
    dışındakilerin hiçbiri alan adına bağlı değil, şimdi eklenip test edilebilir
    ve CSP, token tarayıcıdan okunabildiği için XSS'e karşı asıl önlem. Faz
    7.5'te yalnız canlıda HSTS ve başlıkların canlı adreste ZAP pasif taramasıyla
    doğrulanması kalır. **Geri taşındı (03.10.2026, Kaan + Serhan'ın ortak kararı;
    ön yüz başlıklarının tamamı):** backend başlıkları Faz 7'de bitti; ÖN YÜZ başlıkları Faz
    7.5'e döndü, çünkü CSP iyzico ödeme formunun adreslerine (Serhan'dan) ve
    nonce/`'unsafe-inline'` kararına bağlı çıktı. Ayrıntı bölüm 7, açık takip 10
    madde 7. Faz 7'nin kapanışı artık bu işi beklemez.
  - **7.5'e bırakılanlar (değişmedi):** ZAP'ın R2 ve Supabase yönetici API'sine
    dayanan uçların içini taraması (canlı bağlantı ister) ve gerçek Supabase +
    gerçek backend ile uçtan uca E2E — ikisi de staging ortamı gerektirir.
  - **Süreç notu — PR incelemeleri (01.10.2026 taraması, Serhan'ın onayıyla
    yazıldı).** GitHub'da inceleme kaydı olmayan PR'lar: **#36** (142 dosya) ve
    **#37** Serhan'ın PR'ları, kendisi birleştirdi, yalnız Copilot yorumu var;
    **#39, #40, #41, #42, #44** Kaan'ın PR'ları, Serhan birleştirdi, hiç
    inceleme ya da yorum yok. İnceleme GitHub dışında (sohbet, ekran paylaşımı)
    yapılmış olabilir; böyleyse kayıt yok. Yazılı istisna yalnız #29 için vardı
    (#30'u Kaan #32'de geriye dönük inceledi). Kural (kök `CLAUDE.md` → "Git iş
    akışı") değişmedi. **Karar bekliyor (Serhan + Kaan):** birleştirmeden önce
    incelemeyi GitHub'da kayda geçirmek (onay/yorum) mi, yoksa küçük ve acil
    PR'lar için yazılı bir istisna sınırı mı konacak. Büyük bir PR'ın tasarım
    diline dokunan dosyalarda silme yapıp yapmadığı tarayıcıda bakılarak
    kontrol edilir (kök `CLAUDE.md` ders 20).
- **Öne alınan iş — "ürün nasıl kesilir" kaydırma hikâyesi (30.09.2026, Kaan): denendi, beğenilmedi, İPTAL EDİLDİ.** Ayrıntı ve öğrenilenler `frontend/README.md` → "Açılış vitrini".
- **Öne alınan iş — deneme bölümü ve SSS akordeonu (30.09.2026, Kaan; ✅):** geçiş sahneleri denenip kaldırıldı; bölüm baştan açık, yükleme kartı kaydırmaya bağlı yumuşakça oturur; SSS satırları yumuşak açılır. Ayrıntı `frontend/README.md` → "Açılış vitrini".
- **Öne alınan iş — "Kendi fotoğrafınızla deneyin" yükleme kartı (30.09.2026, Kaan; ✅):** kapsam dışı olduğu söylendi, Kaan yön seçerek onayladı (koyu sahne kartı). Yalnız görünüm; ayrıntı `frontend/README.md` → "Açılış vitrini".
- **Öne alınan iş — açılış vitrini ve ana sayfa yenileme (28–30.09.2026, Serhan;
  ✅).** Faz 7'nin (test/optimizasyon/sağlamlaştırma) kapsamı dışında bir arayüz
  işi; Serhan'ın kararıyla ("genel düzenleme ve yeni eklemeler bir faza bağlı
  olmak zorunda değil") bu dalda yapıldı. Ayrıntı: kök `CLAUDE.md` →
  "Açılış vitrini ve ana sayfa düzeni", `frontend/README.md` → "Açılış vitrini".
  Kapsam: 4 sahneli el+takı vitrini, 3D yakınlaşma (three.js, `next/dynamic`),
  kütüphane zeminlerine koyma, stüdyo turu, yeni zemin galerisi, SSS, kapanış
  çağrısı; uygulama adı "Vitrin AI" → "Vitrin"; markalı 404/hata sayfası, simge,
  paylaşım önizlemesi, `robots`/site haritası; Çalışmalar'da "yüklenemedi"
  durumu; katalog ve bülten görselleri. Ölçüm (üretim derlemesi, 375 px, 4x
  CPU, ~8 Mbps): açılışa kadar JS 280 → 285 KB, LCP 916 → 848 ms. **Açık:**
  el katmanlarındaki silme izleri (kesik parmak uçları) yapay zekayla üretilmiş takısız ellerle çözüldü (`scripts/build-hero-hands.py`; sayfa ve yakınlaşma aynı el dosyasını kullanır); bilezikli sahne fikrinden vazgeçildi (alyans kalıyor);
  gerçek telefon GPU'sunda 3D akıcılığı (Faz 7.5 listesine); yasal metinlerde
  "Vitrin AI" → "Vitrin" (sürümle birlikte; **yapıldı, 30.09.2026**, ayrı PR `feature/yasal-metin-vitrin`: yasal sürüm `2026-09-30`).
- **CI — ✅ kuruldu (26.09.2026; roadmap'te yoktu, Serhan'ın onayıyla Faz 7'ye
  eklendi).** `.github/workflows/ci.yml`: backend testleri (`.env`'siz, servis
  olarak Postgres + Redis), frontend lint/test/build ve ayrı bir iş olarak
  `pip-audit` + `npm audit`; tarama haftada bir de koşar. İlk bulgusu, yerel
  `.env`'ye gizlice bağlı bir admin testiydi (düzeltildi).
- **Model optimizasyonu — ✅ ölçüldü, CPU'da optimizasyon YAPILMADI (27.09.2026).**
  Serhan'ın kuralı: kaliteye dokunabilecek hiçbir seçenek (FP16/INT8,
  düşük çözünürlük, lite model) kullanılmaz. `backend/scripts/profile_cutout.py`
  (çıktısı rembg ile bit düzeyinde aynı) sürenin %93–99'unun model hesabında
  olduğunu gösterdi; model dışı adımlar en fazla ~0,6 sn. Kalan kayıpsız
  seçenekler (PNG sıkıştırma seviyesi, iş parçacığı) kazancı değmediği için
  reddedildi. Asıl hız GPU'da (FP32, kesim başına tahmini ~0,3–1,5 sn) —
  karar Faz 7.5. Ayrıntı `backend/README.md` → "Model optimizasyonu".
- **Veritabanı yedeği ve geri yükleme testi — ✅ (27.09.2026).**
  Supabase ücretsiz pakette otomatik yedek almıyor (Serhan: paket Free) —
  kendi yedeğimiz tek yedek. `backend/scripts/backup_database.py`: `pg_dump`
  17 (Docker) ile `public` + `auth`, bellekte şifrelenir (Fernet), depo
  dışına yazılır. Production'dan alınan yedek atılabilir bir Postgres'e geri
  yüklendi: 48 tablo/346 satır ve RLS/politika/tetikleyici/fonksiyon/indeks/
  kısıt sayıları birebir, 2,8 sn; kontrol dört bozmayla sınandı. Ayrıntı
  `backend/README.md` → "Veritabanı yedeği". **Faz 7.5'e:** günlük otomatik
  çalıştırma, ayrı özel R2 bucket, saklama süresi.
  **Codex incelemesi düzeltmeleri (27.09.2026):** (1) yetkiler korunuyor —
  eskiden `--no-privileges` bütün GRANT/REVOKE'ları atıyordu ve test bunu
  görmüyordu; artık dökümde ve geri yüklemede duruyor, geri yükleme testi
  yetkileri satır satır karşılaştırıyor (production: 416 yetki birebir);
  (2) satır sayıları, parmak izi ve döküm AYNI anlık görüntüden
  (`pg_export_snapshot` + `pg_dump --snapshot`), canlı yazmalar sağlam yedeği
  "başarısız" göstermiyor; (3) dosya adı rastgele ek taşıyor ve dosya yalnız
  yoksa oluşturuluyor. Üçü de Docker'da gerçek `pg_dump`/`pg_restore` ile
  test edildi (eski betikte kırmızı). Önceki yedekler yetki içermiyor.
  **Yan bulgu kapatıldı (27.09.2026):** yedeğin yetki manifestinde
  `record_signup_consents()` için PUBLIC ve `anon` EXECUTE görüldü (0004'te
  REVOKE unutulmuştu). Migration `0012` geri alıyor; `test_rls.py`
  `public`'teki her SECURITY DEFINER fonksiyonu için bunu genel olarak
  doğruluyor. **Production'a 29.09.2026'da uygulandı** (yedek alındı, sonra
  `0012`; production `0012 (head)`); sonraki yedekte üç satır (PUBLIC, `anon`,
  `authenticated`) kalktı, yalnız `service_role` kaldı, geri yükleme testi
  birebir geçti.
- **Kesim kuyruğu — ✅ (27.09.2026; Faz 7'ye eklendi, Serhan'ın kararı 26.09.2026).**
  Yük testinde "aynı anda tek kesim, fazlası anında 429" çıktı; Serhan:
  "her türlü bir anda bir kesim kabul edilemez", fazla istekler reddedilmek
  yerine SIRAYA alınmalı ve **bu müşteriye hissettirilmemeli** (hata yok,
  yalnız normal işleme görünümü). Kapsam: kesim API'den ayrı işçi
  süreç(ler)ine taşınır, istekler Redis tabanlı kuyruğa girer, aynı anda
  işlenen kesim sayısı yapılandırılabilir (>1). Bu aynı zamanda "model süreç
  başına yüklenir" bulgusunu çözer (API süreçleri modeli yüklemez).
  **Tasarım (26.09.2026, Serhan'ın onayladığı kararlar):**
  - Özgün fotoğraf işçiye ulaşana kadar **Redis'te en fazla 15 dk** bekler,
    işçi alınca silinir; diske/R2'ye yazılmaz. KVKK metni buna göre
    güncellenir.
  - Uzun beklemede müşteriye **sıra bilgisi gösterilmez**; ~30 sn'den sonra
    yalnız nötr bir cümle çıkar. Hata gösterilmez.
  - Ön yüz değişikliğini Serhan yapar, **Kaan PR'da ayrıca inceler**.
    **Kaan'ın incelemesi (28.09.2026):** bir bulgu çıktı ve düzeltildi —
    yükleme sürerken ekran sıfırlanınca eski iş yeni fotoğrafın anahtarıyla
    yokluyordu (kredi harcanıp sonuç kayboluyor ya da yanlış sonuç geçmişe
    yazılıyordu). Artık iş anahtarını yüklemeden önce sabitliyor
    (`bindJobKey`, kök `CLAUDE.md` ders 35).
    **29.09.2026, PR #32 kalan üç birleşme engeli kapatıldı:** Redis yoklama
    hatası yeni krediye izin vermiyor; işçi geçici Redis/DB hatasında ayakta
    kalıp alınmış işi yeniden sıraya koyuyor; Windows VS Code görevleri ortak
    R2 bucket'ı için silme korumasını açıyor. Windows test uyumluluğu
    30.09.2026'da kapandı (migration SQL'i UTF-8 okunuyor, `compare_cutouts`
    Windows'ta açılıyor, günlük mutabakat için Windows'ta `tzdata` kuruluyor,
    `test.sh` `localhost` yerine `127.0.0.1` veriyor (Windows'ta paket ~1 sa → ~3 dk),
    Unix izni isteyen 6 yedek testi Windows'ta atlanıyor —
    kök `CLAUDE.md` ders 37); kararsız ön yüz testi düzeltildi (PR #32
    bulguları; `error-tracking.test.ts` gerçek SDK'nın soğuk `import`'u yük
    altında 5 sn sınırına yaklaşıyordu — 40 meşgul süreçle 0,3 → 3,1 sn ölçüldü;
    o testin sınırı 30 sn'ye çıkarıldı, 30.09.2026 Kaan. Bu makinede hiç
    kırmızı üretilemedi, yani düzeltme mekanizmayı ölçüme dayanarak kapatıyor,
    kırmızı→yeşil kanıtı yok). Aynı PR'da (#34, Kaan): kesim sonucunda "kesim" ve "özgün" etiketleri ters çiziliyordu (solda kesim, sağda özgün; `components/comparison-view.tsx`) — açılış kaydıracıyla aynı sıraya getirildi.
  - İş kimliği = istemcinin `Idempotency-Key`'i; Redis anahtarı
    `(kullanıcı, anahtar)` — başka kullanıcı başkasının işini bulamaz.
  - `POST /api/remove-background` → doğrulama + kredi ayırma + kuyruğa ekleme,
    `202`. `GET /api/remove-background/jobs/{id}` → durum ya da PNG ya da hata.
  - İşçi: `python -m app.workers.cutout`; modeli bir kez yükler,
    `MAX_CONCURRENT_INFERENCES` kadar kesimi aynı anda işler (tek model
    kopyası). Çöken işçinin işleri başka işçiye geri verilir.
  - Kredi ayırma zaman aşımı 5 dk → 30 dk (kuyrukta bekleyen işin kredisi
    bakım işince iade edilmesin); 15 dk içinde başlamayan iş kendisi iade eder.
  - Kuyruk üst sınırı ayarlanabilir (fotoğraflar Redis belleğinde); aşılırsa
    nazik bir yoğunluk mesajı — yalnız aşırı durumda.
  - **Dürüst sınır:** aynı CPU makinesinde aynı anda N kesim throughput'u
    artırmaz (model zaten bütün çekirdekleri kullanıyor); kapasite işçi
    MAKİNESİ sayısıyla ya da GPU'yla (Faz 7.5) artar. Kuyruğun değeri: hata
    yerine bekleme ve API'ye dokunmadan işçi ekleyebilmek.
  **Codex incelemesi düzeltmeleri (27.09.2026):** (1) işçi krediyi tükettikten
  sonra ölürse kurtarılan ikinci deneme tüketilmiş krediye ait sonucu siliyor
  ve ön yüz sessizce ikinci kredi harcıyordu — artık işçi ayırmanın gerçek
  durumunu okuyor, tüketilmişse saklanan sonucu teslim ediyor (kök
  `CLAUDE.md` ders 32); (2) kuyruk sınırı eşzamanlı isteklerde aşılıyordu —
  kontrol ve ekleme tek bir Lua betiğinde; (3) Redis'in varsayılanı belleği
  diske (`dump.rdb`) yazıyordu, KVKK metniyle çelişiyordu — compose'da
  RDB/AOF kapalı + `/data` tmpfs, API her kuyruğa koymadan önce doğruluyor
  (ders 33). Dördü de eski kodda kırmızı yanan testlerle. **İkinci tur:**
  paralel iki deneme ödenmiş sonucun üzerine yazabiliyordu (artık her deneme
  kendi anahtarına yazar); `CONFIG` yasak Redis'te fotoğraf yine alınıyordu
  (artık reddedilir); yedek betiği `[::1]` adresini bozuyordu.
  **Sonuç (27.09.2026):** tek işçi, 4 eşzamanlı istemci × 2 istek → 8/8
  başarılı, 0 × 429 (önce 6/8 reddediliyordu); sıra dahil ortalama 38,5 sn,
  kesim sürerken diğer uçlar p95 ≤29 ms. Ayrıntı `backend/README.md` →
  "Kesim kuyruğu". Yol boyunca: fotoğrafın işçi ALIRKEN değil BİTİRİNCE
  silinmesi (çöken işçinin işi kurtarılabilsin), kullanıcı ekrandan ayrılınca
  yoklamanın DURMAMASI (kredi harcanıyor, sonuç geçmişe yazılmalı), Windows'ta
  işçinin sinyal işleyicisi yüzünden çökmemesi. **2 işçi yerelde ölçülemedi:**
  16 GB'lık makineyi kilitledi (kök `CLAUDE.md` ders 31) — canlıda ölçülecek. **Faz 7.5'e:** GPU'ya
  (sunucusuz GPU) geçiş kararı ve sağlayıcı/maliyet karşılaştırması.
- **Yük testi (yerel) — ✅ (26.09.2026).** `backend/scripts/load_test.py`
  (gerçek model/Postgres/Redis/JWT, depolama bellekte). Sonuçlar ve tablolar:
  `backend/README.md` → "Yük testi". Özet: kabul sınırlayıcısı fazla
  inference'ı 6–10 ms'de 429'la reddediyor, inference sürerken diğer uçlar
  p95 ≤20 ms; okuma uçları eşzamanlılık 50'de hatasız, p95 ~0,7 sn. Yük
  testinin iki bulgusu **kesim kuyruğuyla çözüldü (27.09.2026, yukarıdaki
  madde):** (1) aynı anda ikinci kullanıcının 429 alması — istekler artık
  reddedilmeden sıraya giriyor (Serhan'ın seçimi bekleme kuyruğu oldu, kendi
  küçük kuyruğumuz; Celery/RQ değil); (2) modelin her API sürecine
  yüklenmesi — model artık yalnız ayrı işçide, API süreç sayısıyla serbestçe
  ölçeklenebiliyor. **Faz 7.5'e:** veritabanı havuz boyutu
  (varsayılan 5+10 darboğazın bir parçası çıktı; Supabase sınırıyla birlikte
  canlıda ölçülecek) ve Linux'ta bellek ölçümü.
- **Hata izleme (backend) — ✅ (26.09.2026).** `app/core/monitoring.py`:
  Sentry SDK kuruldu, `SENTRY_DSN` boşken hiç başlatılmıyor; doluyken yalnız
  5xx hataları maskelenmiş olarak gidiyor (gövde, yerel değişken, kimlik
  bilgisi, çerez, sorgu dizesi yok; e-posta/JWT/SQL parametresi maskeli).
  Gerçek backend sahte bir Sentry sunucusuna bağlanarak uçtan uca doğrulandı.
  **Sağlayıcı seçimi ve DSN Faz 7.5'te** (kod ikisiyle de çalışıyor).
  **Frontend de aynı gün eklendi (Serhan'ın isteği, Kaan PR'da ayrıca
  inceleyecek):** `frontend/src/lib/error-tracking.ts`, DSN yokken SDK
  tarayıcıya hiç yüklenmiyor (üretim derlemesinde ve gerçek tarayıcıda
  ölçüldü); DSN'li derleme gerçek tarayıcıda sahte Sentry'ye bağlanıp
  maskelemenin çalıştığı görüldü. **KVKK aydınlatma metni ve gizlilik
  politikası güncellendi:** "hata izleme hizmet sağlayıcısı" alıcı grubu
  olarak eklendi, yasal sürüm `2026-09-27` (yeni kayıtlar bu sürümü kabul
  eder; eski kabul kayıtları tarihçede kalır).
- **Güvenlik incelemesi (kod) — ✅ (27.09.2026, `/cso`, ücretsiz).** Bütün kod
  tabanı tarandı; kritik/yüksek bulgu yok. Bulunanlar ve yapılanlar: (1) yerel
  Postgres/Redis bütün ağa açıktı, varsayılan parolayla ve production'dan kopyalanan
  kullanıcı verisiyle — portlar `127.0.0.1`'e bağlandı; (2) `/api/cmyk` oturumsuz ve
  sınırsızdı — backend izin ucu (`/api/cmyk/permit`, oturum + 10 dk'da 20,
  fail-closed); (3) herhangi bir kullanıcı bir zemini taslağına bağlayıp yöneticinin
  onu silmesini engelleyebiliyordu — Serhan'ın kararıyla silme artık taslak
  bağlantısını temizleyip yapılıyor; (4) belgedeki "token tarayıcıya hiç açılmıyor"
  ve "parola değiştirme her yolda kanıt istiyor" cümleleri yanlıştı — düzeltildi,
  Hesabım sayfası mevcut parolayı Supabase'e de gönderiyor, sunucu tarafı koruma
  Supabase panel ayarında (Serhan kontrol edecek); (5) `.env.supabase` izni 600.
  **Dinamik tarama — ✅ (27.09.2026, OWASP ZAP, ücretsiz, yerel):** uygulama test
  veritabanına bağlı ayrı bir kopya olarak açılıp tarandı. Backend API (OpenAPI'den,
  aktif saldırı kalıpları): 116 kontrol geçti, açık yok; yalnız iki eksik başlık
  (`X-Content-Type-Options`, `Cross-Origin-Resource-Policy`). Ön yüz (pasif): açık yok;
  eksik güvenlik başlıkları (CSP, tıklama tuzağı koruması, `X-Content-Type-Options`,
  `Permissions-Policy`, COOP/COEP/CORP, `X-Powered-By` sızıntısı) ve **bir gerçek
  bulgu:** formlarda `method` yoktu, JS yüklenmeden gönderilen bir form alanları
  GET ile adres çubuğuna yazıyordu (destek formunda e-posta/mesaj; satın alma
  formunda aynı yol T.C. kimlik no, telefon, adres) — 12 forma `method="post"` ve
  hepsini tarayan bir test eklendi. **Oturumlu tarama (aynı gün):** normal
  kullanıcı ve yönetici kimliğiyle iki ayrı aktif API taraması. Gerçek Supabase'e
  dokunmamak için tarama backend'i yerel sahte bir JWKS sunucusuna bağlandı
  (token'lar yerelde üretildi); R2/iyzico/Resend/Supabase yönetici anahtarı boş
  bırakıldı. Sonuç: 116 kontrol geçti, açık yok; normal kullanıcı yönetici uçlarında
  42 kez 403 aldı; tek 5xx'ler kasıtlı olarak koparılan Supabase yönetici API'sinin
  503'ü. **Sınır:** R2 ve Supabase yönetici API'sine dayanan uçların içi taranmadı
  (kopuktular); ön yüz oturumlu taranmadı. Supabase panelinde "Require current
  password when changing password", "Secure password change" ve "Secure email
  change" Serhan tarafından 27.09.2026'da açıldı. **Kalan:** güvenlik başlıkları
  Faz 7'ye çekildi (01.10.2026, sahipleri "kapanış denetimi"); canlıda HSTS Faz 7.5.
  **Dinamik tarama — ikinci tur ✅ (02.10.2026, Serhan):** yöntem ve kit
  `backend/scripts/zap/` (hermetik: sahte JWKS, tarama için ayrı veritabanı,
  gerçek R2/Supabase/iyzico'ya hiç gidilmez). **Backend** (OpenAPI, aktif; anonim,
  normal kullanıcı, yönetici): 118 kontrol geçti, FAIL 0; 27.09'da uyarı veren
  `X-Content-Type-Options` ve CORP (Spectre izolasyonu) kuralları artık PASS; tek
  uyarı yöneticide `/api/admin/users` 503'ü (`SUPABASE_SECRET_KEY` bilerek
  boş: beklenen). **Ön yüz oturumlu** (kullanıcı ve yönetici çerezi, aktif +
  pasif): 407 URL (sayfa örümceği + `/api/*` vekilleri için üretilen OpenAPI),
  **enjeksiyon/XSS/yol geçişi/SSRF vb. aktif bulgu YOK.** Pasif bulgular: CSP,
  tıklama tuzağı koruması, `nosniff`, `X-Powered-By` eksik/sızıntı (Kaan'ın K2
  işi, `ROADMAP.md` bölüm 7, açık takip 12), "HTTP Only Site" (yerel düz HTTP; HSTS Faz
  7.5) ve "Anti-CSRF token yok" (`/destek` yedek formu: JS yokken POST'u sayfa
  yeniden çiziyor, durum değiştirmiyor; oturum çerezi `SameSite=Lax`, geri
  alınamaz işlemlerde Origin kontrolü var → gerçek açık değil). **Oturumlu
  olduğu ölçülerek doğrulandı:** yönetici-özel `/api/admin/stats` çerezle
  yönetici 200, kullanıcı 403, çerezsiz 401 (kontrol deneyi yanlış beklentide
  uyarı verdi). **Sınırlar (dürüst):** (1) tarama örneğinde hız sınırlayıcılar
  kapalı (yoksa yazma uçları 429'a boğulur; sınırların kendisi
  `test_rate_limit_coverage.py`'de); (2) aktif DOM-XSS kuralı (40026) ve AJAX
  örümceği kapalı: x86 ZAP imajı ARM Mac'te emülasyonla Firefox'u başlatamayıp
  ZAP'i düşürüyor (günlükte "bitti" görünüp rapor yazılmıyor; Linux/x86'da
  açılabilir); (3) R2, Supabase yönetici API'si ve iyzico'ya dayanan uçların içi
  taranmadı (kopuk) → staging, Faz 7.5; (4) dinamik tarama yerel ve test
  verisiyle; canlıda ayrıca yapılır.
- **Sistematik IDOR/yetki paketi — ✅ (26.09.2026).** `backend/tests/test_idor.py`:
  45 ucun her biri dört erişim sınıfından birine atanıyor (sınıflandırılmamış
  yeni uç testi kırmızı yakar), 22 admin ucu üç yoldan (401/403/kabul),
  sahipli kaynaklar hem red hem kabul yoluyla, `Idempotency-Key`'in
  kullanıcıya göre ayrılması hem veritabanı hem HTTP düzeyinde sınanıyor
  (71 test). Mevcut kodda açık BULUNMADI. Paketin işe yaradığı yedi ayrı
  bozmayla kanıtlandı (ayrıntı `backend/README.md` → "Yetkilendirme ve IDOR
  paketi").
- **Bağımlılık taraması — ✅ (26.09.2026).** Backend'de 6 pakette 34 bilinen
  açık sürüm yükseltmesiyle kapatıldı (ayrıntı `backend/README.md` → "CI ve
  bağımlılık taraması"); frontend `npm audit` temizdi. rembg 2.0.61 → 2.0.85
  atlaması modelin çıktısını değiştirebileceği için 6 gerçek ürün
  fotoğrafında ölçüldü: maskeler arasında en büyük alfa farkı 1/255, kopan ya
  da sızan piksel yok (`backend/scripts/compare_cutouts.py`; aynı araç model
  optimizasyonunda da kullanılacak). **Model optimizasyonu için kabul ölçütü
  (Serhan):** gözle fark edilmeyen kayıp kabul, ama kaybın SEVİYESİ ve başka
  bir yerde (ince zincir, yansıtıcı kenar, zemin sızıntısı) açık oluşturup
  oluşturmadığı ayrıca ölçülür. **Yük testine not:** aynı ölçümde tek süreçte
  6 fotoğraf için tepe RSS macOS'ta 4,8–6,6 GB göründü; bu, servisin kendisinde
  ölçülen 12 GB'lık değeri DEĞİŞTİRMEZ (macOS belleği sıkıştırıyor, ölçüm
  uvicorn sürecinde ve farklı koşullardaydı) — Linux'ta, servis üzerinde yük
  testiyle yeniden ölçülecek.
- **Bağımlılık taraması — ikinci tur, `main` CI'ı üç ayrı açık bildirimiyle kırmızıya döndü
  (30.09–01.10.2026; ROADMAP'e sonradan yazıldı).** Zorunlu CI kuralının
  (kök `CLAUDE.md` → "Git iş akışı") öngörülen yan etkisi gerçekleşti: yeni
  yayımlanan açıklar taramayı kırdı ve açık PR'lar (#34, #36) birleştirilemedi.
  Çıkış yolu kural seti gevşetilmeden açığı kapatan sürüm PR'ları oldu:
  **PR #35** PyJWT 2.13.0 → 2.14.0 (10 CVE; 2.14 `PyJWKClient`'ta yönlendirme
  izlemiyor ve isteği `build_opener` ile atıyor — üretim kodu değişmedi, yalnız
  JWKS önbellek testlerinin sahte uç noktası taşındı); **PR #37** üç geçişli
  npm paketi (`brace-expansion` yüksek/DoS, `fast-uri`, `ip-address`; yalnız
  yama sürümleri); **PR #44** `next` 16.3.4 → 16.3.8 (GHSA-vcvr-r3jv-pc5j,
  `next/og` `ImageResponse`'ta **kritik RCE**; `icon`/`apple-icon`/
  `opengraph-image` bu API'yi kullanıyor, yani etkilenen sürüm aralığı `main`'de
  PR #36'dan #44'e kadar vardı — canlı yayında değildi) ve PyJWT 2.14.0 → 2.15.0
  (CVE-2026-101918). PR #43 (yalnız PyJWT) iki açık birlikte kapanması gerektiği
  için #44'e katılıp kapatıldı. Sonuç: `npm audit` 0 açık (01.10.2026).
  **Ders:** bağımlılık açığı zamanlaması kontrol edilemez; kuralın bedeli
  birkaç saatlik birleştirme kilidi, kazancı bilinen açıkla `main` kirletmemek.
  Kilit dosyası CI'daki npm'le güncellenir (kök `CLAUDE.md` npm tuzağı).
  **Dördüncü olay (03.10.2026):** `braces` (GHSA-vfj7-8cjw-p6xm, yüksek, 18.09.2026'da
  yayımlanmış, `≤ 3.0.3`) için **düzeltilmiş sürüm YOK** (en güncel sürüm 3.0.3), bu yüzden
  sürüm yükseltmesiyle kapatılamadı ve #47/#48 dahil bütün PR'lar bloke oldu. `braces`
  yalnız geliştirme araçlarından geliyordu (`micromatch` ← `fast-glob` ← `eslint-config-next`
  ve `shadcn`; `shadcn` pakete yalnız `globals.css`'teki `@import "shadcn/tailwind.css"` ile
  derleme zamanında giriyor). Çıkış: `shadcn` `devDependencies`'e taşındı (derleme zaten
  Tailwind/TypeScript gibi geliştirme paketlerine dayanıyor) ve zorunlu kapı yalnız
  **üretim** bağımlılıklarını tarar (`npm audit --omit=dev`, 0 açık); geliştirme araçları dahil
  tarama ayrı, `continue-on-error` ile engellemeyen bir adımda görünür kalır (8 yüksek bulgu,
  düzeltilmiş sürüm çıkınca kapatılır). İş adları değişmedi, kural seti güncellenmedi.
  **Ders:** düzeltilmiş sürümü olmayan bir açık, zorunlu kapıyı sonsuza dek kırmızı tutabilir;
  kapıyı neyin tarandığına göre ayarlamak (üretim ≠ geliştirme araçları) kural setini
  gevşetmekten güvenlidir. Risk değerlendirmesi: bu açık saldırgan kontrollü kalıplar ister,
  geliştirme araçları yalnız kendi yapılandırmamızı işler (tahmin, kanıt değil).
- **Görüntü sıkıştırma / tembel yükleme — ✅ (28.09.2026, Kaan).** Önce
  ölçüldü (üretim derlemesi, `next start`, sayfanın indirdiği JS/CSS/görsel
  toplamı): `public/` zaten küçüktü (772 KB, WebP), zemin listeleri zaten
  `loading="lazy"`, Konva ve HEIC çözücü zaten ayrı parçaydı. Asıl bulgu:
  `SiteShell` stüdyoyu doğrudan içe aktardığı için stüdyonun arayüz kodu
  HER sayfaya iniyordu. `StudioHost` (`next/dynamic`) ile yalnız stüdyo
  açılınca yükleniyor: sayfa başına ilk JS ~1050 → ~940 KB (gzip ~305 →
  ~275 KB, ≈%10). Çalışmalarım ve Katalog'daki çalışma küçük resimleri de
  tembel yükleniyor. **Yapılmayan (bilinçli):** yüklenen fotoğrafı istemcide
  sıkıştırmak — model girdisi özgün dosya olmalı (bölüm 2). Kalan JS React
  çatısı ve her sayfada gereken Supabase istemcisi.
- **Kullanıcı etkinliği ekranı — FİKİR, kullanıcılar gelmeye başlayınca
  değerlendirilecek (Serhan, 19.09.2026).** Admin panelindeki "Günlük" yalnız
  YÖNETİCİ eylemlerini gösteriyor (`admin_audit_log`). Kullanıcıların kendi
  işlemleri (kesim, indirme, ödeme, taslak kaydetme) ayrı tablolarda duruyor
  (`usage_events`, `usage_reservations`, `billing_transactions`, `projects`)
  ve panelde toplu bir görünümü yok. Karar verilirken bakılacaklar: bunun
  değiştirilemez yönetici günlüğüyle KARIŞTIRILMAMASI (ayrı ekran/uç),
  hacim (kullanıcı başına çok satır — sayfalama ve saklama süresi), KVKK
  (kişisel veri; aydınlatma metni ve saklama süresiyle uyumlu olmalı) ve
  gerçekten neye ihtiyaç duyulduğu (destek talebinde "bu kullanıcı ne yaptı"
  sorusu mu, genel analitik mi). Şimdilik iş YOK, yalnız not.
- **Stüdyoda zemin değiştirirken takılma — ✅ düzeltildi (ilk kısım 19.09.2026, kalan kısım 03.10.2026, Kaan; açık takip 12 madde 1).**
  **Düzeltilen kısım:** aşama geçişlerinde tuval sütununun 520 ms'lik genişlik
  geçişi her karede tuvali yeniden boyutlandırıp Konva'yı yeniden çizdiriyordu
  (10–14 kez, her biri uzun kare); masaüstünde geçiş kaldırıldı, tuval tek
  seferde boyutlanıyor (uzun kare 10–15 → 0–2). Aynı ölçümde `useStageSize`'ın
  yalnız ilk kapsayıcıyı izlediği ve Tamamla'da tuvalin sağının/altının
  KESİLDİĞİ bulundu, düzeltildi. Aynı gün asıl "kasma" sebebi de bulundu:
  react-konva'ya her render'da yeni `filters` dizisi veriliyor, ürünün filtreli
  önbelleği her render'da baştan hesaplanıyordu (Retina'da ~100 ms/kare);
  dizi sabitlendi, dpr 2'de geçişler 35 → 60 fps (kök `CLAUDE.md` ders 30).
  **Kalan (aşağısı):**
  Tarayıcıda (1440×900, dpr 1, geliştirme modu) ölçüldü: sürükleme, üzerine
  gelme ve kaydırma 60 fps; her zemin seçimi 60–70 ms'lik, ilk seçim ~390 ms'lik
  bir kare üretiyor ve sürenin neredeyse tamamı Konva çiziminde. Sebep: zemin
  görselleri tam çözünürlükte (3508×2480, 8,7 MP) ve 0,42 sn'lik çapraz geçişte
  her karede ~500 px'lik tuvale küçültülerek İKİ kez çiziliyor; ilk seçimde buna
  büyük JPEG'in ana iş parçacığında çözülmesi ekleniyor. Retina ekranda tuval 4
  kat piksel. Aşama değişiminde de ~50 ms'lik bir kare var (panel kurulumu +
  tuvalin yeniden çizimi). `backdrop-filter` ve stüdyo arka planı kapatılınca
  sonuç değişmedi — cam efektleri sebep değil. **Önerilen düzeltme:** ekranda
  zeminin tuval boyutuna (× dpr) küçültülmüş bir kopyasını kullanmak
  (`createImageBitmap` + `resize*`, ya da `img.decode()` sonrası tek seferlik
  offscreen çizim), dışa aktarmada tam çözünürlüğe dönmek. Dışa aktarma
  kalitesini etkileyebileceği için ayrı ve ölçülerek yapılmalı.
  **Kalan kısım düzeltildi (03.10.2026, Kaan):** zemin ekranda, tuvalde görünen
  bölgesinin (`coverCrop`) tuvalin ekran pikseli (× dpr) ölçüsüne küçültülmüş
  kopyasıyla çiziliyor (`components/composer/use-display-background.ts`);
  dışa aktarma düğümde saklanan TAM çözünürlüklü SEÇİLİ zemine geçip öyle
  çiziyor (`swapToExportBackground`, `background-fade.ts`). Çoklu boyut dışa
  aktarıcısı (görünmez ikinci sahne) kopya kullanmıyor. Kopya hazırlanırken
  önceki zeminin kopyası kalır; üretilemezse tam görsele düşülür, eski zemin
  süresiz kalmaz (ders 23, testli). **Ölçüm** (Windows, Playwright Chromium
  başsız, 1440×900, ÜRETİM derlemesi `next start`, 3508×2480 JPEG zeminler,
  Long Animation Frame API; her koşul iki tur):
  | | önce | sonra |
  | --- | --- | --- |
  | zemin seçimi (ikinci ve sonraki), en uzun kare, dpr 1 | 65–78 ms (Konva çizimi 38–47 ms) | 50 ms'yi aşan kare yok (bir turda betiksiz 52 ms) |
  | aynısı, dpr 2 | 51–90 ms (Konva çizimi 41–58 ms) | 50 ms'yi aşan kare yok (bir turda betiksiz 50 ms) |
  | stüdyodan sonra İLK sunucu zemini | 76–111 ms | 66–86 ms (kopya henüz yokken tam görsel bir kez çiziliyor, ~41–47 ms) |
  **Ara bulgu:** ilk sürüm `createImageBitmap`'e `HTMLImageElement` veriyordu;
  Chrome 8,7 MP'lik JPEG'i ANA iş parçacığında çözüp küçülttüğü için Konva
  çiziminin yerine ~37 ms'lik yeni bir uzun kare çıktı (Long Animation Frame
  dökümünde React zamanlayıcısının `MessagePort` görevi olarak). Görsel blob
  olarak alınıp (`fetch`, tarayıcı önbelleğinden) `createImageBitmap(blob)`
  ile çözülünce kayboldu. **CSP notu (madde 2 için):** bu `fetch` R2'ye gider;
  CSP'nin `connect-src`'u R2 kökenini içermezse istek düşer ve kod yüklü
  görselden kopya üretmeye geri döner (çalışır ama ~37 ms'lik kare geri gelir).
  **Çıktı:** dışa aktarılan PNG önce/sonra dpr 1 ve 2'de **piksel piksel aynı**
  (1240×1754, farklı piksel 0). Kontrol koşusu: tam çözünürlüğe geçiş adımı
  kapatılınca aynı dosyanın piksellerinin %73–82'si değişiyor; yani
  karşılaştırma bozulmayı yakalıyor ve çıktıyı koruyan şey bu adım. Ölçüm
  M4/Safari'de ya da telefonda yapılmadı (ders 40).
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
### Faz 7.2 — Vitrin AI — ⏳ Planlanan (02.10.2026'da eklendi; Faz 7 bitmeden başlamaz)

**Sıra (Serhan'ın kararı, 02.10.2026):** Faz 7 → **Faz 7.2** → Faz 7.5 (canlıya
çıkış) → Faz 8 (mobil). Vitrin AI canlıya çıkıştan ÖNCE yapılır. Gerekçe: tek
hukukçu turu, tek canlıya çıkış, "Vitrin AI" düğmesi canlıya "yakında" diye
çıkmaz. **Bedeli:** canlıya çıkış bu fazın süresi kadar gecikir ve kredi akışı
canlı ödeme olmadan yalnız sandbox'ta denenir; Vitrin AI'ın canlı doğrulaması
Faz 7.5 listesinde. Numara "7.2" bilerek: 7.5'e yapılmış çok sayıda atıf var,
yeniden numaralandırma onları bozardı. **Kaan'ın incelemesi bekliyor:** faz
kapsamı iki kişinin ortak kararıdır, bu bölüm Kaan görmeden kesin sayılmaz.

**Özellik.** Kullanıcı kesilmiş ürününü yükler ya da Çalışmalarım'dan seçer,
ürün türünü (yüzük, kolye, küpe, bilezik, Diğer) ve bir sahneyi seçer; yapay
zekâ ürünü o sahneye yerleştiren bir "ürün kullanımda" görseli üretir (yüzük
açık kutuda, kolye boyunda, vb.). Elle ayar yapılmaz. Stüdyonun içinde değil,
menüde ayrı bir sayfa ve kesim sonrası "Vitrin AI ile üret" düğmesi.
**Sahneler dinamiktir:** yılbaşı, sevgililer günü gibi dönemsel sahneler kod
değişikliği olmadan eklenir. Tarif ve test kaynağı Serhan'ın yerel "Vitrin
Özellik Kararları" sayfası (depoda değil); alınan kararların tamamı aşağıda.

**Kapsam ve kararlar (02.10.2026, Serhan + Claude):**

- **Sahne = veritabanı kaydı, admin panelinden yönetilir.** Alanlar: ürün türü,
  ad, önizleme görseli, prompt şablonu, tür (kalıcı | dönemsel), tema etiketi,
  başlangıç/bitiş (Türkiye saati, yalnız dönemsel), cinsiyet (kadın | erkek |
  ikisi), üretim modu (yeniden çiz | hibrit), kredi maliyeti, durum (taslak →
  test → yayında). Yeni tablo ve RLS **aynı migration'da** (kök `CLAUDE.md`
  "RLS'siz tablo oluşturulmaz"). Şemanın dışına çıkan istekler (yeni ürün türü,
  sahneye metin yazma, çoklu kesim) kod ister; yeni bir dönemsel sahne ise yalnız
  yeni bir kayıttır.
- **Prompt sunucuda durur, kullanıcıya gitmez.** Admin panelinden düzenlenir;
  her düzenleme yeni bir **sürümdür** (eskisi silinmez, geri dönülür) ve her
  üretim hangi prompt sürümüyle yapıldığını kayda yazar. Yayındaki sahnenin
  prompt'u değişirse sahne "test" durumuna döner (küçük yazım düzeltmesi için
  kapatılabilir). Yeni sahne yayına girmeden aynı ürünlerle **sadakat
  testinden** geçer.
- **Kalıcı ve dönemsel sahneler.** Ayrım veritabanındadır; sahne sayısına sert
  sınır yoktur. 3 kalıcı sahneyle başlanır, yeni kalıcı fikir gelirse eklenir
  (ekran düzeni büyürse sonra tasarlanır). **Dönemsel sahne** tarih aralığında
  listenin başına rozetle çıkar ("Yılbaşı · 5 Ocak'a kadar"), bitişte kendiliğinden
  kalkar ve arşivlenir (kayıt silinmez); her yıl tarih elle güncellenir ve
  yayından önce test yeniden yapılır ("her yıl otomatik" YOK). Aynı dönemin
  farklı türlerdeki sahneleri **tema etiketiyle** gruplanır (ayrı kampanya
  tablosu yok). Bitişte o sahneyle üretilmiş sonuçlar ve bekleyen "iki sonuçtan
  seç" ekranı bozulmaz. Hazırlık payı: sezondan en az ~2 hafta önce.
- **Türler ve kalıcı sahne taslağı** (hepsi kadın sahnesi; erkek sahneleri
  sonradan veri olarak eklenir; prompt ve önizleme uygulamada test edilip
  kesinleşir):

  | Tür | Sahne 1 | Sahne 2 | Sahne 3 (vücut) |
  | --- | --- | --- | --- |
  | Yüzük | Açık yüzük kutusunda (düşük risk) | Özel an: gül yaprağı, mum ışığı (orta) | Parmakta (yüksek) |
  | Kolye | Serili ipek/mermer (düşük) | Kadife büstte (orta-yüksek) | Boyunda (yüksek) |
  | Küpe | Kadife kartta (düşük) | Mermer, ipek, kurutulmuş çiçek (düşük) | Kulakta (yüksek) |
  | Bilezik | Hediye kutusunda (düşük) | Kapalıçarşı bilezik sehpasında (orta) | Bilekte (yüksek) |
  | Diğer | Mermer yüzey | Hediye kutusu | Cam vitrin rafı |

  Her tür **ayrı bir bayrakla**, kendi sadakat testini geçince yayına girer;
  testi geçmeyen tür görünmez. Vücut sahneleri (parmak, boyun, kulak, bilek)
  kalıcı olabilir ama yalnız testi geçerse yayına girer; geçmezse o türün
  kutu/yüzey sahneleriyle çıkılır. **İnce zincir riski:** kolyede yeniden çizim
  halkaları bozabilir; kolye testi geçmezse "serili" sahne de yayına girmez.
  Kadın/Erkek ayrı bir tür değil sahne kaydının alanıdır. **İlk sürüm dışı:**
  Takım (birden fazla kesim, ayrı akış), ziynet ürünleri (çeyrek, gram, Ata
  lira), erkek sahneleri. **Hiçbir sahnede yüz çizilmez** (kadraj parmak, boyun,
  kulak).
- **Kullanıcı akışı.** Giriş: kesim sonrası düğme + menüdeki ayrı sayfa. Sıra:
  tür (tek tık; AI tahmin etmez) → uygunsa Kadın/Erkek → sahne (3 kalıcı +
  varsa rozetli dönemsel) → üretim → sonuç. **Bekleme:** sayfada bekleme ekranı;
  kullanıcı ayrılabilir, iş arka planda sürer, sonuç Çalışmalarım'da bekler ve
  bildirim gider; yüzde göstergesi yok (backend ara ilerleme bildirmiyor, bkz.
  Faz 2). **Kredi metni:** üretimden önce "1 kredi, 2 deneme" YAZILMAZ; ilk
  üretim bitince sonuç ekranında "Tekrar dene (ücretsiz)" yazılır. **İki
  sonuç:** ikinci denemede kullanıcı ikisinden birini seçer, seçilmeyen silinir
  (depolama artmaz); **7 gün içinde seçmezse SON üretilen kalır, ilki silinir**
  (süre ayarlanabilir). Silme hata yolu önceki yazmaları bozmaz (ders 25).
- **Uyarı metni** (Serhan'ın cümlesi; dokümandaki "küçük farklılıklarla" ifadesi
  riski az gösterdiği için bırakıldı): *"Yapay zeka ürünü yeniden çizer. Taş,
  kesim ve ince ayrıntılar gerçek üründen farklı olabilir. Birebir ürün görseli
  için stüdyo çıktısını kullanmanızı öneririz."* **İlk kullanımda** tam metin +
  onay kutusu (onay kayda yazılır; mevcut kullanıcılardan yasal metin için
  yeniden onay istenmediğinden bu onay aynı zamanda yurt dışı aktarım bilgisini
  de taşır); sonra her sonuç ekranında indir düğmesinin yanında kalıcı kısa not
  ("Yapay zekâ ile çizildi, ürünle karşılaştırın"). Her üretimde tekrar uyarı
  çıkmaz.
- **Benzerlik ilkesi.** Her Vitrin AI görseli "benzerdir", birebir değildir;
  **birebir ana görsel her zaman stüdyodan çıkar**, Vitrin AI ek ("ürün
  kullanımda", sosyal medya) görsel üretir. Sahne kaydındaki **üretim modu**
  alanı: "yeniden çiz" ya da "sahne + orijinal ürün" (hibrit: AI yalnız sahneyi
  üretir, orijinal kesim üstüne konur, sonuç birebir olur). **İlk sürümde TÜM
  sahneler "yeniden çiz"**; hibrit (özellikle duruşu değiştirmeyen yüzey/kart
  sahneleri için) sonra, önce denenip veri olarak açılır. İndirme: Vitrin AI
  çıktısı logo/etiket, çoklu boyut ve WhatsApp'a girer; **CMYK baskı PDF'ine
  GİRMEZ** (yeniden çizilmiş görselin matbaaya gitmesi yanıltıcı olur, baskı
  yalnız stüdyo çıktısından).
- **Şeffaflık.** Köşede "yapay zekâ ile oluşturuldu" etiketi, **kullanıcı
  kapatabilir** (Serhan'ın kararı; Claude daha sıkı bir başlangıç önermişti —
  kapatılabilirlik hukukçu listesinde, bkz. açık takip 13); **dosyada görünmez
  işaret her zaman** yazılır (teknik yöntem uygulamada seçilir; sağlayıcıların
  kendi işaretlemesi olabilir, resmî belgeden doğrulanır); **sunucuda yalnız
  eklemeye açık üretim kaydı** (kim, hangi ürün, ne zaman, hangi sahne ve prompt
  sürümü, etiket kapatıldı mı). Dosya bilgileri Instagram ve WhatsApp'ta
  silinebildiği için asıl kanıt bu kayıttır. **Hesap silinince** kayıttaki
  kullanıcı kimliği **anonimleştirilir, kayıt kalır** (KVKK için hukukçuya
  teyit; Faz 7 hesap silme akışıyla çakışmaması testle kanıtlanır).
- **Kredi ve erişim.** Aynı kredi bakiyesi; sahne kaydında "kaç kredi" alanı
  (varsayılan sunucu ayarı), Faz 5 rezervasyon ve iade mantığı aynen kullanılır
  (teknik hatada iade; "beğenmedim" ücretsiz tekrarı tüketmez). **Kredinin
  değeri (paket içinde kaç kredi) bilerek AÇIK.** Günlük bütçe tavanı YOK
  (kullanıcı krediyle ödüyor). **Ücretsiz Deneme planı Vitrin AI kullanamaz**
  (düğme görünür ama kilitli, "Vitrin AI ücretli planlarda" der): ödenmemiş
  kullanım dış sağlayıcıya gerçek para harcatır. **Admin panelinde tek bir
  açma/kapama bayrağı** (kapalıyken yeni üretim başlamaz, kredi düşmez, mevcut
  işler biter; **canlıya çıkarken varsayılan KAPALI**; faturalamadaki "checkout
  varsayılan kapalı" deseni). Üretim ucu para harcadığı için hız sınırı
  fail-closed sınıfındadır (`CLOSED`). **Maliyet açıkları ve kararları
  (02.10.2026):** (a) ücretsiz Deneme planı → kullanamaz (yukarıda). (b) *çalınmış
  kartla alınan kredi (chargeback):* **bilinçli kabul**; Faz 5'in itiraz akışı hesabı
  zaten askıya alır, hesap başına hız sınırı art arda üretim patlamasını yavaşlatır,
  yeni hesabı bekletmek dürüst kullanıcıyı cezalandırdığı için YAPILMAZ. (c) *işçide
  mükerrer sağlayıcı çağrısı:* **yeniden deneme YOK.** Sağlayıcı yanıt vermezse (zaman
  aşımı, ağ kopması, işçi çökmesi) iş başarısız sayılır ve kredi iade edilir; kullanıcı
  "tekrar dene" der ve yeni iş açılır. Sağlayıcıya çağrıdan ÖNCE iş "çağrı başladı"
  diye kaydedilir; yeniden başlayan işçi "çağrı başladı ama sonuç yok" durumundaki
  işi yeniden ÇAĞIRMAZ, başarısız sayıp iade eder. Bedel: sağlayıcı ilk çağrıyı
  tamamlamışsa o çağrı boşa gider (en kötü durumda iş başına 1 çağrılık kayıp) ve
  geçici hatada kullanıcı bir hata ekranı görür; kazanç: "iş başına en kötü iki üretim"
  maliyet varsayımı bozulmaz. Sağlayıcının geçici hata oranı yüksek çıkarsa bu karar
  model yarışındaki ölçümle yeniden değerlendirilir. (d) *sağlayıcı fiyat artışı:*
  ek koruma yok; sahne kaydındaki "kredi maliyeti" admin panelinden artırılır (kod
  değişmez) ve **üretim kaydına sağlayıcı maliyeti yazılır** (gerçek ortalama maliyet
  görünsün; Faz 7.5'teki gerçek maliyet ölçümü bunu kullanır).
- **Model: şimdi seçilmez.** Dokümandaki "ChatGPT önde, Gemini ikinci" iki
  yüzük, kombinasyon başına tek örnek ve **uygulama arabirimi (API değil)**
  üzerindeki bir ilk izlenimdir; API çıktısı farklı olabilir. Kodda sağlayıcı
  sunucu ayarıyla değiştirilebilir olur. Uygulamadan önce ChatGPT ve Gemini
  **API'si** aynı ürün + sahnelerle, kombinasyon başına 3 deneme yarıştırılır;
  sadakat testini geçen ve ucuz olan seçilir, sonuç buraya yazılır. Model
  kalitesini bozan bir kısayol yoktur (kesim modeli için geçerli kural burada da
  ürün sadakati önceliğidir).
- **Gizlilik.** Sağlayıcıya **yalnız arka planı kaldırılmış kesim** gider; özgün
  fotoğraf gitmez. Yayından önce sağlayıcının eğitimde kullanmama ve saklama
  ayarları resmî belgeden doğrulanır (ders 33: söz, kodda/ayarda doğrulanır).
  KVKK/gizlilik metnine "Vitrin AI için kesim görseli yurt dışı sağlayıcıya
  aktarılır" maddesi eklenir (alıcı grubu + sağlayıcı adı; metin sürümü
  değişir) — hukukçu turuna girer.

**Görev bölüşümü (rol dayanağı: bölüm 5):** Serhan — sahne şeması + migration + RLS,
admin sahne yönetimi, prompt sürümleme, üretim hattı (kuyruk, kredi, iade,
açma/kapama bayrağı, hız sınırı sınıfı, üretim kaydı), sağlayıcı soyutlaması ve
model yarışı, gizlilik doğrulaması, hukukçu soruları. Kaan — Vitrin AI sayfası ve
kesim sonrası düğme, tür/sahne seçimi, bekleme ve sonuç ekranı (iki sonuçtan
seçim, ücretsiz tekrar), ilk kullanım onayı, etiket ve kalıcı not, Deneme planı
kilidi. Sınır: kullanıcıya görünen metinler ve ekran düzeni Kaan'ın, sunucu
davranışı Serhan'ın.

**Açık (bilerek ertelendi; bu fazın İLK işleri):**

1. ChatGPT ve Gemini'nin API üzerinden tutarlılığı ve gerçek API maliyeti
   (3 tekrar; resmî fiyat sayfası).
2. Kolye ve bileklik (vücut) sahnelerinin testi; yalnız yüzük denendi.
3. Takım akışı (birden fazla kesim seçmek).
4. Kredinin paket içindeki değeri ve fiyat (KDV ve komisyon dahil iş başına
   maliyet; mali müşavire sorulacak KDV konusu).
5. Hukukçu soruları — açık takip 13.
6. **"İş = ürün + sahne" idempotency tanımı** aynı ürün + sahneyi sonradan
   yeniden üretmeyi engellememeli (yeni giriş = yeni anahtar; ders 24:
   girdinin kalıcı olarak tek olduğunu sor).
7. ✅ **Ad çakışması — karar verildi (03.10.2026, Kaan + Serhan; PR #48 yorumu):**
   Deneme planı filigranı "Vitrin AI" yazısı yerine sayfanın görünen bir yerinde
   **şeffaf Vitrin logosu** olacak (ayrıntı Faz 5, madde 7).
8. ✅ **Sahne listesi düzeni — karar verildi (03.10.2026, Kaan; PR #48 yorumu):**
   şimdilik **kategorili**, sahne sayısı büyüyünce yeniden bakılır. Her türün üç
   sütunu ekranda **Tek başına** (kutuda, serili, kartta) · **Dekorlu** (gül
   yaprağı, kadife büst, mermer/çiçek, Kapalıçarşı sehpası) · **Üzerinde**
   (parmakta, boyunda, kulakta, bilekte) başlıklarıyla gruplanır; ekranda
   "Üzerinde · Parmakta" gibi görünür. "Diğer" türünde başlık yok, sahneler
   düz listelenir. Bunun için sahne kaydına bir **kategori alanı** gerekiyor
   (ör. `standalone | decorated | worn`, "Diğer" için boş); şema Serhan'ın,
   PR #48 yorumunda istendi.
9. Kullanıcıya gösterilen "yapay zekâ ile oluşturuldu" etiketinin görünümü ve
   görünmez işaretin yöntemi.

**Çıkış ölçütleri (bu faz kapanmadan 7.5'e geçilmez):** sahne şeması, RLS ve
admin yönetimi çalışıyor; model seçimi API testiyle yapılmış ve sonucu burada;
her açık tür kendi sadakat testini geçmiş (geçmeyen tür kapalı); üretim hattı
kredi, iade, idempotency ve kapatma bayrağıyla testli; kapsam envanteri
(`test_idor.py` sınıfı, `test_rate_limit_coverage.py` sınıfı `CLOSED`) yeni
uçlar için tamam; uyarı, etiket, görünmez işaret ve üretim kaydı çalışıyor;
hesap silme + anonimleştirme testli; sağlayıcıya yalnız kesim gittiği testle
kanıtlı; Deneme planı kilidi testli; gizlilik/KVKK metni taslağı ve hukukçu
soruları hazır (hukukçu yanıtı 7.5'te).

**Güvenlik:** `SECURITY.md` bölüm 6 ("Yapay zekâ sağlayıcısına aktarım — Vitrin AI"
maddesi) ve bölüm 8 (Faz 7.2) bu fazı kapsar. Yeni uç, tablo ve dosya yazan her iş
kök `CLAUDE.md`'deki güvenlik davranış kurallarına tabidir.

### Faz 7.5 — Canlıya çıkış (deploy) — ⏳ Planlanan (26.09.2026'da ayrıldı)

**Neden ayrı bir faz (kullanıcı kararı, 26.09.2026):** production alan adı
son ana kadar kararlaştırılmayacak. Alan adına ve canlı sunucuya bağlı işler
Faz 7'nin içinde durduğu sürece Faz 7 hiç kapanamazdı; oysa Faz 7'nin kendi
işi (test, optimizasyon, sağlamlaştırma) alan adı olmadan yapılabiliyor. Bu
yüzden canlıya çıkışa bağlı her şey buraya toplandı. **Faz 7 ve Faz 7.2 (Vitrin
AI; sıra kararı 02.10.2026) bitmeden bu faza geçilmez; bu fazın ilk adımı alan
adı kararıdır** — aşağıdaki maddelerin çoğu ona bağlı.

- **Alan adı ve dağıtım hedefi kararı** (backend sunucusu ≥12–14 GB RAM,
  frontend Vercel mi sunucu mu). Diğer maddelerin kilidi.
- **Faz 5'in canlı açılışı:** iyzico merchant sandbox doğrulaması ve
  `docs/billing-runbook.md` "Kurulum sırası" (yerel test başarısı sandbox
  doğrulaması sayılmaz). `RESEND_API_KEY` / `BILLING_EMAIL_FROM` ve
  `TRUSTED_PROXY_IPS` production'da verilir (`ROADMAP.md` bölüm 7, açık takip
  maddesi 3).
- **Vitrin AI'ın canlı açılışı (Faz 7.2'den, 02.10.2026):** Vitrin AI Faz 7.2'de
  kodlanır ama canlıda açma/kapama bayrağı **KAPALI** başlar; bu fazda: (1) hukukçu
  turuna Vitrin AI soruları eklenir (açık takip 13) ve KVKK/gizlilik metninin yeni
  sürümü yayımlanır; (2) seçilen AI sağlayıcısının üretim API anahtarı verilir ve
  eğitimde kullanmama/saklama ayarları canlı hesapta yeniden doğrulanır; (3) gerçek
  bir üretimle uçtan uca denenir (kredi düşümü, teknik hatada iade, iki sonuçtan seçim,
  7 günlük silme, görünmez işaret, üretim kaydı, hesap silmede anonimleştirme) ve
  **gerçek üretim maliyeti** ölçülüp Faz 7.2'deki tahminle karşılaştırılır;
  (4) Vitrin AI uçları ZAP taramasına ve hız sınırı değerlerinin canlı gözden
  geçirilmesine (ölçüm listesi madde 12) dahil edilir; (5) bayrak açılır — bu ayrı
  ve bilinçli bir karardır, deploy ile birlikte kendiliğinden olmaz.
- **Bakım worker'ı periyodik çalıştırılır** (`python -m
  app.services.billing.maintenance`, cron/systemd timer; `ROADMAP.md` bölüm 7, açık takip maddesi 4) ve gerçek bir test hesabı silme isteğiyle doğrulanır.
- **Yalnız-yerel ayarların production'da kapalı olduğu doğrulanır:**
  `R2_SHARED_WITH_PRODUCTION=false` (açık kalırsa silinen zeminlerin R2
  dosyaları bucket'ta sahipsiz kalır), `LOCAL_ADMIN_EMAILS` boş,
  `USE_MOCK_BACKEND=false`.
- **Faz 6'dan taşınan CMYK işleri (26.09.2026):** fiziksel matbaa provası,
  matbaanın PSO Coated v3 istediğinin teyidi, TAC/preflight kontrolü, 2,2
  MB'lik gömülü profil kararı ve **canlı sunucu ölçümü** — 40 MP'lik bir
  görselin CMYK dönüşümünün production sunucusunda ne kadar sürdüğü ve ne
  kadar bellek harcadığı. Profil dosyası sunucuya konup `CMYK_ICC_PATH`
  ayarlanır (`ROADMAP.md` bölüm 7, açık takip maddesi 1).
- **Otomatik veritabanı yedeği (Faz 7'den, 27.09.2026):** Supabase
  ücretsiz pakette otomatik yedek YOK. `backup_database.py backup` günlük
  çalışacak şekilde zamanlanır (sunucuda cron/systemd timer), çıktı AYRI ve
  özel bir R2 bucket'ına yüklenir (yalnız o bucket'a yetkili ayrı anahtar),
  saklama süresi belirlenir ve ayda bir `restore-test` koşulur. Alternatif:
  Supabase Pro'ya geçmek (7 gün otomatik yedek) — o durumda bizimki ek,
  başka yerde duran kopya olur. `BACKUP_ENCRYPTION_KEY` parola
  yöneticisinde saklanmış olmalı.
- **GPU'ya geçiş kararı (Faz 7'den, Serhan'ın kararı 26.09.2026):**
  kesim kapasitesini asıl artıran adım. Sunucusuz GPU sağlayıcıları (Modal,
  RunPod, Replicate vb.) fiyat, soğuk başlangıç süresi, veri konumu (KVKK) ve
  BiRefNet MIT ağırlıklarının çalıştırılabilirliği açısından karşılaştırılır.
  Faz 7'deki kuyruk, işçiyi GPU'ya taşımayı API'ye dokunmadan mümkün kılacak
  biçimde kurulur.
  **27.09.2026 güncellemesi:** kuyruk kuruldu (işçi API'den ayrı). Örnek
  fiyat araştırması: `docs/research/sunucu-fiyatlari-2026-09-27.md` (yalnız
  CPU / aylık GPU sunucusu / saatlik GPU / sunucusuz GPU; aylık hacme göre
  kaba karşılaştırma; KVKK veri konumu notu). **Yalnız FP32** (Serhan: kalite
  bozan optimizasyon yok). Geçişten önce `profile_cutout.py` GPU'da koşulur
  ve GPU çıktısı `compare_cutouts.py` ile CPU çıktısına karşı ölçülür.
- **Canlı sunucuda yapılacak ölçümler (Faz 7'den, 26.09.2026 — unutulmasın,
  `ROADMAP.md` bölüm 7, açık takip maddesi 7):** yerel ölçümler tek makinede
  yapıldı ve aşağıdakilerin yerine geçmez.
  1. **Bellek (RAM):** backend'in tepe bellek kullanımı Linux'ta, çalışan
     serviste yeniden ölçülür (referans 12 GB; macOS'ta yerel ölçüm 4,5–5 GB
     çıktı ama bellek sıkıştırması yüzünden karşılaştırılamaz). Sunucu boyutu
     bu ölçüme göre seçilir.
  2. **Kesim süresi:** production CPU'sunda fotoğraf başına süre (yerelde
     Apple M4'te ~13 sn). Süre kapasiteyi doğrudan belirler: tek süreçte
     dakikada 60 / süre kesim.
  3. **Yük testi:** `backend/scripts/load_test.py` production'a benzer bir
     sunucuda, yük üreticisi AYRI bir makineden koşulur (yerelde ikisi aynı
     CPU'yu paylaşıyordu). R2'ye yazmaz; ayrı bir test veritabanı gerekir.
  4. **Veritabanı bağlantı havuzu:** varsayılan (5 + 10 taşma) yerel yük
     testinde darboğazın bir parçası çıktı (havuz 40'ta iki uç 1,7–2,3 kat
     hızlandı). Doğru boyut Supabase pooler'ının bağlantı sınırıyla birlikte
     canlıda ölçülerek seçilir; sınırı aşan havuz bağlantı hatası üretir.
  5. **CMYK dönüşümü:** 40 MP'lik görselin production'da süresi ve belleği
     (Faz 6'dan taşınan madde, açık takip maddesi 1).
  6. **Hata izleme:** seçilen sağlayıcıya gerçek bir hata gönderilip
     maskelemenin orada da doğru göründüğü kontrol edilir.
  7. **Kesim kuyruğu kapasitesi:** aynı makinede 2 işçi ya da
     `MAX_CONCURRENT_INFERENCES=2` throughput'u artırıyor mu (yerelde 16 GB'lık
     makine bunu kaldırmadı, ders 31); sunucunun belleğine göre işçi sayısı
     seçilir. İşçi bir servis olarak (systemd) kurulur ve çöktüğünde yeniden
     başlatıldığı doğrulanır; işçi yoksa kesimler sırada bekler.
  8. **Boşta kalıştan sonraki ilk kesim:** işçi bir süre boşta kaldıktan sonra
     ilk kesimin süresi ölçülür. 27.09.2026'da bellek sıkışık Mac'te model
     diske atılmış, ilk kesim 30 sn sürmüştü (sonrakiler 9 sn). Sunucuda model
     bellekte kalmalı (yeterli RAM, takas tercihen kapalı).
  9. **GPU seçilirse:** `backend/scripts/profile_cutout.py` GPU sunucusunda
     koşulup kesim süresi tahmini (~0,3–1,5 sn) gerçek ölçüme çevrilir; FP32
     GPU çıktısı `compare_cutouts.py` ile CPU çıktısına karşı gerçek
     fotoğraflarda karşılaştırılır (kalite bozan hiçbir ayar yok — FP16/INT8
     kapsam dışı). Fiyatlar: `docs/research/sunucu-fiyatlari-2026-09-27.md`.
  10. **Redis diske yazmıyor mu:** kesim kuyruğu özgün fotoğrafı Redis'te
     tutuyor ve KVKK metni "diske yazılmaz" diyor. Canlı Redis'te RDB ve AOF
     kapalı olmalı (`--save "" --appendonly no`). API bunu her kuyruğa
     koymadan önce `CONFIG GET` ile doğruluyor ve açıksa fotoğrafı ALMIYOR
     (kredi iade + 503). **`CONFIG` yasaksa da fotoğrafı almıyor**
     (doğrulanamayan söz verilmiş sayılmaz — Codex incelemesi, 2. tur).
     Yani `CONFIG GET`'e izin vermeyen yönetilen bir Redis (bazı
     sağlayıcılar) kesim kuyruğuyla ÇALIŞMAZ; sağlayıcı seçilirken bu
     dikkate alınır, gerekirse bilinçli bir kararla koda dönülür.
  11. **Açılış vitrini (Faz 7'den, 28–30.09.2026; `ROADMAP.md` bölüm 7, açık takip
     7 madde 11):** gerçek bir orta sınıf telefonda 3D yakınlaşmanın akıcılığı
     ölçülür (M4'te 60 fps; telefon ekran kartı hiç ölçülmedi, yakınlaşma
     telefonda `compact` kaliteyle çalışıyor); alan adı belli olunca
     `NEXT_PUBLIC_SITE_URL` verilir (paylaşım önizlemesi ve site haritası bu
     adresi kullanır); canlıda Safari ile ÜRETİM adresinde kontrol yapılır
     (geliştirme sunucusu üretimle aynı şey değildir, kök `CLAUDE.md` ders 39).
  12. **Hız sınırı değerleri gerçek trafikle gözden geçirilir (Faz 7'den,
     02.10.2026; `ROADMAP.md` bölüm 7, açık takip 7 madde 12):** okuma 600/dk, taslak
     kaydı 300/dk, çalışma silme 30/dk, hesap silme 5/saat ölçülmüş değil,
     istemci sıklığının üstüne konmuş emniyet payları. Canlıda 429 sayıları ve
     meşru kullanıcıların sınıra çarpıp çarpmadığı izlenir, değerler buna göre
     ayarlanır; taslak kaydının fail-open kararı da yeniden değerlendirilir.
- **Güvenlik kapanış listesi (Faz 7'den, 27.09.2026 — `ROADMAP.md` bölüm 7, açık takip maddesi 10 ile aynı; Faz 7.5'e başlarken hatırlatılır):**
  1. **HSTS ve başlıkların canlıda doğrulanması.** Ön yüz CSP, tıklama tuzağı
     koruması, `nosniff`, `Permissions-Policy`, `Referrer-Policy`, COOP/CORP,
     `poweredByHeader` ve backend `nosniff`/CORP **Faz 7'ye çekildi
     (01.10.2026, Serhan'ın onayı; sahipleri ROADMAP Faz 7 "kapanış denetimi")**
     — alan adına bağlı değiller. **Ön yüz başlıkları 03.10.2026'da yeniden
     Faz 7.5'e taşındı** (Kaan + Serhan'ın ortak kararı; iyzico ödeme formunun CSP adresleri
     ve nonce kararı bekliyor — bölüm 7, açık takip 10 madde 7). Burada kalan: canlıda HSTS, başlıkların canlı
     adreste gerçekten geldiğinin ZAP pasif taramasıyla doğrulanması ve
     başlıklar oturunca CI'a ZAP pasif taraması (`zaproxy/action-baseline`)
     eklenmesi. (CSP önemli: oturum token'ı tarayıcıdan okunabildiği için
     `@supabase/ssr`, `SECURITY.md` 3.1 — XSS'e karşı asıl önlem.)
  2. **Canlıda tarama:** test/staging ortamı kurulunca ZAP pasif taraması
     canlı adreste; AKTİF tarama yalnız staging'de (canlıda sahte kayıt ve
     ödeme denemesi üretir). 27.09.2026 taramalarının kapsamadıkları:
     R2'ye ve Supabase yönetici API'sine dayanan uçların içi (tarama
     sırasında bilerek koparılmıştı) ve ön yüzün oturumlu taraması.
  3. **Canlı Redis:** özel ağda, parolalı, RDB/AOF kapalı ve `CONFIG GET`
     izinli (ölçüm listesi madde 10).
  4. **Canlı altyapı denetimi:** HTTPS/HSTS, ters vekil, `TRUSTED_PROXY_IPS`
     (açık takip 3), R2 CORS ve bucket politikası (açık takip 2), Supabase
     Auth panel ayarları — "Require current password when changing
     password", "Secure password change", "Secure email change" (27.09.2026'da
     açıldı; değişirse `SECURITY.md` 3.1 güncellenir).
  5. **Profesyonel penetrasyon testi:** ücretsiz karşılığı yok; canlıya
     çıkmadan önce bütçe olursa staging'de.
  6. **CI'a eklenebilecekler (27.09.2026 değerlendirmesi):** kod kapsama
     raporu (`pytest-cov`, önce yalnız bilgi amaçlı), ZAP pasif taraması
     (madde 1'den sonra), uçtan uca tarayıcı testleri (Playwright, Kaan'ın
     Faz 7 işi). Backend kod kuralı kontrolü (`ruff`, yalnız pyflakes)
     27.09.2026'da eklendi.
- **Hata izleme sağlayıcısı (Faz 7'den, 26.09.2026):** sentry.io'nun AB
  bölgesi mi kendi barındırılan GlitchTip mi seçilir; `SENTRY_DSN` ve
  `SENTRY_ENVIRONMENT=production` verilir. **Açmadan önce** sağlayıcı KVKK
  aydınlatma metninin alıcılar bölümüne (ve yurt dışıysa aktarım bilgisine)
  eklenir — metin değişince sürüm/onay akışı işler (`SECURITY.md` bölüm 9).
  **26.09.2026 güncellemesi:** alıcı GRUBU metne eklendi; kalan iş seçilen
  sağlayıcının adını gizlilik tablosuna yazmak, `NEXT_PUBLIC_SENTRY_DSN`'i
  vermek ve kaynak haritası yüklemesine (`withSentryConfig` + auth token)
  karar vermek. Yeni metin hukukçu son kontrolüne dahildir.
- **Launch öncesi son kapı — dış girdiye bağlı (kullanıcı kararı
  14.09.2026; Faz 7'den buraya taşındı 26.09.2026):**
  - R2 CORS kuralına production alan adı eklenmesi (`ROADMAP.md` bölüm 7, açık takip maddesi 2) — production alan adı belirlenince.
  - Production veri sorumlusu unvanı/başvuru e-postası ve hukukçu son
    kontrolü (`ROADMAP.md` bölüm 7, açık takip maddesi 3) — hukukçu onayı
    verilince.
  - Baskı (CMYK) profili üretime konması (`ROADMAP.md` bölüm 7, açık takip
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
    hesap sahibi dışına hiç göndermemesi) — bkz. `ROADMAP.md` bölüm 7, açık takip maddesi 5.

### Faz 8 — Mobil uygulama ve kamera entegrasyonu — ⏳ Planlanan

**Önkoşul (02.10.2026):** Faz 7.2 (Vitrin AI) ve Faz 7.5 (canlıya çıkış) biter; sıra
Faz 7 → 7.2 → 7.5 → 8. Vitrin AI mobilden önce web'de tamamlanır, mobil onun web
iş mantığını yeniden kullanır.

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

## 7. Açık takip maddeleri

Kapatılmamış, sahibi belli işler (kök `CLAUDE.md`'den buraya taşındı, 02.10.2026; maddelerin numaraları değişmedi, belgelerdeki "açık takip N" atıfları bu bölüme gider). Bir madde çözüldüğünde buradan **silinir**, "tamamlandı" diye bırakılmaz — liste her zaman yalnızca açık işleri göstermeli.

### 1. Baskı (CMYK) profili üretime konmalı — sahibi: Kaan

`/api/cmyk` gerçek CMYK üretiyor (4 kanal, ICC gömülü) ama hedef baskı
koşulunun profilini `CMYK_ICC_PATH` env değişkeninden alıyor ve **varsayılanı
yok**. Değişken boşsa ya da dosya okunamıyorsa endpoint dönüşüme başlamadan
açık bir mesajla 503 döner.

Profilsiz bir çevrim matbaada yanlış renk verir; bunu sessizce yapmak özelliği
hiç sunmamaktan kötüdür — bu yüzden varsayılan konmadı.

**Profil seçildi (16.09.2026, Kaan): ECI "PSO Coated v3"** (FOGRA51, ISO
12647-2:2013, kuşe kâğıda ofset). eci.org indirme sayfası, `pso-coated_v3.zip`
(1784 KB) → `PSOcoated_v3.icc`. Eski öneri `ISOcoated_v2` artık ECI'nin
"eski sürümler" bölümünde; ECI onu yalnızca eski dosyalar için sunuyor.

**Profil DEPOYA KONMAZ — lisans.** Profilin içindeki telif etiketi: kullanılabilir,
dosyalara gömülebilir ve paylaşılabilir; **ECI'nin yazılı izni olmadan dağıtılamaz,
satılamaz, değiştirilemez.** Depo GitHub'da herkese açık; oraya koymak dağıtım olur.
Kullanıcının indirdiği CMYK dosyasına gömülmesi ve matbaaya gönderilmesi serbest.
Bu yüzden: `*.icc` kök `.gitignore`'da, profil depo dışında durur ve
`CMYK_ICC_PATH` ile verilir (yerelde `Yeni klasör\vitrin-ai-baski\PSOcoated_v3.icc`).

**Planlandı: Faz 6 (kullanıcı kararı, 17.09.2026).** PR #18 incelemesi
sırasında bu iş bilinçli olarak o PR'ın kapsamı dışında bırakıldı (ödeme/zemin
düzeltmeleriyle ilgisi yok) ve `ROADMAP.md` Faz 6'da Kaan'ın kısmına yazıldı.
PR #18'in yorumunda iş Serhan'dan istenmişti; sahip **Kaan** olarak netleşti.
PR #18'de yalnızca şu doğrulandı: profil ayarlı değilken `POST /api/cmyk`
doğru mesajla 503 dönüyor.

**Açık kalan — canlıya çıkarken:** profil dosyası sunucuya ayrıca konup
`CMYK_ICC_PATH` o yola ayarlanmalı. Frontend **Vercel**'e çıkarsa bilgisayardaki
bir yol okunamaz; o durumda profil özel bir depolamadan (ör. herkese açık olmayan
R2 nesnesi) çalışma anında alınmalı — henüz yazılmadı, dağıtım hedefi belli
olunca karar verilecek.

**Ölçüm (17.09.2026):** çıktı gerçekten 4 kanallı CMYK, alfasız, içinde
"PSO Coated v3" profili gömülü (TIFF ve JPEG). **Profil 2,2 MB** ve her dosyaya
gömülüyor: küçük bir görsel bile ~2,2 MB iniyor. Beyaz 0/0/0/0 çıkıyor (saydamlık
beyaza düzleşiyor). **18-19.09.2026: Kaan çıktıyı Photoshop'ta açıp iki kez
kontrol etti — CMYK olarak açılıyor, çalışıyor.** Kaan'ın değerlendirmesi:
"matbaada bir sorun çıkmaz" (19.09.2026). Fiziksel matbaa provası hâlâ
yapılmadı; **kod tarafında yapılacak bir iş kalmadı**, açık olan tek şey
aşağıdaki deploy adımı (profil dosyasının sunucuya konması).

### 2. R2 bucket CORS kuralı şimdilik yalnızca localhost — production deploy'da alan adı eklenmeli, sahibi: Serhan

Editör zeminleri `crossOrigin="anonymous"` ile yüklüyor. Bucket'ın CORS kuralı bir origin'i içermiyorsa tarayıcı görseli **hiç yüklemiyor** ve editör sessizce gradyana düşüyor; küçük önizleme (CSS arka planı) yine göründüğü için hata gözle fark edilmiyor, çıktı zeminsiz iniyor. Bu davranış sahte bir CORS'suz origin'le gerçek tarayıcıda ölçüldü; CORS'lu origin'le 2000×2000 dışa aktarma zeminle birlikte doğru çıktı.

**Bilinçli karar (10.09.2026, kullanıcı onayı):** henüz bir production alan adı yok, bu yüzden bucket'a şimdilik yalnızca `http://localhost:3000` için GET/HEAD kuralı eklenecek (şablon `backend/README.md` → "R2 CORS"). **Deploy anında bu maddeye mutlaka geri dönülmeli** — asıl production alan adı belirlendiğinde kurala eklenmezse, canlıda çıkan her kompozisyon sessizce zeminsiz iner (yerelde fark edilmeyen bir hata modu, çünkü localhost zaten kuralda var). Doğrulama: `backend/scripts/check_r2_cors.py <production-origin> http://localhost:3000` çalıştırılıp çıkış kodu 0 görülmeli.

### 3. Ödeme bildirimi ve proxy ayarları deploy anında verilmeli — sahibi: Serhan

İki ayar üretimde verilmezse sistem çalışır ama **sessizce eksik davranır**:

- `RESEND_API_KEY` + `BILLING_EMAIL_FROM` yoksa "ödemeniz alınamadı, kartınızı
  güncelleyin" e-postası hiç gitmez. Sessiz kalmıyor (`billing_alerts`'e
  `dunning_email_not_sent` yazılıyor); action `succeeded` sayılmıyor, sınırlı
  retry/manual inceleme için açık kalıyor. Yine de operatör alarmı çözmezse
  kullanıcı 3 günlük grace penceresini haberi olmadan tüketebilir.
- `TRUSTED_PROXY_IPS` (ve uvicorn'un `--proxy-headers` / `--forwarded-allow-ips`
  değerleri) verilmezse hız sınırı bütün public trafiği proxy'nin tek kovasına
  koyar; sınır fiilen kalkar ve bunu yerelde fark etmenin yolu yoktur.

Sağlayıcı yeni değil: aşağıdaki 6. maddede Supabase Auth için seçilen Resend'in
aynısı. Fark, buradaki e-postanın Supabase'in gönderdiği kimlik doğrulama
postası değil, uygulamanın kendi bildirimi olması — bu yüzden Supabase SMTP
ayarından değil, kendi `RESEND_API_KEY`'imizle HTTP API'sinden gidiyor.
Ayrıntı: `docs/billing-runbook.md` "Kurulum sırası" 5. ve 6. maddeler.

### 4. Bakım worker'ı canlıda periyodik çalışmalı — sahibi: Serhan

`provider_actions` kuyruğunu (hesap silme, abonelik iptali, dunning e-postası,
depolama temizliği) işleyen tek şey `python -m app.services.billing.maintenance`.
Aynı tur kesim işçisinin sağlığını da gözler, ama "işçi yok" alarmı bu işe
BAĞLI DEĞİL: API sürecinin kendi periyodik gözlemcisi var (02.10.2026).
Bir servis olarak kurulu değil; 19.09.2026'da test hesabının silinmesi elle
çalıştırılana kadar "sırada" kaldı. **Canlıda periyodik çalıştırılmazsa
(systemd timer / cron) hiçbir silme talebi, iptal ya da ödeme bildirimi
tamamlanmaz** — arayüz "işlem sırada" der ve süresiz orada kalır. Yerelde bu
fark edilmiyor çünkü kuyruk zaten boş duruyor.

**PR #25'ten Serhan'a devredilen açık iş:** production hedefi belli olduğunda
bu komut için tekil çalışan bir cron/systemd timer kurulacak; çakışan iki turun
aynı işi sahiplenmediği ve başarısız turun alarm ürettiği doğrulanacak. Sonra
gerçek bir test hesabı silme isteğiyle `provider_actions` kaydının `succeeded`
olduğu ve `billing_runs` içindeki son başarılı çalışma zamanının ilerlediği
gözlenecek. Bu doğrulama yapılmadan hesap silme/iptal/dunning akışı production'a
hazır sayılmaz.

**PR #25 sahiplik notu:** `GET /api/admin/me` Serhan'ın backend alanı,
`PATCH`/`DELETE /api/admin/backgrounds/{id}` ise Serhan'ın planlanan PR 2
kapsamıydı; Kaan bunların üçünü de PR #25'te tamamladı. Serhan tarafında yeniden
yazılacak iş yoktur; PR 2 hazırlanırken aynı değişiklikler tekrarlanmayacak,
yalnız çakışma/rebase kontrolü yapılacaktır. CMYK deploy adımının sahibi Kaan'dır;
zemin favorilerini hesaba bağlama işi ise PR #25'te Serhan'a atanmadı.

### 5. Production yasal kimliği ve hukukçu kontrolü — sahibi: Kaan + Serhan

KVKK Aydınlatma Metni, Gizlilik Politikası ve Kullanım Koşulları yayımlandı;
kayıtlar sunucu zamanlı, istemciden değiştirilemeyen `user_consents` tablosuna
sürümüyle yazılıyor. Production'a çıkmadan önce gerçek veri sorumlusu unvanı ve
başvuru e-postası `NEXT_PUBLIC_DATA_CONTROLLER_NAME` /
`NEXT_PUBLIC_LEGAL_CONTACT_EMAIL` ile verilmeli ve metinler Türkiye'de yetkili
bir hukukçu tarafından son kez kontrol edilmeli. Vercel production veya
`VITRIN_DEPLOY_ENV=production` bu iki değer eksikken build'i durdurur.

### 8. Veritabanı yedeği henüz OTOMATİK değil — sahibi: Serhan

Supabase projesi **ücretsiz pakette** ve bu pakette Supabase otomatik yedek
almıyor; tek yedek `backend/scripts/backup_database.py`'nin ürettiği şifreli
döküm (27.09.2026'da production'dan alındı, geri yükleme testi birebir
geçti — `backend/README.md` → "Veritabanı yedeği"). Açık olanlar:

1. **Faz 7.5'e kadar:** yedek elle alınır (önemli bir değişiklikten ya da
   migration'dan önce `backup` çalıştırılır). Şifreleme anahtarı
   (`BACKUP_ENCRYPTION_KEY`) parola yöneticisine kopyalandı (Serhan, 29.09.2026).
2. **Faz 7.5:** günlük otomatik çalıştırma, ayrı özel R2 bucket'ı, saklama
   süresi, ayda bir `restore-test` (ROADMAP Faz 7.5). Ya da Supabase Pro.

### 10. Faz 7.5 güvenlik kapanış listesi — sahibi: Serhan (27.09.2026, PR #30 sonu)

Faz 7'de kod güvenlik incelemesi (`/cso`) ve OWASP ZAP (oturumsuz + oturumlu,
yerel) yapıldı; açık bulunmadı, bulunan her şey düzeltildi (`ROADMAP.md` Faz 7
"Güvenlik incelemesi"). Aşağıdakiler bilinçli olarak canlıya çıkışa bırakıldı ve
**Faz 7.5'e başlarken bu liste hatırlatılmalı** (ROADMAP Faz 7.5'te aynısı):

  1. **HSTS ve başlıkların canlıda doğrulanması.** Ön yüz CSP, tıklama tuzağı
     koruması, `nosniff`, `Permissions-Policy`, `Referrer-Policy`, COOP/CORP,
     `poweredByHeader` ve backend `nosniff`/CORP **Faz 7'ye çekildi
     (01.10.2026, Serhan'ın onayı)** — sahipleri aşağıdaki açık takip 11 ve 12.
     **Ön yüz başlıkları 03.10.2026'da yeniden buraya taşındı** (madde 7).
     Burada kalan: canlıda HSTS, başlıkların canlı adreste ZAP pasif taramasıyla
     doğrulanması ve başlıklar oturunca CI'a ZAP pasif taraması
     (`zaproxy/action-baseline`).
  2. **Canlıda tarama** (yerel kit: `backend/scripts/zap/README.md`): test/staging ortamı kurulunca ZAP pasif taraması
     canlı adreste; AKTİF tarama yalnız staging'de (canlıda sahte kayıt ve
     ödeme denemesi üretir). 27.09.2026 taramalarının kapsamadıkları:
     R2'ye ve Supabase yönetici API'sine dayanan uçların içi (tarama
     sırasında bilerek koparılmıştı) ve ön yüzün oturumlu taraması.
  3. **Canlı Redis:** özel ağda, parolalı, RDB/AOF kapalı ve `CONFIG GET`
     izinli (ölçüm listesi madde 10).
  4. **Canlı altyapı denetimi:** HTTPS/HSTS, ters vekil, `TRUSTED_PROXY_IPS`
     (açık takip 3), R2 CORS ve bucket politikası (açık takip 2), Supabase
     Auth panel ayarları — "Require current password when changing
     password", "Secure password change", "Secure email change" (27.09.2026'da
     açıldı; değişirse `SECURITY.md` 3.1 güncellenir).
  5. **Profesyonel penetrasyon testi:** ücretsiz karşılığı yok; canlıya
     çıkmadan önce bütçe olursa staging'de.
  6. **CI'a eklenebilecekler (27.09.2026 değerlendirmesi):** kod kapsama
     raporu (`pytest-cov`, önce yalnız bilgi amaçlı), ZAP pasif taraması
     (madde 1'den sonra), uçtan uca tarayıcı testleri (Playwright, Kaan'ın
     Faz 7 işi). Backend kod kuralı kontrolü (`ruff`, yalnız pyflakes)
     27.09.2026'da eklendi.
  7. **Ön yüz güvenlik başlıkları — sahibi Kaan (açık takip 12 madde 2'den,
     03.10.2026'da Faz 7'den buraya taşındı; Kaan + Serhan'ın ortak kararı,
     başlıkların TAMAMI).** 01.10.2026'da Serhan'ın onayıyla Faz 7.5'ten Faz 7'ye
     çekilmişti; geri taşınma sebebi, CSP'nin iki kararının başka girdiye
     bağlı çıkması: (a) **iyzico ödeme formu** `/odeme/{id}`'de `srcDoc`
     iframe'inde çalışıyor (`components/checkout-page.tsx`) ve `srcDoc`
     belgesi ana sayfanın CSP'sini MİRAS ALIR — iyzico'nun script/connect/
     frame/img alan adları (sandbox ve canlı ayrı) CSP'ye girmezse ödeme formu
     çalışmaz; adresler kodda yok, **Serhan'a sorulacak**, ve form yerelde
     denenemiyor (checkout kapalı, merchant sandbox doğrulanmadı). (b) **Next'in
     satır içi script'leri** için yöntem: nonce (`proxy.ts`'te istek başına;
     enjekte script çalışmaz ama bugün statik olan sayfalar her istekte
     sunucuda üretilir — etkisi ölçülmeli) ya da `'unsafe-inline'` (basit, ama
     XSS korumasının çoğunu kaldırır); Claude'un önerisi nonce, yöntemi Kaan seçer.
     İş tanımı (değişmedi): `next.config.ts` `headers()` ile CSP,
     `frame-ancestors`/`X-Frame-Options`, `nosniff`, `Permissions-Policy`,
     `Referrer-Policy`, COOP/CORP (COOP ödeme pencerelerini kesmesin diye
     `same-origin-allow-popups`), `poweredByHeader: false`. CSP sayfanın
     yüklediği her kaynağı bilmeyi ister (Supabase, R2 imzalı görseller, Sentry
     DSN'i verilmişse, Konva ve HEIC WASM, three.js ve HDRI, `blob:`/`data:`,
     iyzico); önce yalnız raporlayan kipte (`Content-Security-Policy-Report-Only`)
     açılıp ÜRETİM derlemesinde (`next start`, ders 39) konsol ihlalleri
     taranır (sıra: Report-Only → ihlallerden kaynak listesi → zorlayıcı kip →
     başlık testi + E2E yeşil). Başlıkların geldiğini doğrulayan bir test
     eklenir. **R2 notu (03.10.2026, K1'den):** stüdyo zemini küçük kopya için
     R2'deki görseli `fetch` ile de alıyor; `connect-src` R2 kökenini içermeli
     (yoksa sessizce yavaş yola düşer, bkz. Faz 7 "Stüdyoda zemin değiştirirken
     takılma"). Backend başlıkları (`nosniff`, CORP) Faz 7'de bitti (Serhan).

### 12. Faz 7 kapanış denetiminden kalan işler — sahibi: Kaan (01.10.2026)

Aynı denetimden Kaan'a düşenler; biri bitince buradan SİLİNİR.

> **Kaan'ın Claude'u için:** Serhan'a SORULMADAN ilerlenmeyecek noktalar kök `CLAUDE.md` → "Ekip notları" bölümündedir; bu işlere başlamadan önce orayı okuyun.

**Kaan'ın Faz 7 kapanış işleri bitti (03.10.2026).** Madde 1 (zemin takılması)
ve madde 3 (E2E'de testsiz akışlar) tamamlandı; ayrıntı ROADMAP Faz 7 "Stüdyoda
zemin değiştirirken takılma" ve "E2E — Faz 7 kapanış turu". Gerçek Supabase +
gerçek backend ile uçtan uca test staging gerektirir → Faz 7.5.

2. **Ön yüz güvenlik başlıkları → Faz 7.5'e taşındı (03.10.2026, Kaan +
   Serhan'ın ortak kararı).** Tam metin ve taşınma gerekçesi açık takip 10, madde 7'de.

### 13. Vitrin AI için hukukçu soruları — sahibi: Serhan + Kaan (02.10.2026)

Vitrin AI (Faz 7.2) yapay zekâ sağlayıcısına görsel gönderir ve yapay zekâyla
üretilmiş görsel sunar. Aşağıdakiler hukukçuya **Faz 7.5'in tek hukukçu turunda**
(madde 5 ile birlikte) sorulur; sorular Faz 7.2 çıkışında yazılı hazır olmalı.
Hiçbirinin cevabını biz bilmiyoruz; kod ve metin cevaba göre ayarlanır, cevap
gelmeden Vitrin AI açma/kapama bayrağı canlıda açılmaz:

1. **Kullanım koşulları maddesi:** yapay zekâyla üretilen görselin ürünü
   yeniden çizdiği, gerçek üründen farklı olabileceği ve kullanıcının bu görseli
   müşteriye göstermeden önce kontrol etme sorumluluğu. Uyarı metni ve "birebir
   görsel için stüdyo çıktısını kullanın" önerisi bu madde için yeterli mi?
2. **Etiketin kapatılabilmesi:** köşedeki "yapay zekâ ile oluşturuldu" etiketini
   kullanıcının kapatabilmesi (dosyadaki görünmez işaret ve sunucu kaydı kalsa
   bile) uygun mu? Yapay zekâ içeriğini işaretleme yönünde bir yükümlülük var mı?
   Hukukçu "kapatılamaz" derse tek bir ayar değişir.
3. **Yurt dışı sağlayıcıya aktarım:** kesim görseli (özgün fotoğraf değil) yurt
   dışındaki bir yapay zekâ sağlayıcısına gidiyor. KVKK aydınlatma metninde alıcı
   grubu ve aktarım nasıl yazılmalı, ek bir izin ya da koşul gerekir mi? İlk
   kullanımdaki onay kutusu bunun yerine geçer mi? (Mevcut kullanıcılardan yasal
   metin için yeniden onay istenmiyor, bilinçli.)
4. **Üretim kaydının saklama süresi ve hesap silme:** eklemeye açık kaydın ne kadar
   saklanacağı ve hesap silinince kullanıcı kimliğinin anonimleştirilip kaydın
   kalmasının yeterli olup olmadığı.
5. **Üretilen görsellerin ticari kullanımı:** seçilecek sağlayıcının güncel
   koşullarına göre çıktıların kuyumcunun ticari satışında kullanılabilmesi (Faz
   7.5 "Launch öncesi son kapı" listesindeki yapay zekâ zemin görseli sorusuyla
   aynı konu; birlikte sorulur).

### 7. Canlı sunucuda yapılacak ölçümler — sahibi: Serhan (Faz 7.5)

Faz 7'deki yük testi, bellek ve süre ölçümleri yerelde, tek makinede yapıldı
(ayrıntı `backend/README.md` → "Yük testi"). Canlı sunucu belli olunca
şunlar ölçülmeden production'a hazır denmez (`ROADMAP.md` Faz 7.5'te aynı
liste):

  1. **Bellek (RAM):** backend'in tepe bellek kullanımı Linux'ta, çalışan
     serviste yeniden ölçülür (referans 12 GB; macOS'ta yerel ölçüm 4,5–5 GB
     çıktı ama bellek sıkıştırması yüzünden karşılaştırılamaz). Sunucu boyutu
     bu ölçüme göre seçilir.
  2. **Kesim süresi:** production CPU'sunda fotoğraf başına süre (yerelde
     Apple M4'te ~13 sn). Süre kapasiteyi doğrudan belirler: tek süreçte
     dakikada 60 / süre kesim.
  3. **Yük testi:** `backend/scripts/load_test.py` production'a benzer bir
     sunucuda, yük üreticisi AYRI bir makineden koşulur (yerelde ikisi aynı
     CPU'yu paylaşıyordu). R2'ye yazmaz; ayrı bir test veritabanı gerekir.
  4. **Veritabanı bağlantı havuzu:** varsayılan (5 + 10 taşma) yerel yük
     testinde darboğazın bir parçası çıktı (havuz 40'ta iki uç 1,7–2,3 kat
     hızlandı). Doğru boyut Supabase pooler'ının bağlantı sınırıyla birlikte
     canlıda ölçülerek seçilir; sınırı aşan havuz bağlantı hatası üretir.
  5. **CMYK dönüşümü:** 40 MP'lik görselin production'da süresi ve belleği
     (Faz 6'dan taşınan madde, açık takip maddesi 1).
  6. **Hata izleme:** seçilen sağlayıcıya gerçek bir hata gönderilip
     maskelemenin orada da doğru göründüğü kontrol edilir.
  7. **Kesim kuyruğu kapasitesi:** aynı makinede 2 işçi ya da
     `MAX_CONCURRENT_INFERENCES=2` throughput'u artırıyor mu (yerelde 16 GB'lık
     makine bunu kaldırmadı, ders 31); sunucunun belleğine göre işçi sayısı
     seçilir. İşçi bir servis olarak (systemd) kurulur ve çöktüğünde yeniden
     başlatıldığı doğrulanır; işçi yoksa kesimler sırada bekler.
  8. **Boşta kalıştan sonraki ilk kesim:** işçi bir süre boşta kaldıktan sonra
     ilk kesimin süresi ölçülür. 27.09.2026'da bellek sıkışık Mac'te model
     diske atılmış, ilk kesim 30 sn sürmüştü (sonrakiler 9 sn). Sunucuda model
     bellekte kalmalı (yeterli RAM, takas tercihen kapalı).
  9. **GPU seçilirse:** `backend/scripts/profile_cutout.py` GPU sunucusunda
     koşulup kesim süresi tahmini (~0,3–1,5 sn) gerçek ölçüme çevrilir; FP32
     GPU çıktısı `compare_cutouts.py` ile CPU çıktısına karşı gerçek
     fotoğraflarda karşılaştırılır (kalite bozan hiçbir ayar yok — FP16/INT8
     kapsam dışı). Fiyatlar: `docs/research/sunucu-fiyatlari-2026-09-27.md`.
  10. **Redis diske yazmıyor mu:** kesim kuyruğu özgün fotoğrafı Redis'te
     tutuyor ve KVKK metni "diske yazılmaz" diyor. Canlı Redis'te RDB ve AOF
     kapalı olmalı (`--save "" --appendonly no`). API bunu her kuyruğa
     koymadan önce `CONFIG GET` ile doğruluyor ve açıksa fotoğrafı ALMIYOR
     (kredi iade + 503). **`CONFIG` yasaksa da fotoğrafı almıyor**
     (doğrulanamayan söz verilmiş sayılmaz — Codex incelemesi, 2. tur).
     Yani `CONFIG GET`'e izin vermeyen yönetilen bir Redis (bazı
     sağlayıcılar) kesim kuyruğuyla ÇALIŞMAZ; sağlayıcı seçilirken bu
     dikkate alınır, gerekirse bilinçli bir kararla koda dönülür.

  11. **Açılış vitrini (Faz 7.5):** gerçek bir orta sınıf telefonda 3D
     yakınlaşmanın akıcılığı ölçülür (M4'te 60 fps, telefon GPU'su hiç
     ölçülmedi); alan adı belli olunca `NEXT_PUBLIC_SITE_URL` verilir
     (paylaşım önizlemesi ve site haritası bu adresi kullanır); canlıda Safari
     ile üretim adresinde kontrol yapılır (ders 39).
  12. **Hız sınırı değerleri gerçek trafikle gözden geçirilir (02.10.2026):**
     değerler (okuma 600/dk, taslak kaydı 300/dk, çalışma silme 30/dk, hesap
     silme 5/saat; ayrıntı `backend/README.md` → "Hız sınırı kapsam
     envanteri") ölçülmüş üretim verisi değil, istemcinin istek sıklığının
     (kesim yoklaması 1,5 sn, checkout 5 sn, otomatik kayıt 1,5 sn gecikmeli)
     üstüne konmuş emniyet payları. Canlıda gerçek kullanıcı trafiğiyle
     bakılır: 429 sayıları (Sentry/günlük), meşru kullanıcının sınıra çarpıp
     çarpmadığı, çarpıyorsa hangi uçta; gerekirse gevşetilir, gereksiz bol
     kalan değerler sıkılaştırılır. Taslak kaydının fail-open kararı
     (`limit_project_write`) da bu turda gözden geçirilir. Aynı bakışta
     Next vekili arkasında kovaların doğru kullanıcıya bağlandığı
     (`TRUSTED_PROXY_IPS`, açık takip 3) doğrulanır.

### 6. Gerçek kullanıcılara HİÇ e-posta gitmiyor — sahibi: Serhan (düzeltildi 17.09.2026)

Kayıt, e-posta doğrulaması ve parola sıfırlama Supabase Auth'un gönderdiği
e-postalara bağlı (`email_not_confirmed` akışı, "e-postanızı kontrol edin"
ekranı — bkz. `frontend/README.md` "Hesaplar").

**Bu madde önceden "e-posta spam'e düşüyor" diyordu — YANLIŞTI, düzeltildi.**
17.09.2026'da Kaan gerçek kullanımda hem kayıt hem "şifremi unuttum" denedi,
ikisinde de hata aldı. Supabase Auth Logs'ta `/auth/v1/signup` ve
`/auth/v1/recover` **500**, Resend Logs'ta karşılık gelen `/emails` isteği
**403** olarak görüldü — e-posta spam'e düşmüyor, **hiç gönderilmiyor.**

**Kök sebep (kaynağından doğrulandı):** gönderen adres hâlâ
`onboarding@resend.dev` — Resend'in yalnızca **hesap sahibinin kendi
e-postasına** teslimat yapan test alan adı. Başka her adrese (Kaan dahil,
gerçek her müşteri dahil) gönderim Resend tarafında 403 ile reddediliyor;
bu red Supabase'de 500'e dönüşüp arayüzde genel bir hataya düşüyor.
("resend.dev is a test-only sender that can only deliver to the email
address on your Resend account" —
[VibeAnswers](https://vibeanswers.com/resend/403-testing-emails-error/);
"you need to verify a domain... and change the from address" —
[Resend API errors](https://resend.com/docs/api-reference/errors).)
14.09.2026'daki "doğrulama" da bu yüzden yanıltıcıydı: test edilen adres
(`serhandenizhan404+etiket@gmail.com`) hesap sahibinin **kendi** adresinin
bir varyasyonuydu, yani sandbox kısıtına hiç çarpmamıştı.

**Geçici çözüm (17.09.2026, Kaan'ın hesabı için uygulandı):** Supabase'in
yönetici API'si (`PUT /auth/v1/admin/users/{id}`, `SUPABASE_SECRET_KEY` ile)
parolayı e-postaya HİÇ dokunmadan doğrudan yazabiliyor. Kaan'a rastgele bir
geçici parola bu yolla atandı ve güvenli bir kanaldan iletildi; Dashboard'daki
"Reset password" düğmesi denenmedi çünkü o da aynı bozuk e-posta yoluna
gidiyor — kalıcı çözüm değil, yalnızca tek seferlik kilit açma.

**Domain almadan denenebilecek — henüz denenmedi:** Supabase'in kendi
(built-in) e-posta servisi, custom SMTP hiç bağlanmasaydı da çalışırdı;
resmi belgeye göre saatte 2 e-postayla sınırlı
([Supabase Rate Limits](https://supabase.com/docs/guides/auth/rate-limits)).
Bu sınırın dışında kime gönderebildiği resmi belgede açık değil — bazı
ikincil kaynaklar yalnızca "yetkili takım adresleri"ne gittiğini söylüyor
ama bu, Supabase'in kendi belgesinden DOĞRULANAMADI. Yani şu an bilinmeyen:
Authentication → SMTP Settings'ten özel SMTP'yi kapatıp built-in'e dönmek,
Kaan gibi harici bir adrese (saatte 2 taneyle sınırlı olsa da) gerçekten
ulaşır mı ulaşmaz mı — denenip sonucu buraya not düşülmeli.

**Çözüm iki aşamalı — sağlayıcı seçildi (Resend, 14.09.2026):**

1. **Sandbox bağlantısı kuruldu (14.09.2026) ama HESAP SAHİBİ DIŞINDA hiçbir
   adrese teslimat yapmıyor (17.09.2026'da doğrulandı).** SMTP kimlik
   doğrulamasının kendisi çalışıyor (bağlantı reddedilmiyor, 403 bir
   yetkilendirme/alan adı sorunu) ama bu, "üretime hazır" anlamına gelmiyor —
   tam tersine, gerçek kullanıcıların **hiçbiri** bugün e-posta alamıyor.
2. **Tam üretim aşaması (henüz yapılamaz — sahibi: Serhan, dış girdiye
   bağlı):** proje bir alan adı alınca, o alan adı Resend'de doğrulanmalı
   (DNS'e SPF/DKIM kaydı) ve gönderen adresi kendi alan adına çevrilmeli.
   **Bu, mutlaka Vitrin AI için yeni satın alınmış bir alan adı olmak
   zorunda değil** — Resend alt alan adı (subdomain) doğrulamasını da kabul
   ediyor; Serhan veya Kaan'ın DNS kaydı ekleyebildiği HERHANGİ bir mevcut
   alan adı üzerinde bir alt alan adı (ör. `mail.mevcutalanadi.com`)
   doğrulanıp gönderen adres oraya çevrilebilir. Bu olmadan gerçek
   müşterilere e-posta gitmez — R2 CORS ve production domain maddesiyle
   (açık takip maddesi 2) aynı dış girdiye bağlı, o yüzden bu ikinci aşama
   de facto Faz 7.5'in (canlıya çıkış) "launch öncesi son kapı" listesine düşüyor.
