# SECURITY.md

Bu doküman, projenin production'a çıkmadan önce ve çıktıktan sonra uyması gereken
güvenlik standartlarını tanımlar. Roadmap'teki fazlar "ne inşa ediyoruz" sorusuna
cevap verir; bu doküman "nasıl güvenli inşa ediyoruz" sorusuna cevap verir ve
her fazda paralel olarak uygulanır — sadece Faz 7'ye ertelenmez.

Sorumluluk notu: Serhan (backend/altyapı) bu dokümanın çoğunu uygular. Kaan
(frontend) input validation, XSS koruması ve auth UI akışlarından sorumludur.

---

## 1. Sunucu & Altyapı Güvenliği

### 1.1 Secrets yönetimi
- **Hiçbir zaman** `.env` dosyaları veya API key'ler Git'e commit edilmez. `.gitignore`'da
  `.env`, `.env.*`, `*.pem`, `*.key` mutlaka olmalı.
- Production secrets (DB şifresi, R2 access key, iyzico API key, JWT secret) bir secrets
  manager'da tutulmalı (örn. Doppler, Infisical, veya en azından hosting sağlayıcının
  kendi encrypted env değişkenleri — Railway/Render/Fly.io hepsi bunu destekler).
- Secret rotasyonu: iyzico ve R2 key'leri en az yılda bir, herhangi bir sızıntı şüphesinde
  hemen değiştirilmeli.
- `CLAUDE.md` ve `ROADMAP.md` gibi dokümanlarda **asla gerçek key/şifre örneği** yazılmaz.

### 1.2 Docker & konteyner güvenliği
- Container'lar **root olmayan bir kullanıcı** ile çalışmalı (`USER` direktifi Dockerfile'da).
- Base image'lar `-slim` veya `-alpine` varyantları olmalı; gereksiz paket yüzeyini azaltır.
- Image'lar düzenli olarak `docker scan` veya `trivy` ile taranmalı (bilinen CVE kontrolü).
- `.dockerignore` ile `.env`, `.git`, test verisi gibi dosyalar image'a dahil edilmemeli.

### 1.3 Sunucu erişimi
- SSH sadece key-based auth ile; parola ile giriş kapalı.
- Production sunucusuna erişim sadece Serhan ve Kaan'ın kendi key'leriyle; paylaşılan
  hesap/şifre kullanılmaz.
- Gereksiz portlar kapalı (sadece 443/80 dışa açık; DB ve Redis portları asla public değil).
- Otomatik güvenlik güncellemeleri açık (unattended-upgrades / benzeri).

### 1.4 HTTPS & TLS
- Tüm trafik HTTPS zorunlu (HTTP → HTTPS redirect). Let's Encrypt / Cloudflare üzerinden
  otomatik sertifika yenileme.
- HSTS header aktif.

---

## 2. Ağ Koruması

### 2.1 Rate limiting
- Her public endpoint için rate limit (örn. `slowapi` FastAPI için): özellikle
  `/api/remove-background` (pahalı GPU/CPU işlemi) ve auth endpoint'leri (`/login`, `/register`)
  brute-force'a karşı sıkı limitlenmeli (örn. IP başına dakikada 5 login denemesi).
- Kredi sistemi devreye girdiğinde rate limit + kredi kontrolü birlikte çalışmalı; biri
  bypass edilse bile diğeri korumalı.
- **Ters proxy arkasında kova anahtarı doğru seçilmeli.** `request.client.host`
  doğrudan okunursa nginx/Caddy arkasında proxy'nin kendi adresi gelir ve bütün
  public trafik tek kovayı paylaşır — sınır fiilen kalkar. `X-Forwarded-For`'a
  körlemesine güvenmek ise her isteğe ayrı kova verir, aynı sonucu doğurur.
  Başlık YALNIZCA bağlantı güvenilen bir proxy'den geliyorsa okunur
  (`TRUSTED_PROXY_IPS`; `backend/app/services/billing/limits.py::client_ip`).
- **Vekil arkasındaki oturumlu uç noktalarda kova kullanıcıya bağlanır.** Zemin
  listesi gibi uç noktalara tarayıcı doğrudan gelmiyor; backend bütün
  kullanıcılar için AYNI adresi görüyor. Doğrulanmış kullanıcı kendi kovasını
  alır, anonim trafik IP kovasında kalır (doğrulanmamış bir başlıkla kova
  seçilemez).

### 2.2 CORS
- Backend CORS ayarı sadece bilinen frontend origin'lerine (`localhost:3000` dev,
  production domain) izin vermeli. `allow_origins=["*"]` production'da asla kullanılmaz.
- **Uygulandı (Faz 4):** `CORSMiddleware`, liste `CORS_ALLOWED_ORIGINS` env değişkeninden.
  `*`, yol içeren ya da şemasız değerler uygulama başlarken reddediliyor (sessizce hiçbir
  isteğe uymayan bir liste yazılamıyor); `allow_credentials` kapalı çünkü kimlik çerezle
  değil `Authorization` başlığıyla taşınıyor. Production alan adı belli olunca eklenmeli.

### 2.3 DDoS / Firewall katmanı
- Cloudflare (proxy modu) önerilir: DDoS koruması, bot filtreleme, ve WAF (Web Application
  Firewall) kuralları ücretsiz planda bile mevcut.
- Reverse proxy (nginx/Caddy) request boyutu sınırı koymalı (büyük dosya upload'ları için
  ayrı limit, örn. max 20MB — jewelry fotoğrafları için yeterli).

### 2.4 İç ağ segmentasyonu
- PostgreSQL ve Redis sadece backend container'ının erişebileceği internal network'te;
  dışarıya port açılmaz (Docker Compose'da `expose` kullan, `ports` değil).

---

## 3. Database & Kullanıcı Verisi Güvenliği

### 3.1 Kimlik doğrulama
- Şifreler **asla plaintext** saklanmaz. **Karar (29.08.2026): Supabase Auth kullanılıyor**,
  dolayısıyla hash'leme, parola sıfırlama ve e-posta doğrulama Supabase'in sorumluluğunda;
  kendi auth katmanımızı yazmıyoruz.
- **RLS zorunlu.** Supabase'in `anon` anahtarı istemciye açıktır ve tasarımı gereği gizli
  değildir; tabloyu koruyan tek şey Row Level Security politikasıdır. **RLS'siz tablo
  oluşturulmaz** — tablo ve politikası aynı migration'da gider. Bu, aşağıdaki 3.2'deki IDOR
  korumasının Supabase tarafındaki karşılığıdır.
- Session token'lar / JWT'ler kısa ömürlü (örn. 15dk access + refresh token deseni).
- Parola sıfırlama linkleri tek kullanımlık ve süreli (15-60dk).
- **Uygulandı (Faz 4):**
  - Parola kuralı en az 8 karakter + küçük harf + büyük harf + rakam + sembol; Supabase
    ayarında zorunlu, arayüzde yazarken canlı gösteriliyor (`frontend/src/lib/password-policy.ts`,
    14.09.2026'da sembol eklendi — istemci kontrolü Dashboard'ın gerçek ayarından geride
    kalmıştı, bkz. kök `CLAUDE.md` ders 19).
  - E-posta bağlantıları (doğrulama, sıfırlama) kısa süreli ve tek kullanımlık (Supabase
    ayarı); access token 15 dakika.
  - Kullanıcı numaralandırması kapalı: yanlış parola ile kayıtsız e-posta aynı mesajı veriyor;
    kayıtlı adresle kayıtta ve parola sıfırlamada da "e-postanızı kontrol edin" deniyor.
  - Açık yönlendirme kapalı: `/auth/callback`'teki `next` yalnızca site içi yolu kabul
    ediyor (`//`, `/\`, kontrol karakteri ve mutlak adres reddediliyor; `safe-redirect.ts`).
  - Parola değiştirme her yolda kanıt istiyor: Hesabım sayfası mevcut parolayı soruyor;
    mevcut parolasız `/auth/yeni-parola` formu yalnızca sıfırlama bağlantısından gelinince
    açılıyor (`/auth/callback`'in yazdığı 10 dakikalık `httpOnly` çerez,
    `frontend/src/lib/password-recovery.ts`). Yalnızca oturuma bakılsaydı açık kalmış bir
    oturum parolayı ele geçirmeye yeterdi.
  - Oturum çerezde (`@supabase/ssr`), token tarayıcıya ve backend adresine hiç açılmıyor;
    vekiller iletiyor.
  - Parola değiştirme mevcut parolayı istiyor; parola sıfırlanınca ve istenirse "tüm
    cihazlardan çıkış" ile diğer oturumlar kapatılıyor.

### 3.2 Yetkilendirme (authorization)
- Her kullanıcı sadece kendi verisine (kendi yüklediği fotoğraflar, projeler, kredi bakiyesi)
  erişebilmeli — endpoint seviyesinde "bu kaynak gerçekten bu kullanıcıya mı ait" kontrolü
  (IDOR — Insecure Direct Object Reference açığına karşı). Örn: `/api/projects/{id}` çağrısında
  `id`'nin `current_user`'a ait olduğu DB seviyesinde doğrulanmalı, sadece giriş yapmış olmak
  yetmez.
- Admin panel endpoint'leri ayrı bir rol kontrolü (`is_admin`) ile korunmalı; role check
  frontend'de değil backend'de yapılmalı.
- Kullanıcının kendisinin düzenleyebildiği veri (Supabase `user_metadata`: ad, şirket adı,
  hesap türü) **hiçbir yetki kararında** kullanılmaz; yalnızca görünüm içindir. Hesap türüne
  göre paketler geldiğinde (Faz 5) plan bilgisi kullanıcının değiştiremeyeceği bir yerde
  tutulmalı.
- Vekiller istemciden gelen kaynak kimliğini backend adresine eklemeden önce doğruluyor
  (`/api/projects/[id]` yalnızca UUID; `../admin` gibi değerler backend'e gitmiyor).

### 3.3 SQL Injection
- ORM (SQLAlchemy) veya parametreli sorgular her zaman kullanılır; string concatenation ile
  SQL asla yazılmaz.

### 3.4 Veri şifreleme
- Hassas alanlar (varsa TC kimlik no benzeri veri — jewelry platformunda muhtemelen
  gerekmeyecek ama fatura bilgisi olabilir) at-rest şifrelenmeli.
- Database yedekleri (backup) şifreli saklanmalı ve erişim kısıtlı olmalı.

### 3.5 Yedekleme
- Otomatik günlük DB backup + R2'ye ayrı bir bucket'ta saklama.
- Backup restore süreci en az bir kez test edilmeli (çoğu ekip bunu atlar ve felaket anında
  backup'ın çalışmadığını öğrenir).

---

## 4. Dosya Yükleme Güvenliği (Bu Proje İçin Özellikle Kritik)

- Yüklenen dosyalar **içerik türüne göre** doğrulanır (sadece dosya uzantısına değil, magic
  byte / MIME type kontrolüne göre) — kötü niyetli bir kullanıcı `.jpg` uzantılı ama içinde
  script olan bir dosya yükleyemez.
- Dosya boyutu sınırı (örn. max 15-20MB) hem frontend hem backend'de kontrol edilir.
- Yüklenen dosyalar **kullanıcı tarafından erişilebilir bir path'e doğrudan yazılmaz** —
  R2'de rastgele/hash'lenmiş dosya adları kullanılır, orijinal dosya adı path traversal
  riski taşıdığı için sanitize edilir.
- Görsel işleme kütüphaneleri (Pillow vb.) güncel tutulmalı — geçmişte image parsing
  kütüphanelerinde RCE (remote code execution) açıkları çıkmıştır.
- R2 bucket'ları **public-read değil**, imzalı URL (presigned URL) ile süreli erişim
  sağlanmalı — özellikle kullanıcı henüz ödeme yapmadan/kredi harcamadan üretilen görseller.
- R2 bucket CORS kuralı yalnızca bilinen frontend origin'lerine (production alan adı +
  `localhost:3000`) ve yalnızca `GET`/`HEAD`'e izin verir; production'da `AllowedOrigins: ["*"]`
  kullanılmaz. CORS yetki vermez — erişim hâlâ imzalı URL'e bağlı — ama editörün tuvale
  çizebilmesi için gerekli. Doğrulama: `backend/scripts/check_r2_cors.py`.

---

## 5. Ödeme Güvenliği (iyzico) & PCI Uyumu

- **Kredi kartı bilgisi asla kendi sunucunuzda saklanmaz veya işlenmez.** iyzico'nun
  hosted checkout / tokenization akışı kullanılır — kart numarası hiçbir zaman sizin
  backend'inize dokunmamalı. Bu sayede PCI-DSS kapsamınız minimuma iner (SAQ-A seviyesi).
- iyzico webhook'ları **imza doğrulaması** (HMAC signature check) ile doğrulanmadan
  işlenmez — sahte webhook çağrısıyla kredi yüklenmesi engellenmeli.
- Webhook endpoint'i idempotent olmalı (aynı ödeme bildirimi iki kez gelirse kullanıcıya
  çift kredi yüklenmemeli).
- Tüm ödeme işlemleri loglanır ama **kart bilgisi loglara asla yazılmaz**.

---

## 6. Gizlilik & KVKK Uyumu (Türkiye Pazarı)

- Kullanıcıların yüklediği jewelry fotoğrafları **ticari sır** niteliğinde olabilir —
  bir kullanıcının verisi başka bir kullanıcı tarafından hiçbir şekilde görülememeli
  (bkz. 3.2 Yetkilendirme).
- KVKK (6698 sayılı kanun) kapsamında Aydınlatma Metni yayımlanır; açık rıza
  yalnızca rızanın uygun hukuki sebep olduğu ayrı amaçlar için alınır.
- Kullanıcı hesabını silme talebinde bulunduğunda verisinin (fotoğraflar, projeler) makul
  bir sürede silinmesi için bir süreç tanımlanmalı ("right to erasure").
  **Faz 5:** `/hesap` → `DELETE /api/account` 202 ile kalıcı talep oluşturur.
  Önce provider iptalleri doğrulanır, ardından R2/Auth silinir. Mali ve kabul
  kayıtlarının kimlik bağlantısı ayrılır; para kayıtları cascade silinmez.
  Aktif ödemesi olan hesabın doğrudan Auth silmesi DB trigger'ıyla engellenir.
  Ödemesiz hesabın panelden silinmesinde R2 temizliği operatör sorumluluğudur.
- **Veri ölçülülüğü (Faz 4):** kayıtta yalnızca ürün için gerekli bilgiler soruluyor (ad,
  soyad, e-posta, hesap türü, şirket adı/türü, şehir, isteğe bağlı telefon); doğum tarihi,
  cinsiyet, T.C. kimlik no ve adres sorulmuyor. Özgün fotoğraf sunucuda saklanmıyor,
  yalnızca sonuç. Ticari e-posta izni zorunlu onaya bağlı değil, ayrı ve isteğe bağlı; hesap
  sayfasından her an geri alınabiliyor.
- **Uygulandı (14.09.2026):** `/kvkk`, `/gizlilik` ve
  `/kullanim-kosullari` yayımlandı. Gösterilen sürümle kayıt metadata'sına
  yazılan sürüm tek sabitten gelir; veritabanı trigger'ı kabul/bildirim kaydını
  sunucu zamanıyla `user_consents` tablosuna ekler. `anon` ve `authenticated`
  bu tabloyu okuyamaz/değiştiremez; migration eski kabul metadata'sını kaynağı
  açıkça `metadata_backfill` olarak taşır. Production gerçek veri sorumlusu
  unvanı/e-postası olmadan build durur; hukukçu son kontrolü hâlâ launch kapısıdır.
- Üçüncü taraf servislere (Sentry, analytics) gönderilen veri minimize edilmeli — hata
  loglarına kullanıcı fotoğrafı veya kişisel veri sızmamalı.
- Gizlilik Politikası ve Kullanım Şartları sayfaları launch öncesi hazır olmalı.

---

## 7. Uygulama Katmanı (OWASP Top 10 Kontrol Listesi)

| Risk | Bu projede karşılığı | Önlem |
|---|---|---|
| Broken Access Control | IDOR (madde 3.2) | Her istekte ownership kontrolü |
| Injection | SQL/command injection | ORM + parametreli sorgu, `subprocess` kullanımında shell=False |
| Sensitive Data Exposure | Kart bilgisi, şifreler | iyzico tokenization, bcrypt/argon2 |
| XXE / Insecure Deserialization | Dosya yükleme | Görsel dosyalarının güvenli parse edilmesi |
| Security Misconfiguration | CORS, debug mode | Production'da `DEBUG=False`, sıkı CORS |
| XSS | Kullanıcı girdisi (proje isimleri vb.) | React'in default escape'i + `dangerouslySetInnerHTML` yasak |
| Insecure Dependencies | npm/pip paketleri | `npm audit`, `pip-audit` CI'da otomatik çalışmalı |
| Insufficient Logging | Şüpheli aktivite | Başarısız login denemeleri, admin işlemleri loglanmalı |
| Unintended File Exposure | `frontend/public/` altındaki **her dosya** internete açıktır ve dağıtıma dahil edilir | Yalnızca yayınlanması *istenen* dosyalar `public/` altında durur. Ham/kaynak/ara dosyalar (yüksek çözünürlüklü orijinaller, notlar, yedekler) `public/` dışında tutulur — Faz 2'de 3,6 MB'lik bir kaynak fotoğraf yanlışlıkla oraya konmuş ve fark edilip taşınmıştı |

---

## 8. Roadmap Entegrasyonu — Hangi Güvenlik Maddesi Hangi Fazda

Güvenlik Faz 7'ye ertelenmez; ilgili faz içinde uygulanır:

- **Faz 0:** `.env`/secrets yönetimi, `.gitignore`, Docker temel sertleştirme
- **Faz 1:** Dosya yükleme validasyonu (madde 4), dosya boyutu limiti
- **Faz 2:** Sunucu tarafı vekil — tarayıcı FastAPI'ye doğrudan bağlanmaz; yükleme
  kısıtları (tür + boyut) vekilde de tekrar uygulanır. Bu, güvenlik sınırının kendisi
  değildir (asıl sınır backend'dir), ama Faz 4/5'te auth ve ödeme anahtarları
  devreye girdiğinde bunların tarayıcıya sızmasını engelleyecek katmanı şimdiden kurar.
- **Faz 3:** R2 presigned URL, path traversal koruması (UUID tabanlı `r2_key`), bucket CORS
  kuralının yalnızca bilinen origin'lere GET/HEAD vermesi (gerçek bucket doğrulaması açık —
  bkz. `CLAUDE.md` açık takip maddesi 2).
  `POST /api/admin/backgrounds` Faz 3'te geçici bir `X-Admin-Secret` paylaşılan secret'ıyla
  korunuyordu (bkz. kök `CLAUDE.md` ders 8); **Faz 4'te kaldırıldı**, yerini Supabase
  oturumu + `admin_users` tablosu aldı.
- **Faz 4:** Şifre hash'leme, JWT/session tasarımı, IDOR koruması (bu fazda en kritik —
  şema yanlış tasarlanırsa sonradan düzeltmek pahalı). **Backend'de yapılanlar:** JWKS ile
  JWT doğrulaması (algoritma karıştırmaya karşı izin listesi, anonim oturum reddi,
  Supabase'de iptal edilen imzalama anahtarının en geç 10 dakikada reddedilmesi),
  `public`'teki her tabloda RLS + `anon`/`authenticated` yetkilerinin geri alınması
  (`alembic_version` dahil), her sorguda sahiplik filtresi ve 404 ile IDOR koruması,
  CORS (2.2), yönetici yetkisinin kullanıcı tarafından değiştirilemeyen bir tabloda
  tutulması. **Frontend'de yapılanlar:** çerezde oturum, token'ı ileten vekiller, açık
  yönlendirme ve kullanıcı numaralandırması koruması, parola kuralı, arka plan kaldırmada
  oturum zorunluluğu, hesap silme (3.1, 3.2, 6). Upload'larda multipart'tan
  önce JWT, toplam gövde sınırı, oturumsuz/geçersiz istekler için IP ve
  doğrulanmış kullanıcı için kayan pencere hız sınırı uygulanıyor — sayaçlar
  Redis'te tutuluyor, **dağıtık** (birden fazla worker/instance aynı sayacı
  paylaşır; PR #13 incelemesinde Faz 7'den öne alındı, bkz. `backend/README.md`
  "Kaynak tüketimi korumaları"). **Redis arızasında davranış uç noktaya göre
  ayrı** (PR #18 incelemesi): para, sağlayıcı geri dönüşü ve webhook yüzeyleri
  fail-CLOSED (sınır kalkmasın), zemin LİSTELEME fail-OPEN (sınırlayıcının
  arızası ürünün çekirdek özelliğini kapatmasın) — gerekçe ve iki yönün testi
  `backend/app/services/billing/limits.py` ile `tests/test_backgrounds_endpoint.py`. Supabase'de access token 15 dakika, parola
  kuralı ve kısa e-posta bağlantı süresi ayarlandı.
  **Açık:** Supabase panelinden elle silinen kullanıcının R2 görselleri otomatik temizlenmiyor.
- **Faz 5:** iyzico webhook imza doğrulama, PCI kapsam netleştirme, idempotency.
  **Yapılanlar:** ödeme callback'i ve zemin listesi dahil bütün public uç
  noktalarda hız sınırı (2.1); proxy arkasında gerçek istemci IP'si; hesap
  silme vekilinde de ödeme mutasyonlarıyla aynı Origin kontrolü (CSRF);
  değişmez dönem snapshot'ı (plan sürümü, provider referansları, tarihler ve
  kota DB trigger'ıyla korunuyor); iade/itiraz kapsamının tahsilatın ait olduğu
  aboneliğe bağlanması; silme kuyruğundaki projenin doğrudan GET'te de
  gizlenmesi (IDOR/veri saklama tutarlılığı); Auth silindikten sonra çöken
  silme işinin PII temizliğini tamamlaması.
- **Faz 6:** Admin rol kontrolü backend seviyesinde (`require_admin`, her
  istekte `admin_users` tablosundan — arayüzün bir düğmeyi gizlemesi
  yetkilendirme sayılmaz); admin eylemlerinin **yalnızca eklemeye açık**
  denetim günlüğü (`admin_audit_log`, DB trigger'ı `UPDATE`/`DELETE`'i
  reddeder); admin uçlarında hız sınırının yönü uca göre seçilir (okuma
  fail-open, kredi/silme/rol fail-closed); geri döndürülemez admin silme
  işleminde kullanıcının e-postasının yazılarak doğrulanması
- **Faz 7:** Penetrasyon testi / güvenlik taraması, dependency audit, HTTPS/HSTS
  son kontrol ve yasal metinlerin hukukçu kontrolü — **launch öncesi son kapı**

---

## 9. Launch Öncesi Son Kontrol Listesi

- [ ] Tüm secrets `.env`'den production secrets manager'a taşındı
- [ ] `DEBUG=False`, stack trace'ler kullanıcıya gösterilmiyor
- [ ] HTTPS zorunlu, HSTS aktif
- [ ] Rate limiting tüm public endpoint'lerde aktif
- [ ] CORS sadece bilinen origin'lere izin veriyor
- [ ] DB ve Redis dışarıya kapalı
- [ ] Backup + restore test edildi
- [x] iyzico V3 webhook imzası + idempotency yerel testleri; gerçek merchant sandbox testi açılış kapısı
- [ ] `npm audit` / `pip-audit` temiz (kritik açık yok)
- [x] KVKK Aydınlatma Metni + Gizlilik Politikası yayında
- [ ] Yasal metinlerde gerçek veri sorumlusu bilgileri ve hukukçu onayı var
- [ ] IDOR testleri yapıldı (başka kullanıcının kaynağına erişim denendi ve reddedildi)
- [ ] Admin panel erişimi role-based ve backend'de doğrulanıyor
- [ ] Resend'de alan adı doğrulandı (SPF/DKIM) ve gönderen adresi kendi alan adına çevrildi (Faz 5'te sandbox aşaması — yalnızca kendi hesabına gönderim — kapatıldı; bu, gerçek müşterilere e-posta gitmesi için son adım — bkz. kök `CLAUDE.md` açık takip maddesi 4)

## Faz 5 uygulama sınırları

Plan, dönem ve mali kayıtlar kullanıcı metadata'sından türetilmez. Plan/mali/kabul
snapshot'ları korunur; tutarlar tam sayı kuruş olarak tutulur. Kart alanları
izole iyzico formunda kalır; backend kart almaz veya loglamaz. Webhook HMAC V3
kontrolünden sonra kalıcı kaydedilir; erişim yalnızca provider detaylarıyla açılır.
Checkout fiyat sürümü ve kabul hash'leri eşleşmelidir. Kota düşümü atomik ve
request-id tekildir. Zemin seviyesi backend'de doğrulanır. Redis billing hız
sınırları ve Next.js Origin kontrolü eklenmiştir.

Hukuk/faturalama/retention onayları ile gerçek merchant/3DS ve alarm izleme
kurulumu üretim açılış koşullarıdır. PCI kapsamı otomatik olarak sertifikalanmış
sayılmaz. Belirsiz iadede otomatik tekrar durur; kanıtlı admin uzlaştırması gerekir.
İşletim ve saklama prosedürü: [ödeme runbook'u](docs/billing-runbook.md).
