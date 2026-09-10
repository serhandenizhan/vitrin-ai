# CLAUDE.md

Bu depoda çalışırken Claude Code için rehber. Bu dosyayı her adımda güncel tutun — projenin nasıl inşa edildiğine dair tek doğru kaynak budur.

## Bu projenin geçmişi — ikinci iterasyon

Bu proje, aynı iki kişi (Serhan, Kaan) tarafından daha önce bir kez baştan sona planlanıp kısmen inşa edilmişti (Faz 0-3 tamamlanmış, Faz 4 sürüyordu). Kod tabanı bu depoda **sıfırdan yeniden yazılıyor**, ama önceki iterasyonda alınan kararlar ve doğrulanan teknik bulgular hâlâ geçerli ve tekrar tartışılmayacak. Bu bölümü, kararların *neden* alındığını anlamak için okuyun — bu, karara bağlanmış soruları yeniden tartışmaktan kurtarır.

1. **Ekip ve iş akışı:** 2 kişilik ekip. Kişi başına yerel Claude Code kullanımı (sadece bulut değil) ve normal `git push`/`pull` ile GitHub üzerinden senkronizasyon. PR'lar Claude Code içinden `gh pr create` ile açılır ve diğer kişinin incelemesinden sonra birleştirilir. Her push'tan önce açık kullanıcı onayı gerekir.
2. **Ürün tanımı:** kuyumcular için bir AI aracı. Kullanıcı bir ürün fotoğrafı yükler (yüzük, kolye vb.) → AI çok yüksek kenar hassasiyetiyle arka planı kaldırır → kullanıcı kesimi birçok özel arka plan tasarımından birinin üzerine yerleştirir ve ölçeklendirip döndürebilir, yeniden konumlandırabilir. Önce web uygulaması (konsepti doğrulamak için), asıl uzun vadeli hedef mobil uygulamadır.
3. **AI model kararı (en yüksek riskli teknik karar, kilitli):** üç zorunlu gereksinime göre araştırıldı — ücretsiz/ucuz, ticari kullanım lisansı, ince/yansıtıcı kenarlarda çok yüksek doğruluk (mücevher, segmentasyonun en zor kategorilerinden biridir). Karar: **BiRefNet, orijinal `ZhengPeng7/BiRefNet` ağırlıkları (MIT lisansı)**. BRIA'nın "RMBG" ağırlıkları (aynı mimari, farklı eğitim verisi) açıkça elendi çünkü bu spesifik ağırlıklar sadece ticari olmayan kullanım içindir — bu, bu alanda tekrar eden bir tuzaktır.
4. **Tüm teknoloji yığını birlikte kararlaştırıldı** — aşağıdaki teknoloji yığını tablosuna bakın. Ödeme sağlayıcısı (iyzico) özellikle hedef pazarın Türk kuyumcular olması nedeniyle seçildi. Kimlik doğrulama için Supabase Auth seçildi (Clerk değerlendirilip elendi) — detay için aşağıya bakın.
5. **Önceki iterasyonda gerçek fotoğraflarla doğrulanan teknik bulgular** (bu iterasyonda yeniden keşfedilmesine gerek yok, `ROADMAP.md` bölüm 2'de tam detay var):
   - `birefnet-general-lite` ve `u2net` gerçek ürün kullanımı için elendi (ya çok fazla RAM, ya çok düşük kalite). Üretim modeli: `birefnet-general`.
   - **CPU inference için en az 12–14 GB RAM gerekiyor** — üç ayrı ölçümle doğrulandı, en güncel ölçüm çalışan servisin kendisinde (uvicorn süreci) 12.0 GB tepe RSS gösterdi. 8 GB'lık bir sunucu bu modeli kaldırmaz.
   - Ortalama inference süresi ~15sn/fotoğraf (CPU), ilk istekte model yükleme nedeniyle daha uzun (~30-35sn).
   - Kalite, gerçek mücevher fotoğraflarında (yüksek çözünürlüklü iPhone HEIC dahil) iyi — ince zincirler ve yansıtıcı detaylar temiz kenarlarla korunuyor.
   - **Bilinen sınırlama:** ürün elde tutularak çekildiğinde model bazen eli koruyor bazen kaldırıyor (tutarsız davranış) — bu bir hata değil, "salient object" segmentasyonunun doğal belirsizliği. Bilinçli olarak MVP'yi bloklamayacak şekilde ertelenmiş bir üründür kararı; gerçek kullanımda sorun çıkarırsa ayrı bir iyileştirme (el tespiti + tutarlı maskeden çıkarma) olarak ele alınacak.
   - Parmak/el tarafından fiziksel olarak örtülen ürün kısımları çıktıda da eksik kalır — temel bir 2D segmentasyon kısıtı, model tarafında çözülemez, çekim rehberliğiyle azaltılabilir.
6. **Kimlik doğrulama kararı: Supabase Auth.** Production Postgres de aynı Supabase projesinde olacak — DB ve Auth ayrılmıyor. Oturum `@supabase/ssr` ile çerezde tutulur (localStorage değil, sunucu bileşenleri ve middleware'in de okuyabilmesi gerekiyor). **Bunun doğrudan sonucu:** Supabase'in `anon` anahtarı tasarımı gereği herkese açıktır, tabloyu koruyan tek şey **Row Level Security (RLS)** politikalarıdır — RLS'siz bir tablo oluşturmak o tablonun tamamını internete açmak demektir. Tablo ve RLS politikası her zaman aynı migration'da gider.
7. **Depolama kararı: Cloudflare R2.** Bucket public-read değil; okuma süreli imzalı URL (`generate_presigned_url`) üzerinden. Yükleme anahtarı kullanıcı dosya adından değil, sunucuda üretilen bir UUID'den gelir (path traversal koruması). Önceki iterasyonda gerçek bir R2 hesabına karşı uçtan uca doğrulandı (yükle → imzalı URL üret → indir → içerik doğrula).
8. **Ders — geçici çözümler yazılırken kullanıcıya açıkça söylenmeli:** önceki iterasyonda birkaç bilinçli geçici karar alındı (örn. arka plan yükleme endpoint'ini gerçek admin auth gelene kadar basit bir `X-Admin-Secret` header'ıyla korumak, ya da proje geçmişini DB şeması gelene kadar tarayıcıda IndexedDB'de tutmak). Bunların hepsi kullanıcı onayıyla ve "bu geçici, şu faz gelince kaldırılacak" notuyla yapıldı — sessizce yapılmadı. Aynı disiplin bu iterasyonda da sürdürülmeli.
9. **Ders — bir sayı (RAM, süre, limit) birden fazla dokümanda geçiyorsa hepsi birden güncellenmeli.** Önceki iterasyonda bu atlanmış ve dokümanlar birbiriyle çelişmişti (12 GB ölçümü önce sadece bir dosyaya yazılıp diğer üç dosyada eski rakam kalmıştı). Bu iterasyonda her PR'dan önce ilgili tüm dokümanlar (`README.md`, `ROADMAP.md`, `CLAUDE.md`, alt `README`'ler) kontrol edilmeli.
10. **Ders — `USE_MOCK_BACKEND` gibi geçici test bayrakları unutulabiliyor.** Önceki iterasyonda gerçek backend tekrar çalışır hale geldiğinde bu bayrağın kapatılmayı unutulması, "neden sonuç hep aynı örnek görsel" şeklinde bir kafa karışıklığına yol açmıştı. Bu tür bayraklar açıldığında bir hatırlatma notu bırakılmalı.
11. **Ders — dosya/klasör path'lerini kod içine hard-code etmeyin.** Önceki iterasyonda bir benchmark script'i geliştiricinin kendi makinesindeki mutlak path'i (`/Users/...`) içeriyordu; bu hem başka bir geliştiricide hem CI'da çalışmayı kırdı. Path'ler her zaman repo köküne göre türetilmeli ve env değişkeniyle override edilebilmeli.
12. **Ders — araçların ürettiği `.gitignore` ve yardımcı dosyaları da denetleyin.** Faz 2'de `create-next-app`'in ürettiği `frontend/.gitignore` içindeki `.env*` deseni, negasyon olmadığı için `.env.example`'ı da yutuyordu — fark edilmeseydi yeni bir geliştirici hangi ortam değişkenlerine ihtiyaç olduğunu göremezdi (`!.env.example` eklendi). Aynı araç ayrıca `frontend/` altına kendi `AGENTS.md` ve `CLAUDE.md` dosyalarını üretiyor; kök `CLAUDE.md` tek doğru kaynak olduğu için bu `next.config.ts` içinde `agentRules: false` ile kapatıldı. **Genel kural: bir iskelet üreticisi (scaffolder) çalıştırdıktan sonra ürettiği dosyaları tek tek gözden geçirin — sessizce yanlış davranan bir yapılandırma bırakabiliyor.**
13. **Ders — aynı özgüllükteki iki `@utility` arasında kazananı SIRA belirler; ve bir hatayı ortamın kendisiyle karıştırmayın.** Faz 2'de sol çekmece "açık" işaretlendiği hâlde ekran dışında kalıyordu. İki ayrı şey aynı belirtiyi veriyordu ve bu, teşhisi üç tura yaydı:
    - **Asıl hata:** `.drawer` ve `.drawer-open` ikisi de `@utility` idi, yani aynı özgüllükte; kazananı üretilen dosyadaki sıra belirliyordu ve `.drawer` sonra geldiği için her zaman o kazanıyordu. **Durum değiştiren sınıf çiftlerinde bileşik seçici kullanın** (`.drawer.drawer-open`, 0-2-0).
    - **Ortam artefaktı:** doğrulama yapılan gömülü tarayıcı paneli gizliyken hiç kare üretmiyor; `requestAnimationFrame` çalışmıyor, dolayısıyla CSS geçişleri ve `scroll-behavior: smooth` ilerlemiyor ve hesaplanan değer eski hâlinde donuyor. Bu bir kod hatası **değil**; gerçek bir tarayıcıda geçiş çalışıyor ve arka plandaki bir sekme öne geldiğinde geçiş tamamlanıyor.
    **Ders:** bir belirtiyi kod hatası saymadan önce ortamın kendisini eleyin. Ölçüm aracının sınırı, ölçülen şeyin özelliği gibi görünebiliyor. (Geçiş, özgüllük düzeltildikten sonra bilinçli olarak geri getirildi — bkz. `frontend/src/app/globals.css`.)
14. **Ders — `.gitignore` dosyasının adını kontrol edin.** Önceki iterasyonda dosya yanlışlıkla `gitignore` (baştaki nokta eksik) olarak commit edilmişti ve hiç etkili olmuyordu (`.venv/`, `.DS_Store` gibi dosyalar git'e görünür kalmıştı). Faz 0'da bunu doğrulayın.
15. **Ders — bir testin yeşil geçmesi hatanın olmadığını göstermez; testin neyi *doğrulamadığına* bakın.** Faz 3'te `POST /api/admin/backgrounds`'un admin secret karşılaştırması non-ASCII secret'larda bozuktu ve düzeltmesi de bozuktu (bkz. ders 16). Yanındaki test, `test_non_ascii_admin_secret_returns_401_not_500`, yalnızca **yanlış** secret'ın 401 döndürdüğünü doğruluyordu; **doğru** secret'ın kabul edildiğine hiç bakmıyordu. Bozuk kod bu testten yeşil geçiyordu — hata, testin baktığı yerin dışında duruyordu. **Kural: bir yetkilendirme/doğrulama kontrolü test edilirken hem RED hem KABUL yolu ayrı ayrı doğrulanır.** Daha genel olarak, bir hatayı düzeltirken yazılan testin gerçekten iş gördüğü, testi ESKİ (bozuk) koda karşı çalıştırıp kırmızı yandığını görerek kanıtlanır; yalnızca yeni kodda yeşil yanması hiçbir şey söylemez.
16. **Ders — HTTP header'ları `latin-1`, ortam değişkenleri `utf-8`'dir; karşılaştırırken codec'i karıştırmayın.** Starlette, ASGI header baytlarını `latin-1` ile decode ederek `str` yapar. `secrets.compare_digest` `str` argümanlarında yalnızca ASCII kabul ettiği için karşılaştırma baytlar üzerinden yapılmalı — ama iki tarafın codec'i **aynı değil**: header'dan gelen `str`'in ham baytlarını geri almak için `latin-1` ile encode edilir, `.env`'den okunan secret ise `utf-8`'dir. Her iki tarafı `utf-8` ile encode etmek header baytlarını ikinci kez kodlar (double-encode) ve Türkçe karakter içeren bir `ADMIN_SECRET`'ta doğru secret gönderilse bile kalıcı 401 üretir. Bulgu GitHub Copilot'un PR incelemesinden geldi, düzeltme PR #7'de.
17. **Ders — stacked PR'da merge SIRASI işi kaybettirebilir.** PR #4'ün base'i `main` değil `feature/faz-2-web-frontend` idi. Önce PR #3 (alt dal → `main`), bir dakika sonra PR #4 (üst dal → alt dal) birleştirildi. Alt dal `main`'e zaten girmiş olduğu için PR #4'ün 8 commit'i **`main`'e hiç ulaşmadı** ve bu, GitHub'da her iki PR da "Merged" göründüğü için fark edilmedi; `main`'de sol panel, gerçek fotoğraflar ve 27 frontend testinin tamamı eksik kaldı. **Kural: stacked PR'lar her zaman ÜSTTEN ALTA birleştirilir (önce PR #4 alt dala, sonra alt dal `main`'e); ve bir merge'den sonra işin gerçekten `main`'de olduğu `git merge-base --is-ancestor <commit> origin/main` ile doğrulanır.** "Merged" rozeti, işin `main`'de olduğu anlamına gelmez.

## Proje genel bakış

Kuyumcular için AI destekli bir web uygulaması (mobil uygulama uzun vadeli hedeftir). Kullanıcılar bir ürün fotoğrafı yükler (yüzük, kolye vb.); AI ürün sınırını yüksek hassasiyetle tespit eder ve arka planı kaldırarak şeffaf arka planlı bir kesim bırakır. Ardından kullanıcılar bu kesimi birçok özel arka plan tasarımından birinin üzerine yerleştirir, ölçeklendirebilir, döndürebilir ve yeniden konumlandırabilir. Tam fazlı plan ve teknoloji kararları için `ROADMAP.md` dosyasına bakın.

## Kalıcı proje kuralları

1. **Bu dosyayı her adımda güncel tutun.** Bir mimari karar, kural veya iş akışı değiştiğinde, `CLAUDE.md` dosyasını aynı değişiklikte güncelleyin.
2. **Push'tan önce onay alın.** O spesifik değişiklik için açık kullanıcı onayı olmadan asla `git push` çalıştırmayın (veya bir PR açmayın/birleştirmeyin).
3. **Dil kuralı:** kaynak kod (değişken adları, API alanları vb.) İngilizcedir; kod içindeki yorumlar sadece Türkçe yazılır. Üst seviye dokümantasyon dosyaları (`CLAUDE.md`, `ROADMAP.md`) kullanıcı talebi üzerine Türkçe tutulabilir. Sohbet Türkçe devam eder.
4. **`README.md`'yi de her adımda güncel tutun.** Kök dizindeki `README.md`, projenin GitHub'daki dış yüzüdür — yeni bir özellik, mimari değişiklik veya proje durumu güncellemesi olduğunda bunu da güncelleyin. Değişiklik hangi ekip üyesi (Serhan veya Kaan) tarafından yapılıyor olursa olsun aynı kural geçerlidir: iş bitmeden önce Claude Code, `README.md`'nin güncellenmesi gerekip gerekmediğini kullanıcıya otomatik olarak sormalı.
5. **Her PR'dan önce ilgili dokümanların tamamı kontrol edilir:** kök `README.md`, `ROADMAP.md`, `CLAUDE.md`, `SECURITY.md` ve ilgili alt `README` (`frontend/README.md` / `backend/README.md`). Bu bir "gerekirse" maddesi değil — PR açmadan önce tek tek gözden geçirilir ve güncellenmesi gerekmeyenler için kullanıcıya "şu dosyada değişiklik gerekmedi" diye **açıkça** söylenir. Sessizce atlamak yasak. Bir sayı (RAM, süre, limit) birden fazla dokümanda geçiyorsa **hepsi birden** güncellenir.
6. **Faz dışına çıkılmaz — çıkılacaksa ÖNCE uyarılır.** (Kaan'ın kararı, 08.09.2026.) Bir istek, o an üzerinde çalışılan fazın `ROADMAP.md`'deki kapsamının dışındaysa: **iş yapılmadan önce** kullanıcıya bunun hangi faza ait olduğu ve neden şimdi yapılmaması gerektiği söylenir, onayı beklenir. Sessizce yapmak da, "nasılsa faydalı" diye eklemek de yasak.
   - Bu kural Faz 2'de fiilen yaşandığı için kondu: çalışma geçmişi (Faz 4, sunucuda) tarayıcıda yapıldı ve "giriş yap" arayüz öğesi (Faz 4) eklendi. İkisi de kullanıcı isteğiyle ve belgelenerek yapıldı ama **kapsam yine de aşıldı** ve Faz 4'e taşıma işi bıraktı — yol haritası tam olarak bundan kaçınmak için "baştan sunucuda" demişti.
   - Kapsam dışı olup olmadığı belirsizse, varsayılan **dışıdır**: sorulur.
   - Kullanıcı uyarıya rağmen isterse yapılır; o zaman karar `ROADMAP.md`'deki ilgili faza ve gerekiyorsa `CLAUDE.md`'ye "geçici çözüm / öne alınan iş" olarak yazılır (bkz. ders 8).
   - Bir fazın kendi görevleri bitmeden bir sonraki faza geçilmez.
7. **Güvenlik, Faz 7'ye ertelenen ayrı bir görev değildir.** `SECURITY.md` dosyasındaki standartlar ilgili faz içinde uygulanır (hangi maddenin hangi fazda olduğu hem `SECURITY.md` bölüm 8'de hem `ROADMAP.md`'deki ilgili faz altında listelenir). Yeni bir endpoint, DB tablosu, dosya yükleme akışı veya ödeme entegrasyonu yazılırken `SECURITY.md`'deki ilgili bölüm önce kontrol edilir.

## Teknoloji yığını (tam gerekçe için ROADMAP.md bölüm 3'e bakın)

- **Backend:** Python, FastAPI, asenkron işler için Celery/RQ + Redis
- **AI modeli:** BiRefNet — sadece orijinal `ZhengPeng7/BiRefNet` MIT lisanslı ağırlıkları kullanın. BRIA'nın "RMBG" ağırlıklarını asla kullanmayın (aynı mimari, ancak bu ağırlıklar ticari değildir). Üretim modeli doğrudan `birefnet-general` — `-lite` ve `u2net` önceki iterasyonda elendi.
- **Veritabanı:** PostgreSQL (production'da Supabase — aynı proje, DB ve Auth ayrılmıyor)
- **Nesne depolama:** Cloudflare R2 (S3 uyumlu), public-read değil, presigned URL ile erişim
- **Frontend:** Next.js, TypeScript, Tailwind, shadcn/ui
- **Kompozisyon editörü:** Konva.js / react-konva
- **Kimlik doğrulama:** **Supabase Auth**. Oturum `@supabase/ssr` ile çerezde tutulur. FastAPI gelen Supabase JWT'sini projenin JWKS'iyle (ES256/RS256) doğrular — `backend/app/core/auth.py`. Yönetici yetkisi `admin_users` tablosundan gelir (Faz 3'ün `X-Admin-Secret`'ı Faz 4'te kaldırıldı). **IDOR koruması iki katmanlı:** backend veritabanına tablo sahibi olarak bağlandığı için RLS onu etkilemez — birinci katman her sorgudaki sahiplik filtresi (`user_id = <token'daki kullanıcı>`), ikinci katman Data API (PostgREST) kapısındaki RLS + grant'ler. **RLS'siz tablo oluşturulmaz**; `public`'teki her tablonun RLS'li olduğunu ve `anon`/`authenticated`'ın hiçbir yetkisi olmadığını `backend/tests/test_rls.py` genel olarak doğrular (bkz. `ROADMAP.md` Faz 4, `SECURITY.md` 3.2, `backend/README.md` "Kimlik doğrulama ve yetkilendirme").
- **Ödemeler:** iyzico
- **Test:** pytest (backend), Vitest (frontend), Playwright (E2E)
- **Mobil (sonra):** React Native + Expo

## Git iş akışı

- Dal (branch) isimlendirme: `feature/<kısa-açıklama>`, `fix/<kısa-açıklama>`
- Çalışma feature dallarında yapılır, asla doğrudan `main` üzerinde değil
- Pull request'ler bir görev tamamlandığında ve kullanıcı onayladığında Claude Code içinden GitHub CLI ile açılır (`gh pr create`)
- PR'lar birleştirilmeden önce diğer ekip üyesi tarafından incelenir
- Bir birleştirmeden sonra, yeni işe başlamadan önce yerel olarak `main`'i çekin (pull)
- **Stacked PR'lar üstten alta birleştirilir.** Bir PR'ın base'i `main` değil başka bir feature dalıysa, önce üstteki PR alt dala, sonra alt dal `main`'e birleştirilir. Ters sırada birleştirilirse üstteki PR'ın işi `main`'e hiç ulaşmaz ve GitHub'da her iki PR da "Merged" göründüğü için bu fark edilmez (bkz. ders 17 — Faz 2'de yaşandı, 8 commit kayboldu)
- **Bir merge'den sonra işin gerçekten `main`'de olduğu doğrulanır:** `git merge-base --is-ancestor <commit> origin/main`

## Depo yapısı (hedef)

```
/backend           FastAPI uygulaması, AI inference servisi, Celery worker'ları,
                   arka plan meta verisi (Postgres/Alembic) — Faz 3'te genişler
/frontend          Next.js uygulaması (web arayüzü, admin paneli) — Faz 2'de kurulur
/mobile            React Native uygulaması (Faz 8'de eklenecek)
docker-compose.yml Yerel Postgres (Faz 0/3)
ROADMAP.md         Tam fazlı proje planı
CLAUDE.md          Bu dosya
SECURITY.md        Katman katman güvenlik standartları
```

## Bilinen kısıt: BiRefNet bellek ayak izi (önceki iterasyonda üç kez ölçüldü)

CPU inference için **en az 12–14 GB RAM** bütçeleyin, ya da trafik gerektirdiğinde GPU serverless'a geçin. 8 GB'lık bir sunucu bu modeli kaldırmaz — bu, çalışan servisin kendisi üzerinde yapılan gerçek bir ölçümle doğrulandı (uvicorn süreci 12.0 GB tepe RSS'e çıktı). İnference servisi için en küçük/en ucuz katmanı sağlamayın. Tam ölçüm geçmişi için `ROADMAP.md` bölüm 2'ye bakın.

## Claude Code için notlar

- Arka plan kaldırma endpoint'ini uygularken, ince/yansıtıcı yapılar (zincirler, ince halkalar, küçük taşlar) üzerindeki model doğruluğunu en üst öncelik olarak ele alın — bu, ürünün temel değer önerisidir.
- Önce tartışmadan yeni bir backend dili/framework'ü tanıtmayın — amaç, 2 kişilik bir ekip için tüm AI + backend yüzeyini Python'da tutmaktır.
- Bir göreve başlamadan önce, görevin hangi faza ait olduğunu ve kimin sahip olduğunu görmek için `ROADMAP.md`'ye bakın.
- HEIC desteğini (iPhone'un varsayılan formatı) Faz 1'den itibaren baştan planlayın — önceki iterasyonda sonradan eklenmişti, bu sefer gerek yok: `pillow-heif` + `register_heif_opener()` gerekiyor, bu çağrı olmadan PIL HEIC açamaz.
- Frontend'in yükleme kısıtları (`ALLOWED_CONTENT_TYPES` / `MAX_FILE_SIZE_MB`) backend ile elle senkron tutulmalı — biri değişirse diğeri de güncellenmeli.
- **Apple Silicon Mac'te BiRefNet session'ı her zaman `providers=["CPUExecutionProvider"]` ile açık şekilde oluşturun.** `rembg.new_session()` çağrısına `providers` verilmezse onnxruntime macOS'ta `CoreMLExecutionProvider`'ı otomatik seçiyor; BiRefNet'in CoreML'in desteklemediği çok sayıda operatörü olduğu için grafiği yüzlerce küçük alt-parçaya bölüp her birini ayrı ayrı derlemeye çalışıyor — pratikte hiç bitmeyen (gözlemlenen: 600+ `.mlmodelc` alt-parça, 10+ dakika) bir derleme döngüsüne giriyor. Üretim sunucusu zaten Linux/CPU olduğu için bu sağlayıcıyı zorlamak davranışı hem yerelde hem üretimde tutarlı kılıyor, `backend/app/services/background_removal.py` içinde uygulandı.

### Güvenlik davranış kuralları (bkz. `SECURITY.md` için tam detay)

- Hiçbir secret, API key, şifre veya bağlantı string'i kod içine sabit (hardcoded) yazılmaz; her zaman `.env` üzerinden okunur ve `.env` asla commit edilmez.
- Yeni bir DB sorgusu yazarken string concatenation ile SQL asla oluşturulmaz; ORM (SQLAlchemy) veya parametreli sorgu kullanılır.
- Kullanıcıya özel bir kaynağa erişen her endpoint (`/api/projects/{id}` gibi) o kaynağın gerçekten istek yapan kullanıcıya ait olduğunu DB seviyesinde doğrular (IDOR koruması) — bu kontrol olmadan endpoint tamamlanmış sayılmaz.
- Dosya yükleme kabul eden hiçbir endpoint sadece dosya uzantısına/content-type header'ına güvenmez; boyut sınırı ve magic-byte içerik doğrulaması **Faz 1'den itibaren** eklenir (önceki iterasyonda sonradan yama olarak eklenmişti).
- Yeni bir admin/yetkili endpoint yazılırken rol kontrolü backend'de yapılır; frontend'in bir öğeyi gizlemesi yetkilendirme sayılmaz.
- Ödeme/webhook kodu yazılırken imza doğrulaması ve idempotency olmadan "tamamlandı" denilmez.
- **`frontend/public/` altındaki her dosya internete açıktır** ve dağıtıma dahil edilir. Oraya yalnızca yayınlanması *istenen* dosyalar konur; ham/kaynak/ara dosyalar (yüksek çözünürlüklü orijinaller, notlar, yedekler) `public/` dışında tutulur. Faz 2'de 3,6 MB'lik bir kaynak fotoğraf yanlışlıkla oraya konmuş, fark edilip `frontend/photo-source/` altına taşınmıştı (bkz. `SECURITY.md` bölüm 7).
- Bu kurallardan biriyle çelişen bir kısayol gerekiyorsa (örn. hız kaygısıyla), bunu sessizce yapmak yerine kullanıcıya açıkça belirtin ve onay isteyin.

## Sistemi çalıştırma

VS Code'da **`Ctrl+Shift+B`** backend ve frontend'i birlikte başlatır (bkz. `.vscode/tasks.json`). Görev dosyası bilinçli olarak commit ediliyor — "sistemi nasıl ayağa kaldıracağım" bilgisi kişisel bir tercih değil, projenin parçası. Kişisel VS Code ayarları (`settings.json` vb.) yok sayılmaya devam ediyor.

**Tuzak:** `.gitignore`'da dizinin kendisi (`.vscode/`) değil **içeriği** (`.vscode/*`) dışlanmalı — git, dışlanmış bir dizinin içine hiç bakmadığı için `!.vscode/tasks.json` negasyonu aksi hâlde çalışmaz.

**İkinci tuzak:** VS Code görevlerinde `args` içine `&&` yazılmaz; npm'e düz bir argüman olarak geçer ve Windows PowerShell'de `&&` zaten desteklenmez. Zincir gereken yerde `package.json` script'ine taşınır (`npm run kontrol`).

## Frontend çalıştırma (Faz 2'de kuruldu)

```bash
cd frontend && npm install && cp .env.example .env.local && npm run dev
```

- `frontend/.env.local` içinde `USE_MOCK_BACKEND=true` backend olmadan arayüzü çalıştırır (sahte bir kesim PNG'i döner, arayüzde "Demo modu" olarak işaretlenir). **Dikkat:** bu değer `true` kalırsa gerçek backend ayakta olsa bile arayüz hep demo/mock sonucu gösterir.
- Gerçek uçtan uca demo için backend'i ayrı bir terminalde başlatın ve `USE_MOCK_BACKEND=false` yapın. İlk istek modeli belleğe yüklediği için daha uzun sürebilir (bkz. "Bilinen kısıt" bölümü).
- Desteklenen formatlar: JPEG, PNG, WebP, HEIC/HEIF. Backend HEIC'i işliyor ama **tarayıcılar HEIC'i görüntüleyemiyor** — arayüz bu formatta önizleme yerine bilgilendirici bir kart gösteriyor.
- **Dosya boyutu sınırı 20 MB** (`backend/app/core/config.py` → `max_file_size_mb`). Frontend'deki karşılığı `frontend/src/lib/upload-constraints.ts`; ikisi elle senkron tutulur.
- Tarayıcı FastAPI'ye doğrudan bağlanmaz, istek `frontend/src/app/api/remove-background/route.ts` vekilinden geçer. Vekil ayrıca Windows'ta boş gelen `.heic` content-type'ını uzantıdan düzeltir ve backend'in 413/503 yanıtlarını kullanıcı diline çevirir.
- **Backend'de `/health` endpoint'i yok**, bu yüzden arayüzde "servis ayakta mı" göstergesi bulunmuyor — uydurma bir gösterge yanlış bilgi verirdi. Böyle bir gösterge istenirse backend'e küçük bir sağlık endpoint'i eklenmeli (Serhan).
- **Frontend testleri:** `cd frontend && npm test` (Vitest). Kapsam; yükleme kısıtları, arka plan kaldırma/zemin vekilleri, CMYK yükleme limitleri, imzalı URL yenileme zamanlaması ve kompozisyon geometrisinin yanı sıra R2 URL yenilemesi, seçili zeminin korunması ve dışa aktarma başarısız olduğunda sahnenin geri yüklenmesine yönelik React bileşen testlerini içerir. **Tuzak:** Konva, "tainted" tuvalde `toDataURL` hatasını fırlatmıyor, yakalayıp boş string döndürüyor — boş sonuç hata olarak ele alınmazsa PNG düğmesi sessizce hiçbir şey yapmaz (tarayıcıda ölçüldü). Daha geniş bileşen kapsamı ve E2E (Playwright) Faz 7'de kalır.
- **Görsel varlıklar betikle üretilir, elle değil:** `node scripts/prepare-photos.mjs` (gerçek ürün fotoğraflarını web için hazırlar; kaynak `frontend/photo-source/`) ve `python scripts/generate-mock-cutout.py` (demo modunun örnek kesimi). İkili bir dosyayı kaynağı olmadan commit etmek, ileride "bu nereden geldi, nasıl değiştirilir" sorusunu cevapsız bırakır.
- Ayrıntılı gerekçeler ve klasör yapısı için `frontend/README.md`.

## Arayüz tasarım dili (kilitli karar — Faz 2)

Web arayüzü, kullanıcının referans olarak verdiği **apple.com/tr** ürün sayfalarından uyarlandı. Bu bir stil tercihi değil, kullanıcının açık kararı — yeniden tartışılmayacak, yeni bölümler de aynı dile uyacak.

**Uyarlanan (ölçülebilir) şeyler:** tipografi ölçeği ve negatif harf aralığı (hero 64/68 px, bölüm 48/52, alt başlık 28/32, gövde 17/21), 600 ağırlıklı başlıklar, tam genişlikte dönüşümlü koyu/açık bölümler (`#000` / `#1d1d1f` / `#f5f5f7` / `#fff`), 112 px dikey ritim, hap biçimli düğmeler, kaydırınca opaklık + kayma ile ortaya çıkan kısa `ease-out` geçişler.

**Palet 10.09.2026'da sıcak nötrlere çekildi** (kullanıcı kararı: "daha ilgi çekici ve göz yormayacak tonlar"). Apple'ın nötr grileri (`#000` / `#1d1d1f` / `#f5f5f7` / `#fff`) yerine `#0c0b0a` / `#1a1917` / `#f6f4f1` / `#fdfcfb`, koyu zeminde metin `#f3f0eb`. İki gerekçe: saf siyah zeminde saf beyaz metin büyük alanlarda yorucu (karşıtlık ~%92'ye indirildi, WCAG AAA'nın hâlâ çok üzerinde), ve altın vurgu sarımsı-nötr bir zeminde uyum kuruyor — mavi eğilimli `#f5f5f7` üzerinde hafif yeşilimsi duruyordu. Ölçek, ritim ve tipografi değişmedi.

**Büyük başlıklarda nokta kullanılmaz** (kullanıcı kararı, 10.09.2026). `display-hero`, `display-section` ve `display-feature` sınıflarını taşıyan her başlık noktasız biter. Apple'ın kendi başlıkları nokta kullanır ama kullanıcı bu ayrıntıda ayrıştı; kural burada geçerli.

**Menüdeki her öğe ya bir yere götürür ya bir şey açar, ikisi karışık değil.** Tek bağlantı `Deneyin`; `Nasıl çalışır`, `Paketler` ve `Hakkında` panel açıyor (`nav-panel.tsx`) ve yanlarındaki ok bunu önceden söylüyor. Panel içerikleri aracı kullanmak için gerekli olmadığından sayfaya bölüm olarak konmuyor — konduklarında ziyaretçinin araca ulaşması her biri için bir ekran gecikiyordu.

**Uyarlanmayanlar — bilinçli:**
- **SF Pro kullanılmaz.** Apple'a ait ve lisanslı; yerine Inter (aynı sınıfta neo-grotesk).
- **Apple'ın metinleri, görselleri ve marka öğeleri kopyalanmaz.** Sayfadaki her cümle ve sayı projenin kendi gerçeğine dayanır.
- **Vurgu rengi Apple'ın mavisi (`#2997ff`) değil, altın.** Hedef kitle kuyumcu.

**Yapısal fark:** Apple'da ürün bir fotoğraftır, bizde **çalışan aracın kendisi**. Bu yüzden araç tanıtım bölümlerinin sonuna değil, açılıştan hemen sonraya konuldu.

**Bu karar 10.09.2026'da iki kez sınandı ve sonunda korundu.** Önce aracın üstüne iki tanıtım bölümü eklendi (uygulama turu + misyon/vizyon); aynı gün ikisi de kaldırıldı. Tur, yatay kaydırmalı galeri olarak kurulmuştu ve kullanıcı hem kaydırmanın masaüstünde iyi çalışmadığını hem görüntünün referans kaliteye ulaşmadığını söyledi; misyon/vizyon ise panele taşındı. **Sonuç: araç yine açılıştan hemen sonra.** Tanıtım metinleri panellerde, görsel örnekler ise aracın ALTINDA (`backgrounds-showcase.tsx`) — kullanıcı kendi fotoğrafını denedikten sonra "başka ne yapabilirim" sorusunun cevabı olarak.

**Uygulama:** yardımcı sınıflar `frontend/src/app/globals.css` içinde (`display-hero`, `display-section`, `display-feature`, `lede`, `fine-print`, `surface-*`, `section-rhythm`, `reveal`, `press`). Yüzey renkleri bilinçli olarak **sabit**, token değil — bir bölüm "koyu" işaretlendiğinde açık temada da koyu kalmalı, dönüşümlü ritim buna dayanıyor. Punto değerleri `clamp` ile akışkan; alt/üst sınırlar Apple'ın mobil/masaüstü değerleriyle aynı. Ayrıntı ve ölçüm tablosu: `frontend/README.md` → "Tasarım dili".

**Durum taşıyan tek istemci bileşeni `background-remover.tsx`;** tanıtım bölümlerinin hepsi sunucu bileşeni ve istemciye hiç inmiyor. Yeni bölüm eklenirken bu ayrım korunmalı.

## Geçici çözüm kaydı — geçmiş çalışmalar tarayıcıda (Faz 2)

Kullanıcı Faz 2'de sol panelde geçmiş çalışmaları görmek istedi. `ROADMAP.md` proje geçmişini Faz 4'e ve **sunucuya** koyuyor; Faz 4'ün şeması ve RLS'i henüz olmadığı için geçmiş şimdilik **tarayıcıda (IndexedDB)** tutuluyor. Ders 8'in gereği olarak bu sessizce yapılmadı:

- Depo bir arayüzün arkasında: `frontend/src/lib/work-history.ts`. Faz 4'te yalnızca o dosyanın gövdesi sunucu çağrılarıyla değişecek; panel, sağlayıcı ve araç hiç değişmeyecek.
- Panelde kullanıcıya açıkça yazıyor: "yalnızca bu cihazda saklanıyor, hesap sistemi geldiğinde hesabınıza taşınacak."
- Ayarlardan kapatılabiliyor ve tümü silinebiliyor.
- Yalnızca **sonuç** saklanıyor, özgün fotoğraf değil — özgün dosyalar 20 MB'a kadar çıkabiliyor ve yirmi kaydın özgünüyle birlikte saklanması tarayıcı kotasını doldurur. Görünür sonucu: geçmişten açılan çalışmada önce/sonra karşılaştırması değil yalnızca sonuç gösterilir.
- En fazla 20 kayıt.

**Faz 4'te kapatılacak.** Sunucu tarafı (şema + `/api/projects`) Faz 4'te hazırlandı; Kaan'ın `work-history.ts` bağlamasıyla kapanacak (bkz. açık takip maddesi 2). Var olan tarayıcı kayıtlarının hesaba taşınıp taşınmayacağı bir ürün kararı; taşınmayacaksa kullanıcıya önceden bildirilmeli.

## Açık takip maddeleri

Kapatılmamış, sahibi belli işler. Bir madde çözüldüğünde buradan **silinir**, "tamamlandı" diye bırakılmaz — liste her zaman yalnızca açık işleri göstermeli.

### 1. Backend'de `/health` endpoint'i yok — sahibi: Serhan

Arayüze "servis ayakta mı" göstergesi **konmadı**. Uydurma bir gösterge yanlış bilgi verir: servis kapalıyken "bağlı" yazan bir rozet, kullanıcının hatayı anlamasını zorlaştırır. Şu an servisin kapalı olduğu ilk gerçek istekte açık bir mesajla anlaşılıyor ("Arka plan servisine ulaşılamadı. Servis çalışmıyor olabilir.").

Böyle bir gösterge isteniyorsa backend'e küçük bir sağlık endpoint'i eklenmeli. Frontend tarafı hazır: vekil katmanı zaten var, gösterge yarım saatlik iş.

**Not:** endpoint eklenirse model yüklü mü / kapasite dolu mu bilgisini de dönmesi faydalı olur — arayüz `MAX_CONCURRENT_INFERENCES=1` yüzünden gelen 503'ü zaten ayrı bir mesajla gösteriyor, aynı bilgiyi önden verebilmek beklemeyi öngörülebilir kılar.

### 2. Geçmiş çalışmalar tarayıcıda — sunucu tarafı hazır, bağlama kaldı — sahibi: Kaan (bağlama)

Yol haritası proje geçmişini Faz 4'e ve **sunucuya** koymuştu. Kullanıcı Faz 2'de görünür olmasını istedi; geçmiş o yüzden şimdilik **tarayıcıda (IndexedDB)** tutuluyor.

**Serhan'ın yarısı (şema + API) Faz 4'te yapıldı** (`feature/faz4-veritabani-hesaplar`): `projects` tablosu (RLS'li, migration 0003) ve `work-history.ts`'in dört fonksiyonuyla birebir eşleşen uç noktalar — `listWorks` → `GET /api/projects`, `saveWork` → `POST /api/projects` (multipart: `result` PNG, `thumbnail`, `file_name`, `is_mocked`, `duration_seconds`), `deleteWork` → `DELETE /api/projects/{id}`, `clearWorks` → `DELETE /api/projects`. Hepsi `Authorization: Bearer <Supabase access token>` istiyor. Yanıttaki görseller süreli imzalı URL (`result_url`, `thumbnail_url`, `expires_in`) — Blob değil; zeminlerdeki yenileme deseni burada da gerekecek.

Kalan (Kaan): `work-history.ts`'in gövdesini bu uç noktalara bağlamak ve Next.js vekiline oturumdaki access token'ı `Authorization` başlığıyla iletmek. Panel, sağlayıcı ve araç aynı kalacak.

Hâlâ açık **ürün kararları** (kullanıcıya sorulacak):
- Var olan tarayıcı kayıtları hesaba taşınacak mı? Taşınmayacaksa kullanıcıya önceden bildirilmeli; panelde şu an "hesap sistemi geldiğinde hesabınıza taşınacak" yazıyor.
- Sunucuda **özgün fotoğraf** da saklanacak mı? Şema şu an yalnızca sonucu tutuyor (tarayıcıdakiyle aynı); saklanırsa geçmişten açılan çalışmada önce/sonra karşılaştırması da açılabilir.
- Kayıt sınırı: tarayıcıdaki 20 kayıt sınırı kotadan geliyordu; sunucuda sınır yok (liste isteği en fazla 100 döndürüyor).

### 3. Baskı (CMYK) profili üretime konmalı — sahibi: Kaan

`/api/cmyk` gerçek CMYK üretiyor (4 kanal, ICC gömülü) ama hedef baskı
koşulunun profilini `CMYK_ICC_PATH` env değişkeninden alıyor ve **varsayılanı
yok**. Geliştirmede işletim sisteminin profili kullanılıyor; üretimde bu yol
geçersiz olacağı için endpoint açık bir mesajla 503 döner.

Üretime çıkmadan önce depoya serbest lisanslı bir CMYK profili konmalı
(ECI'nin `ISOcoated_v2_eci.icc` dosyası bu iş için serbest) ya da matbaanın
kendi profili alınmalı. Profilsiz bir çevrim matbaada yanlış renk verir; bunu
sessizce yapmak özelliği hiç sunmamaktan kötüdür — bu yüzden varsayılan
konmadı.

### 4. Supabase projesi kurulmadı — backend hazır, bağlanacak proje yok — sahibi: Serhan

Faz 4 backend kodu (JWT doğrulama, `projects`/`admin_users` şeması, RLS) yerel Postgres'e karşı yazıldı ve test edildi; **gerçek bir Supabase projesi henüz yok**. `SUPABASE_URL` boşken oturum gerektiren her uç nokta (projeler, `POST /api/admin/backgrounds`) açık bir 503 döner — sessizce açık kalmaz. Yapılacaklar (kullanıcı hesabı gerektirdiği için Claude yapamaz):

1. Supabase projesini oluşturmak; **JWT imzalama anahtarlarını (asimetrik, JWKS)** kullanmak — HS256 legacy secret'ı üretim için önerilmiyor.
2. `backend/.env`'e `SUPABASE_URL` ve Supabase Postgres'in `DATABASE_URL`'ini yazmak (doğrudan bağlantı ya da **session** pooler; transaction pooler asyncpg'nin prepared statement'larıyla uyumsuz). **Bundan sonra `pytest` bu veritabanına karşı çalışmayı reddeder** — test paketi bağlandığı veritabanını sıfırlıyor (`auth.users` dahil); koruma `backend/tests/db_safety.py`. Testleri `DATABASE_URL=... pytest` ile yerel bir Postgres'e yönlendir.
3. `alembic upgrade head` ile migration'ları Supabase'e uygulamak (0002 orada no-op).
4. İlk yöneticiyi SQL editöründen eklemek: `insert into public.admin_users (user_id) select id from auth.users where email = '<e-posta>';` — Faz 3'teki `X-Admin-Secret` kaldırıldığı için zemin yüklemenin artık tek yolu bu.
5. Supabase Auth ayarlarında access token süresini kısa tutmak (`SECURITY.md` 3.1: ~15 dk + refresh token).

### 5. R2 bucket CORS kuralı şimdilik yalnızca localhost — production deploy'da alan adı eklenmeli, sahibi: Serhan

Editör zeminleri `crossOrigin="anonymous"` ile yüklüyor. Bucket'ın CORS kuralı bir origin'i içermiyorsa tarayıcı görseli **hiç yüklemiyor** ve editör sessizce gradyana düşüyor; küçük önizleme (CSS arka planı) yine göründüğü için hata gözle fark edilmiyor, çıktı zeminsiz iniyor. Bu davranış sahte bir CORS'suz origin'le gerçek tarayıcıda ölçüldü; CORS'lu origin'le 2000×2000 dışa aktarma zeminle birlikte doğru çıktı.

**Bilinçli karar (10.09.2026, kullanıcı onayı):** henüz bir production alan adı yok, bu yüzden bucket'a şimdilik yalnızca `http://localhost:3000` için GET/HEAD kuralı eklenecek (şablon `backend/README.md` → "R2 CORS"). **Deploy anında bu maddeye mutlaka geri dönülmeli** — asıl production alan adı belirlendiğinde kurala eklenmezse, canlıda çıkan her kompozisyon sessizce zeminsiz iner (yerelde fark edilmeyen bir hata modu, çünkü localhost zaten kuralda var). Doğrulama: `backend/scripts/check_r2_cors.py <production-origin> http://localhost:3000` çalıştırılıp çıkış kodu 0 görülmeli.
