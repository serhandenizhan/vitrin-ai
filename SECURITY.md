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

### 3.2 Yetkilendirme (authorization)
- Her kullanıcı sadece kendi verisine (kendi yüklediği fotoğraflar, projeler, kredi bakiyesi)
  erişebilmeli — endpoint seviyesinde "bu kaynak gerçekten bu kullanıcıya mı ait" kontrolü
  (IDOR — Insecure Direct Object Reference açığına karşı). Örn: `/api/projects/{id}` çağrısında
  `id`'nin `current_user`'a ait olduğu DB seviyesinde doğrulanmalı, sadece giriş yapmış olmak
  yetmez.
- Admin panel endpoint'leri ayrı bir rol kontrolü (`is_admin`) ile korunmalı; role check
  frontend'de değil backend'de yapılmalı.

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
- KVKK (6698 sayılı kanun) kapsamında: Aydınlatma Metni ve Açık Rıza metni gerekli
  (kayıt sırasında kullanıcıya gösterilir).
- Kullanıcı hesabını silme talebinde bulunduğunda verisinin (fotoğraflar, projeler) makul
  bir sürede silinmesi için bir süreç tanımlanmalı ("right to erasure").
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
  bkz. `CLAUDE.md` açık takip maddesi 5).
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
  tutulması. **Bekleyen:** Supabase'de kısa access token süresi (3.1) ve parola
  sıfırlama ayarları proje kurulunca yapılacak; R2'deki proje görsellerinin kullanıcı
  silinince temizlenmesi henüz otomatik değil (KVKK, bölüm 6).
- **Faz 5:** iyzico webhook imza doğrulama, PCI kapsam netleştirme, idempotency
- **Faz 6:** Admin rol kontrolü backend seviyesinde
- **Faz 7:** Penetrasyon testi / güvenlik taraması, rate limiting'in tamamı, dependency
  audit, HTTPS/HSTS son kontrol, KVKK metinlerinin yayınlanması — **launch öncesi son kapı**

---

## 9. Launch Öncesi Son Kontrol Listesi

- [ ] Tüm secrets `.env`'den production secrets manager'a taşındı
- [ ] `DEBUG=False`, stack trace'ler kullanıcıya gösterilmiyor
- [ ] HTTPS zorunlu, HSTS aktif
- [ ] Rate limiting tüm public endpoint'lerde aktif
- [ ] CORS sadece bilinen origin'lere izin veriyor
- [ ] DB ve Redis dışarıya kapalı
- [ ] Backup + restore test edildi
- [ ] iyzico webhook imza kontrolü + idempotency test edildi
- [ ] `npm audit` / `pip-audit` temiz (kritik açık yok)
- [ ] KVKK Aydınlatma Metni + Gizlilik Politikası yayında
- [ ] IDOR testleri yapıldı (başka kullanıcının kaynağına erişim denendi ve reddedildi)
- [ ] Admin panel erişimi role-based ve backend'de doğrulanıyor
