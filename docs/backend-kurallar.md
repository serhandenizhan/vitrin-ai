# Teknoloji yığını ve backend kuralları (ayrıntı)

> **Bu belge ne:** kök `CLAUDE.md`'nin eski "Teknoloji yığını" bölümü, **birebir** buraya taşındı
> (02.10.2026). `CLAUDE.md`'de yalnız her oturumda gereken kısa kurallar durur; **ödeme, admin paneli,
> hız sınırı, migration, kesim kuyruğu, hata izleme, model optimizasyonu ya da CI koduna dokunmadan
> önce** bu belgeyi okuyun. Tam gerekçe için `ROADMAP.md` bölüm 3.

## Teknoloji yığını

- **Backend:** Python, FastAPI, Redis. Redis, Faz 4 kapanışında dağıtık yükleme hız sınırlaması için öne çekilip kuruldu (`backend/app/services/rate_limit.py`). **Kesim kuyruğu (Faz 7, 27.09.2026):** arka plan kaldırma API'de değil ayrı bir işçide (`python -m app.workers.cutout`); API işi Redis kuyruğuna koyar (`app/services/cutout_queue.py`), istemci `GET /api/remove-background/jobs/{id}` ile yoklar. Celery/RQ yerine kendi küçük kuyruğumuz — gerekçe `backend/README.md` → "Kesim kuyruğu". **İşçi çalışmıyorsa kesimler sırada bekler** (02.10.2026'dan beri görünür: `GET /api/admin/cutout-queue` ve `error` günlüğü/Sentry, bkz. `backend/README.md` → "Kesim kuyruğu" → "İşçi sağlığı"); `execute.sh` ve VS Code görevi işçiyi açar. Özgün fotoğraf Redis'te en fazla 15 dk durur (KVKK metninde yazılı). **Redis diske yazmamalı (RDB/AOF kapalı):** `docker-compose.yml` Redis'i `--save "" --appendonly no` ve bellekte `/data` (tmpfs) ile açar; API her kuyruğa koymadan önce bunu doğrular ve açıksa fotoğrafı almaz (`CutoutQueue.ensure_ephemeral`, ders 33). Kaan'ın Windows'taki `redis-windows`'u da aynı argümanlarla başlatılmalı, yoksa kesimler 503 `queue_unavailable` alır.
- **AI modeli:** BiRefNet — sadece orijinal `ZhengPeng7/BiRefNet` MIT lisanslı ağırlıkları kullanın. BRIA'nın "RMBG" ağırlıklarını asla kullanmayın (aynı mimari, ancak bu ağırlıklar ticari değildir). Üretim modeli doğrudan `birefnet-general` — `-lite` ve `u2net` önceki iterasyonda elendi.
- **Veritabanı:** PostgreSQL (production'da Supabase — aynı proje, DB ve Auth ayrılmıyor)
- **Nesne depolama:** Cloudflare R2 (S3 uyumlu), public-read değil, presigned URL ile erişim
- **Frontend:** Next.js, TypeScript, Tailwind, shadcn/ui
- **Kompozisyon editörü:** Konva.js / react-konva
- **Kimlik doğrulama:** **Supabase Auth**. Oturum `@supabase/ssr` ile çerezde tutulur. FastAPI gelen Supabase JWT'sini projenin JWKS'iyle (ES256/RS256) doğrular — `backend/app/core/auth.py`. Yönetici yetkisi `admin_users` tablosundan gelir (Faz 3'ün `X-Admin-Secret`'ı Faz 4'te kaldırıldı). **IDOR koruması iki katmanlı:** backend veritabanına tablo sahibi olarak bağlandığı için RLS onu etkilemez — birinci katman her sorgudaki sahiplik filtresi (`user_id = <token'daki kullanıcı>`), ikinci katman Data API (PostgREST) kapısındaki RLS + grant'ler. **RLS'siz tablo oluşturulmaz**; `public`'teki her tablonun RLS'li olduğunu, `anon`/`authenticated`'ın hiçbir yetkisi olmadığını ve hiçbir SECURITY DEFINER fonksiyonunda PUBLIC/`anon`/`authenticated` için EXECUTE bulunmadığını `backend/tests/test_rls.py` genel olarak doğrular (fonksiyonun `REVOKE ALL ... FROM PUBLIC, anon, authenticated`'ı fonksiyonla aynı migration'da gider; 0004'te unutulan `record_signup_consents` yetkisi production yedeğinin manifestinde bulundu ve `0012`'de kapatıldı) (bkz. `ROADMAP.md` Faz 4, `SECURITY.md` 3.2, `backend/README.md` "Kimlik doğrulama ve yetkilendirme"). **Frontend tarafı:** tarayıcı backend'e hiç doğrudan gitmiyor; Next.js vekilleri (`src/lib/backend-proxy.ts`) çerezdeki oturumdan token'ı alıp `Authorization` başlığıyla iletiyor. `src/proxy.ts` her istekte oturumu yeniliyor ama **yetkilendirme sayılmaz** — asıl kontrol backend'de. Ekranda gösterilen profil bilgileri (ad, şirket, hesap türü) Supabase `user_metadata`'da ve kullanıcının düzenleyebildiği veri olduğu için hiçbir yetki kararında kullanılmaz.
- **Ödemeler (Faz 5):** iyzico; iş kuralları `backend/app/services/billing` içinde.
  Ödeme kodunu değiştirirken, migration yaparken veya canlı açılış/kurtarma
  yürütürken önce [ödeme runbook’unu](docs/billing-runbook.md) okuyun.
  Checkout varsayılan kapalı; yerel test başarısı merchant sandbox doğrulaması sayılmaz.
  **Erişim kararlarında dört kural:** (1) *listeleme kota kapısı değildir* —
  `GET /api/backgrounds` kota/abonelik hatasında `basic`e düşer, listeyi
  boşaltmaz; asıl kapı `POST /api/remove-background`'daki rezervasyondur.
  (2) *bir tahsilatın iadesi/itirazı yalnızca AİT OLDUĞU aboneliği kapatır* —
  kapsam `billing_transactions.period_id → subscription_periods.provider_subscription_reference`
  üzerinden belirlenir, hesap düzeyinde askıya alma yalnız güncel abonelik için.
  (3) *ödeme alınamadığında erişim anında kesilmez* — `past_due` 3 gün
  (`past_due_access_until`, uzamaz) mevcut dönemin KALAN kotasıyla sürer, yeni
  kredi verilmez, sonra `expired`. (4) *idempotency anahtarı İŞİ tanımlar,
  isteği değil* — kredi anahtar başına yalnızca bir kez tüketilir. Başarılı PNG
  `results/<user_id>/<request_id>-<random>.png` altında 24 saat saklanır; aynı anahtar
  tekrar gelirse **inference hiç çalışmaz**, saklanan nesne döner. Sonuç ÖNCE
  saklanır, kredi SONRA tüketilir; sonuç deposu kullanılamıyorsa iş hiç başlamaz
  (`503 result_storage_unavailable`) — belirsiz bir sonucu yeniden inference'a
  bağlamak aynı krediyi ikinci kez yakardı. **Bunun sonucu: arka plan kaldırma
  artık R2 olmadan çalışmıyor**, yerelde de `R2_*` ayarları gerekiyor (yalnız
  arayüz için `USE_MOCK_BACKEND=true`). İstemci yeni bir anahtara YALNIZCA
  backend `retry_safe` dediğinde geçer; başka her durumda (ağ koptu, iş sürüyor,
  sonuç artık saklanmıyor) anahtar korunur. **Faz 7'den beri** API krediyi yalnız AYIRIR ve işi kuyruğa koyar; sonucu R2'ye saklamak ve krediyi tüketmek/iade etmek işçinin işidir (`app/workers/cutout.py`). **Bir iş birden fazla kez işlenebilir** (işçi kredi tükettikten sonra ölürse iş kurtarılır): işçi her işe başlarken ayırmanın durumuna bakar; `retry_safe` YALNIZCA kredi gerçekten iade edildiyse yazılır, ayırma zaten tüketilmişse iş başarılı sayılır ve saklanan sonuç teslim edilir (ders 32). Ön yüz (`lib/cutout-job.ts`) kredisi iade edilmiş GEÇİCİ hataları kullanıcıya göstermeden yeni anahtarla sessizce bir kez daha dener.
- **Admin paneli (Faz 6):** backend uçları `backend/app/api/routes/admin.py`,
  **Genel bakışın en üstünde "Kesim kuyruğu" kartı** (02.10.2026): işçi çalışmıyorsa/kuyruk tıkalıysa gösterir, istatistik yüklemesinden bağımsız ve 30 sn'de bir yenilenir; `GET /api/admin/cutout-queue` vekili, `components/admin/admin-cutout-queue.tsx`,
  şema migration `0007`. **Beş kural:** (1) *admin'in verdiği kredi dönem
  kotasını BÜYÜTMEZ* — `quota_snapshot` değişmez bir kanıt kaydıdır; bonus
  krediler `credit_grants` tablosunda durur, yalnız dönem kotası tükendiğinde
  harcanır ve erişimi kapalı bir aboneliği **diriltmez**.
  `usage_reservations.grant_id` kaynağı tutar, çünkü başarısız bir iş kredisini
  **alındığı** kovaya iade etmeli. (2) *`admin_audit_log` yalnızca eklemeye
  açıktır* (DB trigger'ı `UPDATE`/`DELETE`'i reddeder) — yöneticinin
  düzenleyebildiği bir denetim kaydı denetim kaydı değildir; `actor_id`'nin
  FK'si bilinçli olarak yoktur ki admin hesabı silinse de iz kalsın.
  (3) *admin uçlarında hız sınırı yönü uca göre seçilir*: okuma fail-open,
  yazma (kredi, silme, rol) fail-closed. Kullanıcı e-postaları `auth.users`'tan
  değil Supabase'in yönetici API'sinden okunur. (4) *yönetici hesabı panelden
  silinmez, son yönetici kendini silemez* — panel sahipsiz kalırsa yetkiyi geri
  vermenin tek yolu veritabanına elle girmektir. (5) *denetim satırı yalnız
  durumu gerçekten değiştiren istekte yazılır* — idempotent bir tekrar, günlükte
  olmamış ikinci bir eylem göstermemeli. **Arayüz (Kaan, 18.09.2026):**
  `/admin` sayfası + `app/api/admin/**` vekilleri; yöneticilik bilgisi
  `GET /api/admin/me`'den (403 dönmez, yalnız GÖSTERİM — hesap menüsündeki
  bağlantı ve ilk ekran). Arayüzdeki etiket eşlemeleri (abonelik durumu,
  tahsilat türü) tahminle değil migration CHECK kısıtlarından yazılır. **Zemin
  yönetimi (Kaan, 19.09.2026):** `/admin` → Zeminler; `GET /api/admin/backgrounds`
  kütüphanenin TAMAMINI döndürür (pakete bakmaz, **pasif zeminleri de** verir —
  panelin işi bir zeminin neden kullanıcıya gitmediğini gösterebilmek), yükleme
  Faz 3'ten beri duran `POST /api/admin/backgrounds`. `PATCH .../{id}` paketi
  ve yayın durumunu, `DELETE .../{id}` zemini kalıcı olarak değiştirir
  (üç yazan uç da hız sınırı fail-closed ve append-only audit kayıtlıdır).
  **Pasif, silinmiş değildir:** satır ve
  R2 nesneleri durur, zemin yalnız kullanıcı listesinden çıkar — kütüphaneden
  çekmenin normal yolu budur, silme geri alınamaz ve arayüzde iki adımlıdır.
  **Taslakta kullanılan zemin de silinebilir** (Serhan'ın kararı, 27.09.2026 — eskiden `409`'du; /cso incelemesi, herhangi bir kullanıcının bir zemini taslağına bağlayıp silinmesini engelleyebildiğini gösterdi): silme, zemini kullanan taslakların bağlantısını aynı işlemde temizler ve stüdyo o taslağı uygun ilk zeminle açar; taslak zemini hem
  JSON `editor_state.backgroundId` hem `projects.background_id` sütununda (yabancı anahtar kısıtı yok)
  tutulur.
  Silmede sıra önce DB satırı sonra R2 nesneleri (ters sırası "satır duruyor,
  dosyası yok" üretirdi — ders 25). **Hesap
  silme EŞZAMANLI DEĞİL:** panel yalnız `deletion_requested_at` işaretleyip
  kuyruğa `delete_account` atar, asıl silmeyi
  `python -m app.services.billing.maintenance` yapar. **Günlük (19.09.2026, Serhan):** `GET /api/admin/audit`
  denetim günlüğünü yalnız OKUR (Faz 6 kapanış denetiminde okuma yolunun hiç
  olmadığı bulundu); panelde "Günlük" sekmesi. Eylem listesi backend
  `admin_audit.ACTIONS` ile frontend `AUDIT_ACTIONS` (`lib/admin-api.ts`)
  arasında elle senkron tutulur. Günlük YALNIZ yönetici eylemlerini tutar
  (kullanıcı işlemleri kendi tablolarında). Üstte "Admin · Serhan | Kaan"
  anahtarı (`?actor=`, süzme sunucuda); anahtarda yalnız AD yazar
  (`user_metadata.first_name`, yalnız gösterim), e-posta yazmaz.
- **Vitrin AI (Faz 7.2, PLANLI — henüz kod yok; 02.10.2026 kararları, ayrıntı `ROADMAP.md`
  Faz 7.2).** Üretim hattı kuralları, kod yazılırken uyulacak:
  (1) *Sahne bir veritabanı kaydıdır* (ürün türü, ad, önizleme, prompt şablonu, tür
  kalıcı|dönemsel, tema etiketi, tarih aralığı, cinsiyet, üretim modu, kredi maliyeti, durum
  taslak→test→yayında); tablo ve RLS **aynı migration'da**. Sahne listesini kullanıcıya
  sunan uç yalnız `yayında` ve tarihi geçerli (Europe/Istanbul) kayıtları döner;
  tür bayrağı kapalıysa o türün sahneleri hiç dönmez.
  (2) *Prompt sürümlenir:* düzenleme yeni sürümdür (eski silinmez), her üretim kaydı hangi
  sürümle yapıldığını yazar, yayındaki sahnenin prompt'u değişince sahne `test`e döner.
  Prompt şablonu kullanıcıya hiç gönderilmez ve kullanıcı girdisi prompt'a birleştirilmez.
  (3) *Kredi Faz 5 mantığıyla:* aynı bakiye, sahnedeki `kredi maliyeti` kadar rezervasyon,
  teknik hatada iade; **ilk üretim kredi düşer, ikinci deneme ücretsizdir** ve "beğenmedim"
  iadesi sayılmaz. **İdempotency anahtarı İŞİ tanımlar** (ders 24, 32): ürün + sahne +
  *girişin kendisi*; aynı ürün + sahneyi sonradan yeniden üretmek yeni bir girişle yeni
  iş olur. Tek rezervasyon = sağlayıcıya tek çağrı:
  **işçide sağlayıcı çağrısı için yeniden deneme YOKTUR** (02.10.2026). Çağrıdan ÖNCE iş
  "çağrı başladı" diye yazılır; zaman aşımı, ağ kopması ya da işçi çökmesinde iş başarısız
  sayılır ve kredi iade edilir (ders 32: "iade edildi" demeden önce iadenin bu çağrıda
  yapıldığını kanıtla). Yeniden başlayan işçi "çağrı başladı ama sonuç yok" işini yeniden
  ÇAĞIRMAZ. Test: çağrı sırasında işçi öldürülür, sağlayıcıya tek çağrı gittiği ve kredinin
  iade edildiği kanıtlanır. Çalınmış kartla alınan kredi (chargeback) bilinçli kabul edilmiş
  bir risktir (Faz 5 itiraz akışı hesabı askıya alır; yeni hesap bekletilmez).
  (4) *Yalnız ücretli plan:* Deneme planı sunucuda reddedilir (arayüz kilidi
  yetkilendirme sayılmaz); admin panelinde **tek açma/kapama bayrağı** vardır —
  kapalıyken yeni üretim başlamaz ve kredi düşmez, mevcut işler biter; **canlıya çıkarken
  varsayılan KAPALI**. Günlük bütçe tavanı YOK (Serhan kararı).
  (5) *Hız sınırı sınıfı `CLOSED`* (para harcayan, geri alınamaz): her yeni uç
  `tests/test_rate_limit_coverage.py` ve `tests/test_idor.py`'de bir sınıfa atanır;
  `OWNED` uçlar için "başkası 404 + kaynak değişmez, sahibi başarılı" testi yazılır.
  (6) *İki sonuç, biri silinir:* ikinci denemede kullanıcı seçer, seçilmeyen silinir; 7 gün
  seçmezse SON üretilen kalır (süre ayarlanabilir). Silme çok adımlı dış yazmadır: hata
  yolu önceki yazmaları geri almalı, "ikinci adım patladı" için ayrı test (ders 25).
  (7) *Üretim kaydı eklemeye açıktır* (kim, ürün, zaman, sahne, prompt sürümü, etiket kapatıldı
  mı, **sağlayıcıdan gelen/hesaplanan maliyet** — fiyat artışında gerçek ortalama maliyet
  görünsün diye; fiyat artışı için ek koruma yok, sahnedeki kredi maliyeti artırılır): DB trigger'ı `UPDATE`/`DELETE`'i reddeder (`admin_audit_log` deseni); **hesap
  silinince kullanıcı kimliği anonimleştirilir, kayıt kalır** — Faz 7 hesap silme akışıyla
  çakışmadığı testle kanıtlanır (Auth silindikten sonra çökmeyen kayıt).
  (8) *Sağlayıcı soyutlaması:* model/sağlayıcı sunucu ayarıyla değişir; seçim API
  testinden sonra yapılır (`ROADMAP.md` Faz 7.2). Sağlayıcıya **yalnız kesim** gider;
  anahtar yalnız `.env`'de. Kesim modelindeki "kalite bozulmaz" ilkesi burada
  "ürün sadakati önceliklidir" olarak geçerlidir: sadakat testini geçmeyen tür/sahne
  yayına girmez. **Üretim modu** alanı vardır (`yeniden çiz` | `hibrit`); ilk sürümde
  hepsi `yeniden çiz`.
- **Uygulanmış bir migration yerinde düzenlenmez.** Production'daki Alembic o
  revizyonu `alembic_version`'da gördüğü için dosyayı bir daha çalıştırmaz;
  değişiklik yerelde görünür, production'da sessizce hiç uygulanmaz. Şema
  düzeltmesi her zaman YENİ numaralı bir migration'a gider (Faz 5 inceleme
  düzeltmeleri `0006_billing_review_fixes`'te; `0005`'teki iki fonksiyon orada
  `CREATE OR REPLACE` ile güncelleniyor). Testin de yalnız boş DB'den
  `upgrade head` yolunu değil, **"önceki revizyon uygulanmış DB → yeni
  migration"** yolunu doğrulaması gerekir (`backend/tests/test_migration_0006.py`,
  `0011` için `test_migration_0011.py`). **Numara çakışması (27.09.2026):** iki dal
  aynı anda `0011` açtı; Alembic bunu okurken yalnız uyarıyor, `upgrade head`
  "Multiple head revisions" ile ancak test oturumu ya da deploy anında,
  dosyaları söylemeden duruyor. `backend/tests/test_migration_chain.py`
  (veritabanısız) numaraların benzersiz olduğunu, dosya adıyla uyuştuğunu ve
  zincirin tek uçlu olduğunu doğrular. Yeni migration açan bir dal, birleştirmeden
  önce güncel tabanın üstüne alınıp numarası bir sonrakine taşınır.
- **Dönem snapshot'ı veritabanı seviyesinde değişmezdir** (`period_snapshot`
  trigger'ı): plan sürümü, provider referansları, tarihler ve kota sonradan
  güncellenemez; yalnız `status`, `closed_at`, `used_this_period` ve hesap
  silmedeki `user_id → NULL` serbesttir. Testin zamanı geriye alması gerekiyorsa
  korumayı tek bir yardımcıda (`backend/tests/test_billing.py::backdate_period`)
  ve yalnızca o işlem süresince kapatın — üretim yolunda yürürlükte kalsın.
- **Model optimizasyonunda kalite bozulmaz (Serhan, 27.09.2026):** FP16/INT8
  niceleme, 1024'ün altında giriş çözünürlüğü, lite model KULLANILMAZ.
  Ölçüm: sürenin %93–99'u model hesabı (`backend/scripts/profile_cutout.py`);
  CPU'da kayıpsız kazanç %5'in altında olduğu için yapılmadı. Hız GPU'yla
  (FP32) gelir — Faz 7.5.
- **Model süreç başına yüklenir (yük testi, 26.09.2026):** her kesim İŞÇİSİ
  BiRefNet'in ayrı bir kopyasını tutar (N işçi × ~12 GB; ders 31). Faz 7'den
  beri API modeli hiç yüklemez, bu yüzden API süreç sayısıyla serbestçe
  ölçeklenebilir; kesim kapasitesi işçi MAKİNESİ sayısıyla (ya da GPU'yla,
  Faz 7.5) artar. Aynı CPU'da `MAX_CONCURRENT_INFERENCES` > 1 hızlandırmaz. Yük testi aracı `backend/scripts/load_test.py`
  (R2'ye yazmaz, yalnız yerel test veritabanında koşar); sonuçlar
  `backend/README.md` → "Yük testi".
- **Hata izleme (Faz 7):** backend `backend/app/core/monitoring.py`, frontend
  `frontend/src/lib/error-tracking.ts` (tarayıcı + Next sunucusu, DSN yokken SDK
  hiç yüklenmez; tıklama kırıntıları ve adres sorguları gitmez — ayrıntı
  `frontend/README.md` → "Hata izleme"). KVKK/gizlilik metnine "hata izleme
  hizmet sağlayıcısı" alıcı grubu olarak eklendi (yasal sürüm `2026-09-27`).
  Backend: Sentry protokolü.
  `SENTRY_DSN` boşken kapalı; doluyken yalnız 5xx gider ve gövde, yerel
  değişken, kimlik bilgisi başlıkları, çerez, sorgu dizesi hiç gitmez, e-posta/
  JWT/SQL parametresi maskelenir. **Production'da DSN, sağlayıcı KVKK
  aydınlatma metnine eklenmeden verilmez.** Testler `SENTRY_DSN`'i her zaman
  boşaltır (`tests/conftest.py`). Yeni bir kimlik bilgisi başlığı eklenirse
  `SENSITIVE_HEADERS`'a da eklenir.
- **Hız sınırı Redis arızasında her uç noktada aynı davranmaz.** Karar, uç
  noktanın NE KORUDUĞUNA göre veriliyor: para/sağlayıcı geri dönüşü/webhook
  yüzeyleri **fail-closed** (`limit_checkout`, `limit_public`), zemin
  **listeleme** ise **fail-open** (`limit_scoped`). Gerekçe: listeleme bir kapı
  değil (erişim kuralı 1) ve sınırlayıcının altyapı arızası, Next vekilinin
  bütün 5xx'leri "200 + boş liste"ye çevirmesi yüzünden kullanıcının gözünde
  93 zeminlik kütüphaneyi yok ediyordu. Her iki yön de test edilmiş durumda;
  yeni bir uç noktaya sınır eklerken bu ayrım bilinçli olarak seçilir. **Kapsam (02.10.2026):**
  OpenAPI'deki HER uç `backend/tests/test_rate_limit_coverage.py`'de `CLOSED`/`OPEN`/
  `UPLOAD`/`EXEMPT` sınıflarından birine atanır (sınıfsız yeni uç kırmızı yakar) ve test
  davranışı sınar: limit doluyken 429, Redis düşünce CLOSED 503 / OPEN sınırsız geçer.
  Çalışma okuma/abonelik/geçmiş/kesim yoklaması `limit_user_read` (fail-open, 600/dk),
  taslak otomatik kaydı `limit_project_write` (fail-open: Redis arızasında kapatmak
  kullanıcının stüdyodaki düzenlemesini kaybettirirdi), çalışma silme `limit_user_delete`
  ve hesap silme `limit_account_delete` (fail-closed, saatte 5; bağımlılık DEĞİL, e-posta
  onayı doğrulandıktan SONRA çağrılır — önce sorulunca yanlış yazılan onay hakkı tüketip
  kullanıcıyı bir saat kilitliyordu), ödeme oturumu ve abonelik iptali
  `limit_checkout_cancel` (fail-closed, 10/dk, satın almadan AYRI kova — aynı kovada
  birkaç ödeme denemesi iptali engelliyordu; 03.10.2026, PR #46 kod incelemesi), admin faturalama yazma
  uçları `limit_admin` (fail-closed; 02.10.2026'ya kadar sınırsızdı). Fail-closed artık
  hep temiz 503 `rate_limit_unavailable` verir (eskiden yakalanmamış `RedisError` → 500).
  **Ön yüzde 429 (02.10.2026 kontrolü):** vekil (`lib/backend-proxy.ts`) 429/503'ü Türkçe mesaj ve `Retry-After`'la aynen aktarır; hesap silme, abonelik iptali, destek formu ve çalışma listesi bunu gösterir. **Kesim yoklaması** 429'u ARTIK hataya çevirmez: `Retry-After` kadar bekleyip aynı anahtarla sürer, 5 ardışık 429'da mesajla durur (anahtar ve kredi korunur). Otomatik kayıt 429'da genel "kaydedilemedi" bandını gösterir (mesaj 429'a özgü değil; 300/dk sınırı normal kullanımda tetiklenmez). Destek formu  (`POST /api/support-requests`, saatte 5/kullanıcı) da fail-open: Redis'in
  düştüğü an kullanıcının sorun bildirmek isteyeceği andır. **CMYK dönüşümü**
  (Next `/api/cmyk`, 27.09.2026'ya kadar oturumsuz ve sınırsızdı — /cso
  incelemesi) gövdeyi okumadan önce backend'e sorar (`POST /api/cmyk/permit`:
  oturum + kullanıcı başına 10 dk'da 20); **fail-closed**, çünkü korunan şey
  sunucunun işlemcisi ve kaybedilen yalnız CMYK dosyası. **Oturum token'ı
  tarayıcıdan okunabilir** (`@supabase/ssr` çerezi `httpOnly` değil); "tarayıcı
  token görmüyor" eski ifadesi yanlıştı, ayrıntı `SECURITY.md` 3.1.
- **Hız sınırı kovası ters proxy arkasında doğru seçilmeli:** `request.client.host`
  doğrudan okunursa tüm trafik proxy'nin tek kovasını paylaşır, `X-Forwarded-For`'a
  körlemesine güvenmek ise sınırı tamamen kaldırır. Başlık yalnız bağlantı
  `TRUSTED_PROXY_IPS` listesindeki bir adresten geliyorsa okunur; vekil arkasındaki
  oturumlu uç noktalarda kova kullanıcıya bağlanır
  (`backend/app/services/billing/limits.py`).
- **Test:** pytest (backend), Vitest (frontend), Playwright (E2E). **CI (Faz 7,
  26.09.2026):** `.github/workflows/ci.yml` her PR'da backend testlerini
  `.env`'SİZ, frontend lint/test/build'i ve ayrı bir işte `pip-audit` +
  `npm audit --omit=dev`'i koşar (geliştirme araçları dahil `npm audit` ayrı, engellemeyen bir adımdır; düzeltilmiş sürümü olmayan bir geliştirme aracı açığı zorunlu kapıyı kırmızı tutmasın diye, 03.10.2026, `ROADMAP.md` Faz 7 "dördüncü olay"). Supabase isteyen bir test `tokens` fixture'ını ister —
  yerel `.env`'ye gizlice dayanan test yerelde yeşil, CI'da kırmızı yanar.
  CI'ın backend işi testlerden önce `ruff check app tests scripts alembic`
  koşar (yalnız pyflakes: tanımsız isim, kullanılmayan içe aktarma;
  `backend/ruff.toml`, 27.09.2026). Yerelde aynısı: `cd backend && .venv/bin/ruff check app tests scripts alembic`.
  **Backend testleri tek komutla: `backend/scripts/test.sh`** (ayrı compose
  projesinde kendi Postgres'i 5434 + Redis'i 6380; argümanlar pytest'e geçer,
  çıkış kodu pytest'inki; test Redis'ini her oturum başında temizler — yalnız
  kendi Redis'inde, `VITRIN_TEST_REDIS_OWNED=1`, kilit alındıktan sonra, bkz.
  `backend/README.md` → "Testler"). Düz `pytest` `execute.sh`'ın geliştirme
  veritabanında (yerel + 5432 + `vitrin_ai`) hiçbir şeye dokunmadan durur
  (`VITRIN_ALLOW_DEV_DB_RESET=1` ile bilerek geçilir); aynı test
  veritabanında ikinci bir oturum da kilit alamayıp durur (ders 34).
  Model çıktısını değiştirebilecek her iş (bağımlılık yükseltmesi, model
  optimizasyonu) `backend/scripts/compare_cutouts.py` ile gerçek fotoğraflarda
  önce/sonra ölçülür. `./execute.sh` requirements değişince `.venv`'yi günceller. **npm tuzağı (PR #30):** Mac'teki eski npm (11.6) ile yapılan `npm install`, kilit dosyasına Linux'ta gereken isteğe bağlı paketleri (`@emnapi/*`) yazmadı ve CI'daki `npm ci` "lock file out of sync" ile düştü. Kilit dosyası CI ile aynı npm'le güncellenir: `docker run --rm -v "$PWD:/app" -w /app node:24-alpine npm install --package-lock-only --ignore-scripts` (frontend klasöründe).
- **Mobil (sonra):** React Native + Expo
