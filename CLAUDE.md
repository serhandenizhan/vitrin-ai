# CLAUDE.md

Bu depoda çalışırken Claude Code için rehber. **Kısa tutulur:** burada yalnız her oturumda gereken kurallar ve "şunu yapmadan önce şunu oku" işaretçileri durur; ayrıntı, gerekçe ve olay hikâyeleri aşağıdaki belge haritasındaki dosyalardadır. Bir mimari karar, kural ya da iş akışı değişince önce ilgili belge, gerekirse bu dosya güncellenir. (02.10.2026'da 858 satırdan sadeleştirildi; taşınan içerik birebir `docs/` altındadır, hiçbir şey silinmedi.)

## Ürün

Kuyumcular için AI destekli web uygulaması (mobil uzun vadeli hedef): kullanıcı ürün fotoğrafı yükler (yüzük, kolye vb.) → AI ince/yansıtıcı kenarlarda çok yüksek hassasiyetle arka planı kaldırır → kullanıcı kesimi özel arka planlardan birinin üzerine yerleştirir, ölçekler, döndürür, konumlandırır. İki kişilik ekip: **Serhan** (backend, AI, altyapı) ve **Kaan** (ön yüz, ürün deneyimi). Fazlı plan ve görev sahipleri: `ROADMAP.md`. Önceki iterasyonda alınan kararlar tekrar tartışılmaz.

## Belge haritası — şunu yapmadan önce şunu oku

| Yapacağın iş | Önce oku |
|---|---|
| Göreve başlamak, faz/sahip öğrenmek, açık işleri görmek | `ROADMAP.md` (açık takip maddeleri: bölüm 7) |
| Ödeme, admin paneli, hız sınırı, migration, kesim kuyruğu, hata izleme, model optimizasyonu, CI koduna dokunmak | `docs/backend-kurallar.md` (ödeme ve canlı açılış için ayrıca `docs/billing-runbook.md`) |
| Yeni endpoint, tablo, dosya yükleme ya da ödeme akışı yazmak | `SECURITY.md` |
| Arayüz, stüdyo, ana sayfa vitrini ya da tasarım diline dokunmak | `docs/frontend-kararlar.md`, ölçümler için `frontend/README.md` |
| Sistemi ya da testleri yerelde çalıştırmak, `.env`/Windows/Mac sorunu ayıklamak | `docs/gelistirme-ortami.md`, `backend/README.md` |
| Bir kuralın NEDENİNİ ya da olay hikâyesini öğrenmek (aşağıdaki "ders N") | `docs/lessons.md` |
| Ödeme sağlayıcısı seçimi yeniden tartışılırsa | `docs/research/payment-platform-research-2026-09-14.md` |
| Vitrin AI (sahne, prompt, AI üretimi, uyarı/etiket) | `ROADMAP.md` Faz 7.2, `docs/backend-kurallar.md` "Vitrin AI", `docs/frontend-kararlar.md` "Vitrin AI", `SECURITY.md` bölüm 6 |

## Kilitli kararlar (gerekçesi `docs/lessons.md` 1–7)

- **Model:** BiRefNet, yalnız orijinal `ZhengPeng7/BiRefNet` ağırlıkları (MIT), üretimde `birefnet-general`. BRIA "RMBG" ağırlıkları ticari kullanıma kapalıdır: kullanılmaz. `-lite` ve `u2net` elendi. CPU'da en az 12–14 GB RAM gerekir (ölçüldü).
- **Yığın:** FastAPI + Redis (kesim ayrı işçide), PostgreSQL (üretimde Supabase, Auth ile AYNI proje), Cloudflare R2, Next.js + TypeScript + Tailwind + shadcn/ui, Konva, iyzico, pytest/Vitest/Playwright; mobil sonra (React Native + Expo). Önce tartışmadan yeni backend dili/framework'ü getirilmez.
- **Kimlik:** Supabase Auth, oturum `@supabase/ssr` ile çerezde. Backend token'ı JWKS ile doğrular; yönetici yetkisi `admin_users` tablosundan gelir. `anon` anahtarı herkese açıktır: tabloyu yalnız RLS korur. **RLS'siz tablo oluşturulmaz; tablo ve RLS politikası aynı migration'da gider.** IDOR koruması iki katmanlıdır (sorgudaki sahiplik filtresi + RLS).
- **Depolama:** R2 bucket public-read değil, okuma süreli imzalı URL ile; yükleme anahtarı sunucuda üretilen UUID'dir (kullanıcı dosya adından asla).
- **Ödeme:** iyzico (olgun abonelik API'si, webhook, raporlama, fraud). PayTR tartışması yeniden açılırsa önce araştırma belgesine bak.
- **Ekip akışı:** yerel Claude Code, GitHub üzerinden `push`/`pull`; PR'ları `gh pr create` ile aç, diğer kişi incelemeden birleştirme. Her push'tan önce açık kullanıcı onayı gerekir.
- **Faz sırası ve Vitrin AI (02.10.2026, Serhan'ın kararı):** Faz 7 → **Faz 7.2 Vitrin AI** → Faz 7.5 canlıya çıkış → Faz 8 mobil. Vitrin AI, kesilmiş ürünü seçilen sahneye yapay zekâyla yerleştiren, kredi harcayan ve **dinamik sahneli** (yılbaşı gibi dönemsel sahneler admin panelinden, kod değişmeden) özelliktir. Kilitli: birebir ana görsel hep stüdyodan, Vitrin AI "benzer" ek görsel üretir; sağlayıcıya yalnız kesim gider (özgün fotoğraf gitmez); uyarı + kapatılabilir etiket + görünmez işaret + eklemeye açık üretim kaydı; Deneme planı kullanamaz; canlıda açma/kapama bayrağı KAPALI başlar; model henüz seçilmedi (API testiyle seçilecek). Ayrıntı ve açık işler: `ROADMAP.md` Faz 7.2, hukukçu soruları açık takip 13.
- **Bilinçli ertelenenler:** elde tutulan üründe modelin eli tutarsız koruması ve halka yüzüğün içini doldurması ürün sınırlamasıdır (kullanıcıya "ürünü tek başına çekin" rehberliği); MVP'yi bloklamaz.

## Backend'de dokunmadan önce `docs/backend-kurallar.md`'yi okuyacağın alanlar (kısa kurallar)

- **Ödeme erişimi:** listeleme kota kapısı değildir (kapı `POST /api/remove-background`'daki rezervasyondur); iade/itiraz yalnız AİT OLDUĞU aboneliği kapatır; ödeme alınamayınca erişim 3 gün (`past_due`) kalan kotayla sürer; idempotency anahtarı İŞİ tanımlar, isteği değil (kredi anahtar başına bir kez tüketilir).
- **Migration:** uygulanmış bir migration yerinde düzenlenmez; düzeltme YENİ numaralı migration'dır. İki dal aynı numarayı açarsa birleştirmeden önce numara taşınır.
- **Hız sınırı:** her uç `tests/test_rate_limit_coverage.py`'de bir sınıfa (`CLOSED`/`OPEN`/`UPLOAD`/`EXEMPT`) ve `tests/test_idor.py`'de bir erişim sınıfına atanır; sınıfsız uç testi kırmızı yakar. Yön, ucun NE KORUDUĞUNA göre seçilir (para/geri alınamaz işlem/yönetici yazması fail-closed, okuma ve taslak kaydı fail-open).
- **Kesim:** arka plan kaldırma API'de değil ayrı işçide (`python -m app.workers.cutout`) koşar; model süreç başına yüklenir (işçi × ~12 GB). Redis diske YAZMAZ (RDB/AOF kapalı; API her kuyruğa koymadan doğrular). Model kalitesini bozan hiçbir optimizasyon (FP16/INT8, 1024 altı çözünürlük, lite model) yapılmaz.
- **CI:** `main` üç zorunlu kontrol (`Backend testleri`, `Frontend lint, test, build`, `Bağımlılık güvenlik taraması`) yeşil olmadan birleşmez; iş adı değişirse kural seti de güncellenir. Backend testleri `.env`'SİZ koşar: Supabase isteyen test `tokens` fixture'ını ister.

## Kalıcı proje kuralları

1. **Bu dosya KISA kalır; büyümesi bilinçli bir karardır.** Bir mimari karar, kural veya iş akışı değiştiğinde önce ilgili belge güncellenir (`docs/` altındaki dosya, `ROADMAP.md`, `SECURITY.md`); bu dosyaya yalnız her oturumda gereken **tek satırlık** kural ya da işaretçi girer. Her ekleme öncesi tek soru: *"bunu her oturumun başında bilmek şart mı?"* Hayırsa tam metni `docs/`'a yazın, buraya en fazla bir işaretçi satırı koyun. **Yeni bir ders:** tam metni `docs/lessons.md`'ye, bu dosyaya yalnız numaralı tek satırlık özeti. **Ayrıntı, gerekçe, ölçüm ve olay hikâyesi bu dosyaya yazılmaz.** **Hiçbir şey SİLİNMEZ, yalnız `docs/`'a taşınır** (yerine işaretçi kalır). Katı bir boyut sınırı YOKTUR ve her commit ya da PR'da "neyi çıkaralım" diye SORULMAZ. Tek uyarı eşiği: dosya **~250 satıra** ulaşınca Claude bunu kullanıcıya **bir kez** bildirir ve hangi satırların `docs/`'a taşınabileceğini önerir; karar kullanıcıdadır ("şimdilik kalsın" denirse bir sonraki bildirim ~50 satır sonra). Ayrıca yeni bir BÖLÜM açılacaksa ya da tek bir ekleme birkaç satırı aşıyorsa kullanıcıya bir kez bildirilir ve ayrıntıyı `docs/`'a koyup buraya işaretçi bırakmak önerilir.
2. **Push'tan önce onay alın.** O spesifik değişiklik için açık kullanıcı onayı olmadan asla `git push` çalıştırmayın (veya bir PR açmayın/birleştirmeyin).
3. **Dil kuralı:** kaynak kod (değişken adları, API alanları vb.) İngilizcedir; kod içindeki yorumlar sadece Türkçe yazılır. Üst seviye dokümantasyon dosyaları (`CLAUDE.md`, `ROADMAP.md`) kullanıcı talebi üzerine Türkçe tutulabilir. Sohbet Türkçe devam eder.
4. **`README.md`'yi de her adımda güncel tutun.** Kök dizindeki `README.md`, projenin GitHub'daki dış yüzüdür — yeni bir özellik, mimari değişiklik veya proje durumu güncellemesi olduğunda bunu da güncelleyin. Değişiklik hangi ekip üyesi (Serhan veya Kaan) tarafından yapılıyor olursa olsun aynı kural geçerlidir: iş bitmeden önce Claude Code, `README.md`'nin güncellenmesi gerekip gerekmediğini kullanıcıya otomatik olarak sormalı.
5. **Her PR'dan önce ilgili dokümanların tamamı kontrol edilir:** kök `README.md`, `ROADMAP.md`, `CLAUDE.md`, `SECURITY.md`, ilgili alt `README` (`frontend/README.md` / `backend/README.md`) ve `docs/` altındaki belgeler (`lessons.md`, `backend-kurallar.md`, `gelistirme-ortami.md`, `frontend-kararlar.md`, `billing-runbook.md`). Bu bir "gerekirse" maddesi değil — PR açmadan önce tek tek gözden geçirilir ve güncellenmesi gerekmeyenler için kullanıcıya "şu dosyada değişiklik gerekmedi" diye **açıkça** söylenir. Sessizce atlamak yasak. Bir sayı (RAM, süre, limit) birden fazla dokümanda geçiyorsa **hepsi birden** güncellenir.
6. **Faz dışına çıkılmaz — çıkılacaksa ÖNCE uyarılır.** (Kaan'ın kararı, 08.09.2026.) Bir istek, o an üzerinde çalışılan fazın `ROADMAP.md`'deki kapsamının dışındaysa: **iş yapılmadan önce** kullanıcıya bunun hangi faza ait olduğu ve neden şimdi yapılmaması gerektiği söylenir, onayı beklenir. Sessizce yapmak da, "nasılsa faydalı" diye eklemek de yasak.
   - Bu kural Faz 2'de fiilen yaşandığı için kondu: çalışma geçmişi (Faz 4, sunucuda) tarayıcıda yapıldı ve "giriş yap" arayüz öğesi (Faz 4) eklendi. İkisi de kullanıcı isteğiyle ve belgelenerek yapıldı ama **kapsam yine de aşıldı** ve Faz 4'e taşıma işi bıraktı — yol haritası tam olarak bundan kaçınmak için "baştan sunucuda" demişti.
   - Kapsam dışı olup olmadığı belirsizse, varsayılan **dışıdır**: sorulur.
   - Kullanıcı uyarıya rağmen isterse yapılır; o zaman karar `ROADMAP.md`'deki ilgili faza ve gerekiyorsa `CLAUDE.md`'ye "geçici çözüm / öne alınan iş" olarak yazılır (bkz. ders 8).
   - Bir fazın kendi görevleri bitmeden bir sonraki faza geçilmez.
7. **Güvenlik, Faz 7'ye ertelenen ayrı bir görev değildir.** `SECURITY.md` dosyasındaki standartlar ilgili faz içinde uygulanır (hangi maddenin hangi fazda olduğu hem `SECURITY.md` bölüm 8'de hem `ROADMAP.md`'deki ilgili faz altında listelenir). Yeni bir endpoint, DB tablosu, dosya yükleme akışı veya ödeme entegrasyonu yazılırken `SECURITY.md`'deki ilgili bölüm önce kontrol edilir.

## Git iş akışı

- Dal (branch) isimlendirme: `feature/<kısa-açıklama>`, `fix/<kısa-açıklama>`
- Çalışma feature dallarında yapılır, asla doğrudan `main` üzerinde değil
- Pull request'ler bir görev tamamlandığında ve kullanıcı onayladığında Claude Code içinden GitHub CLI ile açılır (`gh pr create`)
- PR'lar birleştirilmeden önce diğer ekip üyesi tarafından incelenir
- Bir birleştirmeden sonra, yeni işe başlamadan önce yerel olarak `main`'i çekin (pull)
- **Stacked PR'lar üstten alta birleştirilir.** Bir PR'ın base'i `main` değil başka bir feature dalıysa, önce üstteki PR alt dala, sonra alt dal `main`'e birleştirilir. Ters sırada birleştirilirse üstteki PR'ın işi `main`'e hiç ulaşmaz ve GitHub'da her iki PR da "Merged" göründüğü için bu fark edilmez (bkz. ders 17 — Faz 2'de yaşandı, 8 commit kayboldu)
- **Bir merge'den sonra işin gerçekten `main`'de olduğu doğrulanır:** `git merge-base --is-ancestor <commit> origin/main`
- **`main`, CI yeşil olmadan birleştirilemez (26.09.2026, Serhan'ın kararı).** GitHub'daki "protect main" kural setine zorunlu durum kontrolü eklendi: `Backend testleri`, `Frontend lint, test, build`, `Bağımlılık güvenlik taraması` (`.github/workflows/ci.yml`'deki iş adları). Sebep: PR #29, son commit'in CI'ı sürerken birleştirildi — sonuç yeşil çıktı ama kırmızı olsaydı bozuk kod `main`'e girerdi. Kural setinde kimse için istisna (bypass) yok. **Tuzak:** CI'daki bir işin `name:`'i değiştirilirse zorunlu kontrol o adı bir daha görmez ve her PR sonsuza dek "bekliyor"da kalır — iş adı değişirse kural seti aynı anda güncellenir. **Yan etki:** haftalık tarama (ya da herhangi bir PR'daki tarama) yeni bir açık bulduğunda, açık kapatılana kadar hiçbir PR birleştirilemez — ilgisiz bir PR bile. Bu bilinçli (açık bilinerek birleştirme yapılmasın). Doğru çıkış yolu önce açığı kapatan sürüm yükseltmesi PR'ıdır; acil ve başka türlü çözülemeyen bir durumda kural seti (GitHub → Settings → Rules → "protect main") geçici olarak düzenlenir, bu da diğer ekip üyesine haber verilerek ve iş bitince geri alınarak yapılır. **Yan etki gerçekleşti (30.09–01.10.2026):** üç ayrı bildirim (PyJWT 10 CVE, 3 geçişli npm paketi, ardından `next` kritik RCE + PyJWT 2.15) `main` CI'ını bağımlılık taramasında kırmızıya çevirdi ve açık PR'lar (#34, #36) birleştirilemedi; çıkış yolu kural seti gevşetilmeden açığı kapatan sürüm PR'ları oldu (#35, #37, #44; #43 #44'e katılıp kapatıldı). Önceki kural seti `gh api repos/serhandenizhan/vitrin-ai/rulesets/22794410` ile okunabilir.

## Depo yapısı (hedef)

```
/backend           FastAPI uygulaması, AI inference servisi, Celery worker'ları,
                   arka plan meta verisi (Postgres/Alembic) — Faz 3'te genişler
/frontend          Next.js uygulaması (web arayüzü, admin paneli) — Faz 2'de kurulur
/mobile            React Native uygulaması (Faz 8'de eklenecek)
docker-compose.yml Yerel Postgres (Faz 0/3) + Redis (Faz 4, hız sınırlaması)
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
- Kullanıcıya özel bir kaynağa erişen her endpoint (`/api/projects/{id}` gibi) o kaynağın gerçekten istek yapan kullanıcıya ait olduğunu DB seviyesinde doğrular (IDOR koruması) — bu kontrol olmadan endpoint tamamlanmış sayılmaz. **Yeni her uç `backend/tests/test_idor.py`'daki dört sınıftan birine (`PUBLIC`/`SESSION`/`OWNED`/`ADMIN`) eklenir** — eklenmezse envanter testi kırmızı yanar; `OWNED` bir uç için "başkası 404 + kaynak değişmez, sahibi başarılı" testi de aynı dosyaya yazılır.
- Dosya yükleme kabul eden hiçbir endpoint sadece dosya uzantısına/content-type header'ına güvenmez; boyut sınırı ve magic-byte içerik doğrulaması **Faz 1'den itibaren** eklenir (önceki iterasyonda sonradan yama olarak eklenmişti).
- Yeni bir admin/yetkili endpoint yazılırken rol kontrolü backend'de yapılır; frontend'in bir öğeyi gizlemesi yetkilendirme sayılmaz.
- Ödeme/webhook kodu yazılırken imza doğrulaması ve idempotency olmadan "tamamlandı" denilmez.
- **`frontend/public/` altındaki her dosya internete açıktır** ve dağıtıma dahil edilir. Oraya yalnızca yayınlanması *istenen* dosyalar konur; ham/kaynak/ara dosyalar (yüksek çözünürlüklü orijinaller, notlar, yedekler) `public/` dışında tutulur. Faz 2'de 3,6 MB'lik bir kaynak fotoğraf yanlışlıkla oraya konmuş, fark edilip `frontend/photo-source/` altına taşınmıştı (bkz. `SECURITY.md` bölüm 7).
- Bu kurallardan biriyle çelişen bir kısayol gerekiyorsa (örn. hız kaygısıyla), bunu sessizce yapmak yerine kullanıcıya açıkça belirtin ve onay isteyin.

## Çalıştırma ve test (ayrıntı: `docs/gelistirme-ortami.md`)

- **Sistemi ayağa kaldır:** macOS/Linux `./execute.sh` (Postgres Docker'da, backend + işçi + frontend); Windows VS Code'da `Ctrl+Shift+B`. `./execute-supabase.sh` backend'i GERÇEK Supabase (production) veritabanına bağlar, migration'ı varsayılan çalıştırmaz. Frontend: `cd frontend && npm install && cp .env.example .env.local && npm run dev` (`USE_MOCK_BACKEND=true` kalırsa gerçek backend ayakta olsa bile demo sonucu gösterir).
- **Backend testleri tek komutla:** `backend/scripts/test.sh` (kendi Postgres/Redis'ini açar; düz `pytest` geliştirme veritabanında hiçbir şeye dokunmadan durur). Lint: `cd backend && .venv/bin/ruff check app tests scripts alembic`.
- **Ön yüz:** `cd frontend && npm test` (Vitest), `npm run e2e` (Playwright, gerçek Supabase gerektirmez), `npm run build`.
- **Bir ayar/`.env` hatası ayıklarken** önce `docs/gelistirme-ortami.md`'deki tuzaklara bak (çalışma klasörüne bağlı `.env`, `localhost`/IPv6, Windows kodlaması).

## Arayüz tasarım dili (KİLİTLİ, ayrıntı `docs/frontend-kararlar.md`)

Web arayüzü, kullanıcının referans verdiği apple.com/tr ürün sayfalarından uyarlandı; yeni bölümler de aynı dile uyar. Inter (SF Pro değil), sıcak nötr palet (`#0c0b0a`/`#1a1917`/`#f6f4f1`/`#fdfcfb`), vurgu **altın** (Apple mavisi değil), büyük başlıklar **noktasız** biter, dönüşümlü koyu/açık tam genişlik bölümler, hap düğmeler, kısa `ease-out` giriş geçişleri. Apple'ın metinleri/görselleri kopyalanmaz. Araç yüzeyi (stüdyo ve çalışma ekranları) koyu temadır, site açık. **Stüdyoya yeni araç eklerken** ikinci bir panel/kart açılmaz: araç `STEP_TOOLS`'a eklenir, mevcut tek panele girer; tuval boyutuna bağlı öğeye CSS `transition` verilmez (ders 29). Büyük bir PR'da tasarım dilini taşıyan bir sayfa sessizce yeniden yazılmışsa bunu sor (ders 20).

## Dersler (her birinin tam hikâyesi `docs/lessons.md`'de, numaralar aynıdır)

8. **Geçici çözümü** kullanıcı onayıyla ve "şu fazda kalkacak" notuyla yaz.
9. **Bir sayı (RAM, süre, limit) birden fazla belgede geçiyorsa** hepsini aynı değişiklikte güncelle; PR'dan önce belgeleri tek tek gözden geçir (kural 5).
10. **Geçici test bayrağı** (`USE_MOCK_BACKEND`) açılınca bir hatırlatma notu bırak.
11. **Yolları** repo köküne göre türet ve env ile geçersiz kılınabilir yap (mutlak `/Users/...` yolu yok).
12. **Scaffolder** (`create-next-app` vb.) çalıştıktan sonra ürettiği her dosyayı (`.gitignore`, `AGENTS.md`) gözden geçir.
13. **Durum değiştiren sınıf çiftlerinde bileşik seçici** (`.a.a-open`) kullan; bir belirtiyi koda yazmadan önce ölçüm ortamını ele (gizli panelde animasyon ilerlemez).
14. **`.gitignore`'ın adının** başında nokta olduğunu Faz 0'da doğrula.
15. **Test gücünü** düzeltmeyi geri alıp kırmızı yandığını görerek kanıtla; yetki/doğrulama kontrolünde RED ve KABUL yolunu ayrı ayrı sına.
16. **HTTP header `latin-1`, env `utf-8`:** sırları baytlar üzerinden karşılaştır, her tarafı kendi codec'iyle (`secrets.compare_digest`).
17. **Stacked PR'ı ÜSTTEN ALTA birleştir;** sonra `git merge-base --is-ancestor <commit> origin/main` ile işin `main`'de olduğunu doğrula ("Merged" rozeti kanıt değildir).
18. **`.env`'yi** kodun konumundan türet, çalışma klasöründen değil.
19. **Uzak servis ayarını yansıtan istemci kodunu** canlı panelden birebir doğrula ve koda "kaynak, tarih" notu düş.
20. **PR incelemesinde** `git diff --stat`'ta `page.tsx`/tasarım dosyalarında büyük silme varsa bilinçli mi diye sor; ekrana dokunan değişikliği tarayıcıda bir kez gör.
21. **Eylem sonucunu yazan state'i** yoklamanın state'inden ayır; testte en az bir yoklama turu ilerlet.
22. **Yakalanan istisnanın üretimde fırlatıldığını** `grep -rn "raise <İstisna>" app` ile doğrula; dış servis testleri gerçek yanıt gövdesini (biçim dahil) taklit etsin.
23. **"Yükleniyor" ile "yüklenemedi" ayrı durumlardır;** yumuşatma (`keepPrevious`) yalnız birincisi içindir; bir hatayı işaretleyen bayrağı temizleyen yol aynı commit'te yazılır.
24. **Toplu işin idempotency'sini** girdiden türetilen kimliğe dayandır (yan dosyaya değil) ve girdinin KALICI olarak tek olduğunu sor (dosya adı tek değildir).
25. **Çok adımlı dış yazmada** hata yolu önceki yazmaları geri alır; "ikinci adım patladı" için ayrı test yaz.
26. **Tarayıcıda ölçerken aracı ele:** Konva her katmana ayrı `<canvas>` üretir, `getClientRect` zaten görüntü pikselidir, JS `/i` Türkçe `İ`'yi eşleştirmez.
27. **Sahte zamanlayıcılı testte** kaç mikro görev turu gerektiğini say; testin gücünü düzeltmeyi geri alarak doğrula.
28. **Paylaşılan CSS sınıfında** çakışabilecek özellikleri (`position`, `display`, `z-index`) `@layer components` içine koy.
29. **Koşullu dallarda aynı türde elemana ayrı `key` ver;** "görünmüyor" şikâyetinde önce animasyonun oynadığını ölç; tuval boyutuna bağlı öğeye CSS `transition` verme.
30. **react-konva'ya verilen dizi/nesneyi** (özellikle `filters`) modül sabiti ya da `useMemo` yap; "makinede mi" sorusunu farklı koşullarda (dpr, derleme modu) ölçerek cevapla.
31. **Model yükleyen süreç sayısını artırmadan önce** süreç × 12 GB ≤ makinenin belleği hesabını yap.
32. **Koşullu güncelleme "satır değişmedi" dediğinde** NEDENİNİ oku; "iade edildi"/"yeniden dene" demeden önce iadenin bu çağrıda yapıldığını kanıtla.
33. **Gizlilik/saklama sözünü** gerçekleştiren ayarı kodda doğrula (Redis diske yazmıyor: `CONFIG GET`); doğrulanamıyorsa reddet.
34. **Veri silen işlemin güvenli yolu komutun kendisi olsun** (`backend/scripts/test.sh`); kullanıcıya bu tek komutu ver.
35. **Uzun işte kimliği** başladığı anda yerelde sabitle; ortak ref'e ancak hâlâ "güncel" olduğunu doğrulayınca yaz.
36. **Yoklama hatası kredi durumunu kanıtlamaz:** yeni krediye ancak önceki kredinin harcanmadığı ya da iade edildiği kesinleşince geç.
37. **Metin dosyasına `encoding="utf-8"` yaz;** Unix'e özgü modül için Windows kararını aynı commit'te ver; "yavaş/takıldı" demeden önce işlemciyi ölç.
38. **Kimlik/oturum asenkron geliyorsa** "kimlik yokken" yolu için ayrı test yaz; baseline açılış anındaki durumdur.
39. **Tarayıcı bildiriminde** önce o motorda ölç, sonra dev/üretim farkını dene; üretim düzgünse ziyaretçide hata yoktur.
40. **Bir performans sayısını** hangi donanımda ölçüldüğüyle birlikte yaz.
41. **Kapsam envanteri davranışı sınar** (mekanizmadan bağımsız); canlı örnekleri taklit et, sınıfı değil; yeni testi tek başına ve tam pakette koş.
42. **Tarama aracının** "bitti"sine değil raporun varlığına ve "succeeded"e bak; kimlik kapsamını pozitif+negatif kontrolle ölç; tarama örneğinde kapattığın sınırı raporda yaz.
43. **Yeni backend testini** CI koşuluyla da yerelde bir kez koş: `SUPABASE_URL="" SUPABASE_SECRET_KEY="" R2_ACCOUNT_ID="" backend/scripts/test.sh <test>`; ortama bağlı sonuç bekleyen test `tokens` ile ortamı kendisi kurar.
44. **Alarm eşiğini** NORMAL yük altında yalancı alarm vermediğini ölçmeden koyma; "tıkalı" bir bekleme süresi değil bir İLERLEME eksikliğidir, ilerleme işi BİTİŞİNDE işaretlenir.

## Ekip notları: Kaan'ın Claude Code oturumu için (Serhan'ın talimatı, 02.10.2026)

Açık işler `ROADMAP.md` bölüm 7'de (açık takip 12: Kaan'ın Faz 7 kapanış işleri). Bunlar ön yüz kodudur ve Kaan'ındır, ama şu noktalarda **Serhan'a SORULMADAN ilerlenmez** — ilgili adıma gelince dur ve Kaan'a "bunu Serhan'a sor" de (varsayım yapma, kendin karar verme):

- **K2 (ön yüz başlıkları):** (a) CSP kaynak listesine **backend/altyapıya ait** bir alan adı girecekse (R2 bucket adresi, Supabase proje adresi, hata izleme sağlayıcısı/Sentry adresi, canlı alan adı): bunlar Serhan'ın altyapı alanıdır; değeri kodda/`.env`'de bulabiliyorsan kullan, bulamıyor ya da tanıyamıyorsan Serhan'a sor. (b) Report-Only ihlal listesinde tanımadığın bir kaynak çıkarsa. (c) **Zorlayıcı kipe geçmeden önce** (yanlış bir CSP canlıda zeminleri/stüdyoyu sessizce bozar). HSTS ve canlı başlık doğrulaması Faz 7.5'te Serhan'ındır; yapma.
- **K3 (E2E testleri):** (a) **vitrin 3D yakınlaşma**: WebGL yokken ve "hareketi azalt"ta ekranda tam olarak ne görünmesi gerektiği Serhan'ın tasarımıdır (özellik onun: `docs/frontend-kararlar.md` "Açılış vitrini"). Önce kodu ve belgeyi oku; davranış belirsiz ya da kodla belge çelişiyorsa Serhan'a sor, testi tahminle yazma. (b) Ödeme, kuyruk ve admin testlerindeki **taklit yanıtlar backend'in GERÇEK gövde biçimini taşımalı** (ders 22): biçimden emin değilsen `backend/app/api/routes/*.py` ve `backend/tests/`'e bak, hâlâ belirsizse Serhan'a sor. (c) **Gerçek Supabase + gerçek backend'e karşı** uçtan uca test staging ister (Faz 7.5, Serhan'ın); başlama.
- **K1 (zemin takılması):** ön yüz içinde kalır. Sunucu tarafında (R2, yükleme betiği, `backgrounds` tablosu) orta boy zemin üretme fikri çıkarsa Serhan'a sor (ders 24, 25 ve migration kuralı).
- **Genel:** `backend/`, bir migration, R2 yapılandırması, hız sınırı ya da kimlik doğrulama dosyasında değişiklik gerekirse (ya da 429/503 gibi backend yanıt davranışlarını değiştirmek isteyen bir şey çıkarsa) önce Serhan'a sor.
