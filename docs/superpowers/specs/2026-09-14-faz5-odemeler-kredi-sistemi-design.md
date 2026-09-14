# Faz 5 — Ödemeler ve kredi sistemi tasarımı

**Tarih:** 2026-09-14
**Kapsam:** `ROADMAP.md` Faz 5 — abonelik/kota modeli, iyzico entegrasyonu, webhook işleme,
kullanım bazlı düşüm (Serhan). Kaan'ın satın alma akışı arayüzü, kredi bakiyesi gösterimi ve
fatura/geçmiş sayfası bu spec'in API sözleşmesine dayanır ama arayüz tasarımı ayrı, kendi
brainstorming turunu gerektirir — bu spec'in kapsamı dışında.

## Bağlam ve kilitli kararlar

- **Monolit mimari değişmiyor.** Proje genelinde zaten kilitli: tüm AI + backend yüzeyi tek
  FastAPI uygulamasında (bkz. `CLAUDE.md`, `ROADMAP.md` bölüm 3). Faz 5'in ödeme mantığı ayrı
  bir servis değil, mevcut `backend/app/` altına yeni route/model olarak eklenir.
- **İş modeli: abonelik (A), oranlama yok.** Aylık sabit ücret, her planın kendi kotası. Plan
  değişimi **anında** geçerli olur — eski abonelik kapanır, yeni dönem **sıfır kullanımla**
  o anda başlar (ör. Atölye'den Mağaza'ya geçen bir kullanıcı o an Mağaza'nın kotasıyla
  sıfırdan başlar). İndirimli/oranlı hesaplama yok, kasıtlı olarak — kullanıcı kararı
  ("kullanmazsa bizim zararımıza olan bir durum yok").
- **Ödeme sağlayıcısı: iyzico (web), hosted Checkout Form.** PayTR gibi daha ucuz alternatifler
  araştırıldı (bkz. sohbet geçmişi) ama iyzico'da kalınmasına karar verildi. Kart bilgisi hiçbir
  zaman backend'e dokunmaz (SECURITY.md 5).
- **Mobil (Faz 8) için mimari şimdiden hazırlanıyor, ama Apple/Google IAP şimdi
  YAZILMIYOR.** Kimlik doğrulama zaten platform-bağımsız (Bearer JWT, Faz 4'ten beri). Bu
  fazda eklenen kural: Faz 5'in tüm iş mantığı FastAPI'de yaşar (Next.js route'larında değil)
  ve tek, sağlayıcıdan bağımsız bir durum uç noktası (`GET /api/subscriptions/me`) sunulur —
  mobil app geldiğinde aynı uç noktaları doğrudan çağırır, backend'de değişiklik gerekmez.
  `subscriptions.payment_provider` alanı şimdiden var (`iyzico` tek değer) ama Apple/Google'a
  özgü alanlar (ör. `apple_original_transaction_id`) **eklenmiyor** — YAGNI, Faz 8'in işi.
- **Kota takibi: ledger + önbellekli sayaç.** Ayrı bir `usage_events` tablosu (gerçek kaynak,
  denetim ve gelecekteki ağırlıklandırma için) + `subscriptions.used_this_period` (hızlı kontrol
  için önbellek), aynı veritabanı işleminde birlikte yazılır. Kota kontrolü sayaçtan (hot path'i
  yavaşlatmamak için — BiRefNet zaten CPU/RAM kısıtlı), denetim/destek soruları ledger'dan.
- **Barındırma: Hetzner (backend), Supabase hosted (değişmiyor).** `ROADMAP.md`'nin
  Railway/Fly.io kilidi **revize edildi** (kullanıcı onayı, bkz. maliyet modeli aşağıda) —
  backend artık Hetzner Cloud'da (CX42, 16 GB). Supabase'in kendisi **self-host edilmiyor**;
  araştırma, veritabanı/kimlik doğrulama gibi kritik altyapı için küçük bir ekipte hosted
  kalmanın (yedekleme, güvenlik yaması, HA) gizli işçilik maliyeti nedeniyle daha ucuz
  olduğunu gösterdi (self-host'un tasarrufu $12-25/ay, gizli işçilik riski çok daha yüksek).
  **Not:** bu, `ROADMAP.md` bölüm 3'ün "CI/CD ve barındırma (MVP): GitHub Actions +
  Railway/Fly.io" satırını revize ediyor — uygulama planının bir adımı olarak o satır da
  güncellenmeli, sessizce eskimiş bırakılmamalı (`CLAUDE.md` ders 9).

## Veri modeli

### `plans` (yeni tablo, admin tarafından düzenlenebilir veri — kod içine sabit yazılmaz)

| Alan | Tip | Not |
| --- | --- | --- |
| `id` | text, PK | kısa kod: `deneme`, `atolye`, `magaza` |
| `name` | text | ekranda gösterilen ad |
| `monthly_price_try` | numeric, null olabilir | Deneme için `0`/null |
| `monthly_quota` | int | aylık işlem hakkı |
| `background_tier` | text (`basic`/`full`) | Deneme yalnızca düz renk zeminler görür |
| `trial_period_days` | int, default `0` | ücretli planlarda `7` |
| `active` | bool, default `true` | eski planlar silinmez, `false` yapılır |

Migration, `plans` tablosunu oluşturduğu **aynı migration'da** üç planı da (fiyat/kota
alanları geçici placeholder değerlerle — gerçek rakamlar maliyet modeli netleşince ayrı bir
migration'la güncellenir) doldurur — aşağıdaki trigger'ın referans alacağı satırlar migration
sırasında hazır olmalı.

### `subscriptions` (yeni tablo — her kullanıcının, Deneme dahil, tek satırı)

| Alan | Tip | Not |
| --- | --- | --- |
| `id` | UUID, PK | |
| `user_id` | UUID, FK `auth.users`, **unique** | tek kullanıcı = tek satır |
| `plan_id` | text, FK `plans` | |
| `payment_provider` | text, default `'iyzico'` | gelecekte `apple_iap`/`google_play` |
| `provider_subscription_id` | text, null olabilir | Deneme'de null (hiç ödeme yok) |
| `status` | text | `trialing` / `active` / `past_due` / `canceled` / `expired` |
| `current_period_start` | timestamptz | |
| `current_period_end` | timestamptz | Deneme'de anlamsız/uzak bir tarih |
| `used_this_period` | int, default `0` | önbellekli sayaç |
| `cancel_at_period_end` | bool, default `false` | iptal, dönem sonuna kadar erişimi korur |
| `created_at`, `updated_at` | timestamptz | |

RLS: `projects` tablosundaki desenle aynı — kullanıcı yalnızca kendi satırını okur,
INSERT/UPDATE politikası yok (backend tablo sahibi olarak yazıyor, IDOR koruması `user_id`
filtresiyle).

**Kayıt anında otomatik satır:** `auth.users`'a yeni kullanıcı eklenince bir veritabanı
trigger'ı (mevcut `record_signup_consents` deseniyle aynı mantık, migration 0004) otomatik
olarak `plan_id='deneme'`, `status='active'` bir `subscriptions` satırı açar. "Aboneliksiz
kullanıcı" diye bir durum hiç oluşmaz.

### `usage_events` (yeni tablo — ledger)

| Alan | Tip | Not |
| --- | --- | --- |
| `id` | bigint, identity, PK | |
| `user_id` | UUID, FK `auth.users` | |
| `subscription_id` | UUID, FK `subscriptions` | |
| `event_type` | text | şimdilik tek değer: `background_removal`; ileride ağırlıklandırma için genişler |
| `created_at` | timestamptz | |

### `webhook_events` (yeni tablo — idempotency)

| Alan | Tip | Not |
| --- | --- | --- |
| `id` | bigint, identity, PK | |
| `provider` | text | `iyzico` |
| `provider_event_id` | text | iyzico'nun olay kimliği |
| `event_type` | text | `subscription_started` / `payment_succeeded` / `payment_failed` / `subscription_canceled` / bilinmeyen |
| `payload` | jsonb | ham veri, denetim ve "fatura/geçmiş" sayfasının veri kaynağı |
| `processed_at` | timestamptz, null olabilir | işlenemeyen/bilinmeyen olaylarda null kalır ama satır yine de yazılır |

**Unique kısıt:** `(provider, provider_event_id)` — SECURITY.md'nin idempotency şartını
veritabanı seviyesinde garanti eder; iyzico aynı webhook'u tekrar gönderirse ikinci satır
`ON CONFLICT DO NOTHING` ile sessizce reddedilir, iki kere işlenmez.

**Bilinmeyen olay türleri çökertmez:** webhook handler'ı tanımadığı bir `event_type` görünce
satırı (ham payload'la) kaydeder, `processed_at`'i boş bırakır, `200 OK` döner — iyzico'nun
ileride ekleyeceği yeni bir olay türü (ör. iade) siteyi bozmaz, yalnızca o gün ayrıca
işlenmeyi bekler.

### `user_consents` genişlemesi

`document_type` CHECK kısıtına yeni bir değer eklenir: `distance_sales_agreement` (mesafeli
satış sözleşmesi — Türk mevzuatı, çevrimiçi abonelik satışı için ayrı bir onay gerektiriyor).
Checkout akışında, iyzico'ya yönlendirmeden hemen önce ayrı bir onay kutusu gösterilir, kabul
KVKK/kullanım koşulları onayıyla aynı desende (`user_consents`'e sunucu zamanlı,
değiştirilemez satır) kaydedilir. **Metnin kendisi, zaten açık olan `CLAUDE.md` açık takip
maddesi 3'ün (hukukçu son kontrolü) kapsamına dahil edildi** — yeni bir madde açılmadı, var
olanı genişletti.

## API yüzeyi (FastAPI, `backend/app/api/routes/subscriptions.py` + `webhooks.py`)

| Uç nokta | Açıklama |
| --- | --- |
| `GET /api/plans` | Herkese açık. `/paketler` sayfası artık koddaki sabit `PAKETLER` dizisinden değil buradan beslenir — kota/fiyat değişince sayfa otomatik güncellenir, iki yer elle senkron tutulmaz. |
| `GET /api/subscriptions/me` | Oturum ister. Sağlayıcıdan bağımsız şekil: `{ plan, quota, used_this_period, status, current_period_end, cancel_at_period_end }`. |
| `POST /api/subscriptions/checkout` | Oturum ister. `plan_id` alır, iyzico abonelik + `trialPeriodDays` (plandan) ile başlatır, hosted checkout URL'i döner. |
| `POST /api/subscriptions/cancel` | Oturum ister. `cancel_at_period_end=true` yapar; erişim dönem sonuna kadar sürer. |
| `POST /api/subscriptions/change-plan` | Oturum ister. Eski aboneliği kapatır, yeni planla **anında**, sıfır kullanımla yeni bir dönem açar (iyzico'da da yeni bir abonelik/tahsilat). |
| `POST /api/webhooks/iyzico` | HMAC imza doğrulaması (SECURITY.md), `webhook_events`'e idempotent yazar, `subscriptions` durumunu günceller. |

### `POST /api/remove-background` değişikliği

İnference'tan **önce** kota kontrolü eklenir (`admin_users` tablosundaki kullanıcılar tamamen
muaf — kota/plan kontrolüne hiç girmezler). Kontrol, Redis hız sınırlayıcısındaki "kontrol-et-
ve-artır tek sorguda" deseniyle **atomik**: tek bir `UPDATE subscriptions SET used_this_period
= used_this_period + 1 WHERE user_id = :uid AND used_this_period < monthly_quota RETURNING id`
— iki ayrı sorgu (SELECT sonra UPDATE) **kullanılmaz**, aksi hâlde aynı anda gelen iki istek
kotayı aşabilir (Faz 4'ün Redis limiter'ında öğrenilen aynı ders). Başarılı tamamlanınca aynı
veritabanı işleminde `usage_events`'e bir satır düşer. **Başarısız/hata veren bir işlem kota
düşürmez** — kontrol, gerçek inference'tan önce yapılır; inference başarısız olursa sayaç geri
alınır (rollback).

## Depolama saklama kuralı (Deneme planı)

Deneme (ücretsiz, ödeme yapmayan) hesaplarda en fazla **son 10 kayıt** tutulur — 11. kayıt
kaydedilince en eski silinir (FIFO). **Tetikleyici süre değil, plan:** aktif ücretli
aboneliği olan bir hesapta bu kural hiç işlemez, kullanıcı ne kadar süre kullanmazsa
kullanmasın geçmişi silinmez. Plan düşürüldüğünde (ör. Mağaza → Deneme) **var olan kayıtlar
hemen silinmez** — yalnızca o andan sonra kaydedilecek yeni sonuçlar 10 sınırına tabi olur
(mevcut fazla kayıtlar dokunulmadan kalır, zamanla yeni kayıtlar eklendikçe FIFO devreye
girer). Şu an ek bir uyarı/e-posta yok — istenirse ileride eklenir (`CLAUDE.md` ders 8 deseni:
geçici olarak sessiz kalan bir karar, sessizce değil, burada açıkça not düşülerek).

## Maliyet modeli (fiyat/kota rakamlarına temel oluşturması için)

| Kalem | Sağlayıcı | Aylık |
| --- | --- | --- |
| Backend sunucusu (12-14 GB RAM) | Hetzner CX42 (16 GB) | ~$18,6 |
| Veritabanı + Auth | Supabase Pro (hosted, değişmedi) | $25 |
| Nesne depolama | Cloudflare R2 | ~$0 (ilk 10 GB ücretsiz) |
| Redis | Aynı sunucuda (Docker) | $0 |
| Frontend | Vercel Hobby | $0 |
| E-posta | Resend ücretsiz katman | $0 |
| Domain | — | ~$1-2 |
| **Toplam sabit gider** | | **~$45-65/ay** |
| + iyzico komisyonu | Sabit değil | gelirin ~%2-4'ü (tek çekim ~%1,95, kurumsal ~%2,19+0,25 TL) |

Kaynaklar: Railway/Fly.io vs Hetzner karşılaştırması, Supabase self-host analizi, iyzico
komisyon oranları — tam kaynak listesi sohbet geçmişinde, gerekirse tekrar aranabilir.

## Açık maddeler (bu spec kapsamında karara bağlanmadı, ileri bırakıldı)

1. **Fiyat ve kota rakamları henüz belirlenmedi.** Yukarıdaki maliyet modeli girdi olarak
   hazır; kullanıcı bunu değerlendirip nihai TL tutarlarını ve kota sayılarını belirleyecek.
   Zeminler (background) hazır olunca da netleşecek bir bağımlılık var (Deneme'nin "yalnızca
   düz renk zeminler" kısıtı).
2. **Gerçek e-fatura (resmi vergi faturası) entegrasyonu** — işletme türüne/cirosuna göre
   ayrı bir yükümlülük (Logo/Paraşüt/Foriba gibi bir entegratör gerekebilir). Faz 7'ye
   eklendi, bu fazda çözülmüyor.
3. **İade/chargeback akışı** — Faz 7'ye ertelendi. Webhook handler'ı savunmacı yazıldığı için
   (yukarıya bakın) bir iade olayı geldiğinde çökme riski yok, yalnızca o gün ayrıca işlenecek.
4. **Mesafeli satış sözleşmesi metni** — `CLAUDE.md` açık takip maddesi 3'ün (hukukçu son
   kontrolü) kapsamına eklendi, ayrı bir madde açılmadı; ödeme prod'a çıkmadan önce bu metin
   de hukukçu onayından geçmeli.

## Görev bölüşümü (ROADMAP.md ile birebir)

- **Serhan (bu spec'in kapsamı):** yukarıdaki şema, API'ler, iyzico entegrasyonu, webhook
  işleme, kota düşümü.
- **Kaan (ayrı, kendi brainstorming turunu gerektirir):** satın alma akışı arayüzü, kredi
  bakiyesi gösterimi, fatura/geçmiş sayfası — bu spec'in API sözleşmesine (`GET
  /api/subscriptions/me`, `GET /api/plans`, `POST /api/subscriptions/checkout`) dayanır.
