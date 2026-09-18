# Vitrin AI yasal metin araştırması

**Araştırma tarihi:** 18 Eylül 2026  
**Kapsam:** `frontend/src/app/kvkk/page.tsx`, `frontend/src/app/gizlilik/page.tsx`, `frontend/src/app/kullanim-kosullari/page.tsx`, kayıt ve ödeme akışları  
**Kaynak yaklaşımı:** Yalnızca Kişisel Verileri Koruma Kurumu, mevzuat.gov.tr ve T.C. Ticaret Bakanlığının birincil kaynakları kullanılmıştır.

> Bu çalışma, ürün ve kod akışının mevzuattaki asgari gerekliliklerle karşılaştırılmasıdır. Veri sorumlusunun gerçek unvanı, adresi, vergi/MERSİS bilgileri, hizmet sağlayıcı sözleşmeleri, sunucu bölgeleri ve fiilî operasyon doğrulanmadan “yayına hazır hukuk görüşü” sayılamaz. Nihai metinler, bu bilgiler doldurulduktan sonra Türkiye'de bilişim, tüketici ve KVKK alanında çalışan bir hukukçu tarafından onaylanmalıdır.

## Kısa sonuç

Mevcut sayfalar bütünüyle uydurma değildir. KVKK'nın 10 ve 11'inci maddelerine, aydınlatma tebliğine, açık rızanın ayrılığına ve tüketici haklarının saklı tutulmasına yapılan atıflar doğru yöndedir. Kod da birçok gerçek veri akışını metinlerle uyumlu biçimde uyguluyor: özgün fotoğraf arka plan kaldırma sırasında bellekte işleniyor, geçmişe yalnız sonuç ve küçük önizleme kaydediliyor, kayıt sırasında ticari ileti izni zorunlu onaydan ayrı tutuluyor ve ödeme öncesi sürümlenmiş ön bilgilendirme/mesafeli satış belgelerinin kabul kanıtı alınıyor.

Bununla birlikte mevcut üç sayfa profesyonel yayına hazır değildir. En kritik eksikler şunlardır:

1. Veri sorumlusu ve hizmet sağlayıcı gerçek hukukî kişi olarak tanımlanmamış; varsayılan ad yalnızca “Vitrin AI”, posta adresi ve telefon yok, e-posta ise ortam değişkeni boşsa hiç gösterilmiyor.
2. KVKK metni veri kategorisi–amaç–hukuki sebep–alıcı–saklama süresi eşlemesini yapmıyor; birçok farklı işleme faaliyeti tek paragrafta genel gerekçelerle anlatılıyor.
3. Ödeme akışında alınan ad, soyad, GSM, T.C. kimlik numarası ve fatura adresi ile iyzico aktarımı KVKK ve gizlilik sayfalarında yer almıyor.
4. Başarılı kesim sonucu, işlem tekrarı/kredi güvenliği için geçmiş kapalı olsa bile Cloudflare R2'de **24 saat** tutuluyor. Gizlilik sayfası yalnızca geçmiş açıksa sonucun saklandığını söyleyerek bu geçici depolamayı atlıyor.
5. Supabase ve Cloudflare gibi yabancı hizmet sağlayıcıların gerçek sunucu bölgeleri ve sözleşmesel rolleri doğrulanmadan “yurt dışı aktarım gerekiyorsa” deniyor. Fiilî aktarım varsa bunun KVKK madde 9 kapsamındaki mekanizması açıkça belirlenmeli ve uygulanmalı.
6. Saklama süreleri belirli değil. Hesap, profil, ödeme, işlem/kota, onay, destek, günlük ve görsel kayıtları için ayrı süre veya süre belirleme ölçütü bulunmalı.
7. Kullanım koşulları ücret, yenileme, deneme, kredi, fesih, cayma/iade, fikrî mülkiyet, hesap askıya alma, bildirim ve uyuşmazlık çözümü gibi SaaS'ın temel hükümlerini içermiyor.
8. Sitede doğrudan ve kolay erişilebilir bir “İletişim” alanında tacir/esnaf bilgileri yok. Elektronik ticaret faaliyeti başlayacaksa KEP, e-posta, telefon, merkez adresi ve statüye göre ticaret unvanı/MERSİS veya ad-soyad/vergi kimlik numarası gibi bilgiler yayımlanmalı.

## Birincil kaynaklardan asgari gereklilikler

### 1. KVKK aydınlatma metni

6698 sayılı Kanun'un 10'uncu maddesi ve Aydınlatma Yükümlülüğü Tebliği uyarınca, veri elde edilirken en az şu bilgiler verilmelidir:

- veri sorumlusunun ve varsa temsilcisinin kimliği;
- kişisel verilerin hangi belirli amaçlarla işlendiği;
- kimlere ve hangi amaçlarla aktarılabileceği;
- toplamanın yöntemi ve Kanun'un 5 veya 6'ncı maddelerindeki somut işleme şartı;
- ilgili kişinin Kanun'un 11'inci maddesindeki hakları.

Tebliğ ayrıca aydınlatmanın açık rızadan ayrı yapılmasını, genel ve muğlak amaçlardan kaçınılmasını, işleme şartının açıkça belirtilmesini, alıcı grubu ile aktarım amacının açıklanmasını ve otomatik/otomatik olmayan toplama yönteminin yazılmasını zorunlu tutuyor. İspat yükü veri sorumlusunda. Kaynak: [KVKK Aydınlatma Yükümlülüğü Tebliği, md. 4–6](https://www.kvkk.gov.tr/Icerik/4132/aydinlatma-yukumlulugunun-yerine-getirilmesinde-uyulacak-usul-ve-esaslar-hakkinda-teblig); [6698 sayılı Kanun](https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6698.pdf).

Kanun'un 5'inci maddesindeki şartların metinde faaliyete göre eşlenmesi gerekir. Vitrin AI için tipik örnekler şunlardır:

- hesabın açılması, fotoğrafın işlenmesi, kredinin düşülmesi ve aboneliğin yürütülmesi: sözleşmenin kurulması veya ifası için gerekli olma;
- fatura, mali kayıt ve zorunlu kurum bildirimleri: hukukî yükümlülüğün yerine getirilmesi;
- dolandırıcılık önleme, sistem güvenliği ve hakkın savunulması için ölçülü loglar: veri sorumlusunun meşru menfaati veya bir hakkın tesisi/kullanılması/korunması;
- kampanya e-postası: diğer mevzuatla birlikte ayrı ve geri alınabilir izin/açık rıza;
- kullanıcı talebiyle destek iletişimi: talebin niteliğine göre sözleşmenin ifası veya meşru menfaat.

“Sözleşme, hukuki yükümlülük, hak tesisi ve meşru menfaat sebeplerine dayanır” şeklindeki toplu ifade tek başına yeterli değildir; her veri/amaç için hangisinin geçerli olduğu anlaşılmalıdır.

### 2. İlgili kişi başvuruları, silme ve saklama

İlgili kişinin başvuru kanalı ve usulü yayımlanmalı; başvurular en geç otuz gün içinde cevaplanmalıdır. Cevabın yetersiz olması veya zamanında cevap verilmemesi hâlinde Kurula şikâyet süreleri de açıklanabilir. Kaynak: [KVKK — ilgili kişi başvurularının cevaplanması](https://www.kvkk.gov.tr/Icerik/2046/Ilgili-Kisiler-Tarafindan-Yapilan-Basvurularin-Cevaplanmasi-Yukumlulugu).

İşleme şartları ortadan kalktığında veri resen veya talep üzerine silinmeli, yok edilmeli ya da anonimleştirilmelidir. İmha işlemleri kayıt altına alınmalı ve bu kayıtlar, başka bir hukukî süre yoksa en az üç yıl saklanmalıdır. Saklama ve imha politikası zorunluluğu olan veri sorumlularında periyodik imha aralığı altı ayı aşamaz; politika zorunlu değilse koşulların ortadan kalkmasını izleyen üç ay içinde imha gerekir. Talebe konu veriler üçüncü kişilere aktarıldıysa gerekli işlem onlara da bildirilmelidir. Kaynak: [Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik, md. 5–12](https://www.kvkk.gov.tr/Icerik/5441/KISISEL-VERILERIN-SILINMESI-YOK-EDILMESI-VEYA-ANONIM-HALE-GETIRILMESI-HAKKINDA-YONETMELIK).

Bu nedenle “kanunen gerekli süre boyunca tutulur” cümlesi yerine en azından kategori bazlı azami süre veya objektif süre belirleme ölçütü yazılmalıdır. Örneğin “hesap sürdükçe”, “işlemden itibaren X yıl”, “başarılı kesimden sonra 24 saat”, “kullanıcı silene kadar; ücretsiz planda son 10 çalışma” gibi ürünün gerçekten uyguladığı kurallar görünür olmalıdır.

### 3. Yurt dışına aktarım

KVKK madde 9, 1 Haziran 2024'ten beri yeni aktarım rejimini kullanıyor. Yeterlilik kararı yoksa uygun güvencelerden biri, örneğin Kurulca yayımlanan standart sözleşme, bağlayıcı şirket kuralları veya izinli taahhütname gerekir; standart sözleşmenin imzadan itibaren beş iş günü içinde Kuruma bildirilmesi gerekir. Arızî durumlara ayrılan istisnalar sürekli bulut hizmetinin normal aktarım mekanizması gibi kullanılmamalıdır. Kaynak: [KVKK — yurt dışına aktarım](https://www.kvkk.gov.tr/Icerik/2053/Yurtdisina-Aktarim); [standart sözleşme bildirim duyurusu](https://www.kvkk.gov.tr/Icerik/8170/Yurt-Disina-Kisisel-Veri-Aktariminda-Kullanilacak-Standart-Sozlesmelerde-Dikkat-Edilmesi-Gereken-Hususlara-Iliskin-Kamuoyu-Duyurusu).

Supabase, Cloudflare ve iyzico'nun marka adını yazmak tek başına yeterli inceleme değildir. Üretim hesabı bazında şirket unvanı, veri işleyen/veri sorumlusu rolü, veri merkezi bölgesi, alt işleyenler, sözleşme eki ve aktarım mekanizması envantere bağlanmalıdır. Fiilî yurt dışı aktarım yoksa da bu sonuç bölge ve sözleşme kanıtıyla doğrulanmalıdır.

### 4. Çerezler ve cihaz depolaması

Kesinlikle gerekli çerezler, kullanıcının açıkça talep ettiği hizmet için zorunluysa açık rıza dışındaki uygun işleme şartına dayanabilir. Analitik, reklam veya benzeri zorunlu olmayan çerezler için yerleştirilmeden önce aktif seçimle açık rıza alınmalı; kabul, ret ve tercih seçenekleri eşit görünürlükte sunulmalı; rıza kolayca geri alınabilmelidir. Çerez adı, amacı, süresi ve birinci/üçüncü taraf niteliği açıklanmalıdır. Kaynak: [KVKK Çerez Uygulamaları Hakkında Rehber](https://www.kvkk.gov.tr/Icerik/7353/Cerez-Uygulamalari-Hakkinda-Rehber); [Kurulun 2023/1645 sayılı karar özeti](https://www.kvkk.gov.tr/Icerik/7765/2023-1645).

Repo incelemesinde reklam veya üçüncü taraf analitik SDK'sı görülmedi. Supabase oturumu için zorunlu çerezler; stüdyo ayarları, karşılama durumu, logo görseli ve logo ayarları için `localStorage` kullanılıyor. Yine de üretimde ağ istekleri ve gerçek çerez adları tarayıcıdan denetlenerek ayrı bir çerez/cihaz depolama tablosu yayımlanmalı. “Hiçbir üçüncü taraf takip çerezi kullanılmaz” iddiası, her sürümde doğrulanmadıkça değişmez bir taahhüt olarak bırakılmamalıdır.

### 5. Ticari elektronik ileti

Kampanya izni hizmetin veya üyeliğin zorunlu koşulu yapılamaz; aydınlatmadan ve kullanım koşulu kabulünden ayrı, boş başlayan bir seçim olmalı ve kolayca geri alınabilmelidir. Mevcut kayıt formunun ayrı “Yeni özellikler ve kampanyalar hakkında e-posta almak istiyorum” kutusu bu ilkeye uygundur. Ticari iletilerde hizmet sağlayıcıyı tanıtan bilgiler ve kolay, ücretsiz ret imkânı bulunmalı; İYS yükümlülüğü ve tacir/esnaf istisnaları iş modeline göre ayrıca değerlendirilmelidir. Kaynak: [Ticaret Bakanlığı e-ticaret SSS](https://ticaret.gov.tr/ic-ticaret/sikca-sorulan-sorular/elektronik-ticaret); [KVKK'nın 2025/1072 sayılı ilke kararı](https://www.kvkk.gov.tr/Icerik/8338/2025-1072); [ticari elektronik ileti yönetmeliği duyurusu](https://ticaret.gov.tr/haberler/ticari-iletisim-ve-ticari-elektronik-i%CC%87letiler-hakkinda-yonetmelik-resmi-gazetede-yayimlanarak-yururluge-girdi).

### 6. Mesafeli satış ve abonelik

Bireysel kullanıcı “tüketici” sıfatıyla satın alıyorsa, ödeme öncesi en az hizmetin temel niteliği; sağlayıcının unvanı, MERSİS/vergi kimlik numarası, açık adres ve iletişim bilgileri; vergiler dahil toplam fiyat; ödeme/ifa; cayma hakkı ve istisnaları; şikâyet ve hak arama yolları açıkça bildirilmelidir. Ön bilgilendirmenin yapıldığı ispatlanmalı ve sözleşme kullanıcıya kalıcı veri saklayıcısıyla verilebilmelidir. Kaynak: [Ticaret Bakanlığı — Mesafeli Sözleşmeler Hakkında Bilgilendirme](https://tuketici.ticaret.gov.tr/yayinlar/tuketici-bilgi-rehberi/mesafeli-sozlesmeler-hakkinda-bilgilendirme); [Mesafeli Sözleşmeler Yönetmeliği metni](https://tuketici.ticaret.gov.tr/data/5e81982d13b876a1b04c7a42/2023-6502%20Say%C4%B1l%C4%B1%20T%C3%BCketicinin%20Korunmas%C4%B1%20Hakk%C4%B1nda%20Kanun.pdf).

Kural olarak mesafeli sözleşmede on dört günlük cayma hakkı vardır. Elektronik ortamda anında ifa edilen hizmet veya cayma süresi dolmadan tüketicinin onayıyla ifasına başlanan hizmet istisnasına dayanılacaksa, uygun ön bilgilendirme ve açık talep/onay akışı kurulmalıdır; genel kullanım koşullarına gömülü bir cümle yeterli kabul edilmemelidir. Kaynak: aynı Bakanlık sayfasındaki “cayma hakkı hangi durumlarda kullanılamaz” bölümü.

Vitrin AI'nin aylık planı sürekli veya düzenli hizmet sağladığı için abonelik hükümleri de hesaba katılmalıdır. Sözleşme örneği kalıcı veri saklayıcısıyla verilmelidir; internetten kurulan aboneliğin feshinde daha ağır bir yöntem dayatılamaz; fesih talebi en geç yedi gün içinde yerine getirilmeli ve kullanılmayan peşin bedel varsa fesih tarihinden itibaren on beş gün içinde iade edilmelidir. Belirli süreli sözleşme, kullanıcı talebi veya onayı olmadan uzatılamaz. Kaynak: [Ticaret Bakanlığı — Abonelik Sözleşmeleri Hakkında Bilgilendirme](https://tuketici.ticaret.gov.tr/yayinlar/tuketici-bilgi-rehberi/abonelik-sozlesmeleri-hakkinda-bilgilendirme); [Abonelik Sözleşmeleri Yönetmeliği](https://tuketici.ticaret.gov.tr/data/5e819a8e13b8761e84fba40d/Abonelik%20S%C3%B6zle%C5%9Fmeleri%20Y%C3%B6netmeli%C4%9Fi.pdf).

İşletme/tacir hesabında her satın alan “tüketici” olmayabilir. Kullanım koşulları ve ödeme belgeleri, bireysel tüketici ile ticari/mesleki amaçla hareket eden işletme müşterisini tanımlamalı; emredici tüketici hakları yalnız gerçekten uygulanmadığı durumda dışarıda bırakılmalıdır. Arayüzde hesap türü seçimi tek başına kişinin hukukî sıfatını kesinleştirmez.

### 7. Elektronik ticaret sağlayıcı bilgileri

Kendine ait sitede elektronik ticaret yapan tacir için ana sayfadan doğrudan erişilebilen “İletişim” bölümünde KEP, e-posta, telefon, marka/işletme adı, ticaret unvanı, MERSİS ve merkez adresi; esnaf için ad-soyad, vergi kimlik numarası ve merkez adresi gibi bilgiler gerekir. Elektronik ticaret kayıtlarının işlem tarihinden itibaren üç yıl saklanması ve ETBİS kayıt yükümlülüğü de işletme statüsü/istisnalarıyla birlikte kontrol edilmelidir. Kaynak: [Ticaret Bakanlığı e-ticaret SSS](https://ticaret.gov.tr/ic-ticaret/sikca-sorulan-sorular/elektronik-ticaret); [ETBİS bilgilendirmesi](https://ticaret.gov.tr/ic-ticaret/bilgi-sistemleri/elektronik-ticaret-bilgi-sistemi-etbis-ve-e-ticaret-bilgi-platformu); [6563 sayılı Kanun ve ikincil mevzuat listesi](https://www.ticaret.gov.tr/ic-ticaret/mevzuat/elektronik-ticaret).

## Repo ve mevcut metin incelemesi

### KVKK sayfası

**Doğru yöndeki kısımlar**

- Veri sorumlusu, veri kategorileri, amaç/hukuki sebep, yöntem, aktarım ve haklar için ayrı başlıklar var.
- Haklar listesi Kanun'un 11'inci maddesini büyük ölçüde doğru özetliyor.
- Ticari ileti izninin ayrı ve isteğe bağlı olduğu belirtiliyor.
- Özgün fotoğrafın yalnız işlem sırasında bellekte tutulduğu, geçmişe sonuç görselinin kaydedildiği ürün akışıyla büyük ölçüde uyumlu.

**Düzeltilmesi gerekenler**

- `frontend/src/lib/legal-config.ts`, gerçek unvan yoksa “Vitrin AI” yazıyor; gerçek kişi/tüzel kişi unvanı, açık posta adresi, başvuru e-postası/KEP ve gerekiyorsa temsilci belirtilmeli.
- Telefon, ödeme için girilen T.C. kimlik numarası, fatura adresi, abonelik ve ödeme geçmişi, sağlayıcı referansları, teknik/güvenlik kayıtları ve IP gibi fiilen işlenebilen kategoriler eksik.
- Amaç ve hukukî sebep tek paragrafta toplu; veri kategorisi bazında matrise dönüştürülmeli.
- Aktarım bölümüne ödeme kuruluşu iyzico, ödeme/mali danışmanlık gerektiren alıcı grupları ve destek/iletişim sağlayıcısı kullanılıyorsa o grup eklenmeli. Sağlayıcıların ticari adları değişebileceği için alıcı grubu + güncel sağlayıcı listesi yaklaşımı daha sürdürülebilir olur.
- “Yurt dışı aktarım gerekiyorsa” ifadesi fiilî durumu açıklamıyor. Supabase/Cloudflare üretim bölgeleri ve alt işleyenleri incelenerek aktarım var/yok kesinleştirilmeli; varsa mekanizma yazılmalı.
- Saklama süreleri yok. Özellikle geçici R2 sonucu **24 saat**, ücretsiz plan geçmişi **son 10 çalışma**, ücretli geçmiş için hesap/abonelik kuralı, ödeme/mali kayıtlar ve onay kanıtları ayrı yazılmalı.
- Başvuru yönteminde kimlik doğrulama için gerekli bilgiler, posta/KEP/e-posta adresi ve otuz günlük cevap süresi yer almalı.
- Kayıt akışında “KVKK metnini okudum” ifadesi koşullar kabulünden dilsel olarak ayrılmış olsa da veritabanı tablosu bunu `user_consents` içinde `kvkk_notice` adıyla tutuyor. Bu kayıt “açık rıza” gibi sunulmamalı; aydınlatmanın gösterildiğine dair sürüm/tarih kanıtı olarak adlandırılmalı.

### Gizlilik politikası

**Doğru yöndeki kısımlar**

- Supabase kimlik doğrulama, R2 özel nesne depolama, süreli imzalı URL, RLS ve yerel cihaz depolaması gibi gerçek teknik akışları sade anlatıyor.
- Parolanın Vitrin AI uygulama sunucusunda tutulmadığını ve logo/ayarların cihazda kalabildiğini açıklıyor.
- Kullanıcıya tekil çalışma, tüm çalışma ve hesap silme kontrollerini anlatıyor.

**Düzeltilmesi gerekenler**

- “Geçmiş açıksa yalnız sonuç saklanır” anlatımı eksik: arka plan kaldırma sonucu, yanıt kaybolduğunda ikinci kredi harcanmasını önlemek için `results/{user}/{request}.png` anahtarıyla R2'ye yazılıyor ve 24 saat tutuluyor. Geçmiş açık olduğunda ayrıca sonuç ve küçük önizleme `projects/...` altında saklanıyor.
- Ödeme verisinin backend üzerinden iyzico'ya gönderildiği, hangi alanların ödeme kuruluşunca işlendiği ve Vitrin AI tarafında hangi ödeme/abonelik kanıtlarının kaldığı anlatılmalı.
- Cookie/localStorage tablosu, saklama süreleri, hizmet sağlayıcı rolleri, yurt dışı aktarım ve politika değişikliklerinin yürürlük tarihi eksik.
- “Hesap silindiğinde önce kayıtlı görseller, sonra kimlik hesabı kaldırılır” operasyonu doğru yönde; fakat devam eden abonelik/ödeme belirsizliği varsa silmenin önce provider işlemlerini tamamlamayı beklediği ve mali/yasal kayıtların kullanıcı kimliğinden ayrıştırılarak saklanabileceği açıklanmalı.
- Güvenlik önlemleri garanti gibi değil, uygulanan risk azaltıcı kontroller olarak ifade edilmeli; veri ihlali müdahale ve erişim yetkisi ilkeleri de eklenebilir.

### Kullanım koşulları

**Doğru yöndeki kısımlar**

- Hizmetin kapsamı, kullanıcı hesabı, yüklenen içerik hakkı, AI çıktısının sınırları, yasak kullanım, kesinti ve sona erme için temel bir iskelet var.
- Kullanıcı içeriğinin mülkiyetinin kullanıcıda kaldığı ve Vitrin AI'ye yalnız hizmeti vermek için sınırlı işleme izni verildiği dengeli.
- Emredici tüketici haklarının ve emredici görev/yetki kurallarının saklı tutulması doğru.

**Düzeltilmesi gerekenler**

- Hizmet sağlayıcının gerçek unvanı, adresi, telefon/e-posta/KEP, MERSİS/vergi bilgisi ve sözleşmenin yürürlük tarihi eksik.
- Kullanıcının sözleşme ehliyeti/yaş şartı ve şirket hesabını açan kişinin temsil yetkisi düzenlenmeli.
- Ücretsiz ve ücretli planlar, kredi tanımı, kredinin ne zaman tüketildiği/iade edildiği, dönem sonunda devredilip devredilmediği, deneme süresi, fiyat/vergi ve plan değişikliği kuralları eklenmeli.
- Otomatik yenileme, başarısız tahsilat, erişim süresi, yenilemeyi kapatma, fesih, cayma ve iade düzeni açıkça yazılmalı; ödeme öncesi özel ön bilgilendirme ve mesafeli sözleşme bu genel koşullarla çelişmemeli.
- Kullanıcının içerik lisansı; katalog zeminleri, şablonlar, marka ve yazılım üzerindeki Vitrin AI hakları; çıktının ticari kullanım kapsamı ayrıca düzenlenmeli. AI çıktısına mutlak telif garantisi verilmemeli.
- Hesap askıya alma/fesih nedenleri, bildirim ve itiraz imkânı, ihlalin giderilmesi ve veri dışa aktarma/silme sonucu yazılmalı.
- Sorumluluk sınırlaması, tüketici aleyhine geniş bir sorumsuzluk kaydı olmamalı. Kasıt/ağır kusur ve emredici haklar korunmalı; hizmetin görsel düzenleme aracı olduğu ve çıktının kullanıcı tarafından doğrulanacağı somutlaştırılmalı.
- Destek ve şikâyet kanalı, tüketici hakem heyeti/mahkemesi yolu ve ticari müşteriler için yetkili mahkeme ancak gerçek hizmet sağlayıcı adresi belirlendikten sonra yazılmalı.
- Esaslı değişiklikte yalnız “yayınlarız” demek yerine yürürlük tarihi, bildirim yöntemi, gerekirse yeniden kabul ve eski sürümlere erişim düzenlenmeli.

## Önerilen profesyonel belge yapısı

### A. KVKK aydınlatma metni

1. Belge sürümü ve yürürlük tarihi.
2. Veri sorumlusunun tam unvanı, merkez adresi, KEP/e-posta ve iletişim bilgileri.
3. Kişi grupları: ziyaretçi, üye, şirket hesabı yetkilisi/çalışanı, ödeme yapan, destek başvurucusu.
4. İşleme tablosu: veri kategorisi → somut veri örnekleri → amaç → KVKK md. 5/6 işleme şartı → yöntem → saklama süresi.
5. Aktarım tablosu: alıcı grubu/sağlayıcı → aktarılan veri → amaç → yurt içi/yurt dışı → md. 8/9 mekanizması.
6. Fotoğraf işleme: özgün dosyanın bellek ömrü, 24 saatlik idempotency sonucu, isteğe bağlı geçmiş ve küçük önizleme.
7. Oturum/çerez/localStorage açıklaması ve çerez politikasına bağlantı.
8. Pazarlama tercihi ve geri alma yöntemi.
9. KVKK md. 11 hakları ve md. 13 başvuru yöntemi; otuz günlük cevap süresi.
10. Değişiklik geçmişi ve eski sürümler.

### B. Gizlilik politikası

1. “Hızlı özet” ve aydınlatma metnine bağlantı.
2. Ürünün veri akış diyagramı: cihaz → Vitrin AI backend → geçici sonuç deposu → isteğe bağlı geçmiş.
3. Hesap/profil, görseller, kullanım/kota, ödeme, destek, günlük ve cihaz verileri.
4. Hizmet sağlayıcı listesi ve rolleri: Supabase, Cloudflare R2, iyzico, barındırma ve varsa e-posta/destek sağlayıcısı.
5. Saklama tablosu ve silme sırası.
6. Kullanıcı kontrolleri: geçmişi kapatma, çalışmayı silme, tümünü silme, hesabı silme, pazarlama iznini geri alma.
7. Güvenlik yaklaşımı, veri ihlali ve çalışan erişimi.
8. Çerez/cihaz depolama tablosu.
9. Çocuklara yönelik olmama ve üçüncü kişilere ait gereksiz/özel nitelikli veri yüklememe uyarısı.
10. İletişim, yürürlük ve değişiklik bildirimi.

### C. Kullanım koşulları

1. Taraflar, tanımlar, sürüm/yürürlük.
2. Uygunluk, yaş ve temsil yetkisi.
3. Hesap, güvenlik ve doğrulama.
4. Hizmet kapsamı, planlar, krediler ve teknik sınırlar.
5. Ücretler, vergiler, deneme, otomatik yenileme ve başarısız ödeme.
6. Fesih, yenilemeyi kapatma, tüketici cayma/iade hakları ve işletme müşterisi ayrımı.
7. Kullanıcı içeriği, sınırlı hizmet lisansı ve üçüncü kişi hakları.
8. Vitrin AI yazılımı, marka, zemin ve şablon hakları; kullanıcıya verilen çıktı lisansı.
9. Yasak kullanım ve kötüye kullanım önlemleri.
10. AI çıktısı ve kullanıcı doğrulaması.
11. Askıya alma, hesabın sona ermesi ve veri sonucu.
12. Hizmet değişiklikleri, bakım ve mücbir sebep.
13. Sorumluluk, garanti ve tazmin hükümleri; emredici haklar saklı.
14. Bildirimler, sözleşme değişikliği ve eski sürümler.
15. Uygulanacak hukuk ve uyuşmazlık çözümü.
16. İletişim.

## Uygulamadan doğrulanan veri akışı

| Süreç | Kodda görülen veri/işlem | Metinde olması gereken açıklama |
|---|---|---|
| Üyelik | Ad, soyad, e-posta; isteğe bağlı telefon; şehir; hesap/işletme türü ve işletme adı; koşul/aydınlatma sürümü; pazarlama tercihi | Kategori, amaç, hukuki sebep, Supabase rolü, saklama ve pazarlama iznini geri alma |
| Oturum | Supabase oturum çerezleri | Zorunlu çerez adı/sağlayıcı/amaç/süre |
| Arka plan kaldırma | Özgün dosya bellekte işleniyor; sonuç 24 saat R2'de idempotency için tutuluyor | Özgün ve sonuç için ayrı saklama açıklaması |
| Çalışma geçmişi | Geçmiş açıksa sonuç PNG ve thumbnail R2'de; ücretsiz planda son 10 çalışma korunuyor | Kullanıcı tercihi, plan sınırı, silme ve ücretli plan saklama kuralı |
| Cihaz ayarları | Stüdyo/erişilebilirlik tercihleri, karşılama durumu, logo ve logo ayarları localStorage'da | Anahtar/kategori, cihazda kalma ve temizleme yöntemi |
| Ödeme | Ad, soyad, GSM, T.C. kimlik no, fatura adresi backend üzerinden iyzico'ya; ödeme/abonelik referansları ve işlem geçmişi | iyzico aktarımı, sağlayıcı rolü, saklama, mali hukukî sebep ve yurt dışı durumu |
| Onay kanıtı | Koşul/KVKK bildirim sürümü ve ödeme belgelerinin sürüm+hash kayıtları | “Kabul” ile “aydınlatıldı” ayrımı, ispat ve saklama süresi |
| Hesap silme | Önce uzaktaki abonelik/iadeler kesinleştiriliyor; R2 projeleri ve auth hesabı siliniyor; mali kayıt kimlikten ayrıştırılabiliyor | Silmenin aşamaları, gecikme nedeni ve yasal kayıt istisnası |

## Yayından önce cevaplanması gereken açık sorular

1. Veri sorumlusu/hizmet sağlayıcı gerçek veya tüzel kişi kimdir? Tam unvan, adres, KEP, e-posta, telefon, MERSİS/vergi numarası nedir?
2. Şirket Türkiye'de mi yerleşik; VERBİS kayıt yükümlülüğü ve ETBİS kaydı var mı?
3. Supabase projesi, R2 bucket'ı, frontend/backend barındırması ve yedekler hangi ülkelerde? Alt işleyenler kim?
4. Yurt dışı aktarım için yeterlilik/standart sözleşme/diğer güvence hangisi uygulanıyor; gerekiyorsa bildirim yapıldı mı?
5. iyzico sözleşmesinde tarafların KVKK rolleri ve ödeme verilerinin saklama/yurt dışı koşulları nedir?
6. Ücretli plan geçmişi ne kadar saklanıyor? Abonelik sona erince çalışmalar ne zaman siliniyor veya indirilebilir oluyor?
7. Mali kayıt, ödeme kanıtı, onay kanıtı, güvenlik logu ve destek kaydı için işletmenin hukukçu/mali müşavirce onaylı süre tablosu nedir?
8. Ticari e-posta gönderilecek mi; gönderilecekse İYS, ret kanalı ve gönderim sağlayıcısı hazır mı?
9. Tüketici planı gerçekten sunulacak mı, yoksa hizmet yalnız tacir/esnafa mı satılacak? Kayıt formundaki “bireysel” hesap bu ayrımı nasıl etkiliyor?
10. Cayma süresi içinde hizmete hemen başlanması isteniyor mu? İsteniyorsa ayrı ön bilgilendirme ve açık ifa talebi hangi ekranda alınacak?
11. Faturayı kim düzenleyecek, e-fatura/e-arşiv sağlayıcısı kim ve hangi müşteri verisini işleyecek?
12. Destek kanalı ve veri sahibi başvuru kanalı aynı mı; kimlik doğrulama ve başvuru kayıt prosedürü nedir?

## Uygulama önceliği

1. Gerçek işletme kimliği ve üretim sağlayıcı/envanter bilgileri kesinleştirilmeli; bunlar olmadan metin “profesyonel” görünse bile maddi olarak eksik kalır.
2. KVKK metni kategori bazlı tabloyla yeniden yazılmalı; iyzico, 24 saatlik geçici sonuç ve somut saklama süreleri eklenmeli.
3. Ödeme öncesi belgeler, genel kullanım koşullarıyla birlikte tüketici/işletme ayrımına ve cayma–abonelik hükümlerine göre hukukçu tarafından gözden geçirilmeli.
4. Gizlilik politikası gerçek veri akışının sade özeti olarak yenilenmeli; çerez/localStorage ve sağlayıcı listeleri ayrı tablolaştırılmalı.
5. Footer'a gerçek “İletişim” sayfası eklenmeli; KEP/unvan/adres/MERSİS veya vergi bilgileri yayımlanmalı.
6. Belge sürümleme, eski sürüm arşivi ve esaslı değişikliklerde yeniden kabul/bildirim mekanizması korunmalı.

