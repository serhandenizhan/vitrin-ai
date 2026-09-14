# Faz 5 — Ödemeler ve kredi sistemi tasarımı

**Tarih:** 2026-09-14 (v2 — Codex incelemesinden sonra revize edildi)
**Kapsam:** `ROADMAP.md` Faz 5 — abonelik/kota modeli, iyzico entegrasyonu, webhook işleme,
kullanım bazlı düşüm, iade/itiraz (Serhan). Kaan'ın satın alma akışı arayüzü, kredi bakiyesi
gösterimi ve fatura/geçmiş sayfası bu spec'in API sözleşmesine dayanır ama arayüz tasarımı ayrı,
kendi brainstorming turunu gerektirir — bu spec'in kapsamı dışında.

## v1 → v2: neden revize edildi

v1, bağımsız bir incelemeden (Codex) geçti; 10 P1 + 6 P2 bulgusunun **9'u P1'den, tamamı
P2'den** doğrulandı (ikisi bağımsız araştırmayla da teyit edildi: iyzico'nun gerçek webhook
olay isimleri ve gerçek komisyon oranı — v1'deki rakamlar/isimler doğrulanmadan yazılmıştı).
Kök sorun: v1 "tek `subscriptions` satırı + canlı sayaç" modeliyle üretim ödemesi, kota
rezervasyonu ve webhook güvenilirliğini eksik tasarlamıştı. v2, rezervasyon deseni + değişmez
işlem defteri + checkout idempotency ekliyor. Tek itiraz ettiğim nokta (ayrı bir
`subscription_periods` tablosu yerine `subscriptions` satırına snapshot alanı eklemek) aşağıda
uygulandı — daha basit, aynı garantiyi veriyor.

## Bağlam ve kilitli kararlar

- **Monolit mimari değişmiyor.** (v1'den aynı.)
- **İş modeli: abonelik, oranlama yok.** Plan değişimi anında geçerli, yeni dönem sıfır
  kullanımla başlar. (v1'den aynı.)
- **Ödeme sağlayıcısı: iyzico (web), hosted Checkout Form.** Kart bilgisi backend'e dokunmaz.
- **Mobil (Faz 8) için mimari hazır, IAP şimdi yazılmıyor.** (v1'den aynı.)
- **Kota takibi: rezervasyon deseni + ledger + önbellekli sayaç** (aşağıda detaylı — v1'in
  "inference'tan önce artır, başarısızsa rollback" tasarımı **terk edildi**, gerçek bir uzun
  transaction/çökme riski taşıyordu).
- **Barındırma: Hetzner (backend), Supabase hosted.** (v1'den aynı.)
- **İade/itiraz bu fazda tasarlanıyor** (v1'de Faz 7'ye bırakılmıştı — kullanıcı kararıyla
  öne alındı, aşağıda ayrı bölüm).

## Veri modeli

### `plans` (admin tarafından düzenlenebilir veri — kod içine sabit yazılmaz)

| Alan | Tip | Not |
| --- | --- | --- |
| `id` | text, PK | `deneme`, `atolye`, `magaza` |
| `name` | text | ekranda gösterilen ad |
| `price_minor_units` | int, null olabilir | **kuruş cinsinden tam sayı** (ör. 45000 = 450,00 TL) — `numeric` yerine (Codex P2: para tutarları ondalık/format belirsizliğine kapalı tutulmalı); Deneme için null |
| `currency` | text, default `'TRY'` | ileride çoklu para birimi için hazır |
| `monthly_quota` | int | aylık işlem hakkı |
| `background_tier` | text (`basic`/`full`) | Deneme yalnızca düz renk zeminler görür |
| `trial_period_days` | int, default `0` | ücretli planlarda `7` |
| `iyzico_product_reference_code` | text, null olabilir | iyzico Merchant Panel'den alınır — gerçek değer olmadan checkout başlatılamaz (Codex P1-4) |
| `iyzico_pricing_plan_reference_code` | text, null olabilir | aynı |
| `active` | bool, default `true` | eski planlar silinmez, `false` yapılır |

Migration, `plans` tablosunu oluşturduğu aynı migration'da üç planı da placeholder fiyat/kota
ile doldurur (`iyzico_*_reference_code` alanları **null kalır** — iyzico Merchant Panel'de
gerçek ürün/plan oluşturulmadan checkout endpoint'i `503` döner, sessizce yanlış bir referansla
denemez).

**Admin düzenleme uç noktası (Codex P2 — "admin düzenler" deniyor ama mekanizma yoktu):**
`PATCH /api/admin/plans/{id}` — `admin_users` tablosu gerektirir (mevcut desen, Faz 4'ten).
Yalnızca fiyat/kota/aktiflik alanlarını değiştirir. **Var olan aboneliklerin dönem içi
snapshot'ını etkilemez** (aşağıya bakın) — bu yüzden bir plan fiyatı değişince mevcut
abonelerin o anki dönemi sessizce yeniden yorumlanmaz (Codex P2).

### `subscriptions` (her kullanıcının, Deneme dahil, tek satırı)

| Alan | Tip | Not |
| --- | --- | --- |
| `id` | UUID, PK | |
| `user_id` | UUID, FK `auth.users`, **unique** | |
| `plan_id` | text, FK `plans` | |
| `payment_provider` | text, default `'iyzico'` | |
| `provider_subscription_id` | text, null olabilir | Deneme'de null |
| `status` | text | `trialing` / `active` / `past_due` / `canceled` / `expired` |
| `current_period_start`, `current_period_end` | timestamptz | |
| `quota_snapshot` | int | **bu dönemin kotası** — `plans.monthly_quota`'nın dönem başındaki görüntüsü, sonraki plan düzenlemelerinden etkilenmez (Codex P1-1/P1-3/P2'nin ortak kökü) |
| `used_this_period` | int, default `0` | önbellekli sayaç |
| `cancel_at_period_end` | bool, default `false` | |
| `trial_used` | bool, default `false` | **kullanıcı ömrü boyunca bir kez** — plan değişimi/tekrar abone olma bunu sıfırlamaz (Codex P1-5: deneme döngüsü suistimalini engeller) |
| `created_at`, `updated_at` | timestamptz | |

RLS: `projects` desenindeki gibi — kullanıcı yalnızca kendi satırını okur, INSERT/UPDATE
politikası yok, backend tablo sahibi olarak yazıyor. **`plans`, `usage_reservations`,
`usage_events`, `checkout_sessions`, `billing_transactions`, `webhook_events` de dahil — bu
spec'in eklediği yedi tablonun her biri RLS açık, `anon`/`authenticated`'a hiçbir grant yok**
(Codex P2 — v1'de bu her tablo için tekrar edilmemişti, `CLAUDE.md` kural 7'nin gerektirdiği
açıklıkla burada tekrarlanıyor).

**Kayıt anında otomatik satır:** `auth.users` trigger'ı (migration 0004 deseniyle aynı)
`plan_id='deneme'`, `status='active'`, `quota_snapshot=<deneme'nin o anki kotası>` bir satır
açar.

### `usage_reservations` (yeni — Codex P1-2'nin çözümü)

BiRefNet inference'ı 15-35 saniye sürüyor; kota artışını bu süre boyunca açık bir transaction'a
bağlamak (v1'in tasarımı) bağlantıları kilitler ve süreç çökerse geri alma garantisi vermez.
Bunun yerine **rezervasyon deseni:**

| Alan | Tip | Not |
| --- | --- | --- |
| `id` | UUID, PK | |
| `user_id`, `subscription_id` | UUID, FK | |
| `status` | text | `pending` / `consumed` / `released` |
| `created_at`, `resolved_at` | timestamptz | `resolved_at` yalnızca `consumed`/`released` olunca dolar |

**Akış:**
1. İnference başlamadan önce: **tek, kısa bir transaction'da** atomik kontrol-ve-artır —
   `UPDATE subscriptions SET used_this_period = used_this_period + 1 WHERE user_id = :uid AND
   used_this_period < quota_snapshot AND status IN ('active', 'trialing') RETURNING id`, başarılıysa
   aynı transaction'da bir `usage_reservations` satırı `pending` olarak açılır. Transaction
   hemen commit edilir — inference başlamadan **önce** kapanır.
2. İnference çalışır (DB transaction'ı açık değil).
3. Başarılı: rezervasyon `consumed` yapılır, `usage_events`'e bir satır düşer (tek transaction).
4. Başarısız/hata: rezervasyon `released` yapılır **ve** `used_this_period` bir azaltılır (tek
   transaction) — kullanıcı kredisini geri alır.
5. **Süreç çökerse** (worker OOM, restart — BiRefNet'in RAM baskısı altında gerçek bir risk):
   rezervasyon `pending` kalır. Bir arka plan işi (basit bir `pg_cron` görevi, Supabase'de
   zaten mevcut bir uzantı — yeni altyapı gerekmez) 5 dakikadan eski `pending` satırları
   `released` yapıp sayacı düzeltir. 5 dakika, gerçekçi en uzun inference süresinin (35 sn)
   kat kat üzerinde, yanlışlıkla canlı bir işlemi iptal etmez.

### `usage_events` (ledger, v1'den aynı — artık `consumed` adımında yazılıyor)

### `checkout_sessions` (yeni — Codex P1-4'ün ikinci yarısı)

Çift tıklama, ağ retry'ı veya sekme yenilemesinde iki abonelik oluşmasını engeller.

| Alan | Tip | Not |
| --- | --- | --- |
| `id` | UUID, PK | |
| `user_id` | UUID, FK | |
| `plan_id` | text, FK `plans` | hedef plan |
| `price_snapshot_minor_units`, `quota_snapshot` | int | checkout anındaki plan görüntüsü |
| `idempotency_key` | text, **unique** | istemci üretir (ör. bir UUID, "Abone ol" düğmesine her basışta yeni) |
| `status` | text | `pending` / `completed` / `expired` / `failed` |
| `provider_checkout_reference` | text, null olabilir | iyzico'nun döndürdüğü referans |
| `created_at`, `expires_at` | timestamptz | `expires_at` = `created_at` + 30 dk |

`POST /api/subscriptions/checkout`, aynı `idempotency_key` ile ikinci bir istek gelirse **var
olan** `pending` satırı döner, yeni bir iyzico çağrısı yapmaz. Webhook, bir aboneliği yalnızca
**geçerli bir `checkout_sessions` satırına bağlıysa** etkinleştirir — provider referansı
eşleşmeyen ya da süresi dolmuş bir webhook hiçbir şeyi değiştirmez (Codex P1-5'in "geç/eski
webhook yeni planı bozmasın" isteği de bu eşleştirmeyle karşılanıyor).

### `billing_transactions` (yeni — Codex P1-7'nin çözümü, gerçek fatura defteri)

`webhook_events.payload` kullanıcıya gösterilecek bir veri kaynağı değil (Codex haklı) — bu,
Kaan'ın "fatura/geçmiş" sayfasının **tek doğru kaynağı**:

| Alan | Tip | Not |
| --- | --- | --- |
| `id` | UUID, PK | |
| `user_id`, `subscription_id` | UUID, FK | |
| `type` | text | `charge` / `refund` / `chargeback` |
| `amount_minor_units`, `currency` | int, text | gerçekte tahsil/iade edilen tutar |
| `status` | text | `succeeded` / `failed` |
| `provider_transaction_reference` | text | iyzico'nun `iyziReferenceCode`'u |
| `period_start`, `period_end` | timestamptz | bu işlemin kapsadığı dönem (görüntüleme için) |
| `created_at` | timestamptz | |

**Yeni uç nokta:** `GET /api/billing/history` — bu tablodan, kullanıcının kendi satırlarını
döner. Ham webhook verisi (`webhook_events`) yalnızca denetim/hata ayıklama için kalır,
kullanıcıya hiç gösterilmez.

### `webhook_events` (idempotency + retry — v1'den genişletildi)

| Alan | Tip | Not |
| --- | --- | --- |
| `id` | bigint, identity, PK | |
| `provider` | text | `iyzico` |
| `provider_event_id` | text | **`iyziReferenceCode`** — iyzico dokümanlarından doğrulandı |
| `event_type` | text | **gerçek değerler:** `subscription.order.success`, `subscription.order.failure` (iyzico dokümanlarından doğrulandı — v1'deki isimler uydurmaydı) |
| `payload` | jsonb | ham veri |
| `processing_attempts` | int, default `0` | |
| `last_error` | text, null olabilir | |
| `processed_at` | timestamptz, null olabilir | |

**Unique kısıt:** `(provider, provider_event_id)` — idempotency.

**Retry mekanizması (Codex P1-6 — v1'de yoktu):** `processed_at IS NULL` olan satırlar bir
işlenmemiş sayılır. Aynı `pg_cron` görevi (rezervasyon temizliğiyle birlikte) her birkaç
dakikada bir bu satırları yeniden işlemeyi dener, `processing_attempts`'i artırır, 10
denemeden sonra `last_error`'la birlikte bırakır ve **manuel inceleme** için işaretli kalır
(sessizce sonsuza kadar denenmez ama sessizce de kaybolmaz).

**Bilinmeyen olay türü çökertmez, ama artık gerçekten "unutulmuyor":** tanınmayan bir
`event_type` de aynı satır+retry mekanizmasından geçer; ileride iyzico yeni bir tür eklerse
kod güncellenene kadar `processed_at` boş kalır ama **kaybolmaz**, retry görevinin loglarında
görünür kalır.

### `user_consents` genişlemesi (v1'den aynı)

`distance_sales_agreement` document_type'ı eklenir; metin `CLAUDE.md` açık takip maddesi
3'ün (hukukçu son kontrolü) kapsamında.

## API yüzeyi

| Uç nokta | Açıklama |
| --- | --- |
| `GET /api/plans` | Herkese açık, `/paketler`'i besler. |
| `GET /api/subscriptions/me` | `{ plan, quota, used_this_period, status, current_period_end, cancel_at_period_end }`. |
| `POST /api/subscriptions/checkout` | `plan_id` + `idempotency_key` alır. `trial_used=true` ise `trialPeriodDays=0` gönderir (deneme döngüsü koruması). `checkout_sessions` satırı açar, iyzico'nun hosted URL'ini döner. **`trial_used`, `checkout_sessions` satırı `trialPeriodDays>0` ile açıldığı ANDA `true` yapılır** — webhook'un sonucunu beklemez; aksi hâlde bir kullanıcı ödeme sonucu netleşmeden aynı anda birden fazla checkout başlatıp birden fazla deneme kazanabilirdi. |
| `POST /api/subscriptions/cancel` | **Önce iyzico'nun abonelik iptal API'sini senkron çağırır** (Codex P1-5 — v1'de yalnızca yerel bayrak değiştiriliyordu, provider'da abonelik açık kalıp tahsilat devam edebilirdi). Başarılıysa `cancel_at_period_end=true`; provider çağrısı başarısız olursa **hata döner**, yerel durum değişmez. |
| `POST /api/subscriptions/change-plan` | Hedef plan **ücretliyse**: önce eski provider aboneliği iptal edilir, sonra yeni plan için `checkout` akışı başlar (yeni `checkout_sessions` satırı, `trial_used` kontrolü burada da geçerli). Hedef plan **Deneme'yse** (ücretsiz): checkout'a hiç girilmez — eski provider aboneliği iptal edilir, yerel satır doğrudan `plan_id='deneme'`, `provider_subscription_id=null`, `quota_snapshot=<deneme kotası>`, `used_this_period=0` olarak güncellenir. |
| `POST /api/webhooks/iyzico` | `X-IYZ-SIGNATURE-V3` doğrulaması (iyzico dokümanlarından doğrulanan gerçek header), `checkout_sessions`/`provider_subscription_id` eşleştirmesi, idempotent yazma. |
| `GET /api/billing/history` | Kullanıcının kendi `billing_transactions` kayıtları. |
| `POST /api/admin/subscriptions/{user_id}/refund` | Aşağıdaki "İade ve itiraz" bölümüne bakın. |
| `PATCH /api/admin/plans/{id}` | Admin plan düzenleme (yukarıda). |

### `POST /api/remove-background` değişikliği

Yukarıdaki rezervasyon akışı (bkz. `usage_reservations`) burada devreye girer. `admin_users`
tablosundaki kullanıcılar rezervasyon adımını hiç görmez, tamamen muaf.

## İade ve itiraz (chargeback) — bu fazda tasarlandı

İyzico'da iki farklı senaryo var, ayrı ele alınıyor:

**1. Bizim başlattığımız iade (müşteri hizmeti kararı).** iyzico'nun `POST
/payment/refund` API'si **merchant-tetiklemeli** — otomatik gelen bir webhook değil, biz
çağırıyoruz. `POST /api/admin/subscriptions/{user_id}/refund` (yalnızca `admin_users`):
iyzico refund API'sini çağırır → başarılıysa `billing_transactions`'a `type='refund'` satırı
yazar → **aboneliği hemen** (dönem sonunu beklemeden) `canceled` yapıp `deneme` planına
düşürür (para iade edildiği için erişimin devam etmesi mantıksız — iptal'in "dönem sonuna
kadar erişim" kuralından bilinçli olarak farklı).

**2. Banka kaynaklı itiraz (chargeback/dispute).** İyzico dokümanları bunun öncelikle
**Merchant Panel'de** (dashboard) bir bildirim/pop-up olarak yönetildiğini gösteriyor; genel
"Merchant Notifications" webhook sistemi var ama itiraz için **kesin bir olay adı
dokümanlarda net değildi** — bunu burada uydurmuyorum (v1'in tam olarak düştüğü hataya
düşmemek için). Bu yüzden iki katmanlı tasarım:
- **Manuel yol (her zaman çalışır):** biri Merchant Panel'deki itirazı görür, yukarıdaki
  `/refund` admin uç noktasını (ya da erişimi doğrudan kesen ayrı bir `/admin/.../suspend`
  varyantını) elle tetikler.
- **Otomatik yol (implementasyon sırasında doğrulanacak):** gerçek iyzico hesabı açılıp
  Merchant Panel'e erişilince, itiraz/chargeback için gerçekten bir webhook olay türü
  yapılandırılabiliyorsa, aynı `POST /api/webhooks/iyzico` handler'ı genişletilip bu olay da
  aynı "erişimi hemen kes" eylemini otomatik tetikler.

**Politika (launch kapısı, Codex P1-10'un kabul edilen kısmı):** iade/itiraz olduğunda erişim
**hemen** kesilir, kalan kullanım hakkı yanar (geri ödenmez, zaten para iade edildi). Bu
kural kod yazılmadan önce netleşmiş olmalı — netleşti.

## Depolama saklama kuralı (Deneme planı) — Codex P2'nin belirsizliğini gideriyor

Deneme (ücretsiz) hesaplarda en fazla **son 10 kayıt** tutulur. **Kesin mekanik:** her yeni
kayıt sonrası, toplam kayıt sayısı 10'u aşıyorsa **en eskiden başlayarak, toplam tam 10 olana
kadar** siliniyor — tek seferde bir tane değil. Yani 100 kayıtla Deneme'ye düşmüş bir kullanıcı
bir sonraki kaydı yaptığı anda 91 kayıt silinip 10'a iner (yavaş, "her kayıtta bir eksik"
yakınsaması değil). Gerekçe: "Deneme hesabında asla 10'dan fazla kayıt yok" basit ve tutarlı
bir değişmez kural; "geçmiş silinmez" sözü yalnızca **düşürme anının kendisini** korur, sonraki
ilk kaydı korumaz. R2'den silme başarısız olursa DB satırı yine de silinir ve hata loglanır
(mevcut `_delete_objects_quietly` deseniyle aynı — `projects.py`'de zaten var, tekrar
icat edilmiyor).

## Maliyet modeli — iyzico oranı düzeltildi

| Kalem | Sağlayıcı | Aylık |
| --- | --- | --- |
| Backend sunucusu (12-14 GB RAM) | Hetzner CX42 (16 GB) | ~$18,6 |
| Veritabanı + Auth | Supabase Pro | $25 |
| Nesne depolama | Cloudflare R2 | ~$0 (ilk 10 GB ücretsiz) |
| Redis | Aynı sunucuda (Docker) | $0 |
| Frontend | Vercel Hobby | $0 |
| E-posta | Resend ücretsiz katman | $0 |
| Domain | — | ~$1-2 |
| **Toplam sabit gider** | | **~$45-65/ay** |
| + iyzico komisyonu | Sabit değil | **kurumsal %4,29 + 0,25 TL, bireysel %4,49 + 0,25 TL** (BSMV dahil) — v1'deki %1,95-2,19 rakamı yanlış kaynaktan (muhtemelen promosyon/özel teklif) gelmişti, iyzico'nun kendi resmi sayfasından düzeltildi |

Sunucu/DB/depolama kaynakları için tam liste ve linkler sohbet geçmişinde. iyzico oranı:
[iyzico Sanal POS](https://www.iyzico.com/isim-icin/sanal-pos), [Komisyon Oranları Hakkında](https://www.iyzico.com/blog/sanal-pos-komisyon-oranlari-hakkinda-merak-ettikleriniz).

## Açık maddeler (bu spec kapsamında karara bağlanmadı)

1. **Fiyat ve kota rakamları** — düzeltilmiş maliyet modeli (özellikle daha yüksek iyzico
   komisyonu) girdi olarak hazır; nihai TL tutarları ve kota sayıları kullanıcı tarafından
   belirlenecek. Zeminler hazır olunca netleşecek bir bağımlılık var.
2. **Gerçek e-fatura (resmi vergi faturası)** — Faz 7, ayrı bir entegratör gerektiriyor.
3. **Mesafeli satış sözleşmesi metni** — `CLAUDE.md` açık takip maddesi 3 kapsamında.
4. **Chargeback webhook'unun gerçek olay adı** — implementasyon sırasında, gerçek iyzico
   Merchant Panel erişimiyle doğrulanacak (yukarıya bakın, uydurulmadı).
5. **Günlük iyzico mutabakatı (reconciliation)** — Codex önerdi, bilinçli olarak bu spec'e
   **eklenmedi** (YAGNI): webhook güvenilirliği konusunda henüz gerçek bir sorun gözlemlenmedi;
   retry mekanizması (yukarıda) zaten kayıp webhook riskini büyük ölçüde azaltıyor. Gerçek
   kullanımda tutarsızlık görülürse ayrı bir iyileştirme olarak eklenir.

## Görev bölüşümü

- **Serhan (bu spec'in kapsamı):** yukarıdaki şema, API'ler, iyzico entegrasyonu, webhook
  işleme + retry, kota rezervasyonu, iade/itiraz.
- **Kaan (ayrı brainstorming turu gerektirir):** satın alma akışı arayüzü, kredi bakiyesi
  gösterimi, `GET /api/billing/history`'e dayanan fatura/geçmiş sayfası.
