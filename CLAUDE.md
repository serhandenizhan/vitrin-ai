# CLAUDE.md

Bu depoda çalışırken Claude Code için rehber. Bu dosyayı her adımda güncel tutun — projenin nasıl inşa edildiğine dair tek doğru kaynak budur.

## Bu projenin geçmişi — ikinci iterasyon

Bu proje, aynı iki kişi (Serhan, Kaan) tarafından daha önce bir kez baştan sona planlanıp kısmen inşa edilmişti (Faz 0-3 tamamlanmış, Faz 4 sürüyordu). Kod tabanı bu depoda **sıfırdan yeniden yazılıyor**, ama önceki iterasyonda alınan kararlar ve doğrulanan teknik bulgular hâlâ geçerli ve tekrar tartışılmayacak. Bu bölümü, kararların *neden* alındığını anlamak için okuyun — bu, karara bağlanmış soruları yeniden tartışmaktan kurtarır.

1. **Ekip ve iş akışı:** 2 kişilik ekip. Kişi başına yerel Claude Code kullanımı (sadece bulut değil) ve normal `git push`/`pull` ile GitHub üzerinden senkronizasyon. PR'lar Claude Code içinden `gh pr create` ile açılır ve diğer kişinin incelemesinden sonra birleştirilir. Her push'tan önce açık kullanıcı onayı gerekir.
2. **Ürün tanımı:** kuyumcular için bir AI aracı. Kullanıcı bir ürün fotoğrafı yükler (yüzük, kolye vb.) → AI çok yüksek kenar hassasiyetiyle arka planı kaldırır → kullanıcı kesimi birçok özel arka plan tasarımından birinin üzerine yerleştirir ve ölçeklendirip döndürebilir, yeniden konumlandırabilir. Önce web uygulaması (konsepti doğrulamak için), asıl uzun vadeli hedef mobil uygulamadır.
3. **AI model kararı (en yüksek riskli teknik karar, kilitli):** üç zorunlu gereksinime göre araştırıldı — ücretsiz/ucuz, ticari kullanım lisansı, ince/yansıtıcı kenarlarda çok yüksek doğruluk (mücevher, segmentasyonun en zor kategorilerinden biridir). Karar: **BiRefNet, orijinal `ZhengPeng7/BiRefNet` ağırlıkları (MIT lisansı)**. BRIA'nın "RMBG" ağırlıkları (aynı mimari, farklı eğitim verisi) açıkça elendi çünkü bu spesifik ağırlıklar sadece ticari olmayan kullanım içindir — bu, bu alanda tekrar eden bir tuzaktır.
4. **Tüm teknoloji yığını birlikte kararlaştırıldı** — aşağıdaki teknoloji yığını tablosuna bakın. Ödeme sağlayıcısı (iyzico) özellikle hedef pazarın Türk kuyumcular olması nedeniyle seçildi. Seçim öncesi yapılan karşılaştırma (PayTR, iyzico, Sipay, Param, Paddle, Stripe vd.; komisyon, valör, abonelik, webhook) `docs/research/payment-platform-research-2026-09-14.md`'de. Not: o rapor maliyet nedeniyle PayTR'yi ilk sıraya koyuyordu; iyzico olgun abonelik API'si, webhook, raporlama ve fraud altyapısı gerekçesiyle tercih edildi — bu tartışma yeniden açılırsa önce o belgeye bakın. Kimlik doğrulama için Supabase Auth seçildi (Clerk değerlendirilip elendi) — detay için aşağıya bakın.
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
18. **Ders — `.env` dosyası çalışılan klasöre göre değil, kodun konumuna göre bulunmalı.** Faz 4'te backend repo kökünden (`--app-dir backend` ile) başlatıldığında `env_file=".env"` göreli yolu `backend/.env`'yi **hiç okumadı**: uygulama hatasız açıldı ama oturum isteyen her uç nokta "SUPABASE_URL ayarlanmalı" diye 503 döndü. Hata, ayarların eksik olduğu izlenimini veriyordu; asıl sebep dosyanın bulunamamasıydı. `app/core/config.py` artık `.env`'yi dosyanın kendi konumundan türettiği mutlak yoldan okuyor (`BACKEND_ENV_FILE`). Ders 11'in aynı sınıfı: yol, çalıştırma biçimine değil repo yapısına bağlanır.
19. **Ders — bir istemci kontrolü, uzak bir servisin CANLI ayarının aynasıysa, o ayar koda gömülmeden önce doğrulanmalı; aksi hâlde ayar sessizce değişince kontrol de sessizce yanlış olur.** `frontend/src/lib/password-policy.ts`, Supabase Dashboard'ın parola kuralının "küçük harf + büyük harf + rakam" olduğunu VARSAYIYORDU (doğrulanmadan koda yazılmıştı). Gerçek Dashboard ayarı ise "...and symbols (recommended)" idi — sembolsüz bir parola istemci tarafında checklist'te tamamı yeşil görünüyor, "Devam et" tıklanabiliyordu ama Supabase sunucu tarafında `weak_password` ile reddediyordu. Kullanıcı "kurallara uyuyor ama kayıt olamıyorum" diye bildirdi; teşhis ekran görüntüsüyle Dashboard'daki gerçek ayar karşılaştırılarak bulundu. **Kural: bir uzak servisin ayarını yansıtan istemci kodu yazılırken o ayar canlı panelden BİREBİR doğrulanır ve koda "buradan alındı, X tarihinde doğrulandı" notu düşülür — "muhtemelen böyledir" varsayımı yeterli değildir.**
20. **Ders — büyük bir PR'ın içinde, kilitli tasarım kararına ait bir sayfa sessizce yeniden yazılabiliyor ve kod incelemesi bunu kaçırıyor.** Faz 5 implementasyon commit'i (`d861d9c`), Faz 2'de kilitlenen tasarım dilini taşıyan 393 satırlık `/paketler` sayfasını 3 satıra indirip üç düz beyaz karta çevirdi. Commit ödeme sistemi hakkındaydı; sayfa yan etki olarak değişti. İki turlu kod incelemesi (Claude + Codex) güvenlik ve spec bulgularına odaklandığı için bunu görmedi; kullanıcı tarayıcıda "çok iyi bir tasarımla paketler sayfası vardı, neden bozdun" diye fark etti. **Kural: bir PR incelenirken `git diff --stat` içinde `frontend/src/app/**/page.tsx` ya da tasarım dili bölümündeki bir dosyada büyük silme varsa, bunun bilinçli bir karar mı yoksa yan etki mi olduğu ayrıca sorulur.** Ekrana dokunan bir değişikliğin incelemesi, sayfaya tarayıcıda bir kez bakmadan tamamlanmış sayılmaz.
21. **Ders — bir bileşen hem periyodik yoklama hem kullanıcı eylemi yapıyorsa, ikisi aynı hata state'ini paylaşmamalı; paylaşıyorsa testi yoklamanın bir turunu da beklemeli.** `/odeme/{id}` sayfası ödeme durumunu 5 saniyede bir yokluyor ve başarı dalında `setError("")` çağırıyordu. "Bu işlemi iptal et" düğmesinin hatası da aynı `error` state'ine yazıldığı için mesaj yazılır yazılmaz bir sonraki yoklamada siliniyordu: backend doğru biçimde 503 dönüp oturumu korurken kullanıcı hiçbir şey görmedi ve düğmeye dört kez bastı. Mevcut test ("hatayı gösterir") mesajı tıklamadan hemen sonra kontrol ettiği için geçiyordu — yoklama hiç çalışmadan (ders 15'in aynı sınıfı: testin baktığı yerin dışında kalan hata). **Kural: eylem sonucunu yazan state, yoklamanın dokunduğu state'ten ayrı tutulur; test de sahte zamanlayıcıyla en az bir yoklama turu ilerletip sonucun hâlâ ekranda olduğunu doğrular.**
22. **Ders — yakaladığınız özel istisnanın üretim kodunda GERÇEKTEN fırlatıldığını kanıtlayın; mock'a istisna fırlattıran test hiçbir şey kanıtlamaz.** Faz 5'te checkout iptalini fail-closed yapan düzeltme, oturumu yalnızca `CheckoutAbsent` yakalandığında kapatıyordu. Ama `CheckoutAbsent` üretim kodunda hiç fırlatılmıyordu: sınıf tanımı, `except` bloğu ve testteki `provider.checkout.side_effect = CheckoutAbsent(...)` — hepsi bu. Gerçek `Iyzico.request` yalnızca `ProviderUnavailable` ve `ProviderError("provider_rejected")`, `verify_checkout` ise `EvidenceMismatch` fırlatıyor. Sonuç: özellik üretimde her koşulda 409 dönüyordu, üstelik her deneme bir manuel inceleme alarmı üretiyordu; buna rağmen testi yeşildi, çünkü test sağlayıcının hiç üretemeyeceği bir istisna tipini kendisi uyduruyordu. **Kural: bir `except` bloğu eklerken `grep -rn "raise <İstisna>" app` ile o istisnanın üretim yolunda fırlatıldığını doğrulayın; dış servis testleri istisna TİPİNİ değil, servisin döndürdüğü gerçek YANIT GÖVDESİNİ taklit etsin ki hatayı üreten kod da sınanmış olsun.** (Ders 15'in kardeşi: yeşil test, hatanın yokluğunu göstermez.)

23. **Ders — "öncekini koru" davranışı, HATA durumunu ayrıca ele almazsa sessizce YANLIŞ ÇIKTI üretir.** Stüdyo sahnesindeki `useLoadedImage`, zemin değiştirilirken ekran kararmasın diye `keepPrevious` ile önceki görseli tutuyordu. Ama `onerror` bilinçli olarak state'e dokunmuyordu; sonuç: yeni zemin yüklenemediğinde (R2 CORS kuralı eksik, imzalı URL ölmüş, ağ hatası) karşılaştırma önceki görseli **süresiz** döndürüyordu. Kullanıcı arayüzde yeni zemini seçili görüyor, indirdiği dosyada başka bir zemin çıkıyordu. Kodun kendi yorumu da "hata olursa gradyana düşer" diyordu — gerçek davranışın tersi. **Kural: bir "yükleniyor" durumu ile "yüklenemedi" durumu ayrı tutulur; `keepPrevious` gibi bir yumuşatma yalnızca BİRİNCİSİ için geçerlidir.** Yanlış zemini göstermek, zemini hiç göstermemekten kötüdür. **Ve hata işareti BAŞARIDA temizlenmelidir:** ilk düzeltme `onerror`'da işareti koyuyor ama `onload`'da silmiyordu, bu yüzden geçici bir hatadan sonra o zemine geri dönen kullanıcı, imzalı URL yenilenene kadar (dakikalar) zemini hiç göremiyordu — "yanlış zemin" hatasının yerine "hiç zemin yok" hatası geçmişti (ikinci inceleme turunda bulundu). **Genel biçim: bir hatayı kalıcı olarak işaretleyen her bayrağın, onu temizleyen bir yolu da aynı commit'te yazılır.** Düzeltme `frontend/src/components/composer/use-loaded-image.ts`'te (hook test edilebilmesi için ayrı modüle çıkarıldı); bulgu PR #18'in Codex incelemesinden geldi.
24. **Ders — yarıda kalan bir toplu işin "güvenle yeniden çalıştırılabilir" garantisi, YAN DOSYAYA değil DETERMİNİST KİMLİĞE dayanmalı.** `scripts/upload_backgrounds.py` yüklenen dosyaları bir manifeste yazıyor ve manifestte olanı atlıyordu, ama veritabanı commit'i ile manifest yazımı arasında bir pencere vardı: süreç orada ölürse yeniden çalıştırma aynı kaynak dosya için YENİ bir UUID, ikinci bir DB kaydı ve ikinci bir R2 nesne çifti üretiyordu. Kaynak dosya adı hiçbir yerde tutulmadığı için otomatik toparlama da mümkün değildi. Çözüm şema değişikliği DEĞİL: kimlik artık dosya adından türetiliyor (`uuid.uuid5`), böylece tekrar çalıştırma aynı anahtarı üretiyor ve var olan satırı tekrar eklemiyor; içerik aynıysa yükleme de hiç tekrarlanmıyor. **Kural: idempotency'yi "neyin yapıldığını hatırlayan bir kayıt" üzerine kurmak yerine, işin kimliğini girdisinden türetin** — Faz 5'in "idempotency anahtarı İŞİ tanımlar, isteği değil" kuralının aynı sınıfı.

    **Ama determinist kimlik kendi riskini getirir ve bu risk aynı düzeltmede kapatılmalı:** kimlik yalnız dosya ADINDAN türetildiğinde, başka bir klasörde aynı adı taşıyan FARKLI bir görsel aynı kimliği ve aynı R2 anahtarını üretiyordu. İkinci çalıştırma satırı var görüp yeni kayıt açmıyor ama nesneyi ÜZERİNE YAZIYORDU: veritabanındaki zeminin içeriği sessizce değişiyor, kategorisi ve baskı uyarısı eski görsele ait kalıyordu (rastgele UUID ile bu mümkün değildi — yani düzeltme yeni bir hata sınıfı açmıştı, ikinci inceleme turunda bulundu). Çözüm iki katmanlı: kalıcı bir parti ad alanı (`--batch`, kimliğe girer) ve kimlik zaten varsa **içerik karşılaştırması** — aynıysa yükleme hiç tekrarlanmaz, farklıysa betik durur (fail-closed) ve hangi seçeneği kullanacağını söyler. **Genel kural: bir kimliği girdisinden türetirken "bu girdi gerçekten KALICI olarak tek mi" sorusu ayrıca sorulur; dosya adı tek değildir.**
25. **Ders — iki adımlı bir yükleme, İKİNCİ adım patladığında birinciyi geri almalı.** Hem `POST /api/admin/backgrounds` hem toplu yükleme betiği ana görseli ve küçük önizlemeyi ayrı iki `upload()` çağrısıyla yazıyordu; ikincisi patladığında DB satırı hiç yazılmadığı için ilk nesneye ulaşacak hiçbir kayıt kalmıyordu (erişilemez, yer tutan yetim nesne — bucket'ta gerçek bir örneği bulundu). Mevcut test bunu görmüyordu çünkü **her** yüklemeyi başarısız kılıyordu; hata testin baktığı yerin dışında duruyordu (ders 15'in aynı sınıfı). Artık başarıyla yüklenen her anahtar takip edilip hata yolunda siliniyor ve DB yazma hatası da aynı temizliği tetikliyor. **Kural: birden fazla dış yazma içeren bir işlemde, hata yolunun o ana kadar yazılanları geri aldığı ayrıca test edilir — "ilk adım patladı" testi bunu kanıtlamaz.** Temizlik ayrıca satırın ÖNCEDEN var olup olmadığına bakar: var olan bir zeminin nesnelerini silmek, yetim nesneden kötü bir durum (satır kalır, gösterdiği dosya gider) üretirdi.

26. **Ders — tarayıcıda ölçerken üç tuzak üç ayrı yanlış alarm üretti; belirtiyi koda yazmadan önce ölçüm aracını ele** (ders 13'ün somut tekrarı, PR #18 doğrulaması). Üçü de "özellik çalışmıyor" gibi göründü, üçünün de sebebi ölçümdü:
    - **Konva her katman için ayrı `<canvas>` üretiyor.** `document.querySelector("canvas")` ilk katmanı (zemin) veriyor; gölge ve yansıma ürün katmanında çizildiği için "anahtar tuvali hiç değiştirmiyor" ölçülüyor. Bütün tuvaller ayrı ayrı hash'lenince gölgenin katman 1'i, yansımanın katman 1 ve 2'yi değiştirdiği görüldü.
    - **`node.getClientRect()` ZATEN görüntü pikseli döndürüyor** (sahne ölçeği uygulanmış). Bir kez daha `sahneGenişliği / STAGE_SIZE` ile çarpmak logo tutamağını ıskalatıyor ve "köşeden boyutlandırma çalışmıyor" sonucunu veriyor. Ayrıca tutamak yalnızca öğe **seçili** iken çizildiği için önce üzerine tıklanmalı. Doğru ölçüldüğünde `size` 0.18 → 0.29 oluyor.
    - **JavaScript'in `/i` bayrağı Türkçe `İ` (U+0130) ile `i`'yi eşleştirmiyor.** `/indirme işlemi başarıyla tamamlandı/i` ekranda tam olarak o metin dururken bile eşleşmiyor. Türkçe arayüz metni ararken ya gerçek büyük harf yazılır ya `localeCompare`/normalizasyon kullanılır.
    **Ölçülebilir iz seçimi:** Konva tuvaline çizilen bir şeyin durumu DOM'dan okunamıyor. Logo için doğru iz `localStorage`'daki `vitrin-ai:logo-settings` (sürükleme `position`, boyutlandırma `size` yazıyor); ürün dönüşümü için tuval katmanlarının hash'i. `aria-checked` ile `aria-pressed` de karıştırılmamalı — `Toggle` bileşeni `role="switch"` kullanıyor.

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

- **Backend:** Python, FastAPI, asenkron işler için Celery/RQ + Redis. Redis, Faz 4 kapanışında dağıtık yükleme hız sınırlaması için öne çekilip kuruldu (`backend/app/services/rate_limit.py`); Celery/RQ kuyruğunun kendisi henüz kurulmadı.
- **AI modeli:** BiRefNet — sadece orijinal `ZhengPeng7/BiRefNet` MIT lisanslı ağırlıkları kullanın. BRIA'nın "RMBG" ağırlıklarını asla kullanmayın (aynı mimari, ancak bu ağırlıklar ticari değildir). Üretim modeli doğrudan `birefnet-general` — `-lite` ve `u2net` önceki iterasyonda elendi.
- **Veritabanı:** PostgreSQL (production'da Supabase — aynı proje, DB ve Auth ayrılmıyor)
- **Nesne depolama:** Cloudflare R2 (S3 uyumlu), public-read değil, presigned URL ile erişim
- **Frontend:** Next.js, TypeScript, Tailwind, shadcn/ui
- **Kompozisyon editörü:** Konva.js / react-konva
- **Kimlik doğrulama:** **Supabase Auth**. Oturum `@supabase/ssr` ile çerezde tutulur. FastAPI gelen Supabase JWT'sini projenin JWKS'iyle (ES256/RS256) doğrular — `backend/app/core/auth.py`. Yönetici yetkisi `admin_users` tablosundan gelir (Faz 3'ün `X-Admin-Secret`'ı Faz 4'te kaldırıldı). **IDOR koruması iki katmanlı:** backend veritabanına tablo sahibi olarak bağlandığı için RLS onu etkilemez — birinci katman her sorgudaki sahiplik filtresi (`user_id = <token'daki kullanıcı>`), ikinci katman Data API (PostgREST) kapısındaki RLS + grant'ler. **RLS'siz tablo oluşturulmaz**; `public`'teki her tablonun RLS'li olduğunu ve `anon`/`authenticated`'ın hiçbir yetkisi olmadığını `backend/tests/test_rls.py` genel olarak doğrular (bkz. `ROADMAP.md` Faz 4, `SECURITY.md` 3.2, `backend/README.md` "Kimlik doğrulama ve yetkilendirme"). **Frontend tarafı:** tarayıcı token'ı hiç görmüyor; Next.js vekilleri (`src/lib/backend-proxy.ts`) çerezdeki oturumdan token'ı alıp `Authorization` başlığıyla iletiyor. `src/proxy.ts` her istekte oturumu yeniliyor ama **yetkilendirme sayılmaz** — asıl kontrol backend'de. Ekranda gösterilen profil bilgileri (ad, şirket, hesap türü) Supabase `user_metadata`'da ve kullanıcının düzenleyebildiği veri olduğu için hiçbir yetki kararında kullanılmaz.
- **Ödemeler (Faz 5):** iyzico; iş kuralları `backend/app/services/billing` içinde.
  Ödeme kodunu değiştirirken, migration yaparken veya canlı açılış/kurtarma
  yürütürken önce [ödeme runbook’unu](docs/billing-runbook.md) okuyun.
  Checkout varsayılan kapalı; yerel test başarısı merchant sandbox doğrulaması sayılmaz.
  **Erişim kararlarında dört kural:** (1) *listeleme kota kapısı değildir* —
  `GET /api/backgrounds` kota/abonelik hatasında `basic`e düşer, listeyi
  boşaltmaz; asıl kapı `POST /api/remove-background`'daki rezervasyondur.
  (2) *bir tahsilatın iadesi/itirazı yalnızca AİT OLDUĞU aboneliği kapatır* —
  kapsam `billing_transactions.period_id → subscription_periods.provider_subscription_reference`
  üzerinden belirlenir, hesap düzeyinde askıya alma yalnız güncel abonelik için.
  (3) *ödeme alınamadığında erişim anında kesilmez* — `past_due` 3 gün
  (`past_due_access_until`, uzamaz) mevcut dönemin KALAN kotasıyla sürer, yeni
  kredi verilmez, sonra `expired`. (4) *idempotency anahtarı İŞİ tanımlar,
  isteği değil* — kredi anahtar başına yalnızca bir kez tüketilir. Başarılı PNG
  `results/<user_id>/<request_id>.png` altında 24 saat saklanır; aynı anahtar
  tekrar gelirse **inference hiç çalışmaz**, saklanan nesne döner. Sonuç ÖNCE
  saklanır, kredi SONRA tüketilir; sonuç deposu kullanılamıyorsa iş hiç başlamaz
  (`503 result_storage_unavailable`) — belirsiz bir sonucu yeniden inference'a
  bağlamak aynı krediyi ikinci kez yakardı. **Bunun sonucu: arka plan kaldırma
  artık R2 olmadan çalışmıyor**, yerelde de `R2_*` ayarları gerekiyor (yalnız
  arayüz için `USE_MOCK_BACKEND=true`). İstemci yeni bir anahtara YALNIZCA
  backend `retry_safe` dediğinde geçer; başka her durumda (ağ koptu, iş sürüyor,
  sonuç artık saklanmıyor) anahtar korunur.
- **Admin paneli (Faz 6):** backend uçları `backend/app/api/routes/admin.py`,
  şema migration `0007`. **Beş kural:** (1) *admin'in verdiği kredi dönem
  kotasını BÜYÜTMEZ* — `quota_snapshot` değişmez bir kanıt kaydıdır; bonus
  krediler `credit_grants` tablosunda durur, yalnız dönem kotası tükendiğinde
  harcanır ve erişimi kapalı bir aboneliği **diriltmez**.
  `usage_reservations.grant_id` kaynağı tutar, çünkü başarısız bir iş kredisini
  **alındığı** kovaya iade etmeli. (2) *`admin_audit_log` yalnızca eklemeye
  açıktır* (DB trigger'ı `UPDATE`/`DELETE`'i reddeder) — yöneticinin
  düzenleyebildiği bir denetim kaydı denetim kaydı değildir; `actor_id`'nin
  FK'si bilinçli olarak yoktur ki admin hesabı silinse de iz kalsın.
  (3) *admin uçlarında hız sınırı yönü uca göre seçilir*: okuma fail-open,
  yazma (kredi, silme, rol) fail-closed. Kullanıcı e-postaları `auth.users`'tan
  değil Supabase'in yönetici API'sinden okunur. (4) *yönetici hesabı panelden
  silinmez, son yönetici kendini silemez* — panel sahipsiz kalırsa yetkiyi geri
  vermenin tek yolu veritabanına elle girmektir. (5) *denetim satırı yalnız
  durumu gerçekten değiştiren istekte yazılır* — idempotent bir tekrar, günlükte
  olmamış ikinci bir eylem göstermemeli. **Arayüz (Kaan, 18.09.2026):**
  `/admin` sayfası + `app/api/admin/**` vekilleri; yöneticilik bilgisi
  `GET /api/admin/me`'den (403 dönmez, yalnız GÖSTERİM — hesap menüsündeki
  bağlantı ve ilk ekran). Arayüzdeki etiket eşlemeleri (abonelik durumu,
  tahsilat türü) tahminle değil migration CHECK kısıtlarından yazılır. **Zemin
  yönetimi (Kaan, 19.09.2026):** `/admin` → Zeminler; `GET /api/admin/backgrounds`
  kütüphanenin TAMAMINI döndürür (pakete bakmaz, **pasif zeminleri de** verir —
  panelin işi bir zeminin neden kullanıcıya gitmediğini gösterebilmek), yükleme
  Faz 3'ten beri duran `POST /api/admin/backgrounds`. `PATCH .../{id}` paketi
  ve yayın durumunu, `DELETE .../{id}` zemini kalıcı olarak değiştirir
  (üç yazan uç da hız sınırı fail-closed ve append-only audit kayıtlıdır).
  **Pasif, silinmiş değildir:** satır ve
  R2 nesneleri durur, zemin yalnız kullanıcı listesinden çıkar — kütüphaneden
  çekmenin normal yolu budur, silme geri alınamaz ve arayüzde iki adımlıdır.
  Kayıtlı bir taslağın kullandığı zemin silinmez (`409`); taslak zemini hem
  JSON `editor_state.backgroundId` hem `projects.background_id` FK alanında
  tutulur.
  Silmede sıra önce DB satırı sonra R2 nesneleri (ters sırası "satır duruyor,
  dosyası yok" üretirdi — ders 25). **Hesap
  silme EŞZAMANLI DEĞİL:** panel yalnız `deletion_requested_at` işaretleyip
  kuyruğa `delete_account` atar, asıl silmeyi
  `python -m app.services.billing.maintenance` yapar.
- **Uygulanmış bir migration yerinde düzenlenmez.** Production'daki Alembic o
  revizyonu `alembic_version`'da gördüğü için dosyayı bir daha çalıştırmaz;
  değişiklik yerelde görünür, production'da sessizce hiç uygulanmaz. Şema
  düzeltmesi her zaman YENİ numaralı bir migration'a gider (Faz 5 inceleme
  düzeltmeleri `0006_billing_review_fixes`'te; `0005`'teki iki fonksiyon orada
  `CREATE OR REPLACE` ile güncelleniyor). Testin de yalnız boş DB'den
  `upgrade head` yolunu değil, **"önceki revizyon uygulanmış DB → yeni
  migration"** yolunu doğrulaması gerekir (`backend/tests/test_migration_0006.py`).
- **Dönem snapshot'ı veritabanı seviyesinde değişmezdir** (`period_snapshot`
  trigger'ı): plan sürümü, provider referansları, tarihler ve kota sonradan
  güncellenemez; yalnız `status`, `closed_at`, `used_this_period` ve hesap
  silmedeki `user_id → NULL` serbesttir. Testin zamanı geriye alması gerekiyorsa
  korumayı tek bir yardımcıda (`backend/tests/test_billing.py::backdate_period`)
  ve yalnızca o işlem süresince kapatın — üretim yolunda yürürlükte kalsın.
- **Hız sınırı Redis arızasında her uç noktada aynı davranmaz.** Karar, uç
  noktanın NE KORUDUĞUNA göre veriliyor: para/sağlayıcı geri dönüşü/webhook
  yüzeyleri **fail-closed** (`limit_checkout`, `limit_public`), zemin
  **listeleme** ise **fail-open** (`limit_scoped`). Gerekçe: listeleme bir kapı
  değil (erişim kuralı 1) ve sınırlayıcının altyapı arızası, Next vekilinin
  bütün 5xx'leri "200 + boş liste"ye çevirmesi yüzünden kullanıcının gözünde
  93 zeminlik kütüphaneyi yok ediyordu. Her iki yön de test edilmiş durumda;
  yeni bir uç noktaya sınır eklerken bu ayrım bilinçli olarak seçilir. Destek formu
  (`POST /api/support-requests`, saatte 5/kullanıcı) da fail-open: Redis'in
  düştüğü an kullanıcının sorun bildirmek isteyeceği andır.
- **Hız sınırı kovası ters proxy arkasında doğru seçilmeli:** `request.client.host`
  doğrudan okunursa tüm trafik proxy'nin tek kovasını paylaşır, `X-Forwarded-For`'a
  körlemesine güvenmek ise sınırı tamamen kaldırır. Başlık yalnız bağlantı
  `TRUSTED_PROXY_IPS` listesindeki bir adresten geliyorsa okunur; vekil arkasındaki
  oturumlu uç noktalarda kova kullanıcıya bağlanır
  (`backend/app/services/billing/limits.py`).
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
docker-compose.yml Yerel Postgres (Faz 0/3) + Redis (Faz 4, hız sınırlaması)
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

**macOS/Linux'ta terminalden: `./execute.sh`** (repo kökünde, aynı sebeple commit ediliyor). `tasks.json`'un Windows'a özgü olması nedeniyle (`.venv\Scripts\python.exe`) eklendi — tek komutla Postgres'i (Docker) ayağa kaldırır, backend sanal ortamını/migration'larını ve frontend bağımlılıklarını ilk çalıştırmada kurar, ikisini birlikte başlatır. Ctrl+C ikisini birlikte kapatır. `VITRIN_PYTHON` / `VITRIN_VENV_DIR` ile override edilebilir (ders 11: path hard-code edilmez).

**Tuzak:** `.gitignore`'da dizinin kendisi (`.vscode/`) değil **içeriği** (`.vscode/*`) dışlanmalı — git, dışlanmış bir dizinin içine hiç bakmadığı için `!.vscode/tasks.json` negasyonu aksi hâlde çalışmaz.

**İkinci tuzak:** VS Code görevlerinde `args` içine `&&` yazılmaz; npm'e düz bir argüman olarak geçer ve Windows PowerShell'de `&&` zaten desteklenmez. Zincir gereken yerde `package.json` script'ine taşınır (`npm run kontrol`).

## Frontend çalıştırma (Faz 2'de kuruldu)

```bash
cd frontend && npm install && cp .env.example .env.local && npm run dev
```

- `frontend/.env.local` içinde `USE_MOCK_BACKEND=true` backend olmadan arayüzü çalıştırır (sahte bir kesim PNG'i döner, arayüzde "Demo modu" olarak işaretlenir). **Dikkat:** bu değer `true` kalırsa gerçek backend ayakta olsa bile arayüz hep demo/mock sonucu gösterir.
- Gerçek uçtan uca demo için backend'i ayrı bir terminalde başlatın ve `USE_MOCK_BACKEND=false` yapın. İlk istek modeli belleğe yüklediği için daha uzun sürebilir (bkz. "Bilinen kısıt" bölümü).
- Desteklenen formatlar: JPEG, PNG, WebP, HEIC/HEIF. Chrome/Firefox/Edge HEIC'i `<img>` ile gösteremiyor; önizleme `frontend/src/lib/heic-preview.ts` ile üretiliyor: önce tarayıcının kendi çözücüsü (Safari), olmazsa `heic-to` (libheif WASM, **LGPL-3.0**, ~3 MB) yalnızca HEIC seçildiğinde dinamik yükleniyor. İkisi de başarısızsa eski bilgi kartı çıkıyor. Backend'e her zaman özgün dosya gidiyor; tarayıcıda üretilen JPEG yalnızca gösterim için.
- **Dosya boyutu sınırı 20 MB** (`backend/app/core/config.py` → `max_file_size_mb`). Frontend'deki karşılığı `frontend/src/lib/upload-constraints.ts`; ikisi elle senkron tutulur.
- **Telefondan dev sunucusu:** `frontend/.env.local`'e `DEV_ALLOWED_ORIGINS=<yerel IP>` yazılıp sunucu yeniden başlatılır, telefonda `http://<ip>:3000`. Yazılmazsa Next.js 16 istekleri engeller ve sayfa açılır ama etkileşimsiz kalır — hata gibi görünür. IP koda yazılmaz (ders 11). Ayrıntı: `frontend/README.md`.
- **Mobil kontrol (13.09.2026):** sayfalar 375 px'te taşma ve dokunma hedefi için tarandı. Tuzak: yüzen üst çubuk `z-50`; üstüne açılan her katman (çekmece `z-[55]`, perdesi `z-[52]`, giriş penceresi `z-60`) daha yüksek olmalı, yoksa çubuk katmanın başlığını ve kapat düğmesini örter.
- Tarayıcı FastAPI'ye doğrudan bağlanmaz, istek `frontend/src/app/api/remove-background/route.ts` vekilinden geçer. Vekil ayrıca Windows'ta boş gelen `.heic` content-type'ını uzantıdan düzeltir ve backend'in 413/503 yanıtlarını kullanıcı diline çevirir.
- **Hesaplar (Faz 4):** `frontend/.env.local`'e `NEXT_PUBLIC_SUPABASE_URL` ve `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` yazılmalı; boşsa site açılır ama giriş yapılamaz. **Arka plan kaldırma giriş ister** (ürün kararı, demo modunda da). Vekil oturumu gövdeyi okumadan önce kontrol ediyor. Supabase panelinde gereken ayarlar: Redirect URLs'te `http://localhost:3000/auth/callback` (sıfırlama bağlantısı `?next=` eklediği için yerelde `http://localhost:3000/**`), parola kuralı (en az 8, küçük + büyük harf + rakam + **sembol** — Dashboard'daki gerçek ayar "...and symbols (recommended)", bkz. ders 19), e-posta bağlantı süresi. Ayrıntı: `frontend/README.md` → "Hesaplar".
- **Geçmiş çalışmalar sunucuda:** `work-history.ts` artık `/api/projects` vekillerine gidiyor; kayıtlı sonuç görseli `/api/projects/[id]/result` üzerinden aynı kökenden veriliyor (R2 CORS'a bağlı değil, tuval kirlenmiyor). **Faz 5'ten beri R2 zorunlu:** arka plan kaldırma başarılı sonucu idempotency için geçici bir R2 nesnesi olarak saklamadan krediyi tüketmiyor; R2 yapılandırılmamışsa kesim hiç başlamaz ve `503 result_storage_unavailable` döner (eskiden bu cümle "kesim ve indirme akışı etkilenmez" diyordu). Yalnız arayüzü denemek için `USE_MOCK_BACKEND=true`.
- **Backend'de `GET /api/health` var** (`backend/app/api/routes/health.py`, diğer tüm uç noktalarla aynı `/api` öneki altında) — `{"status": "ok"}` döner. Bilinçli olarak sadece süreç canlılığını doğrular, model yüklü mü diye bakmaz: model ilk çağrıda gecikmeli yüklendiği için (bkz. "Bilinen kısıt") health check bunu tetiklerse ilk kontrol ~30-35sn sürerdi. `backend/Dockerfile`'da bu uç noktaya bağlı bir `HEALTHCHECK` var. Arayüzde bu endpoint'i kullanan bir "servis ayakta mı" göstergesi henüz yok — istenirse eklenebilir.
- **Frontend testleri:** `cd frontend && npm test` (Vitest, 378 test). Kapsam; stüdyonun üç adımı, A4 varsayılanı, zeminin esnetilmeden kırpılması, biçim yönüne göre zemin süzme, yansıma yerleşimi, zemin kategorileri ve baskıya önerilmeyen zeminde CMYK onayı, yükleme kısıtları, arka plan kaldırma/zemin/proje/hesap vekilleri (oturum zorunluluğu dahil), CMYK yükleme limitleri, imzalı URL yenileme zamanlaması, kompozisyon geometrisi, logo/etiket yerleşimi, parola kuralı, profil doğrulaması, açık yönlendirme koruması ile kayıt formu, cursor geçmişi, yasal sürüm/yayın koruması, editör (pazaryeri, WhatsApp paylaşımı, logo reddi), açılıştaki önce/sonra ve Faz 5 incelemesinde eklenen idempotency anahtarı davranışı, stüdyonun masaüstü aşamalı akışı ve geçiş perdesi (matchMedia taklidiyle), zemin favorileri ile gölge boyutu/yoğunluğu ve yansıma mesafesi, oturum düşünce zemin listesinin boşalmaması, hesap silmede Origin kontrolü ile bekleyen checkout'un iptali ve admin listesi/mutasyon yarışı için React bileşen testlerini içerir. **Tuzak:** Konva, "tainted" tuvalde `toDataURL` hatasını fırlatmıyor, yakalayıp boş string döndürüyor — boş sonuç hata olarak ele alınmazsa PNG düğmesi sessizce hiçbir şey yapmaz (tarayıcıda ölçüldü). Daha geniş bileşen kapsamı ve E2E (Playwright) Faz 7'de kalır.
- **Zemin kütüphanesi (öne alınan iş, 17.09.2026):** 93 zemin `backend/scripts/upload_backgrounds.py` ile R2 + `backgrounds` tablosuna "basic" olarak yüklendi; betik yükleme ucuyla aynı kontrolleri yapıp zemini aynı çözünürlükte JPEG %92'ye çevirir ve 480 px önizleme (`backgrounds/thumbs/<id>.jpg`) üretir. **Veritabanı yapısı bilinçli olarak değişmedi** (Kaan: "karışıklık olur"): kategori ve baskı uyarısı `frontend/src/lib/background-catalog.ts`'te (betikle üretilir, elle düzenlenmez), zemin kimliğine göre; katalogda olmayan zemin "Sade" sayılır. 4 kategori (`lib/background-categories.ts`): Sade, Doku & desen, Doğal & çiçekli, Lüks & koyu. Düşük çözünürlüklü 4 ChatGPT zemininde CMYK düğmesi önce "Bu görsel baskıya önerilmiyor. Yine de onaylıyor musunuz?" diye sorar — kontrol yalnız arayüzde, `/api/cmyk` hangi zeminin kullanıldığını bilmez. **Tuzak (PR #18'de KAPATILDI):** Faz 5'in hız sınırlayıcısı Redis ister ve Redis yoksa `GET /api/backgrounds` 500 veriyordu; vekil bütün 5xx'leri "200 + boş liste"ye çevirdiği için stüdyo sessizce gradyan yer tutuculara düşüyordu. Artık zemin listelemenin hız sınırı **fail-open** (para/webhook yüzeyleri fail-closed kaldı, bkz. yukarıdaki hız sınırı maddesi): Redis kapalıyken de 93 zemin dönüyor, yalnızca bir uyarı log'lanıyor. Arayüz de "kütüphane hazırlanıyor" ile "yüklenemedi"yi ayırıyor ve tekrar deneme sunuyor. Zeminler yine görünmüyorsa sıradaki şüpheli Redis değil, **R2 ayarları ya da CORS kuralı**. Yerelde Redis: `Yeni klasör\araclar\redis\` (redis-windows 8.10.1, kurulumsuz), `.claude/launch.json`'daki `redis` kaydı; backend'den önce başlatılır.
- **Stüdyo ve katalog düzenlemeleri (öne alınan iş, 17.09.2026, Kaan):** stüdyo **A4 ile açılır**, "Kare 2000×2000" kaldırıldı (beyaz zeminli Pazaryeri duruyor). Düzenleme **üç adım**: 1 Boyut ve zemin → 2 Ürün (yerleşim, parlaklık/kontrast/doygunluk, gölge, yansıma) → 3 Bitir (logo, etiket, indirme, CMYK, WhatsApp). Zemin artık **esnetilmiyor**, biçimi ortadan kırparak kaplıyor (`coverCrop`); fotoğraf/desenli zeminler yalnızca biçimin yönüne (dikey/yatay; kare = yatay) uyuyorsa listelenir, **Sade her biçimde** (`fitsOrientation`; yön katalogda, yükleme betiği ölçülerden üretir). "Işık havuzu" kaldırıldı, yerine **yansıma** (ayrı Konva katmanında `destination-in` ile silikleşen ayna kopya). **Gölge güçlendirildi** (`SHADOW` 50/34/%55): eski değer Konva'da ölçüldü, açık zeminde ~27/255, koyu zeminde ~0 koyulaşma veriyordu — önbellek teşhisi ölçümle çürütüldü, sebep zayıf değerlerdi. Katalog PNG yerine **JPEG + baskıya uygun CMYK** ve **logo** (stüdyoyla aynı depolama; `lib/print-download.ts`, `lib/logo-image.ts` ortak). Sol panelden eski çalışma ana sayfa dışındaki sayfalarda açılmıyordu: bekleyen çalışma `sessionStorage`'a yazılıp ana sayfaya gidiliyor (sağlayıcı her sayfada yeniden kuruluyor, bellek yetmez).
- **Aynı günün sonraki turları (17.09.2026, Kaan):** indirme sonrası soru (katalog boyutunda önce "şablona ekle" → `lib/catalog-handoff.ts` ile Katalog'da "Tam sayfa", sonra "ana menüye dön"); katalogda 6 şablon, sayfa rengi ve siyah/beyaz metin (`applyTemplateColors`); logo stüdyoda ve katalogda sürüklenip kare köşelerden boyutlandırılıyor (`LogoSettings.position`), renkleri çevrilebiliyor; stüdyoda **gölge kapalı başlıyor**. **Tuzak:** Konva önbelleği `shadowEnabled` değişince yenilenmiyor, gölge aç/kapa için `clearCache()`+`cache()` şart. **Gölge boyutu/yoğunluğu ve yansıma mesafesi (19.09.2026):** `Appearance`'a `shadowSize` (`SHADOW` çarpanı), `shadowOpacity` ve `reflectionGap` eklendi; aynı tuzak nedeniyle önbellek bu değerler değişince de yeniden alınıyor. Eski taslaklar `normalizeAppearance` ile varsayılanlara tamamlanıyor. **Tuzak:** `sessionStorage`'tan okurken silmek geliştirmede (StrictMode, efekt iki kez) veriyi kaybettiriyor — önce oku, teslim edince sil. Bülten `/bulten` (içerik `lib/bulletin.ts`); **altın kuru yok**: ücret/lisans/yazılı izin isteyen veri kaynağı eklenmez (TCMB ticari kullanımda yazılı izin istiyor). Telefonda liste düzenleri içeriğe göre farklı (`globals.css` `.mobile-rail` yalnızca görselli listelerde; diğerleri kısa liste, açılır başlık, sekme).
- **Görsel varlıklar betikle üretilir, elle değil:** `node scripts/prepare-photos.mjs` (gerçek ürün fotoğraflarını web için hazırlar; kaynak `frontend/photo-source/`), `python scripts/generate-mock-cutout.py` (demo modunun örnek kesimi) ve `backend/.venv/Scripts/python frontend/scripts/prepare-before-after.py` (açılıştaki önce/sonra çifti; BiRefNet'i doğrudan çağırır, ~12 GB RAM ister). İkili bir dosyayı kaynağı olmadan commit etmek, ileride "bu nereden geldi, nasıl değiştirilir" sorusunu cevapsız bırakır.
- **README logosu öne alındı (Serhan, 17.09.2026):** Faz 6 kapanışı için planlanan iş, kullanıcı onayıyla şimdi yapıldı. Kök `README.md`'nin başında `docs/brand/vitrin-ai-logo-2.png` var. Marka işaretinin üç renk çeşidi de depoda duruyor: `vitrin-ai-logo.png` (beyaz), `vitrin-ai-logo-2.png` (altın), `vitrin-ai-logo-3.png` (siyah) — hepsi 1530×1040, saydam zeminli PNG. **README'de altın olan seçildi** çünkü GitHub hem açık hem koyu temada gösteriyor: beyaz çeşit açık temada, siyah çeşit koyu temada kayboluyor. İlk sürümde kullanılan `docs/brand/vitrin-ai-mark.svg` kaldırıldı (kullanıcı GitHub'da görünmediğini bildirdi). **Not:** PNG'lerdeki altın `#c9a15c`, arayüzün `--color-gold` değeri (`#d1a25b`) ile tam aynı değil; bu dosyalar arayüz bileşeninden (`frontend/src/components/brand-mark.tsx`) türetilmedi, ayrı tasarım çıktılarıdır — arayüz rengi değişirse bu dosyalar kendiliğinden güncellenmez.
- Ayrıntılı gerekçeler ve klasör yapısı için `frontend/README.md`.

## Arayüz tasarım dili (kilitli karar — Faz 2)

Web arayüzü, kullanıcının referans olarak verdiği **apple.com/tr** ürün sayfalarından uyarlandı. Bu bir stil tercihi değil, kullanıcının açık kararı — yeniden tartışılmayacak, yeni bölümler de aynı dile uyacak.

**Uyarlanan (ölçülebilir) şeyler:** tipografi ölçeği ve negatif harf aralığı (hero 64/68 px, bölüm 48/52, alt başlık 28/32, gövde 17/21), 600 ağırlıklı başlıklar, tam genişlikte dönüşümlü koyu/açık bölümler (`#000` / `#1d1d1f` / `#f5f5f7` / `#fff`), 112 px dikey ritim, hap biçimli düğmeler, kaydırınca opaklık + kayma ile ortaya çıkan kısa `ease-out` geçişler.

**Palet 10.09.2026'da sıcak nötrlere çekildi** (kullanıcı kararı: "daha ilgi çekici ve göz yormayacak tonlar"). Apple'ın nötr grileri (`#000` / `#1d1d1f` / `#f5f5f7` / `#fff`) yerine `#0c0b0a` / `#1a1917` / `#f6f4f1` / `#fdfcfb`, koyu zeminde metin `#f3f0eb`. İki gerekçe: saf siyah zeminde saf beyaz metin büyük alanlarda yorucu (karşıtlık ~%92'ye indirildi, WCAG AAA'nın hâlâ çok üzerinde), ve altın vurgu sarımsı-nötr bir zeminde uyum kuruyor — mavi eğilimli `#f5f5f7` üzerinde hafif yeşilimsi duruyordu. Ölçek, ritim ve tipografi değişmedi.

**Büyük başlıklarda nokta kullanılmaz** (kullanıcı kararı, 10.09.2026). `display-hero`, `display-section` ve `display-feature` sınıflarını taşıyan her başlık noktasız biter. Apple'ın kendi başlıkları nokta kullanır ama kullanıcı bu ayrıntıda ayrıştı; kural burada geçerli.

**Menüdeki her öğe ya bir yere götürür ya bir şey açar, ikisi karışık değil.** `Deneyin`, `Katalog` ve `Paketler` bağlantı; `Nasıl çalışır` ve `Hakkında` panel açıyor (`nav-panel.tsx`) ve yanlarındaki ok bunu önceden söylüyor. **Üst çubuk 11.09.2026'dan beri yüzen bir kapsül** (kullanıcı: "soluk ve eski moda"): kenarlardan 12 px içeride, sayfanın üstüne biniyor; sayfaların ilk bölümü bu payı `page-top` sınıfıyla geri alıyor (`.section-rhythm.page-top`, bkz. `globals.css`). Yeni bir sayfa eklenirken ilk bölüme `page-top` konmazsa başlık çubuğun altında kalır. Paneller de çubukla aynı genişlikte yüzen kartlar; telefonda bağlantılar "Menü" panelinde. Panel içerikleri aracı kullanmak için gerekli olmadığından sayfaya bölüm olarak konmuyor — konduklarında ziyaretçinin araca ulaşması her biri için bir ekran gecikiyordu.

**Uyarlanmayanlar — bilinçli:**
- **SF Pro kullanılmaz.** Apple'a ait ve lisanslı; yerine Inter (aynı sınıfta neo-grotesk).
- **Apple'ın metinleri, görselleri ve marka öğeleri kopyalanmaz.** Sayfadaki her cümle ve sayı projenin kendi gerçeğine dayanır.
- **Vurgu rengi Apple'ın mavisi (`#2997ff`) değil, altın.** Hedef kitle kuyumcu.

**Yapısal fark:** Apple'da ürün bir fotoğraftır, bizde **çalışan aracın kendisi**. Bu yüzden araç tanıtım bölümlerinin sonuna değil, açılıştan hemen sonraya konuldu.

**Bu karar 10.09.2026'da iki kez sınandı ve sonunda korundu.** Önce aracın üstüne iki tanıtım bölümü eklendi (uygulama turu + misyon/vizyon); aynı gün ikisi de kaldırıldı. Tur, yatay kaydırmalı galeri olarak kurulmuştu ve kullanıcı hem kaydırmanın masaüstünde iyi çalışmadığını hem görüntünün referans kaliteye ulaşmadığını söyledi; misyon/vizyon ise panele taşındı. **Sonuç: araç yine açılıştan hemen sonra.** Tanıtım metinleri panellerde, görsel örnekler ise aracın ALTINDA (`backgrounds-showcase.tsx`) — kullanıcı kendi fotoğrafını denedikten sonra "başka ne yapabilirim" sorusunun cevabı olarak.

**Uygulama:** yardımcı sınıflar `frontend/src/app/globals.css` içinde (`display-hero`, `display-section`, `display-feature`, `lede`, `fine-print`, `surface-*`, `section-rhythm`, `reveal`, `press`). Yüzey renkleri bilinçli olarak **sabit**, token değil — bir bölüm "koyu" işaretlendiğinde açık temada da koyu kalmalı, dönüşümlü ritim buna dayanıyor. Punto değerleri `clamp` ile akışkan; alt/üst sınırlar Apple'ın mobil/masaüstü değerleriyle aynı. Ayrıntı ve ölçüm tablosu: `frontend/README.md` → "Tasarım dili".

**Durum taşıyan tek istemci bileşeni `background-remover.tsx`;** tanıtım bölümlerinin hepsi sunucu bileşeni ve istemciye hiç inmiyor. Yeni bölüm eklenirken bu ayrım korunmalı. (İstisnalar: 13.09.2026 — açılıştaki önce/sonra kaydıracı `marketing/hero-before-after.tsx` küçük bir istemci parçası, çerçevesi `hero-visual.tsx` sunucu bileşeni olarak kaldı. 15.09.2026 — `/paketler`'de yalnız kart ızgarası ve satın alma formu (`billing-plans.tsx`) istemcide, çünkü fiyat/kota `GET /api/plans`ten geliyor ve satın alma etkileşimli; hero, karşılaştırma tablosu ve SSS sunucu bileşeni olarak kaldı. `/odeme/{id}` sayfasının içi (`checkout-page.tsx`) de durum yoklaması yaptığı için istemcide.)

**Yumuşak geçişler (13.09.2026, kullanıcı isteği: "tak diye açılıyor").** Bir ekran, pencere ya da katman belirirken `soft-enter` (hafif yükselip belirme) ya da `soft-fade` sınıfları kullanılıyor; tanımlar `globals.css`'in sonunda. Yalnızca giriş animasyonu, eğri sitenin geri kalanıyla aynı (`cubic-bezier(0.16, 1, 0.3, 1)`), "hareketi azalt" açıkken kapalı. Yeni bir koşullu ekran eklenirken aynı sınıflar kullanılmalı. **Doğrulama tuzağı:** gömülü tarayıcı paneli gizliyken kare üretilmediği için bu animasyonlar ilerlemez ve öğe görünmez kalır gibi ölçülür (ders 13); ölçmek için Web Animations API ile zaman ilerletilir.

## Araç yüzeyi — koyu tema ve camlı katmanlar (17.09.2026, Serhan)

Yukarıdaki tasarım dili **iptal edilmedi**; bu, onun yanında duran ayrı bir
yüzey türü. Kural: **stüdyo ve ona giden çalışma ekranları koyu, site açık.**

**Gerekçe:** stüdyo bir sayfa değil bir ARAÇ. Koyu zemin ürünün kendi rengini
doğru gösteriyor (beyaz panelin yanındaki altın, ürünün üzerindeki altını
yanıltıyordu) ve camlı yüzeyler tuvali tamamen örtmeden üzerinde durabiliyor.
**Yeni renk uydurulmadı:** zemin `surface-black` (`#0c0b0a`), cam
`surface-charcoal` %78 + `backdrop-filter`, metin `#f3f0eb` / `#a8a29a`, kenar
`--color-hairline`, vurgu yine altın.

**Kapsam:** stüdyo katmanı (`studio.tsx`), bekleme ekranı ve inceleme ekranı.
Yükleme adımı açık kalıyor — orası hâlâ tanıtım sayfasının parçası, ve karar
"çalışmanın ortasında beyazdan koyuya sıçrama olmasın" üzerineydi.

**Düzen kuralı (18.09.2026, Kaan — iPhone Fotoğraflar düzeni):** stüdyonun
bütün kontrolleri tuvalin altında: **ince bir bar** (solda ‹ geri, sonra
Boyut · Zemin | Yerleşim · Görünüm | Marka · İndir — adımlar ince ayraçla
gruplu, "Devam" yok) ve barın ÜSTÜNDE açılan **menü kartı**. Bar HİÇ
KIPIRDAMAZ: kart, sabit yükseklikli bir alanın altına hizalı açılır. **Geri
tuşu (solda) ARAÇLAR ARASINDA gezer** — bir önceki araca (Boyut ↔ Zemin),
Görünüm'de açık kaydıraçtan önce Görünüm menüsüne; kartı KAPATMAZ. **Küçült
tuşu (sağda)** kartı ve barı tek bir küçük hapa indirir ve **tuval o yeri
alarak büyür** — ikisi aynı eğriyle birlikte hareket eder
(`.stage-fit-collapsed`, `.dock-card-area`). Dört kez yinelendi, sebepleri
kalıcı ders: sağda ayrı kart → göz iki yere gidiyordu; içerik boyunda panel →
bar her araçta kayıyordu; sabit kalın panel → görsel bütünlük bozuldu; geri
tuşu kartı kapatıyordu → "geri" gezinmedir, kapatmak ayrı bir düğmedir. **Masaüstü AŞAMALI akış (19.09.2026, Kaan):** stüdyo
masaüstünde üç gerçek aşama: **1 Sahne** (sağda geniş zemin kütüphanesi +
biçimler, ✓ ile ilerler) → **2 Düzenle** (solda dik zemin barı, sağda
Yerleşim · Görünüm · Marka paneli, altta ‹ Sahne / ✓ Tamamla) → **3 Tamamla**
(yalnızca indirme seçenekleri, görselin altında, ‹ Düzenle). Her geçişte ve
stüdyo açılışında koyu perde (`stage-curtain.tsx`; solda logo, "0N / 03" ve
aşama adı); aşama perde KAPANINCA değişir, "hareketi azalt"ta perde yok. Üst
bardaki adımlar masaüstünde yalnızca GERİYE tıklanır (`EditorStatus.mode`,
`navigateRef` — efektten state değiştirilmez); "Dışa Aktar" masaüstünde gizli.
Tuval her aşamada aynı DOM konumunda (Konva yeniden kurulmuyor). Aşama 2'de iki yan esnek ve EŞİT (`flex-1`, 17–26rem): solda ince DİK zemin barı, yuvarlak zeminler İKİ SIRA (`BackgroundRail`, yuvanın tuvale bakan kenarında), sağda panel — tuval üst barla aynı eksende kalır; panel kapanınca iki yan da 4,75rem'e iner. Aşama 2'de tuvalin altındaki künyede **Önizle**: basılı tutulunca (ya da **Boşluk** basılıyken) tutamaçlar gizlenir (`cleanView`); yazı alanlarında Boşluk normal çalışır. Ayrı önizleme aşaması yok, Aşama 3 zaten temiz görüntü. Telefon
şimdilik eski düzende (kullanıcı kararı). **Önceki masaüstü düzeni (aynı gün;
tasarım Claude'a bırakılmıştı):** zeminler bir araç değil, tuvalin altında **sabit,
ince bir bar** (kategori segmentleri + yuvarlak örnekler, **Favoriler**
rafı). Kalan araçlar (Boyut · Yerleşim · Görünüm · Marka · İndir) **sağdaki
tek kartta** (`Dock` `variant="side"`, `lg` ve üstü): üstte eşit sekmeli
segment kontrolü, altında yalnızca seçili aracın **gruplu listesi**
(`PANEL_GROUP` / `PANEL_ROW`, iOS Ayarlar dili) — kaydırma gerektirmemeli.
Altın yalnızca SEÇİLİ durumda. Tuval ve panel ekranın ortasında bir grup;
tuval sütununun genişliği biçimden türüyor (`.stage-column`), tuval payı
TEK kaynaktan (`--studio-reserved-lg`). Panel kapanınca `--panel-w` küçülür
ve tuval büyür. Üst bar, panel ve zemin barı aynı cam (`liquid-glass`);
arka plan `.studio-backdrop` (sıcak fildişi + ışık + ince doku). Telefonda
alt bar düzeni duruyor. **Yeni araç `STEP_TOOLS`'a eklenir, ikinci bir panel
açılmaz.** Masaüstü düzeninin testleri `matchMedia` taklidiyle
(`composition-editor.test.ts` → "masaüstü düzeni") — jsdom'da `matchMedia`
yok, taklit edilmezse testler yalnızca telefon düzenini sınar. Zemin seçimi kategori
sekmeleri + ADLARIYLA YATAY şerit; paneldeki bütün şeritlerde fare tekerleği
SAĞA/SOLA kaydırır (`use-horizontal-wheel.ts`) ve kaydırma çubuğu gizli.
Dikey ızgara denendi ve bırakıldı: kart büyüdü, adlar kayboldu, ikinci bir
kaydırma çubuğu çıktı. Yatay şeridin asıl kusuru tekerlekti, şerit değil.
Şeritlerin iki yanında cam oklar (`scroll-arrows.tsx`; yalnızca o yönde yer
varsa görünür). **Zeminler arası çapraz geçiş** (`editor-stage.tsx`, 0,42 sn):
eski zemin geçici bir Konva düğümü olarak altta kalır. **Kural:** tuvale
eklenen her animasyon dışa aktarmadan ÖNCE bitirilmeli — `renderStage`
`finishBackgroundFade`'i çağırıyor, yoksa dosyaya iki zeminin karışımı girer
(ders 23'ün "yanlış çıktı" sınıfı). **Tek satırlık menüler (Zemin, Boyut)
ince kartla açılır** ve tuval aynı miktarda büyür (`.stage-fit-compact`);
kategori sekmeleri kartın başlık satırında. Seçim geçişleri tek bir uzun eğriyle
(`cubic-bezier(0.32, 0.72, 0, 1)`, 500–560 ms); seçili sekme/araç altında
cam mercek süzülür (`glass-lens.tsx`, ortak).
Yüzey **Liquid Glass, üstteki navbar'ın camıyla aynı kömür grisi**
(`.liquid-glass`, `globals.css`) — açık ve açık-gri denemeler beyaz çalışma
alanında ya kayboldu ya navbar'la iki ayrı malzeme gibi durdu. Liquid Glass
hissi tondan değil katmanlardan: parlak iç çizgi, ışık lekesi, köşede parlayan
kenar, kayan cam mercek ve "camdan büyüyen" geçişler. Yeni bir araç
eklenirken sağa ayrı bir kart açılmaz, `STEP_TOOLS`'a eklenir. Ayrıntı ve
ölçümler: `frontend/README.md` → "Stüdyo düzeni".

**Üç şey tarayıcıda ÖLÇÜLEREK bulundu, tahminle değil:**
1. `backdrop-filter`'ın kare maliyeti **yok** (16,67 ms / 16,66 ms).
2. Açılışta seçili zemin altın halkayı taşıyor ama **kaydırma alanının
   dışında** kalıyordu; artık görünür duruma kaydırılıyor.
3. Telefonda yapışkan tuval iki kez bozuldu: kısa bir kapsayıcı içinde
   yapışkanlık hiç çalışmıyor, ve yapışkan (konumlandırılmış) öğe statik
   kardeşlerinin üzerine boyanıp alttaki paneli örtüyor.

## Geçmiş çalışmalar — Faz 2'nin geçici çözümü Faz 4'te kapandı

Faz 2'de kullanıcı isteğiyle tarayıcıda (IndexedDB) tutulan geçmiş, Faz 4'te **sunucuya** taşındı: `frontend/src/lib/work-history.ts`'in yalnızca gövdesi değişti, fonksiyon adları aynı kaldı. Ürün kararları (Kaan, 12.09.2026): eski tarayıcı kayıtları hesaba **taşınmıyor** (eski IndexedDB deposu siliniyor), sunucuda yalnızca **sonuç** saklanıyor, **arka plan kaldırma giriş istiyor**. Ayrıntı: `ROADMAP.md` Faz 4, `frontend/README.md` → "Geçmiş sunucuda".

## Açık takip maddeleri

Kapatılmamış, sahibi belli işler. Bir madde çözüldüğünde buradan **silinir**, "tamamlandı" diye bırakılmaz — liste her zaman yalnızca açık işleri göstermeli.

### 1. Baskı (CMYK) profili üretime konmalı — sahibi: Kaan

`/api/cmyk` gerçek CMYK üretiyor (4 kanal, ICC gömülü) ama hedef baskı
koşulunun profilini `CMYK_ICC_PATH` env değişkeninden alıyor ve **varsayılanı
yok**. Değişken boşsa ya da dosya okunamıyorsa endpoint dönüşüme başlamadan
açık bir mesajla 503 döner.

Profilsiz bir çevrim matbaada yanlış renk verir; bunu sessizce yapmak özelliği
hiç sunmamaktan kötüdür — bu yüzden varsayılan konmadı.

**Profil seçildi (16.09.2026, Kaan): ECI "PSO Coated v3"** (FOGRA51, ISO
12647-2:2013, kuşe kâğıda ofset). eci.org indirme sayfası, `pso-coated_v3.zip`
(1784 KB) → `PSOcoated_v3.icc`. Eski öneri `ISOcoated_v2` artık ECI'nin
"eski sürümler" bölümünde; ECI onu yalnızca eski dosyalar için sunuyor.

**Profil DEPOYA KONMAZ — lisans.** Profilin içindeki telif etiketi: kullanılabilir,
dosyalara gömülebilir ve paylaşılabilir; **ECI'nin yazılı izni olmadan dağıtılamaz,
satılamaz, değiştirilemez.** Depo GitHub'da herkese açık; oraya koymak dağıtım olur.
Kullanıcının indirdiği CMYK dosyasına gömülmesi ve matbaaya gönderilmesi serbest.
Bu yüzden: `*.icc` kök `.gitignore`'da, profil depo dışında durur ve
`CMYK_ICC_PATH` ile verilir (yerelde `Yeni klasör\vitrin-ai-baski\PSOcoated_v3.icc`).

**Planlandı: Faz 6 (kullanıcı kararı, 17.09.2026).** PR #18 incelemesi
sırasında bu iş bilinçli olarak o PR'ın kapsamı dışında bırakıldı (ödeme/zemin
düzeltmeleriyle ilgisi yok) ve `ROADMAP.md` Faz 6'da Kaan'ın kısmına yazıldı.
PR #18'in yorumunda iş Serhan'dan istenmişti; sahip **Kaan** olarak netleşti.
PR #18'de yalnızca şu doğrulandı: profil ayarlı değilken `POST /api/cmyk`
doğru mesajla 503 dönüyor.

**Açık kalan — canlıya çıkarken:** profil dosyası sunucuya ayrıca konup
`CMYK_ICC_PATH` o yola ayarlanmalı. Frontend **Vercel**'e çıkarsa bilgisayardaki
bir yol okunamaz; o durumda profil özel bir depolamadan (ör. herkese açık olmayan
R2 nesnesi) çalışma anında alınmalı — henüz yazılmadı, dağıtım hedefi belli
olunca karar verilecek.

**Ölçüm (17.09.2026):** çıktı gerçekten 4 kanallı CMYK, alfasız, içinde
"PSO Coated v3" profili gömülü (TIFF ve JPEG). **Profil 2,2 MB** ve her dosyaya
gömülüyor: küçük bir görsel bile ~2,2 MB iniyor. Beyaz 0/0/0/0 çıkıyor (saydamlık
beyaza düzleşiyor). **18-19.09.2026: Kaan çıktıyı Photoshop'ta açıp iki kez
kontrol etti — CMYK olarak açılıyor, çalışıyor.** Kaan'ın değerlendirmesi:
"matbaada bir sorun çıkmaz" (19.09.2026). Fiziksel matbaa provası hâlâ
yapılmadı; **kod tarafında yapılacak bir iş kalmadı**, açık olan tek şey
aşağıdaki deploy adımı (profil dosyasının sunucuya konması).

### 2. R2 bucket CORS kuralı şimdilik yalnızca localhost — production deploy'da alan adı eklenmeli, sahibi: Serhan

Editör zeminleri `crossOrigin="anonymous"` ile yüklüyor. Bucket'ın CORS kuralı bir origin'i içermiyorsa tarayıcı görseli **hiç yüklemiyor** ve editör sessizce gradyana düşüyor; küçük önizleme (CSS arka planı) yine göründüğü için hata gözle fark edilmiyor, çıktı zeminsiz iniyor. Bu davranış sahte bir CORS'suz origin'le gerçek tarayıcıda ölçüldü; CORS'lu origin'le 2000×2000 dışa aktarma zeminle birlikte doğru çıktı.

**Bilinçli karar (10.09.2026, kullanıcı onayı):** henüz bir production alan adı yok, bu yüzden bucket'a şimdilik yalnızca `http://localhost:3000` için GET/HEAD kuralı eklenecek (şablon `backend/README.md` → "R2 CORS"). **Deploy anında bu maddeye mutlaka geri dönülmeli** — asıl production alan adı belirlendiğinde kurala eklenmezse, canlıda çıkan her kompozisyon sessizce zeminsiz iner (yerelde fark edilmeyen bir hata modu, çünkü localhost zaten kuralda var). Doğrulama: `backend/scripts/check_r2_cors.py <production-origin> http://localhost:3000` çalıştırılıp çıkış kodu 0 görülmeli.

### 3. Ödeme bildirimi ve proxy ayarları deploy anında verilmeli — sahibi: Serhan

İki ayar üretimde verilmezse sistem çalışır ama **sessizce eksik davranır**:

- `RESEND_API_KEY` + `BILLING_EMAIL_FROM` yoksa "ödemeniz alınamadı, kartınızı
  güncelleyin" e-postası hiç gitmez. Sessiz kalmıyor (`billing_alerts`'e
  `dunning_email_not_sent` yazılıyor); action `succeeded` sayılmıyor, sınırlı
  retry/manual inceleme için açık kalıyor. Yine de operatör alarmı çözmezse
  kullanıcı 3 günlük grace penceresini haberi olmadan tüketebilir.
- `TRUSTED_PROXY_IPS` (ve uvicorn'un `--proxy-headers` / `--forwarded-allow-ips`
  değerleri) verilmezse hız sınırı bütün public trafiği proxy'nin tek kovasına
  koyar; sınır fiilen kalkar ve bunu yerelde fark etmenin yolu yoktur.

Sağlayıcı yeni değil: aşağıdaki 6. maddede Supabase Auth için seçilen Resend'in
aynısı. Fark, buradaki e-postanın Supabase'in gönderdiği kimlik doğrulama
postası değil, uygulamanın kendi bildirimi olması — bu yüzden Supabase SMTP
ayarından değil, kendi `RESEND_API_KEY`'imizle HTTP API'sinden gidiyor.
Ayrıntı: `docs/billing-runbook.md` "Kurulum sırası" 5. ve 6. maddeler.

### 4. Bakım worker'ı canlıda periyodik çalışmalı — sahibi: Serhan

`provider_actions` kuyruğunu (hesap silme, abonelik iptali, dunning e-postası,
depolama temizliği) işleyen tek şey `python -m app.services.billing.maintenance`.
Bir servis olarak kurulu değil; 19.09.2026'da test hesabının silinmesi elle
çalıştırılana kadar "sırada" kaldı. **Canlıda periyodik çalıştırılmazsa
(systemd timer / cron) hiçbir silme talebi, iptal ya da ödeme bildirimi
tamamlanmaz** — arayüz "işlem sırada" der ve süresiz orada kalır. Yerelde bu
fark edilmiyor çünkü kuyruk zaten boş duruyor.

**PR #25'ten Serhan'a devredilen açık iş:** production hedefi belli olduğunda
bu komut için tekil çalışan bir cron/systemd timer kurulacak; çakışan iki turun
aynı işi sahiplenmediği ve başarısız turun alarm ürettiği doğrulanacak. Sonra
gerçek bir test hesabı silme isteğiyle `provider_actions` kaydının `succeeded`
olduğu ve `billing_runs` içindeki son başarılı çalışma zamanının ilerlediği
gözlenecek. Bu doğrulama yapılmadan hesap silme/iptal/dunning akışı production'a
hazır sayılmaz.

**PR #25 sahiplik notu:** `GET /api/admin/me` Serhan'ın backend alanı,
`PATCH`/`DELETE /api/admin/backgrounds/{id}` ise Serhan'ın planlanan PR 2
kapsamıydı; Kaan bunların üçünü de PR #25'te tamamladı. Serhan tarafında yeniden
yazılacak iş yoktur; PR 2 hazırlanırken aynı değişiklikler tekrarlanmayacak,
yalnız çakışma/rebase kontrolü yapılacaktır. CMYK deploy adımının sahibi Kaan'dır;
zemin favorilerini hesaba bağlama işi ise PR #25'te Serhan'a atanmadı.

### 5. Production yasal kimliği ve hukukçu kontrolü — sahibi: Kaan + Serhan

KVKK Aydınlatma Metni, Gizlilik Politikası ve Kullanım Koşulları yayımlandı;
kayıtlar sunucu zamanlı, istemciden değiştirilemeyen `user_consents` tablosuna
sürümüyle yazılıyor. Production'a çıkmadan önce gerçek veri sorumlusu unvanı ve
başvuru e-postası `NEXT_PUBLIC_DATA_CONTROLLER_NAME` /
`NEXT_PUBLIC_LEGAL_CONTACT_EMAIL` ile verilmeli ve metinler Türkiye'de yetkili
bir hukukçu tarafından son kez kontrol edilmeli. Vercel production veya
`VITRIN_DEPLOY_ENV=production` bu iki değer eksikken build'i durdurur.

### 6. Gerçek kullanıcılara HİÇ e-posta gitmiyor — sahibi: Serhan (düzeltildi 17.09.2026)

Kayıt, e-posta doğrulaması ve parola sıfırlama Supabase Auth'un gönderdiği
e-postalara bağlı (`email_not_confirmed` akışı, "e-postanızı kontrol edin"
ekranı — bkz. `frontend/README.md` "Hesaplar").

**Bu madde önceden "e-posta spam'e düşüyor" diyordu — YANLIŞTI, düzeltildi.**
17.09.2026'da Kaan gerçek kullanımda hem kayıt hem "şifremi unuttum" denedi,
ikisinde de hata aldı. Supabase Auth Logs'ta `/auth/v1/signup` ve
`/auth/v1/recover` **500**, Resend Logs'ta karşılık gelen `/emails` isteği
**403** olarak görüldü — e-posta spam'e düşmüyor, **hiç gönderilmiyor.**

**Kök sebep (kaynağından doğrulandı):** gönderen adres hâlâ
`onboarding@resend.dev` — Resend'in yalnızca **hesap sahibinin kendi
e-postasına** teslimat yapan test alan adı. Başka her adrese (Kaan dahil,
gerçek her müşteri dahil) gönderim Resend tarafında 403 ile reddediliyor;
bu red Supabase'de 500'e dönüşüp arayüzde genel bir hataya düşüyor.
("resend.dev is a test-only sender that can only deliver to the email
address on your Resend account" —
[VibeAnswers](https://vibeanswers.com/resend/403-testing-emails-error/);
"you need to verify a domain... and change the from address" —
[Resend API errors](https://resend.com/docs/api-reference/errors).)
14.09.2026'daki "doğrulama" da bu yüzden yanıltıcıydı: test edilen adres
(`serhandenizhan404+etiket@gmail.com`) hesap sahibinin **kendi** adresinin
bir varyasyonuydu, yani sandbox kısıtına hiç çarpmamıştı.

**Geçici çözüm (17.09.2026, Kaan'ın hesabı için uygulandı):** Supabase'in
yönetici API'si (`PUT /auth/v1/admin/users/{id}`, `SUPABASE_SECRET_KEY` ile)
parolayı e-postaya HİÇ dokunmadan doğrudan yazabiliyor. Kaan'a rastgele bir
geçici parola bu yolla atandı ve güvenli bir kanaldan iletildi; Dashboard'daki
"Reset password" düğmesi denenmedi çünkü o da aynı bozuk e-posta yoluna
gidiyor — kalıcı çözüm değil, yalnızca tek seferlik kilit açma.

**Domain almadan denenebilecek — henüz denenmedi:** Supabase'in kendi
(built-in) e-posta servisi, custom SMTP hiç bağlanmasaydı da çalışırdı;
resmi belgeye göre saatte 2 e-postayla sınırlı
([Supabase Rate Limits](https://supabase.com/docs/guides/auth/rate-limits)).
Bu sınırın dışında kime gönderebildiği resmi belgede açık değil — bazı
ikincil kaynaklar yalnızca "yetkili takım adresleri"ne gittiğini söylüyor
ama bu, Supabase'in kendi belgesinden DOĞRULANAMADI. Yani şu an bilinmeyen:
Authentication → SMTP Settings'ten özel SMTP'yi kapatıp built-in'e dönmek,
Kaan gibi harici bir adrese (saatte 2 taneyle sınırlı olsa da) gerçekten
ulaşır mı ulaşmaz mı — denenip sonucu buraya not düşülmeli.

**Çözüm iki aşamalı — sağlayıcı seçildi (Resend, 14.09.2026):**

1. **Sandbox bağlantısı kuruldu (14.09.2026) ama HESAP SAHİBİ DIŞINDA hiçbir
   adrese teslimat yapmıyor (17.09.2026'da doğrulandı).** SMTP kimlik
   doğrulamasının kendisi çalışıyor (bağlantı reddedilmiyor, 403 bir
   yetkilendirme/alan adı sorunu) ama bu, "üretime hazır" anlamına gelmiyor —
   tam tersine, gerçek kullanıcıların **hiçbiri** bugün e-posta alamıyor.
2. **Tam üretim aşaması (henüz yapılamaz — sahibi: Serhan, dış girdiye
   bağlı):** proje bir alan adı alınca, o alan adı Resend'de doğrulanmalı
   (DNS'e SPF/DKIM kaydı) ve gönderen adresi kendi alan adına çevrilmeli.
   **Bu, mutlaka Vitrin AI için yeni satın alınmış bir alan adı olmak
   zorunda değil** — Resend alt alan adı (subdomain) doğrulamasını da kabul
   ediyor; Serhan veya Kaan'ın DNS kaydı ekleyebildiği HERHANGİ bir mevcut
   alan adı üzerinde bir alt alan adı (ör. `mail.mevcutalanadi.com`)
   doğrulanıp gönderen adres oraya çevrilebilir. Bu olmadan gerçek
   müşterilere e-posta gitmez — R2 CORS ve production domain maddesiyle
   (açık takip maddesi 2) aynı dış girdiye bağlı, o yüzden bu ikinci aşama
   de facto Faz 7'nin "launch öncesi son kapı" listesine düşüyor.
