# Faz 5 — Ödemeler ve kredi sistemi tasarımı

**Tarih:** 2026-09-14 (v5 — yenileme gecikmesi ve trial yarış düzeltmelerinden sonra revize edildi)
**Kapsam:** Faz 5 abonelik/kota modeli, iyzico entegrasyonu, webhook, kullanım, iade/itiraz ve mutabakat. Kaan'ın satın alma, kredi bakiyesi ve fatura/geçmiş arayüzü bu API sözleşmesine dayanır; arayüz tasarımı ayrı çalışmadır.

## v6 — Uygulama uyarlamaları (15.09.2026)

Bu bölüm aşağıdaki taslak sözleşmelerden farklı olan sağlayıcı ayrıntılarında
önceliklidir. Kullanıcı HTML/token checkout ve iki sağlayıcı planı uyarlamasını onayladı.

- Hosted URL yerine backend sahiplik kontrollü `/odeme/{session_id}` sayfası ve
  izole iyzico HTML iframe kullanılır. Callback ardından token/abonelik detayları
  sunucudan doğrulanır; conversationId retrieve isteğinde gönderilen bir echo'dur.
- Trial süresi checkout alanı değildir; normal ve 7 günlük denemeli pricing-plan
  referansları immutable plan sürümünde ayrı tutulur ve ikisi de doğrulanır.
  Trial başlangıcında tahsilat yoktur: ACTIVE abonelik + gerçek trial dönemi
  doğrulanınca hak bir kez tüketilir, charge yalnızca gerçek başarılı order içindir.
- Checkout isteği `expected_plan_version_id` taşır. Eski fiyatla onaydan sonra
  sürüm değişmişse 409; yeni fiyat kullanıcıya tekrar gösterilmelidir.
- Geç tahsilat erişim açmaz; gerçek mali kayıt + iptal/tam iade telafisi oluşturur.
- iyzico conversationId idempotency garantilemez. Initialization timeout'u yeniden
  gönderilmez; iade dispatch sonrası belirsizlik kalıcı uncertain + kanıtlı admin
  uzlaştırması gerektirir. İstek imzasında GET query string bulunmaz.
- Günlük mutabakat abonelik/order taraması ve önceki iki günün sayfalı
  PAYMENT/REFUND/CANCEL raporlarını kapsar. Farklar alarmdır, otomatik kredi değildir.
- Ücretsiz başlangıç kotası 10/ay olarak yayımlanır; admin yeni sürüm çıkarabilir.
  Ücretli fiyatlar iş sahibi tarafından belirlenip doğrulanmadan yayımlanmaz.
- Hesap silme 202 pending'dir. Kalıcı iş kuyruğu iptalleri doğrular, sonra R2/Auth
  siler; mali/kabul kayıtlarını kimlikten ayırır. İşletim ve dış açılış koşulları
  [ödeme runbook'unda](../../billing-runbook.md) tanımlıdır.

## v2 → v3: kilit düzeltmeler

v2; rezervasyon, checkout idempotency, gerçek webhook olay adları ve finansal ledger ekledi. İkinci incelemede kalan açıklar bu sürümde kapatıldı:

- Geçmiş dönemleri korumak için immutable **subscription_periods** eklendi.
- Kota için gerçek dönem yenileme, dönem sonu kontrolü ve request idempotency tanımlandı.
- Yerel plan fiyatı ile iyzico pricing planı ayrışmasın diye immutable **plan_versions** ve yayınlama akışı eklendi.
- Checkout eşlemesi gerçek iyzico referansları, trial reservation ve amount/currency doğrulamasıyla netleştirildi.
- İptal, plan değişimi, iade, itiraz ve hesap silme provider–DB action/outbox akışına bağlandı.
- Webhook retry'nin hiç ulaşmayan event'i bulamayacağı kabul edildi; günlük reconciliation launch kapısıdır.
- Basic/full zemin yetkisi backend'de zorunlu hale getirildi.

## v3 → v4: üçüncü inceleme turunda bulunan üç nokta

- **Plan değişiminde iyzico'nun kendi "upgrade" API'si kaldırıldı** — kendi oranlama
  davranışını doğrulamadan güvenmek, "oranlama yok" kararımızı sessizce bozabilirdi. Her plan
  değişimi artık aynı ürün olsa bile yeni checkout + eski aboneliğin iptali.
- **Ücretli yenilemede webhook gecikmesi açıkça "bilinen sınır" olarak yazıldı** — uydurma bir
  grace state eklemek yerine (v1'in aynı hatasına düşmemek için) gerçek güvenceler
  (günlük reconciliation + manuel destek müdahalesi) ve implementasyon sırasında doğrulanacak
  bir varsayım (iyzico'nun gerçek yenileme zamanlaması) açıkça ayrıştırıldı.
- **Eşzamanlı çift deneme rezervasyonu artık veritabanı seviyesinde engelleniyor** —
  `trial_used_at` checkout açılış anında yazılıyor ve `checkout_sessions` üzerinde kullanıcı
  başına en fazla bir `reserved` trial'a izin veren kısmi unique index eklendi.

## v4 → v5: yenileme ve trial semantiği tamamlandı

- **Yenileme webhook'u tek gerçek-zamanlı yol değildir.** Dönem sonunda gelen ilk kullanım
  isteği, kısa süreli ve eşzamanlılığa dayanıklı bir iyzico doğrulama yolunu tetikler. Başarılı
  tahsilat doğrulanırsa yeni dönem webhook beklenmeden atomik açılır; doğrulanmayan ödeme için
  asla yeni kredi verilmez.
- **Trial rezervasyonu kullanım değildir.** `trial_used_at` artık checkout açılışında değil,
  yalnız doğrulanmış başarı event'i işlenirken yazılır. Aktif rezervasyona kullanıcı başına tek
  satır kısıtı, aynı anda birden fazla trial checkout yaratılmasını engellemeyi sürdürür.

## Kilit kararlar

- Tüm iş mantığı FastAPI'de kalır; Next.js yalnız UI ve vekildir. Mobil Faz 8 aynı API'yi kullanır.
- İş modeli aboneliktir; proration yoktur. Yeni checkout açılması erişimi değiştirmez; erişim yalnız doğrulanmış provider ödemesiyle değişir.
- Webde iyzico Hosted Checkout Form kullanılır; kart verisi backend'e girmez. Production checkout için X-IYZ-SIGNATURE-V3 Merchant Panel'de etkin ve smoke-test edilmiş olmalıdır.
- Kullanım rezervasyonu, dönem entitlement'ı, finansal hareket ve ham provider event'i ayrı veri kaynaklarıdır.
- Bakım işleri uygulama içi gizli scheduler değildir: Hetzner'de deploy edilen, gözlemlenen systemd timer uygulamanın DB katmanını doğrudan çağırır.

## Veri modeli

### plans ve plan_versions

**plans**, kullanıcıya görünen kalıcı ürün kimliğidir: id, name, active, created_at. Fiyat, kota ve provider referansı plans üzerinde değiştirilemez.

Her ticari değişiklik yeni immutable **plan_versions** satırı yaratır:

| Alan | Tip | Not |
| --- | --- | --- |
| id | UUID PK | |
| plan_id, version | text, int | unique(plan_id, version) |
| price_minor_units, currency | int, text | Kuruş ve TRY; Deneme için 0/TRY |
| monthly_quota | int | Deneme dahil pozitif aylık kota |
| background_tier | text | basic veya full; entitlement sürümünün parçası |
| trial_period_days | int | Ücretli sürümde en çok 7, Deneme'de 0 |
| iyzico_product_reference_code | text, null | Deneme'de null |
| iyzico_pricing_plan_reference_code | text, null | Ücretli yayımlanmış sürümde zorunlu |
| published_at, retired_at | timestamptz, null | Aynı planın yalnız bir canlı sürümü vardır |

İlk migration Deneme sürümünü yayımlar. Ücretli sürüm, iyzico ürünü ve pricing planı doğrulanmadan yayımlanamaz; checkout açıkça 503 billing_not_ready döner.

**Plan yayınlama:** POST /api/admin/plans/{id}/versions yalnız admin_users için çalışır. Yeni fiyat için önce iyzico'da yeni pricing plan oluşturulur; backend provider referansını doğrular, sonra yeni immutable sürümü yayımlar ve eski sürümü emekliye ayırır. PATCH /api/admin/plans/{id} yalnız name/active değiştirir; fiyat, kota ve provider referansı değiştiremez.

### subscriptions ve subscription_periods

**subscriptions** kullanıcının mevcut provider ilişkisidir; kullanıcı başına tek satırdır ve geçmişi tutmaz.

| Alan | Tip | Not |
| --- | --- | --- |
| id | UUID PK | |
| user_id | UUID FK auth.users, unique | |
| provider | text, null | Deneme'de null; şimdilik iyzico |
| provider_subscription_reference | text, null, unique | |
| status | text | active, trialing, past_due, canceling, canceled, suspended, expired |
| access_until | timestamptz, null | Provider iptal edilse de satın alınmış erişim sonu |
| trial_used_at | timestamptz, null | Kullanıcı yaşamında yalnız bir trial |
| renewal_check_after | timestamptz, null | Dönem sonu iyzico doğrulamasını kullanıcı başına en fazla dakikada bir başlatır |
| created_at, updated_at | timestamptz | |

Her erişim dönemi immutable **subscription_periods** satırıdır:

| Alan | Tip | Not |
| --- | --- | --- |
| id | UUID PK | |
| subscription_id, user_id | UUID FK | |
| plan_version_id | UUID FK | Fiyat/kota/zemin yetkisinin immutable kaynağı |
| provider_subscription_reference, provider_order_reference | text, null | Provider kanıtı |
| starts_at, ends_at | timestamptz | Deneme dahil gerçek aylık sınırlar; uzak tarih yok |
| quota_snapshot, used_this_period | int | Sürümden kopyalanır |
| status | text | pending, active, superseded, expired, suspended |
| created_at, closed_at | timestamptz, null | |

Kayıt trigger'ı yayımlanmış Deneme sürümüyle ilk aylık dönemi açar. Dönem sonrasında ilk yeni istekte, tek kısa transaction eski dönemi expired yapar ve yeni Deneme dönemi yaratır. Ücretli yenilemede ise yeni dönem yalnız doğrulanmış iyzico başarılı ödemesiyle yaratılır; ödeme yoksa yeni kota verilmez.

**Ücretli yenileme: webhook gecikmesine dayanıklı doğrulama.** Webhook normal yoldur; fakat
`period.ends_at <= now()` iken gelen ilk kota isteyen istek, önce mevcut period/webhook sonucunu
kontrol eder. Yeni dönem yoksa `subscriptions` satırı kilitlenir ve `renewal_check_after` koşullu
olarak `now() + 60 saniye` yapılır; yalnız kazanan istek iyzico'dan subscription/son ödeme
durumunu sunucu tarafında, kısa timeout ile sorgular. Ağ çağrısı DB transaction'ı dışında yapılır.
Sonra ikinci kısa transaction şu iki sonuçtan yalnız birini yazar:

1. iyzico tahsilatı başarılı ve provider referansı/planı/tutarı/currency'si beklenenle eşleşiyorsa,
   webhook handler ile **aynı idempotent dönem-açma fonksiyonu** yeni paid period'u ve charge
   ledger kaydını yaratır. Geç gelen webhook daha sonra no-op olur.
2. Tahsilat başarısız, pending veya iyzico erişilemezse mevcut dönem uzatılmaz ve yeni kredi
   verilmez. İstemci `409 billing_renewal_pending` ve en fazla 60 saniyelik `Retry-After` alır;
   önceki dönemde kullanılmamış kota da period bitmiş olduğu için harcanamaz.

Bu, sınırsız/uydurma bir entitlement grace'i değildir: müşteri yalnız provider'da gerçekten
başarılı görünen ödeme ile yeni kotaya geçer. `renewal_check_after` içindeki diğer istekler aynı
pending cevabı alır; bakım worker'ı zamanı gelince doğrulamayı yeniden dener. Günlük
reconciliation hâlâ kaçırılmış olaylar için alarm ve manuel inceleme güvenlik ağıdır, erişimin
tek onarım yolu değildir.

### usage_reservations ve usage_events

| Alan | Tip | Not |
| --- | --- | --- |
| usage_reservations.id | UUID PK | |
| period_id, user_id | UUID FK | |
| request_id | UUID | unique(user_id, request_id); inference retry idempotency |
| status | text | pending, consumed, released |
| created_at, resolved_at | timestamptz | |
| usage_events.id | bigint identity PK | |
| period_id, reservation_id, user_id | FK | Tüketimin dönemi değişmez biçimde bellidir |
| event_type, created_at | text, timestamptz | Şimdilik background_removal |

Remove-background akışı:

1. admin_users muaf tutulur. Diğer kullanıcı için aktif period, period.ends_at > now() ve subscriptions.status active/trialing şartıyla bulunur.
2. Tek kısa transaction içinde subscription_periods sayaç artırılır: period aktif, bitmemiş ve used_this_period < quota_snapshot olmalıdır. Aynı transaction pending reservation ekler. Aynı request_id mevcutsa yeni inference başlatılmaz.
3. Transaction kapanır; inference çalışır. Başarıda yalnız pending → consumed koşullu geçişi usage_events insert'iyle birlikte yapılır. Hatada yalnız pending → released koşullu geçişi sayacı bir azaltır.
4. Bakım işi beş dakikayı aşan pending reservation'ı yalnız halen pending ise released yapar; yarışta çifte azaltma yapamaz.

### checkout_sessions

| Alan | Tip | Not |
| --- | --- | --- |
| id | UUID PK | |
| user_id, plan_version_id | UUID FK | |
| idempotency_key | UUID | unique(user_id, idempotency_key) |
| customer_reference_code, conversation_reference | UUID | İyzico'ya gönderilen tekil eşleme değerleri |
| expected_amount_minor_units, currency | int, text | Session fiyat snapshot'ı |
| provider_checkout_token, provider_subscription_reference | text, null | |
| trial_status | text | none, reserved, consumed, released |
| status | text | pending, completed, expired, failed |
| created_at, expires_at, completed_at | timestamptz | 30 dakika sınır |

Aynı kullanıcı+idempotency anahtarı pending ise aynı hosted URL döner; süresi dolmuş anahtar 409 döner ve yeni anahtar gerekir. Trial checkout açıldığında yalnız reserved olur; failed/expired session reservation'ı serbest kalır. Trial, yalnız doğrulanmış subscription.order.success sonrasında consumed olur.

**Trial rezervasyonu ve tüketimi.** Trial-uygun checkout oluştururken backend kullanıcının
`subscriptions` satırını `FOR UPDATE` kilitler. `trial_used_at IS NOT NULL` ise iyzico'ya trial
günü gönderilmez. Aksi halde, geçerli `pending + reserved` session varsa farklı idempotency anahtarı
ile bile yeni provider checkout yaratmak yerine o session'ın hosted URL'i döner. Yoksa session
`reserved` olarak eklenir. Veritabanı son savunma olarak şu kısmi unique index'i taşır:
`CREATE UNIQUE INDEX ... ON checkout_sessions(user_id) WHERE trial_status = 'reserved' AND status = 'pending'`.
Bu yüzden uygulama kodu yarışsa bile kullanıcı başına aynı anda yalnız bir canlı trial rezervasyonu
oluşur.

İmzalı webhook ve server-side iyzico doğrulamasından sonra, session hâlâ `pending + reserved` ve
bitmemişse tek transaction içinde `reserved → consumed`, `pending → completed` ve
`subscriptions.trial_used_at = now()` yazılır; `trial_used_at` için `IS NULL` koşulu compare-and-set
olarak kullanılır. Ödeme başarısız olur, session süresi dolar veya doğrulama geçemezse yalnız session
`released` olur; `trial_used_at` **değişmeden null kalır**. Böylece checkout sayfasını kapatmak
trial hakkını yakmaz; buna karşılık iki eşzamanlı checkout da iki trial sağlayamaz.

Webhook erişim vermeden önce dört doğrulama yapar: V3 HMAC, eşleşen/bitmemiş customer_reference_code veya conversation reference, provider subscription ile pricing-plan referansının session plan sürümüyle eşleşmesi, provider ödeme kaydında beklenen tutar ve para birimi. Bir tanesi uyuşmazsa erişim, period ve finansal kayıt oluşmaz; event manuel incelemeye gider.

### billing_transactions, webhook_events ve provider_actions

**billing_transactions** kullanıcıya gösterilen immutable para defteridir.

| Alan | Tip | Not |
| --- | --- | --- |
| id | UUID PK | |
| user_id, period_id | UUID FK | Kullanıcı silinince user_id pseudonymize edilir; mali kayıt cascade silinmez |
| type | text | charge, refund, chargeback, chargeback_reversal |
| status | text | succeeded, failed, disputed, won, lost |
| amount_minor_units, currency | int, text | |
| provider, provider_transaction_reference | text | unique(provider, provider_transaction_reference, type) |
| invoice_reference, created_at | text, timestamptz | |

**webhook_events** ham JSON, provider_event_id = iyziReferenceCode, event_type, processed_at, processing_attempts, last_error ve lease_until tutar. unique(provider, provider_event_id) idempotency sağlar. Handler imzayı doğrular, event durable yazılmadan 2xx dönmez. Worker satırı FOR UPDATE SKIP LOCKED + lease ile alır; 10 deneme sonrası alarm ve manuel inceleme kuyruğu üretir. Bilinmeyen event processed sayılmaz ve alarm verir.

**provider_actions** uzak yan etki outbox'ıdır: cancel_subscription, refund_payment, suspend_entitlement ve delete_account. Her action idempotency anahtarı, hedef provider referansı, pending/running/succeeded/failed durumu, attempt sayısı ve son hatayı tutar. Worker provider çağrısından önce veya sonra çökse de action'ı idempotent tekrar dener.

### RLS, kayıt silme ve checkout hukuki kanıtı

plans, plan_versions, subscriptions, subscription_periods, usage_reservations, usage_events,
checkout_sessions, billing_transactions, webhook_events, provider_actions ve
storage_deletion_jobs aynı migration'da RLS açık olarak oluşturulur. anon/authenticated rolleri
tablolara ve sequence'lere doğrudan grant almaz; tüm erişim FastAPI'nin sahiplik filtresiyle
yapılır. Kullanıcıya açık iki veri yüzeyi, backend'in ürettiği GET /api/plans ve yalnız kendi
satırını döndüren GET /api/subscriptions/me ile GET /api/billing/history'dir. Admin endpointleri
her zaman admin_users kontrolü ister.

checkout session oluşturulmadan önce mesafeli satış ön bilgilendirmesi/sözleşmesi için kabul
zorunludur. user_consents tablosuna document_type, document_version, document_hash, locale,
accepted_at, plan_version_id ve checkout_session_id ile immutable satır yazılır. Kullanıcı
hesabı silinse bile fatura/consent için zorunlu saklama kaydı, hukukçu ile belirlenen süre ve
pseudonymization politikasıyla korunur; aktif kullanıcı verisi ve R2 içeriği ise ancak remote
abonelik iptal action'ı başarılı olunca silinir.

Checkout kabulü için mevcut user_consents benzersizlik kuralı checkout_session_id'yi de kapsar;
aynı sözleşme sürümünün sonraki gerçek satın alımlarda kanıtı kaybolmaz. Kayıt/kullanım koşulu
kabulü ile satış sözleşmesi kabulü aynı satıra veya aynı hukuki sebebe karıştırılmaz.

## API yüzeyi

| Uç nokta | Açıklama |
| --- | --- |
| GET /api/plans | Herkese açık, yalnız yayımlanmış aktif plan sürümünü döner. |
| GET /api/subscriptions/me | Oturum ister; aktif dönem, kota, kullanım, access end ve status döner. |
| POST /api/subscriptions/checkout | Oturum ister; plan_id ve idempotency_key alır. Fiyat/trial istemciden gelmez. |
| POST /api/subscriptions/cancel | cancel_subscription action açar; provider iptali başarılı olunca erişim yalnız access_until kadar sürer. |
| POST /api/subscriptions/change-plan | Her zaman yeni checkout (iyzico'nun kendi "upgrade" API'si **kullanılmaz** — bkz. gerekçe aşağıda). Eski abonelik yeni ödeme doğrulanmadan iptal edilmez. |
| GET /api/billing/history | Kullanıcının sayfalanmış billing_transactions geçmişi. |
| POST /api/admin/billing/{transaction_id}/refund | Yalnız admin; belirli başarılı charge ve idempotency anahtarı alır. |
| POST /api/admin/subscriptions/{user_id}/suspend | Yalnız admin; chargeback/dispute için erişimi keser, refund çağırmaz. |
| POST /api/admin/plans/{id}/versions | Yeni immutable plan sürümü yayınlar. |
| POST /api/webhooks/iyzico | V3 HMAC, durable ingest ve idempotency. |

### İptal, plan değişimi, iade, itiraz ve hesap silme

- **İptal:** iyzico iptali action ile başarılı olmadan kullanıcıya iptal edildi denmez. Remote iptal gelecekteki tahsilatı durdurur; access_until satın alınmış dönemin erişimini korur. Süre sonunda period expired olur.
- **Plan değişimi:** yeni ücretli charge doğrulanır, yeni period yaratılır; ancak sonra eski provider aboneliği için cancel action başlar. Cancel hata verirse retry ve alarm üretilir. Aynı plan sürümüne geçiş reddedilir. **iyzico'nun kendi "abonelik yükseltme" (upgrade) API'si bilinçli olarak kullanılmıyor** — o API'nin kendi oranlama (proration) davranışını doğrulamadık ve "oranlama yok" kararımızı sessizce bozma riski var; bunun yerine her plan değişimi, ürün aynı olsa bile, yeni bir checkout + eski aboneliğin iptali olarak işleniyor. Daha fazla iyzico API çağrısı pahasına, davranışın tamamı bizim kontrolümüzde kalıyor.
- **İade:** admin belirli bir charge için refund_payment action açar. Başarılı refund immutable refund kaydı oluşturur, erişimi derhal suspend eder ve aktif provider aboneliği için ayrı cancel action başlatır.
- **Chargeback:** bankanın zaten uyguladığı chargeback için refund API kesinlikle çağrılmaz. Panel kararı veya doğrulanmış provider olayı chargeback kaydı + suspend action yaratır; sonuç won/lost olur.
- **Hesap silme:** delete_account action önce aktif provider aboneliklerini iptal eder. Başarı olmadan Auth/R2/uygulama verisi silinmez; retry ve destek görünürlüğü vardır. Mali kayıtlar cascade silinmez; yasal saklama politikasına göre kullanıcı kimliği pseudonymize edilir.

### Zemin yetkisi ve Deneme geçmişi

GET /api/backgrounds, zemin imzalı URL üretimi ve proje kaydı seçilen zemini backend'de aktif period.background_tier ile doğrular. Basic kullanıcı full zemin için URL veya proje kaydı alamaz; frontend gizlemesi güvenlik katmanı değildir.

Deneme hesabı yeni kayıt sonrası en çok 10 projeye indirilir. Kullanıcı projeleri transaction'da kilitlenir; en eskiler seçilir, R2 silme storage_deletion_jobs kuyruğuna eklenir, proje DB satırı ancak silme başarılı olunca kaldırılır. Başarısız R2 silmeleri retry/alarm ile çözülür.

storage_deletion_jobs; id, project_id, r2_key, reason, status (pending/running/succeeded/failed),
attempts, last_error, lease_until ve created_at alanlarını tutar. project_id için tek canlı iş
vardır; worker lease ile işi alır ve R2 silme idempotent tamamlanınca project satırını siler.

## Bakım, reconciliation ve launch kapıları

Hetzner'de deploy edilen billing-maintenance.service + billing-maintenance.timer her dakika reservation,
checkout expiry, webhook/action retry ve `renewal_check_after <= now()` olmuş dönem-sonu yenileme
doğrulamalarını çalıştırır; her gün iyzico reconciliation'ı çalıştırır. Timer uygulamanın DB
modellerini doğrudan kullanır; pg_cron üzerinden belirsiz HTTP self-call yapılmaz.

Günlük reconciliation aktif provider aboneliklerini, son günün ödeme hareketlerini ve yerel billing_transactions/period durumlarını karşılaştırır. Eksik veya çelişkili kayıtlar otomatik erişim değiştirmek yerine alarm + manuel inceleme kuyruğuna gider.

Production ödeme açılışından önce:

1. iyzico production hesabı, V3 imza, callback URL ve sandbox→production smoke test doğrulandı.
2. Mesafeli satış ön bilgilendirmesi/sözleşmesi, kullanım koşulları ve KVKK hukukçu kontrolünden geçti; checkout kabulü doküman sürümü/hash'i, dil, zaman, plan sürümü ve session ile immutable kaydediliyor.
3. E-fatura entegrasyonu Faz 7'de olabilir; ancak ödeme açılmadan manuel/e-arşiv fatura süreci, sorumlusu ve invoice_reference kaydı işletilebilir durumda.
4. Reconciliation, action retry, alarm, pseudonymization ve R2 silme runbook'ları test edildi.

## Maliyet modeli

| Kalem | Sağlayıcı | Aylık |
| --- | --- | --- |
| Backend (12–14 GB RAM) | Hetzner uygun güncel 16 GB plan | Bölge, IPv4 ve vergiyle doğrulanacak |
| Veritabanı + Auth | Supabase Pro | $25 + kullanım aşımı |
| Nesne depolama | Cloudflare R2 | Depolama, egress ve işlem kullanımına göre |
| Redis + bakım worker | Aynı sunucu | Sunucu kaynağı içinde |
| Frontend, e-posta, domain, gözlemlenebilirlik, backup | Vercel/Resend/diğer | Production teklifleriyle hesaplanacak |
| iyzico | Başarılı işlem başı | Kamuya açık kurumsal tarife %4,29 + 0,25 TL; imzalı teklif varsa onunla güncellenir |

Kaynaklar: [iyzico Sanal POS](https://www.iyzico.com/isim-icin/sanal-pos), [iyzico webhook](https://docs.iyzico.com/ek-servisler/webhook), [iyzico abonelik işlemleri](https://docs.iyzico.com/urunler/abonelik/abonelik-entegrasyonu/abonelik-islemleri).

## Zorunlu kabul testleri

- Son kotada iki eşzamanlı inference: yalnız biri reservation alır.
- OOM/timeout/restart: pending reservation yalnız bir kez serbest kalır.
- Deneme aylık yenilenir; expired/past_due kullanıcı kota tüketemez.
- iyzico'da başarılı görünen yenileme webhook'tan önce kullanım isteğiyle doğrulanırsa tek yeni
  period ve tek charge kaydı yaratılır; geç gelen webhook no-op olur.
- iyzico yenilemesi pending/başarısız/erişilemezken yeni period veya kredi yaratılmaz ve istek
  `billing_renewal_pending` + en fazla 60 saniye `Retry-After` alır.
- Aynı checkout anahtarı ikinci provider aboneliği oluşturmaz; farklı anahtarlı iki eşzamanlı
  trial isteği tek reserved session/hosted URL üretir. Expired/failed session released olur ve
  `trial_used_at` null kalır; yalnız doğrulanmış başarı onu bir kez set eder.
- Eski webhook yeni period'u değiştiremez; yanlış amount/currency/plan erişim veremez.
- Plan yayınlama sonrası UI ve iyzico aynı yeni sürümü kullanır; eski snapshot değişmez.
- Cancel/refund provider çağrısı ve DB yazısı arasındaki hata action retry ile toparlanır.
- Chargeback refund çağırmaz; refund doğru transaction için yalnız bir kez uygulanır.
- Hesap silme remote iptal başarısızken Auth/R2 verisini silmez; mali geçmiş korunur/pseudonymize edilir.
- Basic kullanıcı direct API ile full zemin URL'i veya full zeminli proje alamaz.
- Webhook retry ve günlük reconciliation eksik provider olayını alarm üretir.
- R2 silme hatası storage_deletion job olarak tekrar denenir; DB projesi başarıdan önce silinmez.

## Görev bölüşümü

- **Serhan:** migration, iyzico adapter, webhook ingest + worker, dönem/kota, provider actions, iade/itiraz, reconciliation ve testler.
- **Kaan:** satın alma, kredi bakiyesi, fatura/geçmiş ve backend sözleşmesine bağlı plan ekranları.
