# Ödemeler: kurulum ve işletim

Faz 5 kodu abonelik, dönem kotası, satın alma, iptal, plan değişimi, tam iade,
chargeback kaydı ve günlük mutabakatı kapsar. Ücretli checkout varsayılan kapalıdır.
Gerçek merchant anahtarlarıyla sandbox testi, hukuk/fatura süreci ve sunucuda timer
kurulumu bu depodaki otomatik testlerin dışında kalan açılış adımlarıdır.

## Kurulum sırası

1. Veritabanı yedeğini alıp backend ortamında `alembic upgrade head` çalıştırın.
   `0005` mevcut kullanıcılara ücretsiz dönem açar ve bütün yeni tablolarda RLS
   ve grant kısıtlarını kurar. `0006`, uygulama incelemesinin düzeltmelerini
   ekler: `past_due` penceresi, idempotency sonuç alanları, `dunning_email`
   eylem türü, genişletilmiş silme koruması, değişmez dönem snapshot'ı ve
   ücretsiz plan kısıtı. **`0005` yerinde düzenlenmedi** — uygulanmış bir
   revizyon Alembic tarafından yeniden çalıştırılmaz, dolayısıyla o dosyadaki
   bir değişiklik production'da sessizce hiç uygulanmazdı. Mali veri oluşan üretimde downgrade
   veri siler; geri dönüşü yedek ve ileri düzeltme migration'ıyla planlayın.
2. `backend/.env.example` içindeki iyzico ve billing ayarlarını backend secrets
   yönetiminden verin. API/secret/merchant aynı sandbox hesabına ait olmalı.
   `BILLING_CALLBACK_URL` dışarıdan erişilen HTTPS backend
   `/api/subscriptions/callback` adresidir; `BILLING_FRONTEND_URL` uygulama origin'idir.
   Merchant webhook adresi HTTPS `/api/webhooks/iyzico` ve V3 imzalı abonelik
   bildirimleri olmalı. Redis, R2 ve Supabase Admin ayarları worker'a da gerekir.
3. iyzico panelinde gerçek fiyatla aylık recurring ürün/plan oluşturun. Deneme
   sunulacaksa aynı fiyatın **0 gün** ve **7 gün** denemeli iki ayrı pricing planı
   gerekir. Admin `POST /api/admin/plans/{plan_id}/versions` iki referansı da
   sağlayıcıdan doğrulamadan sürümü yayımlamaz. Tutar kuruş, para birimi TRY'dir;
   aylık kota ve basic/full seviyesi sürümün snapshot'ıdır. Atölye/Mağaza için
   depoda uydurma fiyat bulunmaz. Ücretsiz başlangıç sürümü 10 fotoğraf/aydır;
   admin yeni ücretsiz sürüm yayımlayabilir. Eski dönemler değişmez.
4. Yetkili kişi tarafından hazırlanan mesafeli satış ve ön bilgilendirme
   metinlerini `BILLING_SALES_DOCUMENT_TEXT`, `BILLING_PRE_INFORMATION_TEXT` ve
   `BILLING_SALES_DOCUMENT_VERSION` ile sağlayın. Belge hash'i, sürümü, dili,
   checkout/plan referansı ve sunucu zamanı kabul kaydında tutulur. Metinlerin
   yayımlanmış bütün sürümlerini ayrıca değişmez arşivde saklayın. Onay ve fatura
   işletim süreci hazır olduğunda ilgili `BILLING_LEGAL_APPROVED` ve
   `BILLING_INVOICE_PROCESS_READY` bayraklarını açın. Bu bayraklar sürecin yerini tutmaz.
5. **Uygulamayı ters proxy arkasında `--proxy-headers` ile başlatın** ve
   `--forwarded-allow-ips` değerini YALNIZCA gerçek proxy'nin adresine verin;
   aynı listeyi backend'e `TRUSTED_PROXY_IPS` ile de bildirin. Bu iki ayar
   olmadan hız sınırı `request.client.host`'u proxy'nin kendi adresi olarak
   görür ve bütün public trafik (600/dk) tek kovayı paylaşır — sınır fiilen
   kalkar. Uygulama, listede olmayan bir bağlantıdan gelen `X-Forwarded-For`
   başlığını hiç okumaz; yani sahte başlıkla kova değiştirilemez
   (`backend/app/services/billing/limits.py::client_ip`). Örnek:
   `uvicorn app.main:app --proxy-headers --forwarded-allow-ips 10.0.0.1`.
6. Ödeme alınamadığında gönderilen "kartınızı güncelleyin" e-postası için
   `RESEND_API_KEY` ve `BILLING_EMAIL_FROM` **zorunludur**: ikisi eksikken
   `BILLING_CHECKOUT_ENABLED=true` olsa bile satın alma açılmaz (503). Gerekçe,
   kullanıcıya 3 günlük bir grace penceresi vaat edilmesi ve o pencerenin tek
   uyarısının bu e-posta olması. Gönderim yine de yapılamazsa sessiz kalmaz:
   `billing_alerts` tablosuna `dunning_email_not_sent` yazılır, eylem
   `succeeded` sayılmaz ve sınırlı retry'dan sonra admin incelemesine kalır.
   Durum `GET /api/admin/billing/operations` üzerinde görünür. İstek, kalıcı
   `provider_actions.id`'yi Resend'e `Idempotency-Key` başlığıyla taşır —
   timeout sonrası yeniden deneme kullanıcıya ikinci e-postayı göndermez.
7. **R2 sonuç deposu ödemeden bağımsız bir ön koşuldur.** Arka plan kaldırma,
   başarılı çıktıyı geçici bir R2 nesnesi olarak saklamadan krediyi tüketmez;
   `R2_*` ayarları eksikse uç nokta inference'a hiç girmeden 503 döner.
8. Aşağıdaki worker'ı kurup sandbox kabul kontrollerini tamamlayın.
   Sandbox checkout için `BILLING_CHECKOUT_ENABLED=true`; canlı API için ayrıca
   `BILLING_PRODUCTION_VERIFIED=true` gerekir. Canlıya geçişte merchant/ref/anahtar
   eşleşmelerini yeniden doğrulayın; sandbox referanslarını kullanmayın.

API gövdelerinin tam sözleşmesi FastAPI `/docs` ve `app/api/routes/billing.py`'dedir.
Admin uçları Supabase JWT + `admin_users` doğrulaması kullanır.

## Bakım görevi ve izleme

`backend/deploy/billing-maintenance.service` ve `.timer` dağıtım şablonlarıdır.
Servisi uygulama sunucusunda systemd dizinine kurmadan önce `User`, `Group`,
`WorkingDirectory`, `EnvironmentFile`, `ExecStart` değerlerini gerçek kuruluma
uyarlayın; örnek `/opt/vitrin-ai` yerleşimini kullanır. Ardından:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now billing-maintenance.timer
systemctl list-timers billing-maintenance.timer
journalctl -u billing-maintenance.service
```

Elle bir tur: backend çalışma dizininde `.venv/bin/python -m app.services.billing.maintenance`.
Dakikalık görev stale rezervasyonları serbest bırakır, kayıp callback'leri tokenla
arar, webhook/action/storage kuyruklarını işler ve biten ücretli dönemleri doğrular.
Kuyruklar PostgreSQL'de lease + SKIP LOCKED kullanır. Tek tur kuyruk başına en fazla
100 kayıt işler; büyüyen backlog kapasite alarmıdır. Retry 60 saniye, üst sınır 10
başarısız denemedir. Pending checkout/iade bağımlılığını beklemek bu bütçeyi
tüketmez. Checkout probe zamanları ileri alınır; terk edilmiş eski tokenlar
yeni ödemelerin sorgulanmasını engellemez. Redis görüntü yükleme ve billing hız sınırı içindir.

`GET /api/admin/billing/operations` açık alarmları, bekleyen aksiyonları ve çalışma
zamanlarını verir. Harici izleme şu koşullarda operatöre bildirim göndermeli:

- maintenance başarı zamanı 5 dakikadan eski veya hiç yok;
- reconciliation başarı zamanı 26 saatten eski veya hiç yok;
- `uncertain`, 10 denemeye ulaşan işler veya açık `billing_alerts`;
- bekleyen kuyrukların düzenli büyümesi.

Alarm PostgreSQL'e ve uygulama loguna yazılır; bu depo e-posta/Slack alarm göndermez.
Mutabakat, İstanbul tarihine göre önceki iki günün tüm sayfalardaki
PAYMENT/REFUND/CANCEL hareketlerini ve abonelik/order durumlarını karşılaştırır.
Farkları otomatik para/kota yazarak kapatmaz. İki günden uzun kesintide eksik
rapor günlerini operatör Merchant Panel üzerinden geriye dönük kontrol etmelidir.
Raporlama API izni merchant hesabında açık olmalıdır.

## Ödeme ve kurtarma kuralları

- Aynı kullanıcıda bir pending checkout vardır. İstemci idempotency UUID'si ve
  gördüğü `expected_plan_version_id` ile çağırır. Fiyat değişmişse 409 ile yeniden
  gösterim gerekir. Checkout 30 dakika sonra erişim açısından kapanır.
- iyzico formu `/odeme/{id}` içinde ayrı, `allow-same-origin` içermeyen sandbox
  iframe'de gösterilir. Kart alanları bizim formumuz/backend'imiz tarafından
  okunmaz. PCI kapsamı merchant'ın sağlayıcıyla doğrulayacağı açılış maddesidir.
- Callback tek başına ödeme kanıtı değildir. Token retrieve + abonelik/order
  ayrıntısı, plan, müşteri, tutar, para birimi ve dönem doğrulanır. Aynı order
  ikinci kez kota vermez. Deneme başlangıcında tahsilat bulunmadığından ACTIVE
  sağlayıcı aboneliği ve 7 günlük trial aralığı doğrulanır; sahte charge yazılmaz.
- Geç gelen checkout tahsilatı erişim açmaz; gerçek charge kaydı, iptal ve tam
  iade kuyruğu oluşturur. Bu telafi eski/geçerli paketin erişimini askıya almaz.
- Plan değişiminde yeni ödeme doğrulanınca yeni dönem açılır, eski abonelik
  kalıcı iptal kuyruğuna alınır. Kredi devri ve oranlama yoktur. İptalde satın
  alınmış dönem sonuna kadar erişim korunur.
- Provider yenilemesi henüz doğrulanamıyorsa 409 `billing_renewal_pending` ve
  `Retry-After: 60`; ödenmemiş döneme kota verilmez. Askıya alınmış hesapta bu yol
  erişimi geri açmaz.
- **Başarısız tahsilatta erişim anında kesilmez (ürün kararı).** Abonelik
  `past_due` olur, `past_due_access_until` bir kez ve tam **3 gün** sonrasına
  yazılır (art arda gelen başarısız denemeler pencereyi uzatmaz) ve kullanıcıya
  kartını güncellemesi için bir kez e-posta gider. Grace süresince **mevcut
  dönemin kalan kotası** kullanılır: yeni dönem açılmaz, yeni kredi verilmez,
  `used_this_period` sıfırlanmaz. Süre dolduğunda ilk istekte (ya da bakım
  turunda) abonelik `expired` olur ve erişim kapanır. Doğrulanmış bir tahsilat
  geldiğinde pencere temizlenir; bir sonraki başarısızlık yeniden tam 3 gün alır.
- **Devam eden bir satın alma kullanıcı tarafından iptal edilebilir**
  (`POST /api/subscriptions/checkout/{id}/cancel`). Fail-closed: oturum
  kapatılmadan önce sağlayıcıya sorulur. Yalnızca sağlayıcının kesin "böyle
  bir checkout/abonelik oluşmadı" sonucu oturumu `failed` yapıp trial rezervasyonunu
  serbest bırakır. Sağlayıcı cevap veremiyorsa 503; dönen kanıt conversation,
  müşteri veya planla uyuşmuyorsa 409 + `checkout_cancellation_review` alarmı
  döner ve oturum AÇIK kalır. Token hiç alınamamış (belirsiz
  initialization) bir oturum bu yolla kapatılamaz — o, yukarıdaki elle
  uzlaştırma adımına gider. Provider adapter'ının kesin "oluşmadı"
  sonucunu hangi sandbox hata kodundan üreteceği gerçek merchant kabul turunda
  kanıtlanmadan `CheckoutAbsent` eşlemesi eklenmez; bilinmeyen hata kodu genel
  `ProviderError` olarak fail-closed kalır.
- **İade/itiraz, tahsilatın ait olduğu aboneliği kapatır.** Bağ, mali kaydın
  dönem snapshot'ı üzerinden kurulur (`billing_transactions.period_id` →
  `subscription_periods.provider_subscription_reference`). Kullanıcı A'dan B
  paketine geçtiyse A'nın eski tahsilatının iadesi B'yi kapatmaz; yalnız A'nın
  dönemleri kapanır, A'nın uzak aboneliği iptal kuyruğuna alınır ve
  `refund_old_subscription` alarmı yazılır.
- **Arka plan kaldırma idempotency anahtarı işi tanımlar, isteği değil.** Kredi
  anahtar başına yalnızca bir kez tüketilir. Başarılı PNG
  `results/<user_id>/<request_id>.png` altında 24 saat saklanır; aynı anahtar
  tekrar gelirse inference HİÇ çalışmaz, saklanan nesne döner. İlki sürüyorsa
  ikinci istek 409 `request_in_progress`, kredi iade edilmişse aynı anahtar yeni
  denemeye açık, saklama süresi dolmuşsa 409 `request_already_processed`.
  Sonuç **önce saklanır, sonra kredi tüketilir**. Sonuç deposu kullanılamıyorsa
  iş hiç başlamaz (`503 result_storage_unavailable`) — belirsiz bir sonucu
  yeniden inference'a bağlamak aynı krediyi ikinci kez yakardı. Süresi dolan
  nesneleri bakım turu siler; hesap silmede `results/<uid>/` öneki de gider.
  Hata yanıtındaki `retry_safe` bayrağı, kredinin hiç tüketilmediğini ya da
  iade edildiğini söyler; istemci yeni bir anahtara yalnızca bu bayrakla geçer.
- İade sadece tam tutardır. Provider'a gönderildikten sonra ağ sonucu belirsizse
  `uncertain` olur; otomatik ikinci iade gönderilmez. Merchant Panel/destek
  kanıtıyla admin `POST /api/admin/billing/actions/{id}/resolve` çağırır:
  `outcome=succeeded` mali kaydı tamamlar; `outcome=not_refunded` yalnızca **hiç
  iade yapılmadığı doğrulandığında** yeniden denemeye açar. `evidence_reference`
  zorunludur, admin kimliği/kararı kaydedilir. `conversationId` uzak idempotency
  garantisi değildir.
- Gönderilmemiş, başarısız diğer aksiyonlar sorunu giderdikten sonra admin
  `POST /api/admin/billing/actions/{id}/retry` ve `evidence_reference` ile açılır.
  Webhook/storage 10 deneme sınırına gelirse provider/R2 hatasını giderip ilgili
  satırın attempts/lease değerlerini yetkili DB bakım oturumunda sıfırlayın;
  işlem kimliği, neden ve operatörü destek kaydında saklayın.
- Token alınamayan checkout initialization timeout'u otomatik tekrarlanmaz.
  Merchant kayıtlarında conversation/customer/zaman üzerinden abonelik olup
  olmadığını kontrol edin. Varsa gerçek referansı sağlayıcı ayrıntısıyla
  doğrulayıp iptal edin ve tahsilatı uzlaştırın. **Uzakta açık abonelik ve bekleyen
  tahsilat kalmadığı kanıtlandıktan sonra** yetkili DB bakımında checkout'u failed,
  trial rezervasyonunu released yapın; kanıtı açık alarmın destek kaydına ekleyin.
  Bu kanıt olmadan hesap silme korumasını kaldırmayın.
- `PATCH /api/admin/billing/{transaction_id}/invoice` mali kayda yalnızca ilk
  fatura referansını ekler; fatura üretimi işletmenin faturalama sürecindedir.
  `POST .../chargeback` disputed/lost/won kanıtını ayrı kayıt olarak tutar;
  disputed/lost erişimi durdurur, provider'a otomatik refund göndermez.

## Hesap silme ve veri saklama

`DELETE /api/account` e-posta onayından sonra **202 pending** döner. Yeni iş/kota
alımı durur. Worker tüm eski/yeni provider aboneliklerini iptal etmeden R2/Auth
silmez. Belirsiz initialization veya çözülmemiş iade talebi silmeyi bekletir.
R2 öneki temizlendikten sonra Supabase Admin kullanıcısı silinir. Mali ve kabul
kayıtlarının user_id alanı null olur, rastgele retention_subject korunur;
projeler/admin yetkisi cascade gider. Manuel Supabase silme aktif ödeme varsa DB
trigger'ıyla engellenir; aynı trigger, worker'la aynı koşulu kullanarak
**belirsiz initialization** taşıyan (initialize gönderilmiş ama provider
referansı hiç alınamamış) oturumu olan hesabın silinmesini de engeller — oturum
`expired`a düşmüş olsa bile. Ödeme olmayan hesabın panelden silinmesinde R2
temizliği halen operatör sorumluluğudur.

Silme işi Auth kullanıcısını sildikten sonra çökerse iş kaybolmaz: FK
`provider_actions.user_id`'yi NULL yapar, iş `target_reference` üzerinden hangi
hesap olduğunu bilmeye devam eder ve tekrar çalıştığında checkout formu, token
ve müşteri referansı temizliğini tamamlar.

Hukuk/muhasebe sorumlusu belge türüne göre saklama süresi, hukuki dayanak ve
saklama sonu imha prosedürünü üretimden önce belirler. Kod bu süreleri uydurmaz ve
mali defteri otomatik silmez. Ödeme formundaki kimlik/adres iyzico'ya iletilir,
yerel checkout tablosuna kaydedilmez. Form HTML/token yalnızca sahibi tarafından
okunabilir; kapanmış form gösterilmez. Süresi geçmiş checkout tokenları kayıp
ödeme tespiti için tutulur, hesap silme tamamlandığında temizlenir.

Ücretsiz hesapta son 10 proje görünür; eskiler aynı transaction'da kalıcı R2
silme kuyruğuna alınır ve başarılı nesne silmesinden sonra DB'den kaldırılır.
R2 kesintisi kuyruk kaydını kaybettirmez. Önceden verilmiş imzalı URL'ler kendi
kısa süreleri dolana kadar kullanılabilir.

## Sandbox kabul kontrolü

**İlk yapılacak iş budur.** `provider.py::verify_webhook`'un V3 imza alan sırası
ve `Iyzico.request`'in IYZWSv2 imzasında query string'i dışlaması DOĞRULANMAMIŞ
varsayımlardır. Kod fail-closed (varsayım yanlışsa webhook reddedilir, istek 401
alır; sahte erişim açılmaz) — bu bir kod hatası değil, canlıya geçmeden önce
gerçek merchant sandbox'ında kapatılması gereken bir açılış kapısıdır.

Gerçek sandbox merchant ile aşağıdaki tur tamamlanıp kanıtı saklanmadan canlı
checkout açılmamalıdır: ilk denemeli checkout/3DS, iptal, denemesiz ikinci
checkout, tekrar/gecikmiş callback ve V3 webhook, yenileme, başarısız tahsilat,
plan değişimi, tam iade ve belirsiz sonuç uzlaştırma, hesap silme, raporlama
mutabakatı ve systemd timer'ın yeniden başlatma sonrası çalışması. iframe ve
3DS dönüşü gerçek tarayıcıda kontrol edilir; otomatik testler sağlayıcıyı taklit eder.

## Provider sözleşmesinin kaynakları

- [Abonelik işlemleri](https://docs.iyzico.com/urunler/abonelik/abonelik-entegrasyonu/abonelik-islemleri)
- [Ödeme planı](https://docs.iyzico.com/urunler/abonelik/abonelik-entegrasyonu/odeme-plani)
- [Webhook](https://docs.iyzico.com/ek-servisler/webhook)
- [Idempotency](https://docs.iyzico.com/en/getting-started/preliminaries/idempotency)
- [Raporlama](https://docs.iyzico.com/en/advanced/reporting-service)
- [İade](https://docs.iyzico.com/en/advanced/refund-and-cancel)
