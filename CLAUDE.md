# CLAUDE.md

Bu depoda çalışırken Claude Code için rehber. Bu dosyayı her adımda güncel tutun — projenin nasıl inşa edildiğine dair tek doğru kaynak budur.

## Bu projenin geçmişi — ikinci iterasyon

Bu proje, aynı iki kişi (Serhan, Kaan) tarafından daha önce bir kez baştan sona planlanıp kısmen inşa edilmişti (Faz 0-3 tamamlanmış, Faz 4 sürüyordu). Kod tabanı bu depoda **sıfırdan yeniden yazılıyor**, ama önceki iterasyonda alınan kararlar ve doğrulanan teknik bulgular hâlâ geçerli ve tekrar tartışılmayacak. Bu bölümü, kararların *neden* alındığını anlamak için okuyun — bu, karara bağlanmış soruları yeniden tartışmaktan kurtarır.

1. **Ekip ve iş akışı:** 2 kişilik ekip. Kişi başına yerel Claude Code kullanımı (sadece bulut değil) ve normal `git push`/`pull` ile GitHub üzerinden senkronizasyon. PR'lar Claude Code içinden `gh pr create` ile açılır ve diğer kişinin incelemesinden sonra birleştirilir. Her push'tan önce açık kullanıcı onayı gerekir.
2. **Ürün tanımı:** kuyumcular için bir AI aracı. Kullanıcı bir ürün fotoğrafı yükler (yüzük, kolye vb.) → AI çok yüksek kenar hassasiyetiyle arka planı kaldırır → kullanıcı kesimi birçok özel arka plan tasarımından birinin üzerine yerleştirir ve ölçeklendirip döndürebilir, yeniden konumlandırabilir. Önce web uygulaması (konsepti doğrulamak için), asıl uzun vadeli hedef mobil uygulamadır.
3. **AI model kararı (en yüksek riskli teknik karar, kilitli):** üç zorunlu gereksinime göre araştırıldı — ücretsiz/ucuz, ticari kullanım lisansı, ince/yansıtıcı kenarlarda çok yüksek doğruluk (mücevher, segmentasyonun en zor kategorilerinden biridir). Karar: **BiRefNet, orijinal `ZhengPeng7/BiRefNet` ağırlıkları (MIT lisansı)**. BRIA'nın "RMBG" ağırlıkları (aynı mimari, farklı eğitim verisi) açıkça elendi çünkü bu spesifik ağırlıklar sadece ticari olmayan kullanım içindir — bu, bu alanda tekrar eden bir tuzaktır.
4. **Tüm teknoloji yığını birlikte kararlaştırıldı** — aşağıdaki teknoloji yığını tablosuna bakın. Ödeme sağlayıcısı (iyzico) özellikle hedef pazarın Türk kuyumcular olması nedeniyle seçildi. Kimlik doğrulama için Supabase Auth seçildi (Clerk değerlendirilip elendi) — detay için aşağıya bakın.
5. **Önceki iterasyonda gerçek fotoğraflarla doğrulanan teknik bulgular** (bu iterasyonda yeniden keşfedilmesine gerek yok, `ROADMAP.md` bölüm 2'de tam detay var):
   - `birefnet-general-lite` ve `u2net` gerçek ürün kullanımı için elendi (ya çok fazla RAM, ya çok düşük kalite). Üretim modeli: `birefnet-general`.
   - **CPU inference için en az 12–14 GB RAM gerekiyor** — üç ayrı ölçümle doğrulandı, en güncel ölçüm çalışan servisin kendisinde (uvicorn süreci) 12.0 GB tepe RSS gösterdi. 8 GB'lık bir sunucu bu modeli kaldırmaz.
   - Ortalama inference süresi ~15sn/fotoğraf (CPU), ilk istekte model yükleme nedeniyle daha uzun (~30-35sn).
   - Kalite, gerçek mücevher fotoğraflarında (yüksek çözünürlüklü iPhone HEIC dahil) iyi — ince zincirler ve yansıtıcı detaylar temiz kenarlarla korunuyor.
   - **Bilinen sınırlama:** ürün elde tutularak çekildiğinde model bazen eli koruyor bazen kaldırıyor (tutarsız davranış) — bu bir hata değil, "salient object" segmentasyonunun doğal belirsizliği. Bilinçli olarak MVP'yi bloklamayacak şekilde ertelenmiş bir üründür kararı; gerçek kullanımda sorun çıkarırsa ayrı bir iyileştirme (el tespiti + tutarlı maskeden çıkarma) olarak ele alınacak.
   - Parmak/el tarafından fiziksel olarak örtülen ürün kısımları çıktıda da eksik kalır — temel bir 2D segmentasyon kısıtı, model tarafında çözülemez, çekim rehberliğiyle azaltılabilir.
6. **Kimlik doğrulama kararı: Supabase Auth.** Production Postgres de aynı Supabase projesinde olacak — DB ve Auth ayrılmıyor. Oturum `@supabase/ssr` ile çerezde tutulur (localStorage değil, sunucu bileşenleri ve middleware'in de okuyabilmesi gerekiyor). **Bunun doğrudan sonucu:** Supabase'in `anon` anahtarı tasarımı gereği herkese açıktır, tabloyu koruyan tek şey **Row Level Security (RLS)** politikalarıdır — RLS'siz bir tablo oluşturmak o tablonun tamamını internete açmak demektir. Tablo ve RLS politikası her zaman aynı migration'da gider.
7. **Depolama kararı: Cloudflare R2.** Bucket public-read değil; okuma süreli imzalı URL (`generate_presigned_url`) üzerinden. Yükleme anahtarı kullanıcı dosya adından değil, sunucuda üretilen bir UUID'den gelir (path traversal koruması). Önceki iterasyonda gerçek bir R2 hesabına karşı uçtan uca doğrulandı (yükle → imzalı URL üret → indir → içerik doğrula).
8. **Ders — geçici çözümler yazılırken kullanıcıya açıkça söylenmeli:** önceki iterasyonda birkaç bilinçli geçici karar alındı (örn. arka plan yükleme endpoint'ini gerçek admin auth gelene kadar basit bir `X-Admin-Secret` header'ıyla korumak, ya da proje geçmişini DB şeması gelene kadar tarayıcıda IndexedDB'de tutmak). Bunların hepsi kullanıcı onayıyla ve "bu geçici, şu faz gelince kaldırılacak" notuyla yapıldı — sessizce yapılmadı. Aynı disiplin bu iterasyonda da sürdürülmeli.
9. **Ders — bir sayı (RAM, süre, limit) birden fazla dokümanda geçiyorsa hepsi birden güncellenmeli.** Önceki iterasyonda bu atlanmış ve dokümanlar birbiriyle çelişmişti (12 GB ölçümü önce sadece bir dosyaya yazılıp diğer üç dosyada eski rakam kalmıştı). Bu iterasyonda her PR'dan önce ilgili tüm dokümanlar (`README.md`, `ROADMAP.md`, `CLAUDE.md`, alt `README`'ler) kontrol edilmeli.
10. **Ders — `USE_MOCK_BACKEND` gibi geçici test bayrakları unutulabiliyor.** Önceki iterasyonda gerçek backend tekrar çalışır hale geldiğinde bu bayrağın kapatılmayı unutulması, "neden sonuç hep aynı örnek görsel" şeklinde bir kafa karışıklığına yol açmıştı. Bu tür bayraklar açıldığında bir hatırlatma notu bırakılmalı.
11. **Ders — dosya/klasör path'lerini kod içine hard-code etmeyin.** Önceki iterasyonda bir benchmark script'i geliştiricinin kendi makinesindeki mutlak path'i (`/Users/...`) içeriyordu; bu hem başka bir geliştiricide hem CI'da çalışmayı kırdı. Path'ler her zaman repo köküne göre türetilmeli ve env değişkeniyle override edilebilmeli.
12. **Ders — araçların ürettiği `.gitignore` ve yardımcı dosyaları da denetleyin.** Faz 2'de `create-next-app`'in ürettiği `frontend/.gitignore` içindeki `.env*` deseni, negasyon olmadığı için `.env.example`'ı da yutuyordu — fark edilmeseydi yeni bir geliştirici hangi ortam değişkenlerine ihtiyaç olduğunu göremezdi (`!.env.example` eklendi). Aynı araç ayrıca `frontend/` altına kendi `AGENTS.md` ve `CLAUDE.md` dosyalarını üretiyor; kök `CLAUDE.md` tek doğru kaynak olduğu için bu `next.config.ts` içinde `agentRules: false` ile kapatıldı. **Genel kural: bir iskelet üreticisi (scaffolder) çalıştırdıktan sonra ürettiği dosyaları tek tek gözden geçirin — sessizce yanlış davranan bir yapılandırma bırakabiliyor.**
13. **Ders — `.gitignore` dosyasının adını kontrol edin.** Önceki iterasyonda dosya yanlışlıkla `gitignore` (baştaki nokta eksik) olarak commit edilmişti ve hiç etkili olmuyordu (`.venv/`, `.DS_Store` gibi dosyalar git'e görünür kalmıştı). Faz 0'da bunu doğrulayın.

## Proje genel bakış

Kuyumcular için AI destekli bir web uygulaması (mobil uygulama uzun vadeli hedeftir). Kullanıcılar bir ürün fotoğrafı yükler (yüzük, kolye vb.); AI ürün sınırını yüksek hassasiyetle tespit eder ve arka planı kaldırarak şeffaf arka planlı bir kesim bırakır. Ardından kullanıcılar bu kesimi birçok özel arka plan tasarımından birinin üzerine yerleştirir, ölçeklendirebilir, döndürebilir ve yeniden konumlandırabilir. Tam fazlı plan ve teknoloji kararları için `ROADMAP.md` dosyasına bakın.

## Kalıcı proje kuralları

1. **Bu dosyayı her adımda güncel tutun.** Bir mimari karar, kural veya iş akışı değiştiğinde, `CLAUDE.md` dosyasını aynı değişiklikte güncelleyin.
2. **Push'tan önce onay alın.** O spesifik değişiklik için açık kullanıcı onayı olmadan asla `git push` çalıştırmayın (veya bir PR açmayın/birleştirmeyin).
3. **Dil kuralı:** kaynak kod (değişken adları, API alanları vb.) İngilizcedir; kod içindeki yorumlar sadece Türkçe yazılır. Üst seviye dokümantasyon dosyaları (`CLAUDE.md`, `ROADMAP.md`) kullanıcı talebi üzerine Türkçe tutulabilir. Sohbet Türkçe devam eder.
4. **`README.md`'yi de her adımda güncel tutun.** Kök dizindeki `README.md`, projenin GitHub'daki dış yüzüdür — yeni bir özellik, mimari değişiklik veya proje durumu güncellemesi olduğunda bunu da güncelleyin. Değişiklik hangi ekip üyesi (Serhan veya Kaan) tarafından yapılıyor olursa olsun aynı kural geçerlidir: iş bitmeden önce Claude Code, `README.md`'nin güncellenmesi gerekip gerekmediğini kullanıcıya otomatik olarak sormalı.
5. **Her PR'dan önce ilgili dokümanların tamamı kontrol edilir:** kök `README.md`, `ROADMAP.md`, `CLAUDE.md`, `SECURITY.md` ve ilgili alt `README` (`frontend/README.md` / `backend/README.md`). Bu bir "gerekirse" maddesi değil — PR açmadan önce tek tek gözden geçirilir ve güncellenmesi gerekmeyenler için kullanıcıya "şu dosyada değişiklik gerekmedi" diye **açıkça** söylenir. Sessizce atlamak yasak. Bir sayı (RAM, süre, limit) birden fazla dokümanda geçiyorsa **hepsi birden** güncellenir.
6. **Güvenlik, Faz 7'ye ertelenen ayrı bir görev değildir.** `SECURITY.md` dosyasındaki standartlar ilgili faz içinde uygulanır (hangi maddenin hangi fazda olduğu hem `SECURITY.md` bölüm 8'de hem `ROADMAP.md`'deki ilgili faz altında listelenir). Yeni bir endpoint, DB tablosu, dosya yükleme akışı veya ödeme entegrasyonu yazılırken `SECURITY.md`'deki ilgili bölüm önce kontrol edilir.

## Teknoloji yığını (tam gerekçe için ROADMAP.md bölüm 3'e bakın)

- **Backend:** Python, FastAPI, asenkron işler için Celery/RQ + Redis
- **AI modeli:** BiRefNet — sadece orijinal `ZhengPeng7/BiRefNet` MIT lisanslı ağırlıkları kullanın. BRIA'nın "RMBG" ağırlıklarını asla kullanmayın (aynı mimari, ancak bu ağırlıklar ticari değildir). Üretim modeli doğrudan `birefnet-general` — `-lite` ve `u2net` önceki iterasyonda elendi.
- **Veritabanı:** PostgreSQL (production'da Supabase — aynı proje, DB ve Auth ayrılmıyor)
- **Nesne depolama:** Cloudflare R2 (S3 uyumlu), public-read değil, presigned URL ile erişim
- **Frontend:** Next.js, TypeScript, Tailwind, shadcn/ui
- **Kompozisyon editörü:** Konva.js / react-konva
- **Kimlik doğrulama:** **Supabase Auth**. Oturum `@supabase/ssr` ile çerezde tutulur. FastAPI gelen Supabase JWT'sini doğrular. **IDOR koruması Supabase tarafında RLS politikalarıyla yazılır — RLS'siz tablo oluşturulmaz** (bkz. `ROADMAP.md` Faz 4 ve `SECURITY.md` 3.2).
- **Ödemeler:** iyzico
- **Test:** pytest (backend), Vitest (frontend), Playwright (E2E)
- **Mobil (sonra):** React Native + Expo

## Git iş akışı

- Dal (branch) isimlendirme: `feature/<kısa-açıklama>`, `fix/<kısa-açıklama>`
- Çalışma feature dallarında yapılır, asla doğrudan `main` üzerinde değil
- Pull request'ler bir görev tamamlandığında ve kullanıcı onayladığında Claude Code içinden GitHub CLI ile açılır (`gh pr create`)
- PR'lar birleştirilmeden önce diğer ekip üyesi tarafından incelenir
- Bir birleştirmeden sonra, yeni işe başlamadan önce yerel olarak `main`'i çekin (pull)

## Depo yapısı (hedef)

```
/backend           FastAPI uygulaması, AI inference servisi, Celery worker'ları,
                   arka plan meta verisi (Postgres/Alembic) — Faz 3'te genişler
/frontend          Next.js uygulaması (web arayüzü, admin paneli) — Faz 2'de kurulur
/mobile            React Native uygulaması (Faz 8'de eklenecek)
docker-compose.yml Yerel Postgres (Faz 0/3)
ROADMAP.md         Tam fazlı proje planı
CLAUDE.md          Bu dosya
SECURITY.md        Katman katman güvenlik standartları
```

## Bilinen kısıt: BiRefNet bellek ayak izi (önceki iterasyonda üç kez ölçüldü)

CPU inference için **en az 12–14 GB RAM** bütçeleyin, ya da trafik gerektirdiğinde GPU serverless'a geçin. 8 GB'lık bir sunucu bu modeli kaldırmaz — bu, çalışan servisin kendisi üzerinde yapılan gerçek bir ölçümle doğrulandı (uvicorn süreci 12.0 GB tepe RSS'e çıktı). İnference servisi için en küçük/en ucuz katmanı sağlamayın. Tam ölçüm geçmişi için `ROADMAP.md` bölüm 2'ye bakın.

## Claude Code için notlar

- Arka plan kaldırma endpoint'ini uygularken, ince/yansıtıcı yapılar (zincirler, ince halkalar, küçük taşlar) üzerindeki model doğruluğunu en üst öncelik olarak ele alın — bu, ürünün temel değer önerisidir.
- Önce tartışmadan yeni bir backend dili/framework'ü tanıtmayın — amaç, 2 kişilik bir ekip için tüm AI + backend yüzeyini Python'da tutmaktır.
- Bir göreve başlamadan önce, görevin hangi faza ait olduğunu ve kimin sahip olduğunu görmek için `ROADMAP.md`'ye bakın.
- HEIC desteğini (iPhone'un varsayılan formatı) Faz 1'den itibaren baştan planlayın — önceki iterasyonda sonradan eklenmişti, bu sefer gerek yok: `pillow-heif` + `register_heif_opener()` gerekiyor, bu çağrı olmadan PIL HEIC açamaz.
- Frontend'in yükleme kısıtları (`ALLOWED_CONTENT_TYPES` / `MAX_FILE_SIZE_MB`) backend ile elle senkron tutulmalı — biri değişirse diğeri de güncellenmeli.
- **Apple Silicon Mac'te BiRefNet session'ı her zaman `providers=["CPUExecutionProvider"]` ile açık şekilde oluşturun.** `rembg.new_session()` çağrısına `providers` verilmezse onnxruntime macOS'ta `CoreMLExecutionProvider`'ı otomatik seçiyor; BiRefNet'in CoreML'in desteklemediği çok sayıda operatörü olduğu için grafiği yüzlerce küçük alt-parçaya bölüp her birini ayrı ayrı derlemeye çalışıyor — pratikte hiç bitmeyen (gözlemlenen: 600+ `.mlmodelc` alt-parça, 10+ dakika) bir derleme döngüsüne giriyor. Üretim sunucusu zaten Linux/CPU olduğu için bu sağlayıcıyı zorlamak davranışı hem yerelde hem üretimde tutarlı kılıyor, `backend/app/services/background_removal.py` içinde uygulandı.

### Güvenlik davranış kuralları (bkz. `SECURITY.md` için tam detay)

- Hiçbir secret, API key, şifre veya bağlantı string'i kod içine sabit (hardcoded) yazılmaz; her zaman `.env` üzerinden okunur ve `.env` asla commit edilmez.
- Yeni bir DB sorgusu yazarken string concatenation ile SQL asla oluşturulmaz; ORM (SQLAlchemy) veya parametreli sorgu kullanılır.
- Kullanıcıya özel bir kaynağa erişen her endpoint (`/api/projects/{id}` gibi) o kaynağın gerçekten istek yapan kullanıcıya ait olduğunu DB seviyesinde doğrular (IDOR koruması) — bu kontrol olmadan endpoint tamamlanmış sayılmaz.
- Dosya yükleme kabul eden hiçbir endpoint sadece dosya uzantısına/content-type header'ına güvenmez; boyut sınırı ve magic-byte içerik doğrulaması **Faz 1'den itibaren** eklenir (önceki iterasyonda sonradan yama olarak eklenmişti).
- Yeni bir admin/yetkili endpoint yazılırken rol kontrolü backend'de yapılır; frontend'in bir öğeyi gizlemesi yetkilendirme sayılmaz.
- Ödeme/webhook kodu yazılırken imza doğrulaması ve idempotency olmadan "tamamlandı" denilmez.
- Bu kurallardan biriyle çelişen bir kısayol gerekiyorsa (örn. hız kaygısıyla), bunu sessizce yapmak yerine kullanıcıya açıkça belirtin ve onay isteyin.

## Frontend çalıştırma (Faz 2'de kuruldu)

```bash
cd frontend && npm install && cp .env.example .env.local && npm run dev
```

- `frontend/.env.local` içinde `USE_MOCK_BACKEND=true` backend olmadan arayüzü çalıştırır (sahte bir kesim PNG'i döner, arayüzde "Demo modu" olarak işaretlenir). **Dikkat:** bu değer `true` kalırsa gerçek backend ayakta olsa bile arayüz hep demo/mock sonucu gösterir.
- Gerçek uçtan uca demo için backend'i ayrı bir terminalde başlatın ve `USE_MOCK_BACKEND=false` yapın. İlk istek modeli belleğe yüklediği için daha uzun sürebilir (bkz. "Bilinen kısıt" bölümü).
- Desteklenen formatlar: JPEG, PNG, WebP, HEIC/HEIF. Backend HEIC'i işliyor ama **tarayıcılar HEIC'i görüntüleyemiyor** — arayüz bu formatta önizleme yerine bilgilendirici bir kart gösteriyor.
- **Dosya boyutu sınırı 20 MB** (`backend/app/core/config.py` → `max_file_size_mb`). Frontend'deki karşılığı `frontend/src/lib/upload-constraints.ts`; ikisi elle senkron tutulur.
- Tarayıcı FastAPI'ye doğrudan bağlanmaz, istek `frontend/src/app/api/remove-background/route.ts` vekilinden geçer. Vekil ayrıca Windows'ta boş gelen `.heic` content-type'ını uzantıdan düzeltir ve backend'in 413/503 yanıtlarını kullanıcı diline çevirir.
- **Backend'de `/health` endpoint'i yok**, bu yüzden arayüzde "servis ayakta mı" göstergesi bulunmuyor — uydurma bir gösterge yanlış bilgi verirdi. Böyle bir gösterge istenirse backend'e küçük bir sağlık endpoint'i eklenmeli (Serhan).
- Ayrıntılı gerekçeler ve klasör yapısı için `frontend/README.md`.

## Arayüz tasarım dili (kilitli karar — Faz 2)

Web arayüzü, kullanıcının referans olarak verdiği **apple.com/tr** ürün sayfalarından uyarlandı. Bu bir stil tercihi değil, kullanıcının açık kararı — yeniden tartışılmayacak, yeni bölümler de aynı dile uyacak.

**Uyarlanan (ölçülebilir) şeyler:** tipografi ölçeği ve negatif harf aralığı (hero 64/68 px, bölüm 48/52, alt başlık 28/32, gövde 17/21), 600 ağırlıklı başlıklar, tam genişlikte dönüşümlü koyu/açık bölümler (`#000` / `#1d1d1f` / `#f5f5f7` / `#fff`), 112 px dikey ritim, hap biçimli düğmeler, kaydırınca opaklık + kayma ile ortaya çıkan kısa `ease-out` geçişler.

**Uyarlanmayanlar — bilinçli:**
- **SF Pro kullanılmaz.** Apple'a ait ve lisanslı; yerine Inter (aynı sınıfta neo-grotesk).
- **Apple'ın metinleri, görselleri ve marka öğeleri kopyalanmaz.** Sayfadaki her cümle ve sayı projenin kendi gerçeğine dayanır.
- **Vurgu rengi Apple'ın mavisi (`#2997ff`) değil, altın.** Hedef kitle kuyumcu.

**Yapısal fark:** Apple'da ürün bir fotoğraftır, bizde **çalışan aracın kendisi**. Bu yüzden araç tanıtım bölümlerinin sonuna değil, açılıştan hemen sonraya konuldu.

**Uygulama:** yardımcı sınıflar `frontend/src/app/globals.css` içinde (`display-hero`, `display-section`, `display-feature`, `lede`, `fine-print`, `surface-*`, `section-rhythm`, `reveal`, `press`). Yüzey renkleri bilinçli olarak **sabit**, token değil — bir bölüm "koyu" işaretlendiğinde açık temada da koyu kalmalı, dönüşümlü ritim buna dayanıyor. Punto değerleri `clamp` ile akışkan; alt/üst sınırlar Apple'ın mobil/masaüstü değerleriyle aynı. Ayrıntı ve ölçüm tablosu: `frontend/README.md` → "Tasarım dili".

**Durum taşıyan tek istemci bileşeni `background-remover.tsx`;** tanıtım bölümlerinin hepsi sunucu bileşeni ve istemciye hiç inmiyor. Yeni bölüm eklenirken bu ayrım korunmalı.

## Açık takip maddesi

Backend'de CORS middleware'i Faz 4'e kadar eklenmeyecek (frontend sunucu tarafı vekil kullandığı için Faz 0-3'te sorun değil). Faz 4'te auth devreye girdiğinde, ya da backend ayrı bir alan adına taşınırsa/mobil uygulama (Faz 8) gündeme gelirse `fastapi.middleware.cors.CORSMiddleware` eklenmesi gerekecek.

`POST /api/admin/backgrounds` (Faz 3) şu anda gerçek bir admin auth yerine geçici bir `X-Admin-Secret` paylaşılan secret header'ıyla korunuyor (`ADMIN_SECRET` env değişkeni). Bu, ders 8'de anlatılan deseninin ikinci tekrarı — bilinçli, kullanıcı onaylı bir geçici çözüm. Faz 4'te gerçek Supabase Auth + rol kontrolü (`is_admin`) devreye girdiğinde bu header tamamen kaldırılıp yerine gerçek yetkilendirme konulacak.
