# Vitrin AI ödeme platformu araştırması

**Araştırma tarihi:** 14 Eylül 2026
**Varsayım:** Türkiye’de kurulu SaaS/görsel işleme uygulaması; web üzerinden dijital hizmet, ilk hedef TRY/Türkiye kartları, sonraki hedef abonelik ve yurt dışı. Fiyatlar sağlayıcıların resmî sayfalarında görülen kamuya açık bilgileridir; “teklif” alanları başvuru sonrası yazılı teyit edilmelidir.

## Sonuç

Vitrin AI için önerilen sıralama:

1. **PayTR:** Türkiye odaklı MVP için en iyi maliyet/özellik dengesi.
2. **iyzico:** Daha yüksek görünen maliyete karşı güçlü abonelik, webhook, raporlama ve fraud ekosistemi.
3. **Sipay:** Özel teklif PayTR/iyzico’dan iyi çıkarsa güçlü alternatif.
4. **Param:** Business Kart şartı kabul edilirse rekabetçi; standart oranı daha yüksek.
5. **Paddle:** Global SaaS ve vergi operasyonunu Merchant of Record’a devretme seçeneği.
6. **Lemon Squeezy:** Paddle’a benzer global MoR; daha küçük başlangıç için pratik.
7. **Paratika:** Teknik açıdan güçlü, fakat güncel ticari teklif olmadan kesin maliyet bilinmiyor.
8. **Moka United:** Recurring ve tokenization var; tüm yetkiler teklif/sözleşmede açılıyor.
9. **Shopier:** Link/mağaza satışına uygun, SaaS billing için zayıf.
10. **Stripe:** Stripe’ın güncel desteklenen ülke listesinde Türkiye yok; Türkiye şirketiyle doğrudan uygun değil.

**Paycell ek notu:** Paycell'in çevrimiçi ödeme sayfası %1,90'dan başlayan oran ve ertesi iş günü ödeme yayınlıyor; ancak Vitrin AI için recurring/retry/webhook şartları kamuya açık sayfada PayTR ve iyzico kadar ayrıntılı değil. Bu nedenle RFP'ye eklenmeli fakat ilk üçe ancak yazılı teknik ve ticari tekliften sonra alınmalı. [Paycell Online Ödeme](https://www.paycell.com.tr/online-odeme-cozumleri)

## Fiyat ve payout karşılaştırması

| Sağlayıcı | İşlem komisyonu | Sabit/ek ücret | Payout/valör | Resmî kaynak |
|---|---:|---|---|---|
| PayTR | **%2,19’dan başlayan**, 7 gün valör; kesin oran sektör/hacim/kart/taksit teklifine göre | Başlangıç, kurulum, aylık/yıllık aidat, verimsizlik ve gizli işlem ücreti yok | 7 gün oranı yayınlanmış; valör değişirse oran değişebilir | [Sanal POS](https://www.paytr.com/paytr-sanal-pos), [ücretlendirme](https://www.paytr.com/destek-merkezi/genel) |
| iyzico Sanal POS | **%4,29 + 0,25 TL** başarılı işlem (aylık 20.000 TL üstü kurumsal satış bağlamı) | Başlangıç ve aylık sabit ücret yok | Ertesi gün | [Sanal POS](https://www.iyzico.com/isim-icin/sanal-pos) |
| iyzico Abonelik | Sanal POS komisyonu | İlk 3 ay ücretsiz, sonra **199 TL/ay** | Sanal POS koşullarına bağlı | [Abonelik fiyatı](https://www.iyzico.com/isim-icin/abonelik-yontemi) |
| ParamPOS | Param Business Kart’a özel **%2,19**; standart **%4,15** | Sabit/kurulum kamu sayfasında net değil | Ertesi iş günü; Business Kart’a aktarım koşulunu teyit et | [Param oran/ürün](https://param.com.tr/avantajlar/parampos-lu-olun-harcadikca-nakit-iade-kazanin-151) |
| Sipay | Oran kamuya açık değil, işletmeye özel teklif | Kurulum, aylık/yıllık aidat ve gizli ücret yok iddiası | Ertesi gün | [Sipay Sanal POS](https://sipay.com.tr/odeme-cozumleri/online-odeme-cozumleri/sanal-pos/) |
| Moka United | Teklif bazlı | Teklif/sözleşmede teyit | Yerli POS genellikle ertesi iş günü | [Teklif koşulları](https://posbasvuru.mokaunited.com/Application/OfferForm?id=ReEziUm8KAhqfpIuO5C14g%3D%3D) |
| Paratika | FAQ’da **%0,69’dan başlayan**; güncel teklif değil | Net değil | Sözleşmeye göre | [FAQ](https://www.paratika.com.tr/sikca-sorulan-sorular/) |
| Paynet (artık iyzico) | Ayrı yeni teklif yerine iyzico ürün/şartları | Birleşme sonrası iyzico sözleşmesi | İyzico koşulları | [Paynet birleşme duyurusu](https://www.paynet.com.tr/), [iyzico Sanal POS](https://www.iyzico.com/isim-icin/sanal-pos) |
| Shopier | **%2,99 + 0,49 TL’den başlayan**, KDV hariç | Hesap/listeleme ücretsiz; satış yoksa ücret yok | Haftalık: Salı kapanan siparişler Çarşamba | [Resmî fiyat/SSS](https://books.shopier.com/) |
| Paddle | **%5 + 0,50 USD/Checkout** | Aylık/migration/gizli ücret yok; MoR ve vergi dahil | Aylık, minimum 100 USD; ayın 15’ine kadar gönderim, banka 3 iş güne kadar | [Pricing](https://www.paddle.com/pricing), [payout](https://www.paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid) |
| Lemon Squeezy | **%5 + 0,50 USD/işlem**; uluslararası/döviz edge-case ücretleri olabilir | Aylık ücret yok; MoR/vergi dahil | Ayda 2 kez, satış 13 gün tutulur, banka 1–5 gün, minimum 50 USD | [Pricing](https://www.lemonsqueezy.com/pricing), [payout](https://docs.lemonsqueezy.com/help/getting-started/getting-paid) |
| Stripe | Türkiye’de doğrudan uygulanabilir yerel fiyat yok | Türkiye desteklenmiyor | — | [Global availability](https://stripe.com/global) |

### 1.000 TL temel işlem örneği

BSMV/KDV, taksit farkı, döviz ve chargeback hariç yaklaşık hesap:

| Sağlayıcı | Temel kesinti |
|---|---:|
| PayTR, %2,19 teklif varsayımı | 21,90 TL |
| Param Business Kart, %2,19 | 21,90 TL |
| Param standart, %4,15 | 41,50 TL |
| iyzico, %4,29 + 0,25 TL | 43,15 TL |
| Shopier, %2,99 + 0,49 TL | 30,39 TL + komisyon KDV’si |
| Paddle/Lemon | 50 TL eşleniği + 0,50 USD |

PayTR oranı yalnız “başlayan” orandır ve 7 gün valörle ilişkilidir. Param’daki %2,19 Business Kart’a özel olup normal banka hesabına payout koşulu mutlaka yazılı sorulmalıdır.

## Özellik kıyaslaması

| Kriter | PayTR | iyzico | Sipay | Param | Moka | Paratika | Paddle/Lemon | Shopier |
|---|---|---|---|---|---|---|---|---|
| TRY/Türkiye kartları | Evet | Evet | Evet | Evet | Evet | Evet | Yerel POS değil, checkout USD merkezli | Evet |
| Abonelik | Var; plan, kayıtlı kart, recurring API | Var; günlük/haftalık/aylık/yıllık, trial, webhook | Var; günlük/haftalık/aylık/yıllık | Kart saklama/otomatik tahsilat | Developer portalda recurring | Güçlü recurring plan/token API | Çok güçlü billing/trial/proration/dunning | Ana ürün olarak uygun değil |
| Kart token/PCI | PCI DSS, kart saklama | Ödeme kuruluşunda saklama | PCI-DSS, token API | PCI sertifikalı | Yetkiye bağlı | CARDTOKEN | PSP/MoR tarafında | Uygulama içi billing sınırlı |
| 3DS | Var; recurring Non-3DS için yetki | Checkout/3DS + Non-3DS | 3DS/token akışları | 3D API | Teklifte belirlenir | 3DS API | PSD2/3DS | Checkout |
| Taksit | Ana banka kart aileleri | Banka sanal POS/taksit | Tüm banka/kredi kartları | Anlaşmalı bankalar | Teklife göre | Çoklu kart aileleri | Türkiye yerel taksit yok | Vade farkını alıcı öder |
| Yurt dışı | Yabancı Visa/Mastercard; AMEX yalnız TL; yerli karttan döviz yok | Teklif/ülke kapsamı teyit | Farklı para birimleri vurgulanıyor | Teklif alınmalı | Döviz POS ayrı | Türkiye/yurt dışı | Global | Ana hedef değil |
| İade | Panel/API | Refund/cancel API | Panel/API ve sözleşme | API/panel | Sözleşme yetkisi | API/panel | Full/partial refund, MoR | Panel |
| Webhook/rapor | Var | Webhook, settlement/SFTP/reporting | API | API | JSON POST | API | Webhook/invoice/report | Mağaza API’si |

## Sağlayıcı notları

### PayTR

Resmî sayfa 7 gün valörle %2,19’dan başlayan oranı yayımlıyor. Başlangıç/kurulum/aylık/yıllık/verimsizlik/işlem başı gizli ücret olmadığını belirtiyor. Abonelik ürünü kart saklama, panelden plan ve periyot yönetimi sağlıyor. Kayıtlı kart recurring API’si Non-3DS olarak çalışıyor ve mağazada Non-3DS yetkisi gerekiyor; bu durumda fraud/chargeback riski işyerine ait olabilir. Yabancı Visa/Mastercard kartlardan TL veya döviz alınabiliyor; yerli kartlardan dövizli ödeme alınamıyor. İade/iptal için ek ücret olmadığını, kredi kartında ortalama 1–3, banka kartında 7–14 iş günü yansıma olabileceğini söylüyor. Chargeback belgeleri talep edilirse iki iş günü içinde sunma yükümlülüğü var.

Kaynaklar: [abonelik](https://www.paytr.com/abonelik-yontemi), [recurring API](https://dev.paytr.com/direkt-api/kart-saklama-api/kayitli-kart-tekrarlayan-odeme), [iade/iptal](https://www.paytr.com/destek-merkezi/odemeler), [chargeback şartı](https://www.paytr.com/on-bilgilendirme).

### iyzico

Sanal POS için %4,29 + 0,25 TL, ertesi gün ödeme, başlangıç ve aylık sabit ücret yok. Abonelik ürünü SaaS dahil birçok sektör için günlük/haftalık/aylık/yıllık plan, trial ve webhook sağlıyor; ilk 3 ay ücretsiz, sonra 199 TL/ay ve yalnız kredi kartı. Abonelik ilk işleminde trial/PENDING senaryosunda 1 TL provizyon ve geri ödeme görülebilir. Checkout Form/API, webhook, refund/cancel, fraud notification, settlement/SFTP ve raporlama araçları olgun. Taksitli tutarın parça parça değil, komisyon sonrası tek seferde aktarılabildiği belirtiliyor. Chargeback prosedürü bazı itiraz kategorilerinde 120 güne kadar süreler öngörüyor.

Kaynaklar: [abonelik API](https://docs.iyzico.com/en/products/subscription/subscription-implementation/subscription-transactions), [webhook](https://docs.iyzico.com/en/advanced/webhook), [raporlama](https://docs.iyzico.com/en/advanced/reporting-service), [chargeback](https://www.iyzico.com/assets/uploads/pdf/iyzico-ters-ibraz-chargeback-proseduru.pdf).

### Sipay

Kurulum/aylık/yıllık aidat ve gizli ücret olmadığını, ertesi gün payout, Visa/Mastercard, tek çekim/taksit ve kart saklama sağladığını açıklıyor. Abonelik günlük/haftalık/aylık/yıllık periyotlarda çalışıyor; oran işletmeye özel. API’de saveCard, token ile 3DS/non-3DS ödeme, refund ve status var. Sipay işyeri sözleşmesi 3DS’siz işlemlerde kart itirazı riskini işyerine yüklüyor ve doğan zararın beş iş günü içinde ödenmesini düzenliyor.

Kaynaklar: [Sanal POS](https://sipay.com.tr/odeme-cozumleri/online-odeme-cozumleri/sanal-pos/), [abonelik](https://sipay.com.tr/odeme-cozumleri/online-odeme-cozumleri/abonelik-yontemi/), [token API](https://apidocs.sipay.com.tr/card-registration-26908219e0), [saved-card](https://apidocs.sipay.com.tr/payment-with-saved-card-6247061f0), [işyeri sözleşmesi](https://sipay.com.tr/sipay-isyeri-sozlesmesi/).

### Param, Moka, Paratika, Paycell ve Paynet

Param standart %4,15, Business Kart’a özel %2,19, ertesi iş günü payout, 23 banka, taksit, PCI kart saklama/otomatik tahsilat bildiriyor. Düşük oranın Business Kart ve payout modeline etkisi yazılı teyit edilmeli. API dokümanında 3D/non-secure ve hash akışları var; eski endpoint için yeni entegrasyon uyarısı mevcut.

Moka developer portal ödeme, ödeme isteği, kart saklama ve recurring JSON POST API’leri sunuyor; TLS 1.2+ şartı var. Teklif koşullarında yerli POS ertesi iş günü; komisyonun banka/taksit/servis masrafları ve %5 BSMV’yi içerebildiği belirtiliyor. Recurring, token, 3DS, yabancı kart ve refund yetkileri teklifte tek tek açılıyor.

Paratika API v2 recurring plan/tutar/sıklık/token yönetiyor; FAQ’daki %0,69’dan başlayan oran güncel kesin tarife değildir. Paycell çevrimiçi ödeme sayfası %1,90’dan başlayan fiyat ve ertesi iş günü ödeme yayınlıyor; recurring/retry/webhook kapsamı için ticari ve teknik teklif alınmalı. Paynet’in resmî sitesi Paynet–iyzico birleşmesinin 1 Ocak 2026’da tamamlandığını duyurduğu için Paynet artık bağımsız bir kısa liste adayı değil; Paynet ürünleri iyzico sözleşmesi/markasıyla değerlendirilmelidir.

Kaynaklar: [Param](https://param.com.tr/avantajlar/parampos-lu-olun-harcadikca-nakit-iade-kazanin-151), [Param API](https://dev.param.com.tr/tr/api/odeme?tab=oedeme-v2), [Moka developer](https://developer.mokaunited.com/), [Moka teklif](https://posbasvuru.mokaunited.com/Application/OfferForm?id=ReEziUm8KAhqfpIuO5C14g%3D%3D), [Paratika API](https://entegrasyon.paratika.com.tr/paratika/api/v2/doc), [Paycell](https://www.paycell.com.tr/online-odeme-cozumleri), [Paynet birleşme duyurusu](https://www.paynet.com.tr/).

### Shopier

Hesap/ürün listeleme ücretsiz; satışta %2,99 + 0,49 TL’den başlayan hizmet bedeli ve KDV uygulanıyor. Payout, siparişin kapatılmasına göre haftalık Çarşamba. Link/mağaza satışı için pratik olsa da Vitrin AI’nin plan, retry, webhook, cancellation ve entitlement lifecycle’ı için ana provider yapılması önerilmez.

### Paddle/Lemon Squeezy

İkisi de global SaaS için MoR; vergi/VAT hesaplama, tahsilat/filing, checkout, subscription, trial, failed-payment recovery ve refund araçlarını üstleniyor. Temel fiyat %5 + 0,50 USD. Paddle aylık payout ve 100 USD eşik kullanıyor; chargeback’te tutar ve 20 USD/GBP/EUR veya 40 CAD/AUD fee satıcı hesabından düşebiliyor. Lemon Squeezy Türkiye’yi banka payout destek listesinde gösteriyor; satışlar 13 gün tutuluyor, ayda iki payout, 50 USD eşik ve banka 1–5 gün. Yerel TRY kart taksit ekosistemi olmadığından Türkiye müşterilerinde dönüşüm PayTR/iyzico’dan düşük olabilir.

Kaynaklar: [Paddle pricing](https://www.paddle.com/pricing), [MoR](https://www.paddle.com/help/start/intro-to-paddle/how-paddle-is-able-to-take-on-your-vat-and-tax-responsibilities), [chargeback](https://www.paddle.com/help/manage/risk-prevention/understanding-chargebacks-with-paddle), [Lemon pricing](https://www.lemonsqueezy.com/pricing), [ülke desteği](https://docs.lemonsqueezy.com/help/getting-started/supported-countries), [payout](https://docs.lemonsqueezy.com/help/getting-started/getting-paid).

### Stripe

Global availability listesinde Türkiye yok. Türkiye şirketiyle doğrudan merchant hesabı önerilmez. Stripe Billing teknik olarak subscription, trial, proration, usage-based pricing, failed-payment recovery, customer portal ve webhook lifecycle açısından çok güçlü; ancak Türkiye dışında gerçek şirket/banka/vergi yapısı kurmayı gerektirir.

Kaynaklar: [global availability](https://stripe.com/global), [subscriptions](https://docs.stripe.com/billing/subscriptions/overview), [integration](https://docs.stripe.com/billing/subscriptions/build-subscriptions).

## Başvuru öncesi aynı teklif soruları

1. 20k/100k/500k TL aylık hacimde ve 299/499/999 TL sepetlerde kesin TRY tek çekim oranı?
2. Abonelik recurring, kart token, retry ve failed-payment ücretleri aynı mı?
3. İlk ödeme 3DS + sonraki MIT/recurring akışı var mı; Non-3DS chargeback sorumlusu kim?
4. Taksit komisyonu işyerine mi müşteriye mi; tutar tek seferde mi aktarılıyor?
5. Ertesi gün, 3, 7, 30 gün valör oranları?
6. BSMV/KDV, işlem sabit bedeli, döviz dönüşüm marjı, chargeback/itiraz, rezerv/bloke, minimum payout?
7. Kısmi/tam iade ücreti; iade sonrası komisyon geri veriliyor mu?
8. Yabancı Visa/Mastercard/AMEX ve USD/EUR/GBP kapsamı?
9. API/SDK, hosted checkout, webhook imzası, idempotency, test ortamı, SLA?
10. KYC belgeleri, fesih, payout hold ve yasaklı dijital hizmet kategorileri?

## Önerilen rollout

- Aynı hacim senaryolarını PayTR, iyzico ve Sipay’e gönderip yazılı teklif alın.
- MVP’de hosted checkout + ilk ödeme 3DS + webhook + refund + idempotency kullanın; kart numarası backend’e girmesin.
- Abonelik için açık recurring onayı, plan/version, cancellation, retry ve webhook replay kayıtlarını tutun.
- Global müşteri payı oluşunca Paddle veya Lemon Squeezy’yi ikinci kanal olarak PoC yapın; Türkiye TRY müşterileri için yerel sağlayıcıyı koruyun.
- MoR seçilirse Türkiye’de gelir/fatura/KDV etkisini mali müşavir, abonelik tüketici/KVKK metinlerini hukukçu ile kesinleştirin.
