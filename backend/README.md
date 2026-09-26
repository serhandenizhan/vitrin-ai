# backend

FastAPI uygulaması, AI inference servisi (BiRefNet) burada yaşıyor. Celery worker'ları
ve arka plan meta verisi Faz 3'te eklenecek.

**Durum:** Faz 1 tamamlandı — `POST /api/remove-background` endpoint'i çalışıyor,
birim testleri yeşil, gerçek mücevher fotoğraflarıyla (HEIC + WhatsApp JPEG) doğrulandı,
Docker build başarıyla derleniyor ve container düzgün başlıyor. Faz 3'ün backend kısmı
(arka plan kütüphanesi: yükleme + listeleme + R2 depolama) da tamamlandı — ayrıntılar
aşağıda ve kök `ROADMAP.md` Faz 3 bölümünde. Ayrıca `GET /api/health` endpoint'i var —
sadece süreç canlılığını doğrular, model yüklü mü diye bakmaz (model ilk çağrıda
gecikmeli yüklenir, health check bunu tetiklerse ilk kontrol ~30-35sn sürerdi).
`backend/Dockerfile`'daki `HEALTHCHECK` bu uç noktayı kullanıyor.
**Faz 4 (backend) tamamlandı:** Supabase JWT doğrulaması, kullanıcı projeleri API'si,
`admin_users` ile gerçek yönetici yetkisi, tüm tablolarda RLS, CORS, hesap silme
(`DELETE /api/account`) ve `POST /api/remove-background`'da oturum zorunluluğu. Gerçek
Supabase projesi 11.09.2026'da kuruldu; migration'lar uygulandı ve RLS canlı projede
doğrulandı. Arayüzle birlikte gerçek Supabase + R2'ye karşı uçtan uca denendi (bkz.
"Kimlik doğrulama ve yetkilendirme").

**`.env` her zaman `backend/.env`'den okunuyor**, uygulama hangi klasörden başlatılırsa
başlatılsın (`app/core/config.py` → `BACKEND_ENV_FILE`). Önceden göreli yol kullanılıyordu
ve repo kökünden başlatılan backend `.env`'yi hiç okumadan açılıp her oturum isteğine 503
dönüyordu (kök `CLAUDE.md` ders 18).

## Yerel çalıştırma (venv ile)

Sistem Python'u (3.14) `torch`/`onnxruntime` ile uyumlu olmayabileceğinden 3.11
kullanın:

```bash
cd backend
python3.11 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env
.venv/bin/uvicorn app.main:app --reload
```

İlk istekte model belleğe yüklenir (~30-35sn); sonraki istekler ~8-15sn sürer
(bkz. kök `CLAUDE.md` — "Bilinen kısıt" bölümü). **CPU inference için en az
12-14GB RAM gerekir.**

## Testler

```bash
.venv/bin/pytest tests/ -v
```

Testler `BackgroundRemovalService`'i mock'lar — gerçek BiRefNet modelini her
test çalıştırmasında indirip inference yapmak pratik değil (ağır kaynak
kullanımı). Gerçek modelle doğrulama ayrı ve manuel yapılır.

Testler gerçek bir Postgres ister (`docker compose up -d postgres`) ve oturum
başında `alembic upgrade head`, sonunda `alembic downgrade base` çalıştırır —
yani bağlandıkları veritabanını **sıfırlar**. Başka bir işin veritabanına karşı
çalıştırmayın; paralel worktree'lerde ayrı bir Postgres açıp `DATABASE_URL` ile
yönlendirin:

```bash
POSTGRES_PORT=5434 docker compose -p <worktree-adi> up -d postgres
DATABASE_URL=postgresql+asyncpg://vitrin_ai:change_me_locally@localhost:5434/vitrin_ai .venv/bin/pytest
```

**`./execute.sh` açıkken dikkat:** varsayılan `DATABASE_URL`, `execute.sh`'ın
kullandığı veritabanıdır. Testler onu sıfırlarsa eşitlenmiş kullanıcılar ve
zeminler gider (bir sonraki `execute.sh` açılışı geri getirir) ve çalışan
backend tablolar yeniden kurulana kadar hata verir. Aynı container'da ayrı bir
veritabanı yeterli (27.09.2026'da 533 test bu yolla geçti):

```bash
docker compose exec -T postgres psql -U vitrin_ai -d vitrin_ai -c "create database vitrin_ai_test"
DATABASE_URL=postgresql+asyncpg://vitrin_ai:change_me_locally@localhost:5432/vitrin_ai_test .venv/bin/pytest
```

Ayrıca gerçek bir **Redis** ister (`docker compose up -d redis`) — yükleme hız
sınırlayıcısı testleri gerçek Redis'e karşı çalışır, mock'lanmaz. Postgres gibi
paralel worktree'lerde ayrı bir porta yönlendirilebilir:

```bash
REDIS_PORT=6380 docker compose -p <worktree-adi> up -d redis
REDIS_URL=redis://localhost:6380/0 .venv/bin/pytest
```

Redis testleri Postgres'inki gibi ağır bir "sıfırlama" koruması gerektirmiyor:
her test kendi rastgele anahtarını kullanıyor (ör. `user:<uuid4>`) ve yazılan
tek şey birkaç saniyelik TTL'li sayaç anahtarları — üzerine yazma ya da veri
kaybı riski yok. Yine de testler bağlanmadan önce `REDIS_URL`'in yerel bir
Redis'e (`localhost`/`127.0.0.1`/`::1`/docker-compose servis adı `redis`)
işaret ettiğini doğruluyor (`tests/conftest.py`).

**Koruma, iki aşama** (`tests/db_safety.py`, yalnızca Postgres için):

1. **Bağlanmadan önce adres:** `DATABASE_URL`'in sunucusu `localhost`, `127.0.0.1`,
   `::1` ya da docker-compose servis adı `postgres` değilse oturum çıkış kodu 3 ile
   durur, uzak sunucuya bağlantı bile açılmaz. Ayrı bir uzak TEST veritabanı
   bilinçli olarak kullanılacaksa (ör. CI) `VITRIN_ALLOW_REMOTE_TEST_DB=1`. PR #12
   incelemesinde eklendi: yalnızca şema kontrolü, `auth` şeması olmayan uzak bir
   Postgres'i "yeni kurulmuş" sanıp sıfırlardı.
2. **Bağlandıktan sonra şema:** bağlanılan veritabanında `auth` şeması varsa ve yerel
uyumluluk katmanının (migration 0002) işaretini taşımıyorsa — yani büyük
olasılıkla Supabase ise — testler hiçbir şeye dokunmadan çıkış kodu 3 ile durur
(`tests/db_safety.py`). `.env`'e Supabase `DATABASE_URL`'i yazıldıktan sonra
yanlışlıkla `pytest` çalıştırmak bu korumadan önce gerçek kullanıcıların hepsini
silerdi; sahte bir Supabase veritabanında birebir gösterildi.

**Faz 4 ve Faz 5 incelemesindeki testlerin tamamı** izole yerel PostgreSQL
(`localhost:5434`) ve Redis (`localhost:6380`) üzerinde çalıştırıldı: **285
test geçti**. Buna hesap, oturum/gövde, DB adres güvenliği, cursor, erken
JWT, hesap değişimi ve dağıtık hız sınırı testleri dahildir; gerçek Supabase
test hedefi olarak kullanılmadı.

Kimlik doğrulama testleri gerçek bir Supabase'e gitmiyor: test anahtarıyla
imzalanmış token'lar üretiliyor ve yalnızca JWKS indirme adımı taklit ediliyor
(`tests/conftest.py` → `tokens`). RLS testleri `anon`/`authenticated` rollerini
`set local role` ile taklit ediyor (`tests/test_rls.py`).

### Yetkilendirme ve IDOR paketi (`tests/test_idor.py`, Faz 7)

Her uç dört sınıftan TAM OLARAK birine atanır: `PUBLIC`, `SESSION` (yalnız
oturum sahibinin hesabında çalışır), `OWNED` (kaynağın kimliği yoldan gelir)
ve `ADMIN`. Rotalar uygulamanın OpenAPI şemasından okunur; **sınıflandırılmamış
yeni bir uç testi kırmızı yakar** — yeni uç eklerken önce sınıfını seçin.
Sınıfa göre otomatik sınananlar:

- `SESSION`/`OWNED`/`ADMIN`: oturumsuz istek 401.
- `ADMIN`: sıradan kullanıcı 403, yönetici yetki kapısını GEÇER (ders 15:
  iki yol birlikte). Uç gerçekten çağrılır; yetkinin decorator'da mı
  imzada mı yazıldığına bakılmaz.
- `OWNED`: başka kullanıcı 404 alır ve kaynak DEĞİŞMEZ, sahibi aynı istekle
  başarılı olur (projeler GET/PATCH/DELETE, checkout görüntüleme/iptal).
- Liste ve toplu silme başka kullanıcıya ulaşmaz; `Idempotency-Key`
  kullanıcıya göre ayrılır (B, A'nın anahtarıyla A'nın saklanan kesimini
  alamaz — hem `reserve()` hem HTTP düzeyinde).

**Paketin kendisi sınandı (26.09.2026):** yedi ayrı bozma denendi ve her biri
yalnız ilgili testi kırmızı yaktı — bir admin ucundan `require_admin`'in
kaldırılması, proje sahiplik filtresinin, checkout görüntüleme ve iptal
sahiplik filtrelerinin kaldırılması, `reserve()`'ün anahtarı kullanıcıya göre
süzmemesi, sonuç yolunun kullanıcıdan bağımsız olması ve sınıflandırılmamış
bir uç eklenmesi. Bozuk kodu hiçbir mevcut uçta BULMADI: 45 ucun hepsi
beklenen yetki davranışını gösteriyor.

### Veritabanı yedeği ve geri yükleme testi (`scripts/backup_database.py`, Faz 7, 27.09.2026)

**Neden bizim işimiz:** Supabase otomatik günlük yedeği yalnız Pro ve üstü
paketlerde alıyor; proje **ücretsiz pakette** — bu betiğin ürettiği yedek
**tek yedek**. (Supabase belgesi, `docs/guides/platform/backups`: ücretsiz
projeler verilerini düzenli dışa aktarıp başka yerde saklamalı.)

```bash
.venv/bin/python scripts/backup_database.py keygen            # bir kez; anahtar .env'e + parola yöneticisine
.venv/bin/python scripts/backup_database.py backup --out-dir ~/vitrin-ai-backups
.venv/bin/python scripts/backup_database.py restore-test ~/vitrin-ai-backups/<dosya>.dump.fernet
```

- **Kapsam:** `public` (21 tablomuz) + `auth` (kullanıcı hesapları).
  Supabase'in yönettiği diğer şemalar yeni projede zaten oluşur.
- **Şifre:** `cryptography` Fernet (AES + HMAC; yanlış anahtar ya da bozuk
  dosya sessizce geçmez). Şifresiz döküm diske HİÇ yazılmaz. Anahtar
  `BACKUP_ENCRYPTION_KEY` (`backend/.env`); **kaybolursa bütün yedekler
  açılamaz — parola yöneticisinde de saklanır.**
- **pg_dump sürümü sunucuyla aynı ana sürüm olmalı** (production Postgres
  17.6 → Docker `postgres:17-alpine`, `BACKUP_PG_IMAGE` ile değişir).
- **Parola `ps`'te görünmez:** bağlantı adresi yalnız sahibinin okuyabildiği
  geçici bir env dosyasıyla Docker'a verilir ve hemen silinir.
- **Yedek depo DIŞINDA** saklanır (betik depo içini reddeder); dosyalar 600,
  klasör 700.

**Geri yükleme testi ne kanıtlıyor:** yedek bellekte açılıp veri tmpfs'te
duran atılabilir bir Postgres 17'ye yüklenir, sonra iki şey kayıtla
(manifest) karşılaştırılır: her tablonun **satır sayısı** ve **şema parmak
izi** — RLS açık tablo, politika, tetikleyici, fonksiyon, indeks, kısıt
sayıları. Parmak izi şart: bu projede güvenlik ve iş kuralları veritabanında
(RLS, `period_snapshot` ve `admin_audit_log` değişmezlik tetikleyicileri);
satırlar tutup bunlar kaybolsa geri yüklenen sistem sessizce korumasız kalırdı.

**Sonuç (27.09.2026, production):** döküm 11,8 sn (190 KB, şifreli 254 KB);
geri yükleme 2,8 sn; 48 tablo, 346 satır birebir; 37 RLS tablo, 2 politika,
10 tetikleyici, 10 fonksiyon, 168 indeks, 222 kısıt birebir; `pg_restore`
hatası yok (boş Postgres'teki "public zaten var" zararsız uyarısı ayrı
tutuluyor). Kontrolün kendisi dört bozmayla sınandı — yanlış anahtar,
değiştirilmiş dosya, eksik tetikleyici, eksik satır — dördü de çıkış kodu 1.
Şifreli dosyada döküm imzası, e-posta ya da tablo adı izi yok.

**Açık (Faz 7.5, kök `CLAUDE.md` açık takip maddesi 8):** günlük otomatik
çalıştırma, ayrı özel R2 bucket'ına yükleme ve saklama süresi.

### Kesim kuyruğu (Faz 7, 27.09.2026)

Yük testinde süreç başına tek eşzamanlı kesim ve fazlasına anında 429 çıktı;
Serhan'ın kararıyla istekler artık reddedilmez, **sıraya girer ve müşteriye
hissettirilmez**. Kesim API'de değil, ayrı bir işçi sürecinde:

| Parça | Görev |
| --- | --- |
| `POST /api/remove-background` | doğrular, kredi AYIRIR, fotoğrafı Redis'e koyar → `202 {job_id, status}` (aynı anahtarın sonucu hazırsa doğrudan PNG) |
| `GET /api/remove-background/jobs/{id}` | sürüyorsa `202 {status}` (sıra numarası YOK), bittiyse PNG, başarısızsa `code` + `retry_safe` |
| `app/services/cutout_queue.py` | Redis kuyruğu; iş kimliği `(kullanıcı, Idempotency-Key)` |
| `app/workers/cutout.py` (`python -m app.workers.cutout`) | modeli bir kez yükler, `MAX_CONCURRENT_INFERENCES` kadar kesimi aynı anda işler; sonuç ÖNCE R2, kredi SONRA; her hata yolunda kredi iade + `retry_safe` |

- **Fotoğraf:** Redis'te en fazla 15 dk, iş bitince silinir, diske/R2'ye
  yazılmaz (KVKK metninde yazılı). İşçi alırken değil bitirince silinir ki
  çöken işçinin işi başka işçiye fotoğrafıyla verilebilsin.
- **Çöken işçi:** nabzı kesilen işçinin işleri sırasını kaybetmeden kuyruğun
  önüne döner; iki denemede bitmeyen ya da fotoğrafı düşen işin kredisi
  iade edilir.
- **Kredi ayırma zaman aşımı 5 → 30 dk:** sırada bekleyen işin kredisi bakım
  işince iade edilip sonucu çöpe gitmesin (eski değerde kırmızı yanan test var).
- **Neden Celery/RQ değil:** ihtiyaç tek bir model kopyasını paylaşan N
  eşzamanlı kesim, kısa ömürlü fotoğraf ve kullanıcıya bağlı iş kimliği;
  RQ işleri varsayılan olarak ayrı süreçte (fork) çalıştırır, her işte modeli
  yeniden yüklemek demekti. ~200 satırlık Redis kuyruğu bu ihtiyacı tam
  karşılıyor ve Redis zaten kurulu.
- **Dürüst sınır:** aynı CPU makinesinde aynı anda N kesim throughput'u
  artırmaz (model bütün çekirdekleri kullanıyor), belleği katlar. Kapasite
  işçi MAKİNESİ sayısıyla ya da GPU'yla (Faz 7.5) artar.
- **Başlatma:** `./execute.sh`, `./execute-supabase.sh` ve VS Code görevi
  işçiyi de açar (`VITRIN_START_WORKER=0` ile kapatılır). İşçi çalışmıyorsa
  kesimler sırada bekler.

**Ölçüm (27.09.2026, tek işçi, 832×1248 foto, 4 istemci × 2 istek):** 8/8
başarılı, **0 × 429** (kuyruktan önce aynı senaryoda 6/8 reddediliyordu);
kesimler sırayla ~11,7 sn'de bir, sıra dahil ortalama 38,5 sn; kesim sürerken
`/api/health` p95 13 ms, `/api/projects` p95 29 ms. **2 işçi bu makinede
ÖLÇÜLMEDİ:** 16 GB'lık Mac'te iki model kopyası belleği tüketip sistemi
kilitledi (kök `CLAUDE.md` ders 31); ölçüm canlı sunucuda (açık takip maddesi 7).

### Yük testi (`scripts/load_test.py`, Faz 7, 26.09.2026)

Yerelde, gerçek model + Postgres + Redis + gerçek JWT doğrulamasıyla. Depolama
bellekte sahte (R2 production ile ortak — yük testi oraya yazmaz); kullanıcılar
ayrı bir TEST veritabanına eklenir, betik uzak veritabanını ve `execute.sh`'ın
`vitrin_ai`'sini reddeder (`tests/test_load_test_script.py`). Kullanım betiğin
başındaki açıklamada. **Ölçüm sınırı:** tek makine (Apple M4, 16 GB), yük
üreticisi sunucuyla aynı CPU'yu paylaşıyor; macOS belleği sıkıştırdığı için
RSS değerleri Linux'taki 12 GB'lık ölçümün yerine GEÇMEZ. Canlı sunucu
ölçümü Faz 7.5'te.

**Arka plan kaldırma** (tek uvicorn süreci, `MAX_CONCURRENT_INFERENCES=1`):

| Senaryo | Sonuç |
| --- | --- |
| 4 istemci × 2 deneme, 832×1248 foto | 2 × 200 (~13 sn), 6 × 429 (**6 ms**, gövde okunmadan) |
| 2 istemci × 3 deneme, 12 MP iPhone foto (3,9 MB) | 3 × 200 (11–16 sn), 3 × 429 (8–10 ms) |
| Inference SÜRERKEN `/api/health` ve `/api/projects` | p95 7–20 ms, hata yok — model iş parçacığında, olay döngüsü tıkanmıyor |
| Sunucu RSS (macOS) | tepe 4,5–5,0 GB (Linux referansı: 12 GB, ROADMAP bölüm 2) |

**Bulgu 1 — kapasite:** bir kesim ~13 sn sürdüğü ve süreç başına aynı anda
yalnız bir inference çalıştığı için, bir kullanıcının işi sürerken gelen
İKİNCİ kullanıcı anında 429 alır ("Şu anda çok fazla istek işleniyor…"); ön
yüz otomatik yeniden denemiyor, kullanıcı tekrar basmak zorunda. Süreç başına
tavan ~4–5 kesim/dakika. Bu bir hata değil, bilinçli koruma (bellek), ama
eşzamanlı ikinci kullanıcı geldiği anda UX sorunu olur. Seçenekler (karar
bekliyor): kısa süreli bekleme kuyruğu, ön yüzde `Retry-After` ile otomatik
yeniden deneme, ya da ROADMAP'teki Celery/RQ kuyruğu. **Yan not:** vekildeki
yoğunluk mesajı 503 için yazılmış; backend yoğunlukta 429 döndüğü için o dal
kullanılmıyor, kullanıcı backend'in kendi Türkçe mesajını görüyor (doğru ama
tutarsız).

**Bulgu 2 — ölçekleme:** model süreç başına bir kez yükleniyor
(`background_removal._get_session`, `lru_cache`). `uvicorn --workers N`, N
ayrı model = N × ~12 GB demektir. API'yi süreç sayısıyla ölçeklemeden ÖNCE
inference ayrı bir işçiye (Celery/RQ) taşınmalı; `Dockerfile` bugün bilinçli
olarak tek süreç çalıştırıyor.

**Okuma uçları** (eşzamanlılık / istek·sn / p95, 10 sn'lik pencereler, hata 0):

| Uç | 10 | 25 | 50 |
| --- | --- | --- | --- |
| `GET /api/projects` | 685 / 50 ms | 459 / 165 ms | 242 / 640 ms |
| `GET /api/backgrounds` | 401 / 62 ms | 368 / 211 ms | 196 / 708 ms |
| `GET /api/subscriptions/me` | 384 / 60 ms | 407 / 195 ms | 207 / 690 ms |
| `GET /api/health` | 1427 / 9 ms | 740 / 101 ms | 730 / 199 ms |

Hiçbir seviyede hata yok. 50'de sunucu CPU'su yalnız %18–34 (tepe) iken
gecikme artıyor: sunucu bir şey BEKLİYOR. Teşhis için havuz 40 bağlantıya
çıkarıldı (`--pool-size`, yalnız yük testinde): proje ve zemin listesi 1,7–2,3
kat hızlandı, abonelik ucu değişmedi — havuz (varsayılan 5 + 10 taşma)
darboğazın BİR parçası. Üretim havuzu DEĞİŞTİRİLMEDİ: doğru boyut Supabase
pooler'ının bağlantı sınırına bağlı, karar Faz 7.5'te canlı ölçümle.

### Hata izleme (`app/core/monitoring.py`, Faz 7)

`SENTRY_DSN` boşken SDK hiç başlatılmaz. Doluyken yalnız 5xx hataları gider
(4xx `HTTPException`'lar gitmez) ve şunlar gitmez: istek gövdesi (yüklenen
fotoğraf, formlar), yerel değişkenler (yığın çerçevesindeki fotoğraf baytları,
token), SDK'nın kullanıcı/IP eklemesi, performans izi. `before_send` ikinci
bir ağ: kimlik bilgisi taşıyan başlıklar (`Authorization`, `Cookie`,
`X-Expected-User-Id`, `Idempotency-Key`, iyzico imzası, `X-Forwarded-For`…),
çerezler, sorgu dizesi ve gövde silinir; kalan her metinde e-posta, JWT,
`Bearer` token'ı ve SQLAlchemy hata mesajındaki `[parameters: …]` maskelenir.
Dış çağrı kırıntılarının URL'sinden sorgu dizesi atılır (Supabase yönetici
aramasında e-posta orada). Kalan tek kimlik: yol ya da R2 anahtarındaki
kullanıcı UUID'si (takma ad, ama kişisel veri — aydınlatma metni şartı bu
yüzden).

**Doğrulama (26.09.2026):** gerçek backend sahte bir Sentry sunucusuna
bağlanıp veritabanı kapalıyken `GET /api/backgrounds` çağrıldı: gerçek 500 tek
olay olarak ulaştı (tür, ortam, yol okunur), çerez/sorgu dizesi silinmiş,
e-posta ve çerez değeri hiçbir yerde yok. `tests/test_monitoring.py`
aynı yolu gerçek SDK ve sahte taşıyıcıyla sınıyor; yerel değişkenlerin
açılması, `before_send`'in kaldırılması, gövde temizliğinin kaldırılması, SQL
parametre maskesinin kaldırılması ve DSN'siz başlatma ayrı ayrı denendi, her
biri testi kırmızı yaktı. **Testler hiçbir zaman gerçek servise yazmaz:**
`tests/conftest.py` `SENTRY_DSN`'i boşaltır (`.env`'de gerçek bir DSN olsa
bile — korumasız hâlde testin kırmızı yandığı görüldü).

### CI ve bağımlılık taraması (Faz 7)

`.github/workflows/ci.yml` her PR'da ve `main`'e her push'ta testleri
`.env` OLMADAN, servis olarak açılan Postgres 16 + Redis 7'ye karşı koşar.
`.env`'siz koşmak bilinçli: CI kurulurken `test_admin_me_requires_a_session`
yerel `.env`'deki `SUPABASE_URL`'e gizlice bağlı çıktı (yerelde yeşil, `.env`'siz
503). Yeni bir test yazarken Supabase'e ihtiyaç varsa `tokens` fixture'ı istenir.

Aynı iş akışında ayrı bir iş olarak `pip-audit -r requirements-dev.txt` ve
`npm audit` koşar (haftada bir de kendiliğinden). **26.09.2026 taraması:**
6 pakette 34 bilinen açık vardı (Pillow 17, Starlette 7, python-multipart 6,
rembg 2, pillow-heif 1, pytest 1); hepsi sürüm yükseltmesiyle kapatıldı
(FastAPI 0.141.1 + Starlette 1.7.0 açıkça pinli, Pillow 12.3.0, pillow-heif
1.8.0, python-multipart 0.0.32, rembg 2.0.85, onnxruntime 1.30.0, pytest 9.1.1,
pytest-asyncio 1.4.0). Davranış değişikliği: python-multipart artık bir
parçanın başlığını ~4 KB ile sınırlıyor, daha uzun dosya adı `400` alır
(`test_rejects_oversized_part_header_with_400_without_calling_service`;
eski sürümde kırmızı yandığı görüldü).

Yerel ortam: `./execute.sh` requirements dosyalarının özetini
`.venv/.requirements.sha256`'da tutar ve dosyalar değişince bağımlılıkları
yeniden kurar. Önceden `.venv` bir kez kurulunca hiç güncellenmiyordu — yeni
pin'ler git'e girse de geliştirici sessizce eski sürümlerle çalışıyordu.

### Kesim kalitesi karşılaştırması (`scripts/compare_cutouts.py`)

Model çıktısını değiştirebilecek her iş (bağımlılık yükseltmesi, model
optimizasyonu) bununla ölçülür. Önce her ortam için ayrı `render`, sonra
`compare`:

```bash
<eski-venv>/bin/python scripts/compare_cutouts.py render --input <foto-klasörü> --out <taban>
<yeni-venv>/bin/python scripts/compare_cutouts.py render --input <foto-klasörü> --out <aday>
.venv/bin/python scripts/compare_cutouts.py compare <taban> <aday> --out <rapor>
```

Rapor yalnız ortalama farkı değil kaybın NEREDE olduğunu da verir: kenar
bandındaki fark (ince zincir/yansıtıcı kenar), üründen kopan ve zeminden
sızan piksel sayısı ile en büyük bağlı parçası (dağınık gürültü mü, tek yerde
bir kopma mı), IoU; ayrıca fark haritası (kırmızı kayıp, mavi sızıntı).
Yön önemli: "kopan" ve "sızan" hep TABANA göre ölçülür.

**Fail-closed (PR #29 Codex incelemesi):** taban ile adayın dosya kümesi
birebir aynı değilse, hiç kesim yoksa ya da bir çiftin boyutu farklıysa araç
rapor yazmadan sıfırdan farklı kodla çıkar. Bütün çiftler hiçbir artefakt
yazılmadan önce doğrulanır; `compare` ve `render` dolu çıktı klasörlerini
reddeder, böylece eski rapor/kesim/fark haritası yeni sonuca karışmaz. Önceden
eksik örnek "atlandı" denip boş raporla başarı dönülebiliyor, yeniden
kullanılan rapor klasöründe de bayat fark haritaları kalabiliyordu. `render`
çıktıyı tam dosya adıyla yazar (`ring.jpg.png`, `ring.heic.png`). Tek
fotoğrafta ısınmış ortalama `null`'dır. Testleri
`tests/test_compare_cutouts.py`.

Fotoğraflar kişisel veri olabileceği için depoda tutulmaz. **Aracın kendisi
sınandı:** kenarı yalnız 2 px aşındırılmış bir kesimde IoU 0,80'e düştü ve
zincirin çevresi kırmızı işaretlendi. **26.09.2026 yükseltmesi:** 6 gerçek ürün
fotoğrafında eski (rembg 2.0.61) ve yeni (2.0.85) maskeler arasında en büyük
alfa farkı 1/255, kopan/sızan piksel 0 — kalite değişmedi.

## R2 CORS

Kompozisyon editörü zemin görsellerini tarayıcıda `crossOrigin="anonymous"`
ile yüklüyor; bucket her frontend origin'i için **GET ve HEAD** izni vermeli.
Kural eksikse hata vermez: editör sessizce gradyan zemine düşer ve dışa
aktarılan görsel zeminsiz iner. Bucket yine public-read değil — CORS yalnızca
tarayıcının imzalı URL yanıtını okuyabilmesini sağlıyor, yetki vermiyor.

**Şu an henüz bir production alan adı yok (10.09.2026 itibarıyla), bu yüzden
kural bilinçli olarak yalnızca `localhost:3000` içeriyor:**

Cloudflare dashboard → R2 → bucket → Settings → CORS Policy:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": [],
    "MaxAgeSeconds": 3600
  }
]
```

**⚠️ PRODUCTION'A DEPLOY EDERKEN:** asıl alan adı belirlendiğinde
`AllowedOrigins` listesine mutlaka eklenmeli
(`["https://<production-alan-adi>", "http://localhost:3000"]`). Eklenmezse
canlıda hata VERMEZ — editör sessizce gradyan zemine düşer ve her kompozisyon
zeminsiz iner; yerelde fark edilmez çünkü `localhost:3000` zaten kuralda.

Doğrulama (gerçek bucket'a karşı, `.env` içindeki R2_* ile):

```bash
.venv/bin/python scripts/check_r2_cors.py http://localhost:3000
# production'a geçince:
.venv/bin/python scripts/check_r2_cors.py https://<production-alan-adi> http://localhost:3000
```

Script önce tanımlı kuralı okur, sonra bucket'taki gerçek bir nesne için imzalı
URL üretip her origin'le GET/HEAD atar ve `Access-Control-Allow-Origin`
yanıtını kontrol eder. Çıkış kodu 0 değilse kural eksiktir.

## Kimlik doğrulama ve yetkilendirme (Faz 4)

**Akış:** tarayıcı oturumu `@supabase/ssr` ile çerezde tutuyor; Next.js vekili
isteği `Authorization: Bearer <access_token>` ile FastAPI'ye iletiyor. Backend
token'ı Supabase'e sormadan projenin genel anahtarlarıyla (JWKS,
`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`, ES256/RS256) doğruluyor:
imza, `exp`/`iat`, `iss`, `aud=authenticated`, `role=authenticated`; anonim
oturumlar reddediliyor. Kod: `app/core/auth.py`.

| Durum | Yanıt |
| --- | --- |
| `SUPABASE_URL` boş | `503` — sessizce açık kalmaz |
| Token yok / geçersiz / süresi dolmuş | `401` + `WWW-Authenticate: Bearer` |
| JWKS'ye ulaşılamıyor | `503` |
| Oturum var ama yönetici değil (admin uç noktası) | `403` |

**Anahtar önbelleği:** JWK set 10 dakika önbellekte tutuluyor; Supabase'de iptal
edilen bir imzalama anahtarı en geç bu süre dolunca reddediliyor (PyJWT'nin
anahtar başına süresiz önbelleği bilinçli olarak kapalı). Bilinmeyen bir `kid`
(anahtar rotasyonu) JWKS'yi yeniden çektiriyor ama en fazla dakikada bir —
rastgele `kid`'li token'larla Supabase'e istek yağdırılıp threadpool
doldurulamasın diye.

**Yönetici yetkisi** Faz 3'teki geçici `X-Admin-Secret` yerine `admin_users`
tablosundan geliyor; her istekte veritabanından kontrol ediliyor. JWT'deki
`user_metadata` (kullanıcı düzenleyebilir) ve `app_metadata` (token
yenilenene kadar bayat) bilinçli olarak kullanılmadı. İlk yönetici Supabase SQL
editöründen eklenir:

```sql
insert into public.admin_users (user_id)
select id from auth.users where email = '<e-posta>';
```

**Yerelde çalıştırırken dikkat:** bu SQL, `auth.users`'ın gerçek verileri
tuttuğu veritabanına karşı çalıştırılmalı. `./execute.sh` ile yerel Docker
Postgres kullanılıyorsa `auth.users` boş bir uyumluluk şimidir (bkz. kök
`CLAUDE.md` → "Sistemi çalıştırma" → "İkinci betik") — gerçek Supabase
girişleriyle hiç ilişkili değildir ve admin/abonelik verisi orada oluşmaz.
Yerelde bu SQL'e gerek yok: `./execute.sh` her açılışta gerçek kullanıcıları
yerel `auth.users`'a aktarır (`scripts/sync_local_auth.py`, `billing_signup`
abonelik satırını açar) ve `backend/.env`'deki `LOCAL_ADMIN_EMAILS` adreslerini
yerelde yönetici yapar. Production'daki zemin satırlarını da yerel
`backgrounds`'a kopyalar (`scripts/sync_local_backgrounds.py`, kaynak
`backend/.env.supabase`, yalnız okunur); görseller zaten ortak R2'de. İki betik
de yalnız yerel şime yazar; gerçek Supabase'e karşı çalıştırılırsa hiçbir şeye
dokunmadan çıkar. R2 ortak olduğu için `execute.sh` backend'i
`R2_SHARED_WITH_PRODUCTION=true` ile açar: yerelde zemin silmek yalnız yerel
satırı siler, canlıdaki dosyaya dokunmaz.

### Kullanıcı projeleri (geçmiş çalışmalar)

`frontend/src/lib/work-history.ts`'in dört fonksiyonunun sunucu karşılığı:

| Uç nokta | İş |
| --- | --- |
| `GET /api/projects?limit=50&cursor=...` | Tek sayfa, en yeni önce; `{items, next_cursor}` (sayfa başına en fazla 100) |
| `POST /api/projects` | Multipart: `result` (PNG), `thumbnail` (PNG/JPEG/WebP, ≤512 KB), `file_name`, `is_mocked`, `duration_seconds` → `201` |
| `GET /api/projects/{id}` | Tek proje |
| `PATCH /api/projects/{id}` | Form, hepsi isteğe bağlı ama en az biri zorunlu: `workflow_status` (`draft`/`completed`), `editor_state` (JSON nesne, ≤20.000 karakter), `file_name` (yeniden adlandırma, kayıttaki kuralla 1-255 karakter, kırpılır; gönderilmeyen alan değişmez — ad değiştirmek durumu ellemez). `completed` `downloaded_at`'i yalnız İLK tamamlanmada doldurur (tamamlanmış çalışmanın taslak kaydı indirme zamanını ezmez), `draft` temizler; `editor_state` gönderilmezse eskisi korunur |
| `DELETE /api/projects/{id}` | `204` |
| `DELETE /api/projects` | Kullanıcının tüm projeleri, `204` |

`POST /api/support-requests` (oturum zorunlu; `kind` `issue`/`suggestion`,
`message` 10–4000 karakter, isteğe bağlı `email`) satırı token'daki kullanıcıya
yazar ve kullanıcı başına **saatte 5** istekle sınırlıdır (`support_limiter`,
fail-open — Redis'in düştüğü an kullanıcının sorun bildirmek isteyeceği andır).

Yanıtlarda görseller süreli imzalı URL (`result_url`, `thumbnail_url`,
`expires_in` = `PROJECT_URL_EXPIRY_SECONDS`).

- **IDOR:** her sorgu `user_id = <token'daki kullanıcı>` filtresi taşıyor;
  başkasının projesi için `403` değil `404` dönüyor (varlığını doğrulamamak için).
- **Hesap-değişimi yarışı:** POST/DELETE mutasyonları işlemi başlatan tarayıcı
  kullanıcısını `X-Expected-User-Id` ile taşır. JWT'deki doğrulanmış kullanıcı
  farklıysa `409`; A'nın bekleyen sonucu B'nin hesabına yazılamaz.
- **R2 anahtarı:** `projects/<user_id>/<uuid>/result.png` — kullanıcının verdiği
  dosya adı anahtara hiç girmiyor (path traversal koruması), yalnızca
  görüntüleme metni olarak saklanıyor.
- **Sıra:** önce R2, sonra veritabanı; ikinci yükleme patlarsa ilki geri
  siliniyor. Veritabanı yazımı başarısız olursa da yüklenen görseller geri
  siliniyor; Supabase'den silinmiş ama token'ı hâlâ geçerli bir kullanıcının
  kaydı (FK ihlali) `500` değil `401` dönüyor — Supabase kullanıcı silmede
  token'ları iptal etmiyor. Silmede önce satır siliniyor, R2 silmesi başarısız
  olursa nesne yetim kalıyor ve log'a yazılıyor (kullanıcıya hata dönmüyor).
- **Süre:** `duration_seconds` sonlu ve negatif olmayan bir sayı olmalı. `inf`
  hem route'ta (`422`) hem veritabanı kısıtında reddediliyor: JSON'a
  çevrilemediği için kaydedilseydi kullanıcının proje listesi her istekte `500`
  dönerdi. Postgres'te `'NaN' >= 0` doğru olduğu için kısıt `< 'Infinity'` ile
  ikisini birden eliyor.
- **Bilinen sınır:** sonuç PNG'si `MAX_FILE_SIZE_MB` (20 MB) ile sınırlı ve tüm
  istek `MAX_REQUEST_BODY_BYTES` içinde kalmalı. 20 MB'lık bir JPEG'den çıkan
  saydam PNG bundan büyük olabilir; bu durumda `413` döner.
- **KVKK:** kullanıcı Supabase'den silinince `projects` ve `admin_users`
  satırları `ON DELETE CASCADE` ile gidiyor. Kullanıcı hesabını **arayüzden**
  silerse R2 görselleri de siliniyor (aşağıdaki "Hesap silme"); Supabase panelinden
  elle silinen bir kullanıcının R2 nesneleri ise hâlâ otomatik temizlenmiyor.

### Hesap silme

`DELETE /api/account` (oturum + gövdede hesap e-postası) artık **202 pending**
döner. Kalıcı worker önce tüm provider aboneliklerini iptal eder, ardından R2
öneklerini ve Supabase Auth kullanıcısını siler. Belirsiz ödeme/iptal sonucu
çözülmeden hesap silinmez. Finansal ve kabul kayıtları cascade silinmez;
kimlik bağlantısı ayrılır. Ayrıntı ve retry: [ödeme runbook'u](../docs/billing-runbook.md).

**Gizli anahtar** RLS'i atlayan tam yetkili bir anahtar: yalnızca backend'de, hata
mesajlarına ve loglara hiç yazılmıyor (testle korunuyor). Yeni `sb_secret_...`
anahtarları yalnızca `apikey` başlığıyla, eski `service_role` JWT'si ek olarak
`Authorization` ile gönderiliyor.

### Arka plan kaldırmada oturum

`POST /api/remove-background` Faz 4'te **oturum istiyor** (ürün kararı, 12.09.2026):
`EarlyAuthenticationMiddleware` token'ı multipart gövdenin ilk baytından önce
doğruluyor; geçersizse `401` ile gövde okunmadan ve BiRefNet'e ulaşılmadan
reddediliyor. Aynı erken katman doğrulanmış kullanıcı hız sınırını uygular;
Next.js vekili de oturumu kendi gövdesini okumadan kontrol eder.

### Veritabanı erişim modeli ve RLS

Backend Postgres'e tablo **sahibi** olarak bağlanıyor ve RLS onu etkilemiyor;
kullanıcı verisinin birinci koruması yukarıdaki sahiplik filtresi. RLS ikinci
katman: Supabase'in `anon` anahtarı herkese açık ve Data API (PostgREST)
tablolara ulaşabiliyor. Bu yüzden (migration 0003 ve 0004):

- `public` şemasındaki **her** tabloda RLS açık — `alembic_version` dahil
  (varsayılan grant'lerin olduğu bir projede `anon` ona yazabilirdi).
- `anon` ve `authenticated` rollerinin hiçbir tabloda yetkisi yok (`revoke all`).
  Supabase 28.04.2026'dan beri yeni tabloları Data API'ye otomatik açmıyor;
  eski projelerdeki varsayılan grant'lere karşı yine de açıkça geri alınıyor.
- `projects` için yalnızca "kendi satırını oku/sil" politikaları var (tablo
  ileride Data API'ye açılırsa geçerli olacak kurallar). **INSERT/UPDATE
  politikası bilinçli olarak yok:** istemci kendi satırına başka birinin R2
  anahtarını yazabilir ve backend o görsel için imzalı URL üretirdi.
- `admin_users`, `backgrounds` ve `user_consents` için politika yok — tam ret.
- `user_consents`, kayıt metadata'sındaki sürümü trigger ile sunucu zamanında
  kaydeder. Migration öncesi kullanıcılar `metadata_backfill` kaynağıyla
  taşınır; istemci rollerinin tablo üzerinde hiçbir yetkisi yoktur.
- `tests/test_rls.py`, `public`'teki her tablonun RLS'li olduğunu ve istemci
  rollerinin hiçbir yetkisi olmadığını genel olarak doğruluyor: RLS'siz yeni
  bir tablo eklenirse test kırmızı yanar.

**Yerel uyumluluk katmanı (migration 0002):** düz Postgres'te Supabase'in
`auth` şeması, `auth.uid()` ve `anon`/`authenticated` rolleri yok. 0002 bunları
yalnızca YOKSA oluşturuyor; Supabase'de hiçbir şey yapmıyor. Downgrade yalnızca
kendi işaretlediği şemayı siliyor, Supabase'in `auth` şemasına dokunmuyor.

**Supabase'e bağlanırken:** `DATABASE_URL` için doğrudan bağlantıyı ya da
**session** pooler'ı (5432) kullanın; transaction pooler (6543) asyncpg'nin
prepared statement'larıyla uyumsuz.

### CORS

`CORS_ALLOWED_ORIGINS` (virgülle ayrılmış) dışındaki origin'lere izin
verilmiyor; `*` ve yol içeren değerler uygulama başlarken reddediliyor
(`SECURITY.md` 2.2). Yöntemler `GET/POST/DELETE`, başlıklar
`Authorization/Content-Type`; kimlik çerezle değil başlıkla taşındığı için
`allow_credentials` kapalı. Bugünkü asıl istemci Next.js vekili (sunucudan
sunucuya, CORS gerektirmez); bu katman tarayıcıdan doğrudan erişilen her durum
için sınırı baştan çiziyor.

## Zemin kütüphanesi toplu yükleme (17.09.2026)

Zemin yönetim paneli Faz 6'da; ilk kütüphane (93 zemin) o panel olmadan
`scripts/upload_backgrounds.py` ile yüklendi (Kaan'ın onayıyla öne alınan iş).

- **Ne yapar:** her görseli yönetici yükleme ucuyla aynı `validate_upload`
  kontrollerinden geçirir, aynı çözünürlükte JPEG %92'ye çevirir (93 zemin 225 MB → 75 MB),
  ~480 px önizleme üretir, önce R2'ye (`backgrounds/<id>.jpg` ve
  `backgrounds/thumbs/<id>.jpg`) sonra `backgrounds` tablosuna yazar. Yükleme ya da satır
  yazma yarıda kalırsa o ana kadar yüklenen nesneleri geri siler (önizleme yüklemesi
  patladığında ana görselin yetim kalması PR #18 incelemesinde bulundu).
  Manifestteki dosyayı tekrar yüklemez.
- **Yeniden çalıştırma güvenliği manifestten DEĞİL, kimlikten gelir:** zemin kimliği
  kaynak dosya adından türetiliyor (UUIDv5, `background_id_for`). Manifest ile DB
  commit'i arasında süreç ölse bile yeniden çalıştırma aynı kimliği ve aynı R2
  anahtarını üretir; içerik aynıysa yükleme hiç tekrarlanmaz, var olan satır tekrar
  eklenmez. Rastgele UUID ile bu pencerede kalan bir çökme aynı görsel için ikinci bir
  kayıt ve ikinci bir nesne çifti üretiyordu (`tests/test_upload_backgrounds_script.py`).
- **`--batch` ve içerik kontrolü — yalnız dosya adı KALICI bir kimlik değildir.**
  Başka bir klasörde aynı adı taşıyan farklı bir görsel aynı kimliği üretir; kontrolsüz
  bırakılsa ikinci çalıştırma var olan zeminin nesnesini sessizce ezer ve kategori/baskı
  uyarısı eski görsele ait kalırdı (PR #18 ikinci inceleme turunda bulundu). İki katman:
  (1) yeni parti yüklerken `--batch <kalıcı-parti-adı>` verilir, kimlik ondan da türer —
  parti adı verilmediğinde kimlik ilk kütüphaneyle bire bir aynı kalır; (2) kimlik zaten
  varsa R2'deki içerik karşılaştırılır, **farklıysa betik durur** (fail-closed) ve hangi
  seçeneği kullanacağını söyler. Bilinçli değiştirme için `--allow-overwrite`.
- **Veritabanı yapısı değişmez:** kategori ve baskı uyarısı `--catalog-out` ile
  `frontend/src/lib/background-catalog.ts`'e yazılır.
- **Güvenlik kilidi:** gerçek yükleme `--yes` olmadan çalışmaz; önce `--dry-run` hiçbir şey
  yüklemeden bütün dosyaları kontrol eder. Betik gerçek `.env`'i (Supabase + R2) kullanır.
- **Önizleme sözleşmesi:** `GET /api/backgrounds` her kayıt için `thumbnail_url` döner;
  anahtar zeminin anahtarından türetilir (`app/services/background_images.py`), DB'de ayrı
  alan yoktur. `POST /api/admin/backgrounds` da önizlemeyi aynı anahtara yükler.

```bash
python scripts/upload_backgrounds.py --source "<klasör>" --plan plan.json --manifest manifest.json --dry-run
python scripts/upload_backgrounds.py --source "<klasör>" --plan plan.json --manifest manifest.json --yes
# Yeni bir parti: kalıcı ad alanı verin (aynı dosya adının çakışmasını önler)
python scripts/upload_backgrounds.py --source "<klasör>" --plan plan.json --manifest manifest.json --batch 2026-10-sonbahar --yes
python scripts/upload_backgrounds.py --manifest manifest.json --catalog-out ../frontend/src/lib/background-catalog.ts
```

**Stüdyodaki sıra (19.09.2026):** kategori içinde zeminler düzden karmaşığa
dizilir. Sıra `scripts/rank_backgrounds.py` ile üretilir: R2'deki her önizlemenin
kenar şiddetini ölçer ve `frontend/src/lib/background-order.ts`'e yazar. Salt
okumadır (R2'ye/DB'ye yazmaz). Yeni zemin yüklendikten sonra yeniden çalıştırın;
sırada olmayan zemin kategorisinin sonuna düşer.

```bash
python scripts/rank_backgrounds.py --show
```

## Docker

```bash
docker build -t vitrin-ai-backend .
docker run -p 8000:8000 --env-file .env vitrin-ai-backend
```

Container root olmayan bir kullanıcıyla (`appuser`) çalışır.

**GEÇİCİ kısıt — migration'lar container içinden çalışmıyor:** `Dockerfile`
sadece `app/` dizinini image'a kopyalıyor; `alembic/` ve `alembic.ini` image'a
dahil değil ve container'ın başlatma adımında bir migration adımı yok. Yani bu
image'dan çalışan bir container **kendi migration'larını çalıştıramaz** —
`backgrounds` tablosunun (ve gelecekteki tabloların) oluşması hâlâ bir
geliştiricinin tam bir checkout'tan hedef veritabanına karşı elle
`alembic upgrade head` çalıştırmasına bağlı; bu adım deploy'dan önce veya
deploy ile birlikte, ayrı olarak yapılmalı. Bu bilinçli bir kısayol —
Dockerfile'ı/deploy sürecini yeniden yapılandırmak bu PR'ın kapsamı dışında
tutuldu, sessizce bırakılmadı (bkz. kök `CLAUDE.md` ders 8).

**Not:** Yerelde Docker Desktop'a ayrılan bellek 12-14GB'ın altındaysa gerçek bir
inference isteği container'ı OOM ile kill eder (`exitcode=137`) — bu bir kod
hatası değil, yukarıdaki RAM kısıtının doğal sonucu. Docker Desktop'ın bellek
limitini (Settings → Resources) artırın veya production'da yeterli RAM'li bir
sunucu/instance seçin.

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `MAX_FILE_SIZE_MB` | `20` | Yükleme boyutu sınırı (dosya içeriği) |
| `MAX_CONCURRENT_INFERENCES` | `1` | Faz 7'den beri: bir kesim İŞÇİSİNİN aynı anda işlediği kesim sayısı (tek model kopyasını paylaşır). Aynı CPU'da >1 hızlandırmaz, belleği artırır |
| `MAX_CONCURRENT_UPLOADS` | `4` | API'nin aynı anda ayrıştırdığı yükleme sayısı (bellek koruması); fazlası 429 — kesim sırası değil |
| `CUTOUT_QUEUE_MAX_JOBS` | `50` | Kuyruk üst sınırı (bekleyen fotoğraflar Redis belleğinde, 50 × ≤20 MB). Aşılırsa `503 queue_busy` + `Retry-After: 30`; ön yüz sessizce bekleyip yeniden dener |
| `CUTOUT_QUEUE_PREFIX` | `cutout` | Redis anahtar öneki; API ve işçi AYNI olmalı. Yük testi kendi önekini kullanır |
| `MAX_IMAGE_PIXELS` | `40000000` | Kabul edilen maksimum piksel sayısı (decompression-bomb koruması) |
| `MAX_REQUEST_BODY_BYTES` | boş (otomatik: `MAX_FILE_SIZE_MB` + 64KB) | Toplam istek gövdesi sınırı (multipart zarf dahil); ayrıca, açıkça override edilebilir |
| `UPLOAD_RATE_LIMIT_WINDOW_SECONDS` | `60` | Upload hız sınırının kayan pencere süresi |
| `UPLOAD_IP_RATE_LIMIT_REQUESTS` | `120` | Oturumsuz/geçersiz-token denemeleri; process/IP/pencere |
| `UPLOAD_USER_RATE_LIMIT_REQUESTS` | `30` | Doğrulanmış kullanıcı başına upload; process/pencere |
| `REDIS_URL` | `redis://localhost:6379/0` | Hız sınırlayıcı sayaçlarının tutulduğu Redis (yerelde `docker-compose.yml`'deki Redis'e işaret eder) — birden fazla worker/instance aynı sayacı paylaşır. Redis'e ulaşılamadığında davranış uç noktaya göre AYRI: para/webhook yüzeyleri ve admin yazma uçları fail-closed; zemin listeleme, admin okuma uçları ve destek formu fail-open (bkz. `app/services/billing/limits.py`) |
| `REMBG_MODEL_NAME` | `birefnet-general` | Kullanılan segmentasyon modeli |
| `DATABASE_URL` | `postgresql+asyncpg://vitrin_ai:change_me_locally@localhost:5432/vitrin_ai` | Postgres bağlantı dizesi (yerelde `docker-compose.yml`'deki Postgres'e işaret eder) |
| `SUPABASE_URL` | boş | Supabase proje adresi (`https://<ref>.supabase.co`). Token'ların `iss`'i ve JWKS adresi buradan türetiliyor. Boşsa oturum gerektiren uç noktalar `503` döner. Faz 3'teki `ADMIN_SECRET` kaldırıldı |
| `SUPABASE_JWT_AUDIENCE` | `authenticated` | Beklenen `aud` değeri |
| `SUPABASE_LEGACY_JWT_SECRET` | boş | Yalnızca JWKS'ye geçmemiş eski projeler için HS256 secret'ı. Yeni projelerde boş kalmalı |
| `SUPABASE_SECRET_KEY` | boş | Supabase gizli sunucu anahtarı (`sb_secret_...`; Dashboard → Settings → API Keys → Secret keys). Hesap silme **ve** Faz 6 admin panelinin kullanıcı listesi/detayı için gerekli; RLS'i atlar, frontend'e asla yazılmaz. Boşsa `DELETE /api/account` ve `GET /api/admin/users` hiçbir şeye dokunmadan `503` döner |
| `LOCAL_ADMIN_EMAILS` | boş | **Yalnız yerel geliştirme.** `./execute.sh`'ın kullanıcı eşitlemesi (`scripts/sync_local_auth.py`) bu virgüllü e-postaları yerel `admin_users`'a ekler. Uygulama okumaz, production'da anlamı yoktur |
| `R2_SHARED_WITH_PRODUCTION` | `false` | **Yalnız yerel geliştirme.** `true` iken `DELETE /api/admin/backgrounds/{id}` yalnız veritabanı satırını siler, R2 nesnelerine dokunmaz — yerel zemin satırları production'dan kopyalandığı ve bucket ortak olduğu için. `execute.sh` kendisi `true` verir, `.env.example`'da da `true`. **Production'da `false` olmalı**, yoksa silinen zeminlerin dosyaları bucket'ta sahipsiz kalır |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | Virgülle ayrılmış origin'ler; `*` ve yollu değerler reddedilir. Production alan adı belli olunca eklenmeli |
| `PROJECT_URL_EXPIRY_SECONDS` | `3600` | Proje görsellerinin imzalı URL süresi; yanıtta `expires_in` olarak da dönüyor |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` | boş | Cloudflare R2 kimlik bilgileri. Dördü de dolu olmadan R2 client'ı oluşturulmaz: eksik ayarları adlarıyla listeleyen bir `R2ConfigurationError` fırlatılır. Yalnızca gerçekten R2'ye dokunan yollar etkilenir: sunucu ayağa kalkar, boş bir veritabanında `GET /api/backgrounds` hiç client oluşturmaz. **Ama Faz 5'ten beri `POST /api/remove-background` da R2 istiyor** (idempotency sonuç deposu) ve ayarlar eksikse inference'a girmeden `503 result_storage_unavailable` döner — yani arka plan kaldırmayı yerelde denemek için de dört ayar gerekli |
| `BACKGROUND_URL_EXPIRY_SECONDS` | `3600` | `GET /api/backgrounds` presigned URL geçerlilik süresi. Aynı değer yanıtta `expires_in` alanı olarak da dönüyor — istemci yenileme zamanını buradan öğrenir, kendi tarafına sabitlemez |
| `TRUSTED_PROXY_IPS` | boş | Virgülle ayrılmış, GÜVENİLEN ters proxy adresleri. `X-Forwarded-For` yalnızca bağlantı bu listedeki bir adresten geliyorsa okunur; boşken başlık hiç okunmaz (sahte başlıkla hız sınırı kovası değiştirilemez). Uvicorn'un `--forwarded-allow-ips` değeriyle aynı liste olmalı |
| `SENTRY_DSN` / `SENTRY_ENVIRONMENT` / `SENTRY_TRACES_SAMPLE_RATE` | boş / `local` / `0` | Hata izleme (Faz 7, `app/core/monitoring.py`). **DSN boşken izleme tamamen kapalı.** Sentry protokolü: sentry.io (AB bölgesi) ya da kendi barındırılan GlitchTip. Production'da açmadan önce sağlayıcı KVKK aydınlatma metnine alıcı olarak eklenmeli. Testler bu değeri her zaman boşaltır |
| `RESEND_API_KEY` / `RESEND_BASE_URL` / `BILLING_EMAIL_FROM` | boş / `https://api.resend.com` / boş | "Ödemeniz alınamadı, kartınızı güncelleyin" e-postası. **Ücretli checkout'un açılış koşuludur**: eksikse `BILLING_CHECKOUT_ENABLED=true` olsa bile satın alma 503 döner — kullanıcıya vaat edilen 3 günlük grace penceresinin tek uyarısı bu e-posta. Gönderim yine de yapılamazsa `billing_alerts`'e `dunning_email_not_sent` yazılır; action başarılı sayılmaz, sınırlı retry/manual inceleme için açık kalır. Gönderim isteği `provider_actions.id`'yi Resend'e `Idempotency-Key` başlığıyla taşır: timeout sonrası tekrar deneme çift e-posta göndermez |

Frontend'in yükleme kısıtları (`ALLOWED_CONTENT_TYPES` / `MAX_FILE_SIZE_MB`) bu
değerlerle elle senkron tutulmalı (bkz. kök `CLAUDE.md`). Karşılığı Faz 2'de
`frontend/src/lib/upload-constraints.ts` içinde yazıldı — buradaki bir değer
değişirse o dosya da güncellenmeli.

Desteklenen formatlar: JPEG, PNG, WebP, HEIC/HEIF.

## Kaynak tüketimi korumaları

`POST /api/remove-background` Faz 4'ten beri **oturum istiyor** (bkz. "Arka plan
kaldırmada oturum"); Faz 5'te kredi kontrolü atomik dönem rezervasyonuyla uygulanır. Oturumdan bağımsız olarak
kaynak tüketimini sınırlayan beş katman var:

1. **Erken hız sınırı** — `UploadRateLimitMiddleware` oturumsuz/geçersiz
   token denemelerini IP ile; `EarlyAuthenticationMiddleware` doğrulanmış
   kullanıcıları `sub` ile kayan pencerede sınırlar. Aşım gövde okunmadan
   `429` + `Retry-After` döner. Sayaçlar Redis'te (`app/services/rate_limit.py`,
   `REDIS_URL`) — **dağıtık**: birden fazla worker/instance aynı anahtarı
   paylaşır. Faz 7'ye bekletilen "dağıtık rate limiting" maddesiydi, PR #13
   incelemesinde öne alındı; önceden process içi bellekteydi ve her worker
   kendi sayacını tuttuğu için gerçek limit worker sayısıyla çarpılıyordu.
2. **Erken JWT** — korumalı üç POST uç noktasında token multipart parser'ın
   ilk `receive()` çağrısından önce doğrulanır; 401/503 yanıtı gövdeyi tüketmez.
3. **`BodySizeLimitMiddleware`** (`app/middleware/body_size_limit.py`) — saf
   ASGI middleware, `receive()` akışını sararak toplam istek gövdesi
   `MAX_REQUEST_BODY_BYTES` sınırını aşarsa Starlette'in multipart parser'ı
   gövdeyi tamamlamadan `413` döner. Bu sınır ayrı, açıkça yapılandırılabilir
   bir ayardır (`max_request_body_bytes`, env `MAX_REQUEST_BODY_BYTES`);
   verilmezse `max_file_size_mb + 64KB` (multipart zarf overhead payı) olarak
   otomatik hesaplanır. Bu, uygulama-seviyesi bir yedektir — en erken/ucuz red
   reverse proxy'de (`SECURITY.md` 2.3) olmalı.
4. **Piksel sınırı** (`app/validation/upload.py`) — `MAX_IMAGE_PIXELS`, küçük
   byte boyutlu ama devasa çözünürlüklü ("decompression bomb") görselleri
   reddeder; PIL'in kendi `Image.MAX_IMAGE_PIXELS` global'ine güvenilmiyor.
   Görsel decode/verify aşamasında PIL'in fırlatabileceği tüm istisnalar
   (`SyntaxError`, `struct.error` vb. dahil — sadece `OSError`/
   `UnidentifiedImageError` değil) yakalanıp `UploadValidationError`'a çevrilir;
   bozuk/kasıtlı olarak bozulmuş dosyalar 500 yerine her zaman 400 üretir.
5. **`EndpointAdmissionLimiterMiddleware`** (`app/middleware/admission_limiter.py`)
   — saf ASGI middleware, yalnızca `POST /api/remove-background`'a özgü.
   `InferenceCapacityLimiter`'ı (`app/services/concurrency.py`,
   `anyio.CapacityLimiter` tabanlı, gerçek non-blocking sözleşme) **multipart
   parser çağrılmadan önce**, en dış middleware katmanında uygular; kapasite
   doluysa istek parser'a/route'a hiç ulaşmadan beklemeden anında `429` alır.
   İzin, downstream işlem (parse + validation + inference) tamamen bitene
   kadar — başarı, hata veya iptal fark etmeksizin — tutulur. **Sürece/worker'a
   özgüdür** — çoklu worker dağıtımında toplam kapasite `worker_sayısı ×
   MAX_CONCURRENT_INFERENCES` olur; kalıcı, süreçler-arası bir sınır için
   Celery/RQ + Redis kuyruğuna geçmek gerekir (bu PR'ın kapsamı dışında).

## Ödemeler ve kredi (Faz 5)

Kurulum, tüm açılış kapıları ve operasyon prosedürleri:
[ödeme runbook'u](../docs/billing-runbook.md). Migration `0005`; yeni tabloların
RLS/grant kısıtları aynı migration'dadır. İş kuralları `app/services/billing`,
HTTP sözleşmesi `app/api/routes/billing.py` içindedir. PostgreSQL kalıcı kuyrukları
`deploy/billing-maintenance.timer` işletir; ayrıca Celery gerektirmez.
`POST /api/remove-background` UUID `Idempotency-Key` ister. **Anahtar isteği
değil İŞİ tanımlar** ve kredi anahtar başına yalnızca bir kez tüketilir:

- başarılı PNG, `results/<user_id>/<request_id>.png` altında **geçici bir R2
  nesnesi** olarak saklanır; `usage_reservations` satırı bu anahtarı ve son
  kullanma zamanını tutar (`RESULT_RETENTION`, **24 saat**);
- aynı `Idempotency-Key` tekrar gelirse **inference hiç çalışmaz**, saklanan
  PNG döner, ikinci kredi harcanmaz. Yanıtı ağda kaybolan iş böylece
  kurtarılabilir olur;
- ilki hâlâ sürüyorsa ikinci istek `409 request_in_progress` alır (iki hızlı
  tıklama iki kredi açamaz);
- iş kesin başarısız olup kredi iade edildiyse (`released`) aynı anahtar yeni
  bir denemeye açılır — o mantıksal iş henüz tamamlanmadı;
- saklama süresi dolduysa `request_already_processed` döner ve bu bilinçli
  olarak **`retry_safe` DEĞİLDİR**: istemcinin kendiliğinden yeni anahtara
  geçip ikinci krediyi yakmaması için.

Sıra önemli: sonuç **önce saklanır, sonra kredi tüketilir**. Tersi olsaydı
saklama adımında çöken bir süreç krediyi harcanmış ama sonucu yok bırakırdı.

**Sonuç deposu bir ön koşuldur.** İstek, R2 yapılandırılmamışsa inference'a
hiç girmeden `503 result_storage_unavailable` döner; yükleme başarısız olursa
kredi iade edilir ve yine aynı kod döner. Belirsiz bir sonucu yeniden
inference'a bağlamak, aynı krediyi ikinci kez yakma riski demekti. **Yerel
geliştirmede de R2 ayarları gerekiyor** (`R2_*`); yalnız arayüzü denemek için
`frontend/.env.local` içindeki `USE_MOCK_BACKEND=true` kullanılabilir.

Süresi dolan sonuçları bakım turu (`purge_expired_results`) R2'den siler; DB
kaydı yalnız nesne gerçekten silindikten sonra temizlenir, silme başarısız
olursa bir sonraki turda tekrar denenir. Hesap silmede `projects/<uid>/` ile
birlikte `results/<uid>/` öneki de kaldırılır.

**Hata yanıtlarında `retry_safe`:** kredinin hiç tüketilmediğini ya da iade
edildiğini backend AÇIKÇA bildirir. İstemci yeni bir idempotency anahtarına
yalnızca bu bayrakla geçer; bayrak yoksa anahtar korunur.

**Zemin listelemesi kota kapısı değildir.** `GET /api/backgrounds` oturumluysa
`background_tier()`'ı çağırır ama kota/abonelik hatasında (402/403/409) listeyi
BOŞALTMAZ, `basic` seviyeye düşer; yalnız kimlik hatası (401) gerçek hatadır.
Asıl kapı rezervasyondur.

**`past_due` erişimi anında kesmez:** `past_due_access_until` bir kez ve tam 3
gün sonrasına yazılır, o süre boyunca MEVCUT dönemin kalan kotası kullanılır
(yeni dönem/kredi yok), sonra abonelik `expired` olur. Geçişte kullanıcıya
kalıcı kuyruktan bir kez "kartınızı güncelleyin" e-postası gider.

**İade/itiraz kapsamı dönem snapshot'ından belirlenir**
(`billing_transactions.period_id` → `subscription_periods.provider_subscription_reference`):
eski bir aboneliğin tahsilatını iade etmek kullanıcının güncel paketini kapatmaz.

Yeni billing testleri gerçek izole PostgreSQL kullanır, iyzico/R2 yan etkileri
taklit edilir. `subscription_periods` DB seviyesinde değişmez olduğu için
testler zamanı geriye alırken korumayı yalnızca `tests/test_billing.py`
içindeki `backdate_period` yardımcısında ve yalnız o işlem süresince kapatır.

## Admin API (Faz 6)

Migration `0007`; iki yeni tablonun RLS/grant kısıtları aynı migration'dadır.
HTTP sözleşmesi `app/api/routes/admin.py`, denetim yazımı
`app/services/admin_audit.py`. Her uç `require_admin`'e bağlı — rol kontrolü
backend'de ve her istekte `admin_users` tablosundan yapılır.

| Uç | Ne yapar |
|---|---|
| `GET /api/admin/me` | Oturumdaki kullanıcı yönetici mi: `{is_admin: bool}` (Faz 6, Kaan — `/admin` arayüzü için). **`require_admin`'e bağlı DEĞİL ve 403 dönmez**: sıradan kullanıcı da hata değil `false` alır, arayüz "Yönetim paneli" bağlantısını buna göre gösterir. Yetkilendirme sayılmaz — diğer her uç kendi kontrolünü yapar. Rol her istekte veritabanından okunur (yetki geri alınınca aynı token'la bir sonraki istek `false`) |
| `GET /api/admin/users` | Supabase Auth'taki sayfayı kendi abonelik/kota/kullanım satırlarımızla birleştirir (`query`, `page`, `per_page`) |
| `GET /api/admin/users/{id}` | Dönemler, krediler, tahsilatlar, onaylar, son kullanım, açık sağlayıcı eylemleri |
| `DELETE /api/admin/users/{id}` | Kullanıcının kendi silme akışıyla **aynı** kuyruğa girer; gövdede kullanıcının e-postası doğrulanır. Hedef bir yöneticiyse (çağıranın kendisi dahil) `409 admin_target` |
| `POST /api/admin/users/{id}/admin` | Kullanıcıya yönetici yetkisi verir; gövdede hedefin e-postası doğrulanır (yanlış hesaba tıklanarak yapılamaz). İdempotent: zaten yönetici olan biri için ikinci istek yeni bir `admin_add` denetim satırı açmaz. `admin_users`'a önceden yalnızca doğrudan veritabanı erişimiyle satır eklenebiliyordu (PR #25 incelemesi: `admin_add`/`admin_remove` denetim eylemleri tanımlıydı ama kullanan bir uç yoktu) |
| `DELETE /api/admin/users/{id}/admin` | Yönetici yetkisini kaldırır; aynı e-posta doğrulaması. **Son yönetici** (kendisi dahil) `409 last_admin` ile reddedilir — panel sahipsiz kalmasın diye, `DELETE /api/account`'taki son-yönetici korumasıyla aynı gerekçe |
| `POST /api/admin/users/{id}/credits` | Bonus kredi verir (`amount`, `reason`, `idempotency_key`, `expires_at?`) |
| `POST /api/admin/credits/{id}/revoke` | Kullanılmamış kalanı geri alır |
| `GET /api/admin/backgrounds` | Zemin kütüphanesinin TAMAMI (Faz 6, Kaan — `/admin` → Zeminler). `GET /api/backgrounds`ten farkı: pakete/kotaya bakmaz ve **pasif zeminleri de** döndürür (`is_active`, `tier`, `created_at` + imzalı `url`/`thumbnail_url`). Okuma ucu olduğu için hız sınırı fail-open |
| `PATCH /api/admin/backgrounds/{id}` | Zeminin paketini (`tier`) ve yayın durumunu (`is_active`) değiştirir (Faz 6, Kaan). **Pasif, silinmiş değildir:** satır ve R2 nesneleri durur, zemin yalnız kullanıcı listesinden çıkar. Denetim satırı yalnız durum gerçekten değişince yazılır; hız sınırı yazan uç olduğu için fail-closed |
| `DELETE /api/admin/backgrounds/{id}` | Zemini kalıcı siler — **geri alınamaz**. Sıra bilinçli: önce DB satırı, sonra R2 nesneleri (ters sırada "satır duruyor, dosyası yok" çıkardı — ders 25). Nesne silme patlarsa yalnız yer tutan dosya kalır, istek yine başarılı döner |
| `GET /api/admin/audit` | Denetim günlüğünü OKUR (20.09.2026 — Faz 6 kapanış denetiminde okuma yolunun hiç olmadığı bulundu). Yalnız okuma; tablo zaten yalnız eklemeye açık. En yeniden eskiye, `page`/`per_page`; `has_more` için bir satır fazla okunur (toplam sayılmaz). `action` yalnız `admin_audit.ACTIONS`'tan biri olabilir (aksi `422`), `actor` ile tek yöneticinin kayıtları süzülür. Yanıt ayrıca `admins`: şu anki yöneticiler ve adları (panelin "Admin: Serhan | Kaan" anahtarı). Ad/e-posta Supabase yönetici API'sinden; okunamazsa `null` döner ve sayfa yine gelir — günlüğün kendisi veritabanında, ad yalnız gösterim. Hesabı silinmiş yöneticinin satırı da listelenir (`actor_id`'nin FK'si yok). Okuma ucu olduğu için hız sınırı fail-open |
| `GET /api/admin/stats` | Özet sayaçlar + `days` penceresinde günlük seri |

**Bonus krediler dönem kotasının DIŞINDADIR.** `subscription_periods.quota_snapshot`
migration `0006`'daki `period_snapshot` trigger'ıyla değişmez — dönem bir kanıt
kaydıdır. Admin'in verdiği kredi `credit_grants` tablosunda durur ve
`reserve()` yalnızca **dönem kotası tükendiğinde** ona başvurur; erişimi kapalı
(`suspended`/`expired`) bir aboneliği **diriltmez**, süresi geçmiş ve iptal
edilmiş krediler hiç sayılmaz, en yakında biten kredi önce harcanır.
`usage_reservations.grant_id` krediyi hangi kovadan aldığını tutar: başarısız
bir iş kredisini **alındığı** kovaya iade eder. Kullanılabilir bakiye
`GET /api/subscriptions/me` yanıtında `bonus_credits` altında döner.

`credit_grants` de değişmezdir: yalnız `used`, `revoked_at` ve hesap silmede
`user_id`/`granted_by` → `NULL` serbesttir (bu iki sütun `auth.users`'a
`ON DELETE SET NULL` ile bağlı; yasaklansaydı kredi vermiş bir yöneticinin
hesabı hiç silinemezdi). Kimin verdiği bilgisi kalıcı olarak
`admin_audit_log.actor_id`'de durur — o sütunun FK'si bilinçli olarak yoktur.

**`admin_audit_log` yalnızca eklemeye açıktır** (`admin_audit_append_only`
trigger'ı her `UPDATE`/`DELETE`'i reddeder). Yöneticinin sonradan
düzenleyebildiği bir kayıt, "bu krediyi kim, ne zaman, neden verdi" sorusunu
cevaplayamaz. Satır yalnız durumu GERÇEKTEN değiştiren istekte yazılır: aynı
idempotency anahtarıyla tekrar gelen kredi isteği ve silmesi zaten istenmiş bir
hesap için admin silmesi ikinci bir satır üretmez.

**Yönetici hesapları panelden silinmez** (`409 admin_target`, çağıranın kendisi
dahil); yönetici kendi hesabını `DELETE /api/account` ile siler ve **son
yönetici** orada `409` alır (`admin_users` satırları kilitlenerek sayılır, iki
yönetici aynı anda kendini silerken ikisi de "başka biri var" görmez).

**Hız sınırı yönü uca göre seçilir:** okuma uçları `limit_scoped` ile
**fail-open** (Redis arızası panelin bütün sayfalarını karartmasın), yazan
uçlar `limit_admin` ile **fail-closed** (kredi verme ve hesap silme para/erişim
yüzeyidir).

**Kullanıcı araması e-posta (ya da tam kullanıcı kimliği) aramasıdır.**
Davranış İKİ KEZ doğrulandı (17.09.2026): `supabase/auth` kaynağından
(`internal/api/admin.go` → `internal/models/user.go` → `internal/api/mail.go`)
ve canlı projeye karşı yalnızca okuma yapan bir çağrıyla. **Canlı ölçüm:**
`filter='serhande'` 1 sonuç, `filter='SERHANDE'` **0 sonuç** — yani aşağıdaki
küçük harfe çevirme olmasa büyük harf kullanan yönetici hiçbir şey bulamazdı.
`full_name` taşıyan kullanıcı sayısı 0.

- `filter` şu koşula çevriliyor:
  `email LIKE '%f%' OR raw_user_meta_data->>'full_name' ILIKE '%f%'`.
  E-posta tarafı `ILIKE` **değil** `LIKE`, yani büyük/küçük harfe duyarlı.
  GoTrue e-postaları `strings.ToLower` ile sakladığı için sorgu bizden küçük
  harfe çevrilerek gidiyor — yoksa "Musteri" yazan yönetici hiçbir sonuç
  görmezdi.
- **`full_name` dalı bizde hiç çalışmaz:** uygulama profili `first_name` /
  `last_name` / `business_name` anahtarlarıyla yazıyor
  (`frontend/src/lib/profile.ts`); `full_name` diye bir alanımız yok. **Ada
  göre arama desteklenmiyor** ve admin arayüzündeki alan etiketi bunu
  söylemeli — "sayfada bulunanı da ara" gibi bir yama, aranan kişi başka
  sayfadaysa sessizce "sonuç yok" derdi.
- Barındırılan projenin `auth` sürümü bu kaynaktan eski olabileceği için dönen
  sayfa sunucuda bir kez daha süzülüyor: sürüm `filter`'ı yok sayarsa sonuç
  eksik olabilir ama asla yanlış olmaz. İki yön de test edilmiş durumda.
