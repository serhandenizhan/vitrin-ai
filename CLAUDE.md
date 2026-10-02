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
   - **Ek bulgu (28.09.2026, ölçüldü): model elde tutulan HALKA yüzüğün İÇİNİ de dolduruyor** — parmaklarla yüzüğü tek nesne sayıyor; aynı fotoğrafın yalnız ürün bölgesi verilince halka temiz kesiliyor. Kullanıcıya "ürünü tek başına çekin" rehberliği bu yüzden önemli.
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
22. **Ders — yakaladığınız özel istisnanın üretim kodunda GERÇEKTEN fırlatıldığını kanıtlayın; mock'a istisna fırlattıran test hiçbir şey kanıtlamaz.** Faz 5'te checkout iptalini fail-closed yapan düzeltme, oturumu yalnızca `CheckoutAbsent` yakalandığında kapatıyordu. Ama `CheckoutAbsent` üretim kodunda hiç fırlatılmıyordu: sınıf tanımı, `except` bloğu ve testteki `provider.checkout.side_effect = CheckoutAbsent(...)` — hepsi bu. Gerçek `Iyzico.request` yalnızca `ProviderUnavailable` ve `ProviderError("provider_rejected")`, `verify_checkout` ise `EvidenceMismatch` fırlatıyor. Sonuç: özellik üretimde her koşulda 409 dönüyordu, üstelik her deneme bir manuel inceleme alarmı üretiyordu; buna rağmen testi yeşildi, çünkü test sağlayıcının hiç üretemeyeceği bir istisna tipini kendisi uyduruyordu. **Kural: bir `except` bloğu eklerken `grep -rn "raise <İstisna>" app` ile o istisnanın üretim yolunda fırlatıldığını doğrulayın; dış servis testleri istisna TİPİNİ değil, servisin döndürdüğü gerçek YANIT GÖVDESİNİ taklit etsin ki hatayı üreten kod da sınanmış olsun.** (Ders 15'in kardeşi: yeşil test, hatanın yokluğunu göstermez.) **Tekrarı (30.09.2026):** ön yüz `bonus_credits`'i sayı sanıyordu, backend `{ available, expires_at }` döndürüyor; ekranda "Kalan kredi 6[object Object]" çıktı. Test yeşildi çünkü sahte yanıtta `bonus_credits: 0` (backend'in hiç üretmediği bir biçim) vardı — sahte yanıt da gerçek gövdenin biçimini taşımalı.

23. **Ders — "öncekini koru" davranışı, HATA durumunu ayrıca ele almazsa sessizce YANLIŞ ÇIKTI üretir.** Stüdyo sahnesindeki `useLoadedImage`, zemin değiştirilirken ekran kararmasın diye `keepPrevious` ile önceki görseli tutuyordu. Ama `onerror` bilinçli olarak state'e dokunmuyordu; sonuç: yeni zemin yüklenemediğinde (R2 CORS kuralı eksik, imzalı URL ölmüş, ağ hatası) karşılaştırma önceki görseli **süresiz** döndürüyordu. Kullanıcı arayüzde yeni zemini seçili görüyor, indirdiği dosyada başka bir zemin çıkıyordu. Kodun kendi yorumu da "hata olursa gradyana düşer" diyordu — gerçek davranışın tersi. **Kural: bir "yükleniyor" durumu ile "yüklenemedi" durumu ayrı tutulur; `keepPrevious` gibi bir yumuşatma yalnızca BİRİNCİSİ için geçerlidir.** Yanlış zemini göstermek, zemini hiç göstermemekten kötüdür. **Ve hata işareti BAŞARIDA temizlenmelidir:** ilk düzeltme `onerror`'da işareti koyuyor ama `onload`'da silmiyordu, bu yüzden geçici bir hatadan sonra o zemine geri dönen kullanıcı, imzalı URL yenilenene kadar (dakikalar) zemini hiç göremiyordu — "yanlış zemin" hatasının yerine "hiç zemin yok" hatası geçmişti (ikinci inceleme turunda bulundu). **Genel biçim: bir hatayı kalıcı olarak işaretleyen her bayrağın, onu temizleyen bir yolu da aynı commit'te yazılır.** Düzeltme `frontend/src/components/composer/use-loaded-image.ts`'te (hook test edilebilmesi için ayrı modüle çıkarıldı); bulgu PR #18'in Codex incelemesinden geldi.
24. **Ders — yarıda kalan bir toplu işin "güvenle yeniden çalıştırılabilir" garantisi, YAN DOSYAYA değil DETERMİNİST KİMLİĞE dayanmalı.** `scripts/upload_backgrounds.py` yüklenen dosyaları bir manifeste yazıyor ve manifestte olanı atlıyordu, ama veritabanı commit'i ile manifest yazımı arasında bir pencere vardı: süreç orada ölürse yeniden çalıştırma aynı kaynak dosya için YENİ bir UUID, ikinci bir DB kaydı ve ikinci bir R2 nesne çifti üretiyordu. Kaynak dosya adı hiçbir yerde tutulmadığı için otomatik toparlama da mümkün değildi. Çözüm şema değişikliği DEĞİL: kimlik artık dosya adından türetiliyor (`uuid.uuid5`), böylece tekrar çalıştırma aynı anahtarı üretiyor ve var olan satırı tekrar eklemiyor; içerik aynıysa yükleme de hiç tekrarlanmıyor. **Kural: idempotency'yi "neyin yapıldığını hatırlayan bir kayıt" üzerine kurmak yerine, işin kimliğini girdisinden türetin** — Faz 5'in "idempotency anahtarı İŞİ tanımlar, isteği değil" kuralının aynı sınıfı.

    **Ama determinist kimlik kendi riskini getirir ve bu risk aynı düzeltmede kapatılmalı:** kimlik yalnız dosya ADINDAN türetildiğinde, başka bir klasörde aynı adı taşıyan FARKLI bir görsel aynı kimliği ve aynı R2 anahtarını üretiyordu. İkinci çalıştırma satırı var görüp yeni kayıt açmıyor ama nesneyi ÜZERİNE YAZIYORDU: veritabanındaki zeminin içeriği sessizce değişiyor, kategorisi ve baskı uyarısı eski görsele ait kalıyordu (rastgele UUID ile bu mümkün değildi — yani düzeltme yeni bir hata sınıfı açmıştı, ikinci inceleme turunda bulundu). Çözüm iki katmanlı: kalıcı bir parti ad alanı (`--batch`, kimliğe girer) ve kimlik zaten varsa **içerik karşılaştırması** — aynıysa yükleme hiç tekrarlanmaz, farklıysa betik durur (fail-closed) ve hangi seçeneği kullanacağını söyler. **Genel kural: bir kimliği girdisinden türetirken "bu girdi gerçekten KALICI olarak tek mi" sorusu ayrıca sorulur; dosya adı tek değildir.**
25. **Ders — iki adımlı bir yükleme, İKİNCİ adım patladığında birinciyi geri almalı.** Hem `POST /api/admin/backgrounds` hem toplu yükleme betiği ana görseli ve küçük önizlemeyi ayrı iki `upload()` çağrısıyla yazıyordu; ikincisi patladığında DB satırı hiç yazılmadığı için ilk nesneye ulaşacak hiçbir kayıt kalmıyordu (erişilemez, yer tutan yetim nesne — bucket'ta gerçek bir örneği bulundu). Mevcut test bunu görmüyordu çünkü **her** yüklemeyi başarısız kılıyordu; hata testin baktığı yerin dışında duruyordu (ders 15'in aynı sınıfı). Artık başarıyla yüklenen her anahtar takip edilip hata yolunda siliniyor ve DB yazma hatası da aynı temizliği tetikliyor. **Kural: birden fazla dış yazma içeren bir işlemde, hata yolunun o ana kadar yazılanları geri aldığı ayrıca test edilir — "ilk adım patladı" testi bunu kanıtlamaz.** Temizlik ayrıca satırın ÖNCEDEN var olup olmadığına bakar: var olan bir zeminin nesnelerini silmek, yetim nesneden kötü bir durum (satır kalır, gösterdiği dosya gider) üretirdi.

26. **Ders — tarayıcıda ölçerken üç tuzak üç ayrı yanlış alarm üretti; belirtiyi koda yazmadan önce ölçüm aracını ele** (ders 13'ün somut tekrarı, PR #18 doğrulaması). Üçü de "özellik çalışmıyor" gibi göründü, üçünün de sebebi ölçümdü:
    - **Konva her katman için ayrı `<canvas>` üretiyor.** `document.querySelector("canvas")` ilk katmanı (zemin) veriyor; gölge ve yansıma ürün katmanında çizildiği için "anahtar tuvali hiç değiştirmiyor" ölçülüyor. Bütün tuvaller ayrı ayrı hash'lenince gölgenin katman 1'i, yansımanın katman 1 ve 2'yi değiştirdiği görüldü.
    - **`node.getClientRect()` ZATEN görüntü pikseli döndürüyor** (sahne ölçeği uygulanmış). Bir kez daha `sahneGenişliği / STAGE_SIZE` ile çarpmak logo tutamağını ıskalatıyor ve "köşeden boyutlandırma çalışmıyor" sonucunu veriyor. Ayrıca tutamak yalnızca öğe **seçili** iken çizildiği için önce üzerine tıklanmalı. Doğru ölçüldüğünde `size` 0.18 → 0.29 oluyor.
    - **JavaScript'in `/i` bayrağı Türkçe `İ` (U+0130) ile `i`'yi eşleştirmiyor.** `/indirme işlemi başarıyla tamamlandı/i` ekranda tam olarak o metin dururken bile eşleşmiyor. Türkçe arayüz metni ararken ya gerçek büyük harf yazılır ya `localeCompare`/normalizasyon kullanılır.
    **Ölçülebilir iz seçimi:** Konva tuvaline çizilen bir şeyin durumu DOM'dan okunamıyor. Logo için doğru iz `localStorage`'daki `vitrin-ai:logo-settings` (sürükleme `position`, boyutlandırma `size` yazıyor); ürün dönüşümü için tuval katmanlarının hash'i. `aria-checked` ile `aria-pressed` de karıştırılmamalı — `Toggle` bileşeni `role="switch"` kullanıyor.
27. **Ders — bir `await` sayısı YETERSİZSE test, düzeltmeyi geri alsanız bile yeşil kalır; bu ders 15'in en sinsi biçimi** (PR #25 incelemesinin doğrulanması, 19.09.2026). Admin panelindeki zemin listesi mutasyondan önce başlayan periyodik `GET`in yeni durumu geri almasını önleyen düzeltme (`mutationVersionRef`) doğru yazılmıştı, ama onu kanıtlayan test `resolveRefresh(...)` sonrası yalnızca **tek** bir `await Promise.resolve()` bekliyordu. `adminFetch` birden fazla mikro görev içeriyor (`await fetch(...)` + `await response.json()`); tek bir tur bunların hiçbirini bitirmiyor, yani test her zaman "henüz güncellenmedi" durumunu ölçüp yeşil geçiyordu — düzeltme kodu **tamamen silinip** eski (hatalı) davranışa dönülse bile. Hata, testin baktığı zamanın dışında duruyordu. Düzeltme: `await vi.advanceTimersByTimeAsync(0)` birkaç kez çağrılarak bütün mikro görev kuyruğu boşaltıldı; ancak bu testin gerçekten iş gördüğü yalnızca kodu ESKİ hâline döndürüp testin kırmızı yandığı görülerek kanıtlanabildi. **Kural: sahte zamanlayıcıyla (`vi.useFakeTimers`) yazılmış bir testte, çözülen bir `Promise` zincirinin sonucunu okumadan önce kaç `await`/mikro görev turu geçmesi gerektiği SAYILIR ve öyle beklenir — "bir `await` yeterli" varsayımı ölçülmeden yapılmaz; her testin gücü, düzeltmeyi geri alıp kırmızı yanışını GÖREREK doğrulanır (ders 15'in tekrarı, bu sefer zaman/mikro görev ekseninde).**

28. **Ders — katmansız bir CSS kuralı, Tailwind'in HER yardımcı sınıfını özgüllükten bağımsız ezer.** `.liquid-glass` `globals.css`'te katmansız `position: relative` taşıyordu; Tailwind v4'ün `absolute`/`sticky` sınıfları `utilities` KATMANINDA olduğu için hiçbiri kazanamıyordu. Belirti "Kısayollar'a basınca üst bardaki yazılar kayboluyor"du: `absolute` yazılı açılır pencere akışa girip üst barı uzatıyor, bardaki açık renkli yazılar barın dışına, açık zemine itiliyordu. Aynı sebeple üst barın `sticky`'si de hiç çalışmıyordu. Teşhis, üst barın kopyası ayrı bir tarayıcıda kurulup `getComputedStyle(...).position` okunarak yapıldı (`"relative"` döndü). **Kural: bir öğeye konum/görünüm veren paylaşılan bir sınıf `globals.css`'e yazılırken, yardımcı sınıflarla çakışabilecek özellikleri (`position`, `display`, `z-index`…) `@layer components` içine konur; katmansız bırakılırsa o sınıfı taşıyan her öğede ilgili yardımcı sınıf sessizce etkisiz kalır.** (Ders 13'ün kardeşi: kazananı özgüllük değil sıra/katman belirler.)

29. **Ders — koşullu iki dalda aynı türde eleman varsa React AYNI DOM düğümünü kullanır; sınıf adı da değişmiyorsa CSS giriş animasyonu HİÇ oynamaz.** Stüdyonun Sahne paneli ile Düzenle paneli aynı yerde duran birer `<aside>`'dı; ileri geçişte ikisinin sınıfı da `stage-slide-forward` olduğu için tarayıcı animasyonu yeniden başlatmadı ve Serhan iki turda "geçiş görmüyorum" dedi. İlk turda sebep yanlışlıkla "animasyon çok kısa/küçük" sanılıp süre büyütüldü; asıl sebep, animasyon sırasında her karede `getComputedStyle(...).opacity/transform` okunarak bulundu (ilk kareden itibaren 1 ve 0'dı). **Kural: bir elemanın "girişte" animasyon oynaması isteniyorsa ve aynı konumda başka bir dal aynı türde eleman çiziyorsa, her dala ayrı bir `key` verilir; "görünmüyor" şikâyetinde önce animasyonun gerçekten oynayıp oynamadığı ÖLÇÜLÜR, parametreleri büyütmek sonra gelir.** Aynı gün Serhan'ın ekran kaydı iki şey daha gösterdi, ikisi de ölçümle bulundu: (a) `useStageSize` gözlemcisini yalnız İLK kapsayıcıya bağlıyordu; stüdyo telefon düzeninden masaüstüne geçince kapsayıcı yeni düğüm oluyor, tuval eski boyutta kalıp Tamamla'da KESİLİYORDU (artık her render'da düğüm kontrol ediliyor). (b) Tuval sütununun genişlik geçişi her karede Konva'yı yeniden çizdiriyordu (bir geçişte 10–14 kez); masaüstünde kaldırıldı. **Kural: tuvalin boyutuna bağlı bir öğeye CSS `transition` verilmez — her kare bir React render'ı + Konva çizimi demektir.**

30. **Ders — react-konva'ya JSX içinde yazılan dizi/nesne her render'da "değişmiş" sayılır; filtreli bir düğümde bu, her render'da filtrelerin baştan hesaplanması demektir.** `editor-stage.tsx`'te `filters={[Brighten, Contrast, HSL]}` her render'da yeni diziydi; react-konva `!==` ile karşılaştırıp Konva'ya yeniden veriyor, Konva da ürünün filtreli önbelleğini baştan işliyordu (`getImageData` + piksel döngüsü). Stüdyodaki her yeniden çizim (aşama değişimi, panel, hover) Retina'da ~100 ms'lik bir kare üretiyordu; Serhan "geçişler kare kare, makinede mi sorun var" diye sordu. Teşhis: dpr 1 / dpr 2, geliştirme / üretim derlemesi, cam efektleri açık / kapalı karşılaştırıldı; tek fark dpr'deydi ve Long Animation Frame API'si süreyi Konva'nın `requestAnimationFrame` çizimine bağladı. Dizi modül düzeyinde sabit yapılınca dpr 2'de 35 fps → 60 fps, en kötü kare 100 → 18 ms. **Kural: react-konva bileşenine verilen dizi/nesne özellikleri (özellikle `filters`) modül sabiti ya da `useMemo` olur; "makinede mi sorun var" sorusu, aynı ölçüm farklı koşullarda (dpr, derleme modu, efektler) tekrarlanarak cevaplanır.**

31. **Ders — aynı makinede birden fazla model süreci makineyi KİLİTLER; bellek bütçesi komuttan ÖNCE hesaplanır** (27.09.2026). Faz 7'nin kesim kuyruğu yük testinde, "aynı makinede 2 işçi kapasiteyi artırmaz" iddiasını ölçmek için 16 GB'lık Mac'te `load_test.py serve --workers 2` koşuldu. Her işçi BiRefNet'in AYRI bir kopyasını yüklüyor ve iki işçi aynı anda kesim yapınca bellek tükendi: macOS ~70 GB'lık sayfayı diske yazdı ve bilgisayar kilitlendi (süreçler Claude Code'un altında çalıştığı için Etkinlik Monitörü hepsini VS Code'a yazdı, 30 GB+). Model başına 12–14 GB zaten bu dosyada yazılıydı; hesap komuttan önce yapılmadı. Ayrıca betik `kill` ile durdurulunca `atexit` çalışmadığı için işçiler yetim kalıp modeli bellekte tutmaya devam edebiliyordu. **Düzeltme:** `load_test.py serve` artık işçi × eşzamanlılık × 12 GB fiziksel belleğin %75'ini aşarsa başlamayı reddeder (`--force` ile bilerek geçilir) ve SIGTERM'de işçileri kapatır — ikisi de gerçek süreçle doğrulandı. **Kural: model yükleyen süreç sayısını artıran her komuttan önce "süreç × 12 GB ≤ makinenin belleği" hesabı yapılır.** `./execute.sh` de artık açılışta bir işçi başlatıyor (modeli hemen yükler); kesim denenmeyecekse `VITRIN_START_WORKER=0`.
32. **Ders — bir fonksiyonun `False` dönüşü iki ayrı durumu taşıyorsa, çağıran önce HANGİSİ olduğunu okumalı** (27.09.2026, Codex incelemesi, gerçek Redis + Postgres'te yeniden üretildi). `resolve_reservation(..., success)` "ayırma artık `pending` değil" durumunda `False` döndürüyor; işçi bunu her zaman "bakım işi krediyi iade etmiş" diye yorumlayıp saklanan sonucu siliyor ve işi `retry_safe` işaretliyordu. Ama aynı `False`, **aynı işin önceki denemesi krediyi zaten tüketmiş** anlamına da gelebiliyordu: işçi sonucu saklayıp krediyi tükettikten sonra, işi Redis'te bitmiş işaretleyemeden ölürse kurtarma işi onu kuyruğa geri koyuyor, ikinci deneme de tüketilmiş krediye ait sonucu siliyordu. Ön yüz `reservation_released`'i sessizce yeniden denediği için müşteri hiçbir hata görmeden **ikinci bir kredi** ödüyordu; ekrandaki mesaj ise "kredi iade edildi" diyordu. Düzeltme: `reservation_outcome` ayırmanın gerçek durumunu okur; işçi işe başlarken ve her `False`'ta ona bakar, tüketilmişse işi başarılı sayıp saklanan sonucu teslim eder (inference tekrar çalışmaz). **İkinci tur (Codex):** iki deneme PARALEL yürürse ikisi de `pending` görüp aynı sabit anahtara yüklüyordu; sonra yükleyen, kredisi ödenmiş sonucun üzerine yazıyordu. Artık her deneme kendi anahtarına yazar (`results/<kullanıcı>/<anahtar>-<rastgele>.png`), ödenen anahtar `usage_reservations.result_r2_key`'de durur ve kaybeden kendi nesnesini siler — ödenmiş bir sonuç hiçbir koşulda değişmez. **Kural: bir koşullu güncelleme (`UPDATE ... WHERE status='pending'`) "satır değişmedi" dediğinde, satırın NEDEN değişmediği ayrıca okunur; kullanıcıya "iade edildi" ya da "yeniden dene" demek, iadenin gerçekten bu çağrıda yapıldığı kanıtlanmadan yapılmaz.** Testler (`tests/test_cutout_worker.py`) eski kodda kırmızı yandı.
33. **Ders — "diske yazılmaz" gibi yasal bir söz bir yapılandırmaya dayanıyorsa, o yapılandırma kodda DOĞRULANIR; Docker imajının `VOLUME`'u da kapsayıcı yeniden oluşturulunca silinmez** (27.09.2026, Codex incelemesi). KVKK metni özgün fotoğrafın diske yazılmadığını söylüyordu; fotoğraf Redis'te duruyordu ve Redis 7'nin varsayılanı (`save 3600 1 300 100 60 10000`) belleği `dump.rdb`'ye yazıyor — yerel Redis'te dolu bir `dump.rdb` bulundu. Düzeltme sırasında ikinci tuzak ölçüldü: `redis` imajı `/data`'yı anonim volume olarak tanımlıyor, compose onu `--force-recreate`'te bile KORUYOR ve Redis açılışta eski `dump.rdb`'yi belleğe geri yüklüyor. Çözüm üç katmanlı: compose'da `--save "" --appendonly no` + `/data` için `tmpfs`, API'de her kuyruğa koymadan önce `CONFIG GET` ile doğrulama (açıksa fotoğraf alınmaz, fail-closed), canlı Redis için Faz 7.5 kontrol maddesi. İlk sürüm `CONFIG` yasak olduğunda uyarıp fotoğrafı YİNE alıyordu; Codex'in ikinci turu bunun sözü kanıtsız bıraktığını gösterdi ve doğrulanamayan durum da reddedildi. **Kural: bir gizlilik/saklama sözü metne yazılırken onu gerçekleştiren ayar da kodda doğrulanır; "varsayılan zaten öyledir" varsayımı yapılmaz.**
34. **Ders — "şu komutu şu değişkenle çalıştır" diye yazılmış bir uyarı koruma değildir; yıkıcı bir işlemin güvenli yolu KOMUTUN kendisi olmalı** (27.09.2026). Test paketinin `execute.sh` açıkken geliştirme veritabanını sileceği `backend/README.md`'de ve bu dosyada yazılıydı; Claude kullanıcıya testleri çalıştırması için `DATABASE_URL`'siz bir komut verdi, uyarıyı yalnız cümle olarak ekledi ve komut geliştirme veritabanını sildi (eşitleme betikleriyle geri getirildi, yerel çalışmalar gitti). Mevcut iki koruma (adres yerel mi, şema Supabase mi) o veritabanına "atılabilir" diyordu. Aynı gün ikinci bir çakışma da görüldü: iki test oturumu aynı test veritabanında koşup birbirinin tablolarını düşürdü. Çözüm: `backend/scripts/test.sh` (kendi veritabanını açan tek komut), düz `pytest`'in geliştirme veritabanında bağlanmadan durması ve oturum başına bir `pg_try_advisory_lock`. **Kural: veri silen bir işlemin doğru kullanımı belgeye değil koda yazılır — güvenli yol varsayılan yol olur, tehlikeli yol açık bir bayrak ister. Kullanıcıya komut verilirken de bu tek komut verilir.**
35. **Ders — uzun süren bir iş, ekranın ortak durumunu (ref) GEÇ okumamalı; kendi kimliğini başladığı anda sabitlemeli** (28.09.2026, Kaan'ın PR #30 incelemesi). Kesim kuyruğuyla bir kesim artık tek istek değil, yükleme + dakikalarca yoklama. `runCutout` idempotency anahtarını bileşenin ortak `requestKeyRef`'inden okuyordu ve bunu yüklemeden SONRA, yoklamaya başlarken tekrar yapıyordu. Yükleme sürerken kullanıcı ekranı sıfırlayıp ("Yeni çalışma", sol panelden başka bir çalışma, tarayıcının geri tuşu) yeni fotoğraf seçerse ortak anahtar değişiyor, eski iş yeni fotoğrafın anahtarıyla yokluyordu: ya kendi sonucunu hiç bulamıyordu (kredi harcanır, sonuç geçmişe yazılmaz) ya da yeni fotoğrafın sonucunu eski dosyanın adıyla geçmişe yazıyordu. Sessiz tekrarda da eski iş `renewKey` ile yeni oturumun anahtarını eziyordu. Oturum sayacı (`sessionRef`) yalnız EKRANA yazmayı koruyordu, anahtarı korumuyordu. Düzeltme: anahtar yüklemeden önce yerel değişkende sabitlenir; `bindJobKey` işe kendi anahtarını verir ve ortak anahtarı yalnız ekran hâlâ o işteyken günceller. Testler (`lib/cutout-job.test.ts`) düzeltme geri alınınca kırmızı yandı. **Kural: bir `await` zincirinin ortasında paylaşılan bir ref'ten okunan kimlik, zincirin başındaki kimlikle aynı olduğu varsayılarak kullanılmaz; iş kendi kimliğini başladığı anda yerel olarak alır, ortak duruma ancak hâlâ "güncel" olduğu doğrulanınca yazar.**
36. **Ders — yoklama hatası kredi durumunu kanıtlamaz** (29.09.2026, PR #32 bulguları). Redis yoklaması kesilince mevcut işin kredisi hâlâ ayrılmış olabilir: API `retry_safe` vermez, ön yüz aynı anahtarla yoklamayı sürdürür. İşçi geçici Redis/DB hatasında alınmış işi aynı kimlikle yeniden sıraya koyar; Windows VS Code görevleri ortak R2 için `R2_SHARED_WITH_PRODUCTION=true` verir. **Kural: yeni krediye ancak önceki kredinin harcanmadığı veya iade edildiği kesinleşince geçilir.**
37. **Ders — Mac/Linux'ta yazılıp yalnız orada koşan kod, Windows'ta sessiz platform varsayımlarıyla kırılır: dosya okuma KODLAMASI, Unix'e özgü modüller, saat dilimi verisi ve `localhost`'un IPv6'ya çözülmesi** (30.09.2026, Kaan'ın Windows'unda PR #30 sonrası güncelleme). Backend test paketinin 574 testinin HEPSİ kurulumda düştü: `0005`/`0006`/`0007` migration'ları SQL dosyasını `read_text()` ile kodlama vermeden okuyordu; Mac/Linux'ta varsayılan UTF-8, Türkçe Windows'ta **cp1254** olduğu için `0006`'daki Türkçe karakterde `UnicodeDecodeError`. Yerel `alembic upgrade` (yalnız 0011→0012) bunu göstermedi — hata yalnız migration'ları BOŞ veritabanından koşan test paketinde çıktı. Aynı gün üç Unix varsayımı daha: `compare_cutouts.py` `import resource` (Windows'ta yok), yedek betiğinin `os.fchmod`/0o600 izni ve günlük mutabakatın `ZoneInfo("Europe/Istanbul")`'u — saat dilimi verisi Linux/macOS'ta işletim sisteminden gelir, Windows'ta `tzdata` paketi yoksa `ZoneInfoNotFoundError` (iki mutabakat testi düştü; Windows'ta bakım işi de her turda düşerdi). `tzdata` `requirements.txt`'e yalnız `sys_platform == "win32"` koşuluyla eklendi, sunucu değişmedi. Düzeltme: okuma `encoding="utf-8"` (çalışan SQL değişmedi, uygulanmış migration kuralına girmez); `resource` yoksa bellek "ölçülemedi" (`null`); izin isteyen 6 yedek testi Windows'ta **atlanır**, taklit edilmez — "yalnız sahibi okur" gibi bir güvenlik sözü, sağlanamadığı platformda sessizce gevşetilmez. **Kural: metin dosyası okuyan/yazan her çağrıya `encoding="utf-8"` açıkça yazılır; Unix'e özgü bir modül (`resource`, `fcntl`, `os.fchmod`) kullanılıyorsa Windows'ta ne olacağı aynı commit'te kararlaştırılır.** Ayrıca: Windows'ta tam backend paketi ~1 saat sürüyordu ve ilk çalıştırma "takıldı" sanılıp durduruldu. Ölçünce sebep ne RAM ne işlemciydi (pytest 10 sn'de 0,1 sn işlemci): `localhost` Windows'ta önce `::1`'e gidiyor, compose portları yalnız `127.0.0.1`'de açık, ret ~2 sn sonra bildiriliyor — her yeni Postgres/Redis bağlantısı 2,05 sn (127.0.0.1 ile 0,03 sn). `test.sh` artık `127.0.0.1` veriyor, paket ~3 dk. **Kural: "yavaş" ya da "takıldı" denmeden önce süreç ölçülür — işlemci boşsa bir şey BEKLENİYORDUR; beklenen şey (bağlantı, kilit, ağ) ayrıca zamanlanır.**

38. **Ders — bir kimlik sonradan gelebiliyorsa, ona bağlı davranışın "kimlik yokken" yolu ayrıca sınanır** (30.09.2026, Playwright E2E ile bulundu). Stüdyo, sonuç sunucuya kaydedilince gelen çalışma kimliğini açılış anında alıyordu; kullanıcı kaydın bitmesini beklemeden "Arka plan ekle"ye basarsa stüdyo kimliksiz açılıyor ve otomatik kayıt ile "tamamlandı" işareti bütün oturum boyunca çalışmıyordu. İkinci bir katman da vardı: kayıt sonradan açılınca, o ana kadar yapılan düzenleme "zaten kayıtlı" temel sayılıp yazılmıyordu. Mevcut testler kimliğin her zaman hazır olduğu yolu sınıyordu (ders 15 ailesi: testin baktığı yerin dışındaki hata). **Kural: bir kimlik/oturum/sonuç asenkron geliyorsa, ondan ÖNCE yapılan eylem için ayrı test yazılır ve kimlik gelince duruma bağlanır; temel (baseline) açılış anındaki durumdur, kimliğin geldiği andaki durum değil.** Düzeltme: `attachStudioWork` (`workspace-provider.tsx`) ve `openingDraftRef` (`composition-editor.tsx`); test POST'u yapay olarak yavaşlatır ve iki düzeltmenin her biri geri alınınca kırmızı yandı.

39. **Ders — bir tarayıcıda "düzeltildi" demeden önce O tarayıcının MOTORUYLA ölç; ve geliştirme sunucusu üretimle aynı şey değildir** (30.09.2026, Serhan'ın Safari şikâyeti). Ana sayfadaki stüdyo turu Serhan'ın Safari'sinde boş görünüyordu; Chrome'da hep düzgündü. İki tur "düzelttim" denip yine bozuk çıktı, çünkü Chrome'da bakılıyordu. Playwright'ın WebKit'i kurulunca (`npx playwright install webkit`, geçici bir klasörde) sorun orada da yeniden üretilemedi; asıl ayırt edici deney, AYNI kodu üretim derlemesiyle (`npm run build && next start -p 3012`) Serhan'a açmaktı: üretimde her şey doğruydu, sorun yalnız geliştirme sunucusundaydı. **Kural: "Safari'de bozuk" gibi bir bildirimde önce (1) o motorda ölç, (2) olmuyorsa dev/üretim farkını dene; üretim düzgünse ziyaretçiyi etkileyen bir hata yoktur ve geliştirme sunucusunun tarayıcı tuhaflığına saatler harcanmaz.** Bu sırada iki savunma önlemi alındı ve kalıcı: (a) konteyner sorgu birimleri (`cqw`/`cqh`) yerine düz yüzde + `aspect-ratio`; (b) sayfa yenilenince en üste dön (`ScrollTopOnReload`).
40. **Ders — içeriği ölçen sayı, ölçüldüğü koşulun dışına taşınmaz: "makinede 60 fps" telefonda 60 fps değildir.** Vitrin optimizasyonunda her ölçüm M4'te yapıldı. Telefon için işlemci yavaşlatılıp ağ kısıtlandı (LCP 916 → 848 ms, açılışa kadar inen JS 280 → 285 KB) ama ekran kartı taklit edilemedi; bu yüzden 3D yakınlaşma telefonda ayrı, daha düşük kaliteyle çalışır (`compact`) ve gerçek cihaz testi Faz 7.5 listesindedir. **Kural: bir performans sayısı yazılırken hangi donanımda ölçüldüğü de yazılır.**

41. **Ders — "hangi uçlar korumasız" sorusunu belgeden değil, davranıştan sorun; ve `monkeypatch` bir ÖRNEĞİ taklit ederse sınıf düzeyindeki taklit gölgelenir** (02.10.2026, Faz 7 hız sınırı envanteri). Belge "yalnız `projects` ve `account` sınırsız" diyordu; bütün sınırlayıcılar "doldu" döndürülüp her uca istek atılınca ek olarak ödeme geçmişi, abonelik, checkout okuma, kesim yoklaması ve **admin iade/itiraz/fatura/plan yazma uçları** da sınırsız çıktı (taramayı yapan elle yazılmış listeydi). Aynı test iki başka şey ortaya çıkardı: yükleme middleware'leri Redis düşünce ham 500 veriyordu, ve üç eski test `monkeypatch.setattr(örnek, "retry_after", ...)` ile bağlı metodu örnek özniteliği olarak bırakıp sınıfa uygulanan taklidimi gölgeliyordu — test tek başına yeşil, tam pakette kırmızıydı. **Kural: bir kapsam envanteri tanımı değil davranışı sınar (mekanizmadan bağımsız); bir sınıfı taklit etmek yerine canlı örnekleri taklit edin; yeni test hem tek başına hem tam pakette koşulur.**

42. **Ders — bir güvenlik taramasının "bitti" demesi tamamlandığı anlamına gelmez; "oturumlu" olduğunu da veritabanı izinden değil, sınanabilir bir kontrolle kanıtlayın** (02.10.2026, Faz 7 ZAP turu). İki ayrı yerde yanıltıldık. (a) ZAP üç denemede de "bitmiş" gibi çıktı verdi; oysa aracın günlüğünde `Max retries exceeded ... localhost` vardı ve rapor dosyası hiç yazılmamıştı: x86 ZAP imajı ARM Mac'te emülasyonla Firefox'u başlatamayıp (AJAX örümceği, sonra aktif taramanın DOM-XSS kuralı) ZAP'in kendisini düşürüyordu. İlk tahmin "Docker belleği" idi (yalnız 4 GB'tı, iki ZAP'i birlikte koşturmuştuk); tek konteynerle de çöküşün sürmesi bunu çürüttü. (b) Taramanın çerezle oturumlu koştuğunu ispatlamak için veritabanında iz aradık: sıfır çıktı, ama bu çerezin işlemediğini göstermiyordu, çünkü ZAP'in karıştırdığı geçersiz UUID/gövde işleyiciden ÖNCE reddediliyordu. Doğru ölçüt, ZAP'in kendi `requestor` işiyle yönetici-özel bir uca çerezle istek atmak: yönetici 200, kullanıcı 403, çerezsiz 401, ve bilerek yanlış beklentiyle bir KONTROL koşusu uyarı vermeli. **Kural: bir tarama aracının başarılı sayılması için raporun var olduğuna ve aracın "succeeded" dediğine bakılır; kimlik kapsamı pozitif ve negatif kontrolle ölçülür. Hız sınırlayıcılar tarama örneğinde kapatılır (yoksa 429 işleyicilere ulaşmayı keser) ve bu sınır raporda açıkça yazılır.**

44. **Ders — bir alarm eşiği, NORMAL yük altında yalancı alarm vermediği ölçülmeden konmaz; "tıkalı" bir bekleme süresi değil, bir İLERLEME eksikliğidir** (02.10.2026, PR #46 incelemesi M1). Kesim kuyruğunun `stalled` durumu "en eski bekleyen iş 120 sn'den uzun bekliyor" diye tanımlanmıştı. Tek işçi ~12 sn/iş kestiği (aynı PR'ın kendi ölçümü) için kuyrukta 10+ iş birikince en eski iş 120 sn'yi aşıyor ve sistem tamamen sağlıklıyken panelde "Kuyruk tıkalı görünüyor" ve Sentry'de `error` çıkıyordu; gerçek bir tıkanma da aynı kanaldaki gürültüye karışacaktı. Eşiği ölçtüğümüz süre ile (12 sn) kuyruk derinliğini (50'ye kadar) karşılaştırmamıştık. Düzeltme: işçi her iş alışında bir ilerleme işareti yazar; "tıkalı" = kuyrukta iş var, işçi canlı ama eşikten uzun süredir hiç iş alınmadı (sayaç son alımdan ya da en eski işin gelişinden, hangisi sonraysa başlar, böylece saatlerce boşta kalmış işçiye gelen ilk iş yalancı alarm vermez). Tek bir testin bunu kanıtlaması için üç ayrı mutasyon gerekti. **Kural: bir alarm koşulu yazılırken "sistem NORMAL ama yoğunken bu koşul doğru olur mu?" sorusu ölçülür; durma/takılma gibi bir durum, bekleme süresi gibi yük ile büyüyen bir değer yerine ilerleme eksikliği gibi yükten bağımsız bir işaretle tanımlanır.** (İncelemenin M2 iddiası — yeniden kuyruğa konan işin yaşının düşük görünmesi — kodla ve bir deneyle çürütüldü: bağımsız doğrulama bu yüzden yapılır.)

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

- **Backend:** Python, FastAPI, Redis. Redis, Faz 4 kapanışında dağıtık yükleme hız sınırlaması için öne çekilip kuruldu (`backend/app/services/rate_limit.py`). **Kesim kuyruğu (Faz 7, 27.09.2026):** arka plan kaldırma API'de değil ayrı bir işçide (`python -m app.workers.cutout`); API işi Redis kuyruğuna koyar (`app/services/cutout_queue.py`), istemci `GET /api/remove-background/jobs/{id}` ile yoklar. Celery/RQ yerine kendi küçük kuyruğumuz — gerekçe `backend/README.md` → "Kesim kuyruğu". **İşçi çalışmıyorsa kesimler sırada bekler** (02.10.2026'dan beri görünür: `GET /api/admin/cutout-queue` ve `error` günlüğü/Sentry, bkz. `backend/README.md` → "Kesim kuyruğu" → "İşçi sağlığı"); `execute.sh` ve VS Code görevi işçiyi açar. Özgün fotoğraf Redis'te en fazla 15 dk durur (KVKK metninde yazılı). **Redis diske yazmamalı (RDB/AOF kapalı):** `docker-compose.yml` Redis'i `--save "" --appendonly no` ve bellekte `/data` (tmpfs) ile açar; API her kuyruğa koymadan önce bunu doğrular ve açıksa fotoğrafı almaz (`CutoutQueue.ensure_ephemeral`, ders 33). Kaan'ın Windows'taki `redis-windows`'u da aynı argümanlarla başlatılmalı, yoksa kesimler 503 `queue_unavailable` alır.
- **AI modeli:** BiRefNet — sadece orijinal `ZhengPeng7/BiRefNet` MIT lisanslı ağırlıkları kullanın. BRIA'nın "RMBG" ağırlıklarını asla kullanmayın (aynı mimari, ancak bu ağırlıklar ticari değildir). Üretim modeli doğrudan `birefnet-general` — `-lite` ve `u2net` önceki iterasyonda elendi.
- **Veritabanı:** PostgreSQL (production'da Supabase — aynı proje, DB ve Auth ayrılmıyor)
- **Nesne depolama:** Cloudflare R2 (S3 uyumlu), public-read değil, presigned URL ile erişim
- **Frontend:** Next.js, TypeScript, Tailwind, shadcn/ui
- **Kompozisyon editörü:** Konva.js / react-konva
- **Kimlik doğrulama:** **Supabase Auth**. Oturum `@supabase/ssr` ile çerezde tutulur. FastAPI gelen Supabase JWT'sini projenin JWKS'iyle (ES256/RS256) doğrular — `backend/app/core/auth.py`. Yönetici yetkisi `admin_users` tablosundan gelir (Faz 3'ün `X-Admin-Secret`'ı Faz 4'te kaldırıldı). **IDOR koruması iki katmanlı:** backend veritabanına tablo sahibi olarak bağlandığı için RLS onu etkilemez — birinci katman her sorgudaki sahiplik filtresi (`user_id = <token'daki kullanıcı>`), ikinci katman Data API (PostgREST) kapısındaki RLS + grant'ler. **RLS'siz tablo oluşturulmaz**; `public`'teki her tablonun RLS'li olduğunu, `anon`/`authenticated`'ın hiçbir yetkisi olmadığını ve hiçbir SECURITY DEFINER fonksiyonunda PUBLIC/`anon`/`authenticated` için EXECUTE bulunmadığını `backend/tests/test_rls.py` genel olarak doğrular (fonksiyonun `REVOKE ALL ... FROM PUBLIC, anon, authenticated`'ı fonksiyonla aynı migration'da gider; 0004'te unutulan `record_signup_consents` yetkisi production yedeğinin manifestinde bulundu ve `0012`'de kapatıldı) (bkz. `ROADMAP.md` Faz 4, `SECURITY.md` 3.2, `backend/README.md` "Kimlik doğrulama ve yetkilendirme"). **Frontend tarafı:** tarayıcı backend'e hiç doğrudan gitmiyor; Next.js vekilleri (`src/lib/backend-proxy.ts`) çerezdeki oturumdan token'ı alıp `Authorization` başlığıyla iletiyor. `src/proxy.ts` her istekte oturumu yeniliyor ama **yetkilendirme sayılmaz** — asıl kontrol backend'de. Ekranda gösterilen profil bilgileri (ad, şirket, hesap türü) Supabase `user_metadata`'da ve kullanıcının düzenleyebildiği veri olduğu için hiçbir yetki kararında kullanılmaz.
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
  `results/<user_id>/<request_id>-<random>.png` altında 24 saat saklanır; aynı anahtar
  tekrar gelirse **inference hiç çalışmaz**, saklanan nesne döner. Sonuç ÖNCE
  saklanır, kredi SONRA tüketilir; sonuç deposu kullanılamıyorsa iş hiç başlamaz
  (`503 result_storage_unavailable`) — belirsiz bir sonucu yeniden inference'a
  bağlamak aynı krediyi ikinci kez yakardı. **Bunun sonucu: arka plan kaldırma
  artık R2 olmadan çalışmıyor**, yerelde de `R2_*` ayarları gerekiyor (yalnız
  arayüz için `USE_MOCK_BACKEND=true`). İstemci yeni bir anahtara YALNIZCA
  backend `retry_safe` dediğinde geçer; başka her durumda (ağ koptu, iş sürüyor,
  sonuç artık saklanmıyor) anahtar korunur. **Faz 7'den beri** API krediyi yalnız AYIRIR ve işi kuyruğa koyar; sonucu R2'ye saklamak ve krediyi tüketmek/iade etmek işçinin işidir (`app/workers/cutout.py`). **Bir iş birden fazla kez işlenebilir** (işçi kredi tükettikten sonra ölürse iş kurtarılır): işçi her işe başlarken ayırmanın durumuna bakar; `retry_safe` YALNIZCA kredi gerçekten iade edildiyse yazılır, ayırma zaten tüketilmişse iş başarılı sayılır ve saklanan sonuç teslim edilir (ders 32). Ön yüz (`lib/cutout-job.ts`) kredisi iade edilmiş GEÇİCİ hataları kullanıcıya göstermeden yeni anahtarla sessizce bir kez daha dener.
- **Admin paneli (Faz 6):** backend uçları `backend/app/api/routes/admin.py`,
  **Genel bakışın en üstünde "Kesim kuyruğu" kartı** (02.10.2026): işçi çalışmıyorsa/kuyruk tıkalıysa gösterir, istatistik yüklemesinden bağımsız ve 30 sn'de bir yenilenir; `GET /api/admin/cutout-queue` vekili, `components/admin/admin-cutout-queue.tsx`,
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
  **Taslakta kullanılan zemin de silinebilir** (Serhan'ın kararı, 27.09.2026 — eskiden `409`'du; /cso incelemesi, herhangi bir kullanıcının bir zemini taslağına bağlayıp silinmesini engelleyebildiğini gösterdi): silme, zemini kullanan taslakların bağlantısını aynı işlemde temizler ve stüdyo o taslağı uygun ilk zeminle açar; taslak zemini hem
  JSON `editor_state.backgroundId` hem `projects.background_id` sütununda (yabancı anahtar kısıtı yok)
  tutulur.
  Silmede sıra önce DB satırı sonra R2 nesneleri (ters sırası "satır duruyor,
  dosyası yok" üretirdi — ders 25). **Hesap
  silme EŞZAMANLI DEĞİL:** panel yalnız `deletion_requested_at` işaretleyip
  kuyruğa `delete_account` atar, asıl silmeyi
  `python -m app.services.billing.maintenance` yapar. **Günlük (19.09.2026, Serhan):** `GET /api/admin/audit`
  denetim günlüğünü yalnız OKUR (Faz 6 kapanış denetiminde okuma yolunun hiç
  olmadığı bulundu); panelde "Günlük" sekmesi. Eylem listesi backend
  `admin_audit.ACTIONS` ile frontend `AUDIT_ACTIONS` (`lib/admin-api.ts`)
  arasında elle senkron tutulur. Günlük YALNIZ yönetici eylemlerini tutar
  (kullanıcı işlemleri kendi tablolarında). Üstte "Admin · Serhan | Kaan"
  anahtarı (`?actor=`, süzme sunucuda); anahtarda yalnız AD yazar
  (`user_metadata.first_name`, yalnız gösterim), e-posta yazmaz.
- **Uygulanmış bir migration yerinde düzenlenmez.** Production'daki Alembic o
  revizyonu `alembic_version`'da gördüğü için dosyayı bir daha çalıştırmaz;
  değişiklik yerelde görünür, production'da sessizce hiç uygulanmaz. Şema
  düzeltmesi her zaman YENİ numaralı bir migration'a gider (Faz 5 inceleme
  düzeltmeleri `0006_billing_review_fixes`'te; `0005`'teki iki fonksiyon orada
  `CREATE OR REPLACE` ile güncelleniyor). Testin de yalnız boş DB'den
  `upgrade head` yolunu değil, **"önceki revizyon uygulanmış DB → yeni
  migration"** yolunu doğrulaması gerekir (`backend/tests/test_migration_0006.py`,
  `0011` için `test_migration_0011.py`). **Numara çakışması (27.09.2026):** iki dal
  aynı anda `0011` açtı; Alembic bunu okurken yalnız uyarıyor, `upgrade head`
  "Multiple head revisions" ile ancak test oturumu ya da deploy anında,
  dosyaları söylemeden duruyor. `backend/tests/test_migration_chain.py`
  (veritabanısız) numaraların benzersiz olduğunu, dosya adıyla uyuştuğunu ve
  zincirin tek uçlu olduğunu doğrular. Yeni migration açan bir dal, birleştirmeden
  önce güncel tabanın üstüne alınıp numarası bir sonrakine taşınır.
- **Dönem snapshot'ı veritabanı seviyesinde değişmezdir** (`period_snapshot`
  trigger'ı): plan sürümü, provider referansları, tarihler ve kota sonradan
  güncellenemez; yalnız `status`, `closed_at`, `used_this_period` ve hesap
  silmedeki `user_id → NULL` serbesttir. Testin zamanı geriye alması gerekiyorsa
  korumayı tek bir yardımcıda (`backend/tests/test_billing.py::backdate_period`)
  ve yalnızca o işlem süresince kapatın — üretim yolunda yürürlükte kalsın.
- **Model optimizasyonunda kalite bozulmaz (Serhan, 27.09.2026):** FP16/INT8
  niceleme, 1024'ün altında giriş çözünürlüğü, lite model KULLANILMAZ.
  Ölçüm: sürenin %93–99'u model hesabı (`backend/scripts/profile_cutout.py`);
  CPU'da kayıpsız kazanç %5'in altında olduğu için yapılmadı. Hız GPU'yla
  (FP32) gelir — Faz 7.5.
- **Model süreç başına yüklenir (yük testi, 26.09.2026):** her kesim İŞÇİSİ
  BiRefNet'in ayrı bir kopyasını tutar (N işçi × ~12 GB; ders 31). Faz 7'den
  beri API modeli hiç yüklemez, bu yüzden API süreç sayısıyla serbestçe
  ölçeklenebilir; kesim kapasitesi işçi MAKİNESİ sayısıyla (ya da GPU'yla,
  Faz 7.5) artar. Aynı CPU'da `MAX_CONCURRENT_INFERENCES` > 1 hızlandırmaz. Yük testi aracı `backend/scripts/load_test.py`
  (R2'ye yazmaz, yalnız yerel test veritabanında koşar); sonuçlar
  `backend/README.md` → "Yük testi".
- **Hata izleme (Faz 7):** backend `backend/app/core/monitoring.py`, frontend
  `frontend/src/lib/error-tracking.ts` (tarayıcı + Next sunucusu, DSN yokken SDK
  hiç yüklenmez; tıklama kırıntıları ve adres sorguları gitmez — ayrıntı
  `frontend/README.md` → "Hata izleme"). KVKK/gizlilik metnine "hata izleme
  hizmet sağlayıcısı" alıcı grubu olarak eklendi (yasal sürüm `2026-09-27`).
  Backend: Sentry protokolü.
  `SENTRY_DSN` boşken kapalı; doluyken yalnız 5xx gider ve gövde, yerel
  değişken, kimlik bilgisi başlıkları, çerez, sorgu dizesi hiç gitmez, e-posta/
  JWT/SQL parametresi maskelenir. **Production'da DSN, sağlayıcı KVKK
  aydınlatma metnine eklenmeden verilmez.** Testler `SENTRY_DSN`'i her zaman
  boşaltır (`tests/conftest.py`). Yeni bir kimlik bilgisi başlığı eklenirse
  `SENSITIVE_HEADERS`'a da eklenir.
- **Hız sınırı Redis arızasında her uç noktada aynı davranmaz.** Karar, uç
  noktanın NE KORUDUĞUNA göre veriliyor: para/sağlayıcı geri dönüşü/webhook
  yüzeyleri **fail-closed** (`limit_checkout`, `limit_public`), zemin
  **listeleme** ise **fail-open** (`limit_scoped`). Gerekçe: listeleme bir kapı
  değil (erişim kuralı 1) ve sınırlayıcının altyapı arızası, Next vekilinin
  bütün 5xx'leri "200 + boş liste"ye çevirmesi yüzünden kullanıcının gözünde
  93 zeminlik kütüphaneyi yok ediyordu. Her iki yön de test edilmiş durumda;
  yeni bir uç noktaya sınır eklerken bu ayrım bilinçli olarak seçilir. **Kapsam (02.10.2026):**
  OpenAPI'deki HER uç `backend/tests/test_rate_limit_coverage.py`'de `CLOSED`/`OPEN`/
  `UPLOAD`/`EXEMPT` sınıflarından birine atanır (sınıfsız yeni uç kırmızı yakar) ve test
  davranışı sınar: limit doluyken 429, Redis düşünce CLOSED 503 / OPEN sınırsız geçer.
  Çalışma okuma/abonelik/geçmiş/kesim yoklaması `limit_user_read` (fail-open, 600/dk),
  taslak otomatik kaydı `limit_project_write` (fail-open: Redis arızasında kapatmak
  kullanıcının stüdyodaki düzenlemesini kaybettirirdi), çalışma silme `limit_user_delete`
  ve hesap silme `limit_account_delete` (fail-closed, saatte 5), admin faturalama yazma
  uçları `limit_admin` (fail-closed; 02.10.2026'ya kadar sınırsızdı). Fail-closed artık
  hep temiz 503 `rate_limit_unavailable` verir (eskiden yakalanmamış `RedisError` → 500).
  **Ön yüzde 429 (02.10.2026 kontrolü):** vekil (`lib/backend-proxy.ts`) 429/503'ü Türkçe mesaj ve `Retry-After`'la aynen aktarır; hesap silme, abonelik iptali, destek formu ve çalışma listesi bunu gösterir. **Kesim yoklaması** 429'u ARTIK hataya çevirmez: `Retry-After` kadar bekleyip aynı anahtarla sürer, 5 ardışık 429'da mesajla durur (anahtar ve kredi korunur). Otomatik kayıt 429'da genel "kaydedilemedi" bandını gösterir (mesaj 429'a özgü değil; 300/dk sınırı normal kullanımda tetiklenmez). Destek formu  (`POST /api/support-requests`, saatte 5/kullanıcı) da fail-open: Redis'in
  düştüğü an kullanıcının sorun bildirmek isteyeceği andır. **CMYK dönüşümü**
  (Next `/api/cmyk`, 27.09.2026'ya kadar oturumsuz ve sınırsızdı — /cso
  incelemesi) gövdeyi okumadan önce backend'e sorar (`POST /api/cmyk/permit`:
  oturum + kullanıcı başına 10 dk'da 20); **fail-closed**, çünkü korunan şey
  sunucunun işlemcisi ve kaybedilen yalnız CMYK dosyası. **Oturum token'ı
  tarayıcıdan okunabilir** (`@supabase/ssr` çerezi `httpOnly` değil); "tarayıcı
  token görmüyor" eski ifadesi yanlıştı, ayrıntı `SECURITY.md` 3.1.
- **Hız sınırı kovası ters proxy arkasında doğru seçilmeli:** `request.client.host`
  doğrudan okunursa tüm trafik proxy'nin tek kovasını paylaşır, `X-Forwarded-For`'a
  körlemesine güvenmek ise sınırı tamamen kaldırır. Başlık yalnız bağlantı
  `TRUSTED_PROXY_IPS` listesindeki bir adresten geliyorsa okunur; vekil arkasındaki
  oturumlu uç noktalarda kova kullanıcıya bağlanır
  (`backend/app/services/billing/limits.py`).
- **Test:** pytest (backend), Vitest (frontend), Playwright (E2E). **CI (Faz 7,
  26.09.2026):** `.github/workflows/ci.yml` her PR'da backend testlerini
  `.env`'SİZ, frontend lint/test/build'i ve ayrı bir işte `pip-audit` +
  `npm audit`'i koşar. Supabase isteyen bir test `tokens` fixture'ını ister —
  yerel `.env`'ye gizlice dayanan test yerelde yeşil, CI'da kırmızı yanar.
  CI'ın backend işi testlerden önce `ruff check app tests scripts alembic`
  koşar (yalnız pyflakes: tanımsız isim, kullanılmayan içe aktarma;
  `backend/ruff.toml`, 27.09.2026). Yerelde aynısı: `cd backend && .venv/bin/ruff check app tests scripts alembic`.
  **Backend testleri tek komutla: `backend/scripts/test.sh`** (ayrı compose
  projesinde kendi Postgres'i 5434 + Redis'i 6380; argümanlar pytest'e geçer,
  çıkış kodu pytest'inki; test Redis'ini her oturum başında temizler — yalnız
  kendi Redis'inde, `VITRIN_TEST_REDIS_OWNED=1`, kilit alındıktan sonra, bkz.
  `backend/README.md` → "Testler"). Düz `pytest` `execute.sh`'ın geliştirme
  veritabanında (yerel + 5432 + `vitrin_ai`) hiçbir şeye dokunmadan durur
  (`VITRIN_ALLOW_DEV_DB_RESET=1` ile bilerek geçilir); aynı test
  veritabanında ikinci bir oturum da kilit alamayıp durur (ders 34).
  Model çıktısını değiştirebilecek her iş (bağımlılık yükseltmesi, model
  optimizasyonu) `backend/scripts/compare_cutouts.py` ile gerçek fotoğraflarda
  önce/sonra ölçülür. `./execute.sh` requirements değişince `.venv`'yi günceller. **npm tuzağı (PR #30):** Mac'teki eski npm (11.6) ile yapılan `npm install`, kilit dosyasına Linux'ta gereken isteğe bağlı paketleri (`@emnapi/*`) yazmadı ve CI'daki `npm ci` "lock file out of sync" ile düştü. Kilit dosyası CI ile aynı npm'le güncellenir: `docker run --rm -v "$PWD:/app" -w /app node:24-alpine npm install --package-lock-only --ignore-scripts` (frontend klasöründe).
- **Mobil (sonra):** React Native + Expo

## Git iş akışı

- Dal (branch) isimlendirme: `feature/<kısa-açıklama>`, `fix/<kısa-açıklama>`
- Çalışma feature dallarında yapılır, asla doğrudan `main` üzerinde değil
- Pull request'ler bir görev tamamlandığında ve kullanıcı onayladığında Claude Code içinden GitHub CLI ile açılır (`gh pr create`)
- PR'lar birleştirilmeden önce diğer ekip üyesi tarafından incelenir
- Bir birleştirmeden sonra, yeni işe başlamadan önce yerel olarak `main`'i çekin (pull)
- **Stacked PR'lar üstten alta birleştirilir.** Bir PR'ın base'i `main` değil başka bir feature dalıysa, önce üstteki PR alt dala, sonra alt dal `main`'e birleştirilir. Ters sırada birleştirilirse üstteki PR'ın işi `main`'e hiç ulaşmaz ve GitHub'da her iki PR da "Merged" göründüğü için bu fark edilmez (bkz. ders 17 — Faz 2'de yaşandı, 8 commit kayboldu)
- **Bir merge'den sonra işin gerçekten `main`'de olduğu doğrulanır:** `git merge-base --is-ancestor <commit> origin/main`
- **`main`, CI yeşil olmadan birleştirilemez (26.09.2026, Serhan'ın kararı).** GitHub'daki "protect main" kural setine zorunlu durum kontrolü eklendi: `Backend testleri`, `Frontend lint, test, build`, `Bağımlılık güvenlik taraması` (`.github/workflows/ci.yml`'deki iş adları). Sebep: PR #29, son commit'in CI'ı sürerken birleştirildi — sonuç yeşil çıktı ama kırmızı olsaydı bozuk kod `main`'e girerdi. Kural setinde kimse için istisna (bypass) yok. **Tuzak:** CI'daki bir işin `name:`'i değiştirilirse zorunlu kontrol o adı bir daha görmez ve her PR sonsuza dek "bekliyor"da kalır — iş adı değişirse kural seti aynı anda güncellenir. **Yan etki:** haftalık tarama (ya da herhangi bir PR'daki tarama) yeni bir açık bulduğunda, açık kapatılana kadar hiçbir PR birleştirilemez — ilgisiz bir PR bile. Bu bilinçli (açık bilinerek birleştirme yapılmasın). Doğru çıkış yolu önce açığı kapatan sürüm yükseltmesi PR'ıdır; acil ve başka türlü çözülemeyen bir durumda kural seti (GitHub → Settings → Rules → "protect main") geçici olarak düzenlenir, bu da diğer ekip üyesine haber verilerek ve iş bitince geri alınarak yapılır. **Yan etki gerçekleşti (30.09–01.10.2026):** üç ayrı bildirim (PyJWT 10 CVE, 3 geçişli npm paketi, ardından `next` kritik RCE + PyJWT 2.15) `main` CI'ını bağımlılık taramasında kırmızıya çevirdi ve açık PR'lar (#34, #36) birleştirilemedi; çıkış yolu kural seti gevşetilmeden açığı kapatan sürüm PR'ları oldu (#35, #37, #44; #43 #44'e katılıp kapatıldı). Önceki kural seti `gh api repos/serhandenizhan/vitrin-ai/rulesets/22794410` ile okunabilir.

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
- Kullanıcıya özel bir kaynağa erişen her endpoint (`/api/projects/{id}` gibi) o kaynağın gerçekten istek yapan kullanıcıya ait olduğunu DB seviyesinde doğrular (IDOR koruması) — bu kontrol olmadan endpoint tamamlanmış sayılmaz. **Yeni her uç `backend/tests/test_idor.py`'daki dört sınıftan birine (`PUBLIC`/`SESSION`/`OWNED`/`ADMIN`) eklenir** — eklenmezse envanter testi kırmızı yanar; `OWNED` bir uç için "başkası 404 + kaynak değişmez, sahibi başarılı" testi de aynı dosyaya yazılır.
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

**İkinci betik: `./execute-supabase.sh` (22.09.2026, kullanıcı kararı).** `execute.sh` Postgres için **yerel Docker** kullanıyor; bu, Faz 4'ün yerel Supabase Auth uyumluluk katmanına (`0002_local_supabase_auth_shim.py`) dayanıyor — gerçek Supabase Auth ile giriş yapılabiliyor ama `auth.users`, `admin_users`, `subscriptions` YEREL ve BOŞ bir tablo, gerçek Supabase projesindeki verilerle hiç ilişkili değil. Sonuç: yerel `execute.sh` ile giriş yapan gerçek bir hesap admin panelini hiç göremiyor ve `/api/subscriptions/me` "Hesap bulunamadı" (401 `auth_required`) döndürüyor — çünkü `billing_signup` trigger'ı yalnızca YEREL `auth.users`'a satır eklenince tetikleniyor, gerçek Supabase girişi bu tabloya hiç yazmıyor. Admin yetkisini/aboneliği yerelde test etmenin iki yolu var:
1. **`execute.sh` (varsayılan, 26.09.2026'dan beri otomatik):** betik her açılışta `backend/scripts/sync_local_auth.py`'yi çalıştırır. Kullanıcılar Supabase'in yönetici API'sinden (HTTPS, `SUPABASE_SECRET_KEY`) okunup yerel `auth.users`'a yazılır; satır eklenince `billing_signup` abonelik satırını kendisi açar (production'daki kayıt yoluyla aynı). Yönetici yetkisi Supabase API'sinde olmadığı için yerelde kimin yönetici olacağı `backend/.env`'deki `LOCAL_ADMIN_EMAILS` ile verilir. Betik yalnız EKLER: listeden çıkarılan adresin yerel yetkisi ve Supabase'de silinen kullanıcı yerelde kalır. **Zemin kütüphanesi de eşitlenir** (`scripts/sync_local_backgrounds.py`): production'daki `backgrounds` satırları `backend/.env.supabase` üzerinden YALNIZCA OKUNUP yerele yazılır — görseller zaten ortak R2'de ama zemin listesi tabloda, tablo boşken stüdyo yalnız sade zeminleri gösteriyordu. Ağ 5432'yi engelliyorsa ~10 sn'de vazgeçer, zeminler son eşitlemedeki hâliyle kalır (ölçüldü). **R2 ortak olduğu için** `execute.sh` backend'i `R2_SHARED_WITH_PRODUCTION=true` ile açar: yerelde zemin silmek yalnız yerel satırı siler, canlıdaki dosyaya dokunmaz (test, koruma geri alınınca kırmızı yandığı görülerek doğrulandı). **Tarihçe:** 22.09.2026'dan önce `execute.sh` ile zeminlerin görünmesinin sebebi, loglara göre `backend/.env`'nin doğrudan Supabase'i göstermesiydi (20.09 logunda backend istekleri ~424 ms, bugün yerel DB ile ~75 ms; o gün düzenlenen zemin kimliği production'da var). Port engeli çıkınca `.env` yerele çevrildi ve zeminler kayboldu. **Tuzak (27.09.2026'da kodla kapatıldı):** backend testleri bağlandıkları veritabanını sıfırlar; düz `pytest` bu yerel veritabanını sildi. Artık düz `pytest` burada durur; testler `backend/scripts/test.sh` ile ayrı bir veritabanında koşar (`backend/README.md` → "Testler", ders 34). **Koruma:** betik yalnız 0002'nin işaretlediği yerel şime yazar; bağlandığı veritabanı gerçek Supabase ise hiçbir şeye dokunmadan çıkar (çıkış kodu 2, ölçüldü). Eşitleme başarısız olursa sistem yine açılır, yalnız uyarı basılır. Günlük geliştirme için doğru yol bu: production verisine dokunmaz.
2. **`./execute-supabase.sh`:** backend'i yerel Docker Postgres yerine DOĞRUDAN gerçek Supabase veritabanına bağlar (Redis hâlâ yerel Docker'da — Supabase'in parçası değil). `backend/.env.supabase` (gitignored, `.env.*` deseninde) içindeki `DATABASE_URL`'i gerçek bir ortam değişkeni olarak dışarı verip `backend/.env`'deki aynı anahtarı geçersiz kılıyor (pydantic-settings'te ortam değişkeni `.env` dosyasından önce gelir — doğrulandı). `.env`'deki diğer her değer (`SUPABASE_URL`, R2, vb.) aynen kullanılıyor. Önkoşul: `./execute.sh` en az bir kez çalıştırılmış olmalı (venv + `node_modules` kurulumu için) — bu betik onları kurmuyor.
   - **Bu veritabanı production'dır (gerçek kullanıcı verisi).** Betik bu yüzden `alembic upgrade head`'i varsayılan olarak ÇALIŞTIRMAZ: bir feature dalındaki birleşmemiş bir migration production'a sessizce girerse o dosya bir daha düzenlenemez. Bilinçli olarak uygulamak için `VITRIN_SUPABASE_MIGRATE=1 ./execute-supabase.sh` (betiğin ilk incelemesinde bulundu, 26.09.2026).
   - **Ağ kısıtı AĞA BAĞLI, kalıcı değil:** 22.09.2026'da o anki ağdan Supabase pooler'ına (`aws-0-eu-central-1.pooler.supabase.com`) port 443 açılıyor ama **5432** ve **6543** (Postgres) sessizce düşüyordu — kod hatası değil, o ağın (VPN/güvenlik duvarı/ISP) Postgres portlarını engellemesi. **26.09.2026'da aynı makineden ev ağında (en0) yeniden ölçüldü: üç port da açık, gerçek bir `select 1` 1,5 sn'de döndü.** Betik açılışta asılı kalırsa ilk şüpheli yine bulunulan ağdır; o durumda yol 1 kullanılır.

## Frontend çalıştırma (Faz 2'de kuruldu)

```bash
cd frontend && npm install && cp .env.example .env.local && npm run dev
```

- `frontend/.env.local` içinde `USE_MOCK_BACKEND=true` backend olmadan arayüzü çalıştırır (sahte bir kesim PNG'i döner, arayüzde "Demo modu" olarak işaretlenir). **Dikkat:** bu değer `true` kalırsa gerçek backend ayakta olsa bile arayüz hep demo/mock sonucu gösterir.
- Gerçek uçtan uca demo için backend'i ayrı bir terminalde başlatın ve `USE_MOCK_BACKEND=false` yapın. Kesimi ayrı işçi yapar (`execute.sh` ve VS Code görevi açar); işçi modeli açılışta yüklediği için ilk ~30 sn'deki istek sırada bekler, hata almaz (bkz. "Bilinen kısıt" bölümü).
- Desteklenen formatlar: JPEG, PNG, WebP, HEIC/HEIF. Chrome/Firefox/Edge HEIC'i `<img>` ile gösteremiyor; önizleme `frontend/src/lib/heic-preview.ts` ile üretiliyor: önce tarayıcının kendi çözücüsü (Safari), olmazsa `heic-to` (libheif WASM, **LGPL-3.0**, ~3 MB) yalnızca HEIC seçildiğinde dinamik yükleniyor. İkisi de başarısızsa eski bilgi kartı çıkıyor. Backend'e her zaman özgün dosya gidiyor; tarayıcıda üretilen JPEG yalnızca gösterim için.
- **Dosya boyutu sınırı 20 MB** (`backend/app/core/config.py` → `max_file_size_mb`). Frontend'deki karşılığı `frontend/src/lib/upload-constraints.ts`; ikisi elle senkron tutulur.
- **Telefondan dev sunucusu:** `frontend/.env.local`'e `DEV_ALLOWED_ORIGINS=<yerel IP>` yazılıp sunucu yeniden başlatılır, telefonda `http://<ip>:3000`. Yazılmazsa Next.js 16 istekleri engeller ve sayfa açılır ama etkileşimsiz kalır — hata gibi görünür. IP koda yazılmaz (ders 11). Ayrıntı: `frontend/README.md`.
- **Mobil kontrol (13.09.2026):** sayfalar 375 px'te taşma ve dokunma hedefi için tarandı. Tuzak: yüzen üst çubuk `z-50`; üstüne açılan her katman (çekmece `z-[55]`, perdesi `z-[52]`, giriş penceresi `z-60`) daha yüksek olmalı, yoksa çubuk katmanın başlığını ve kapat düğmesini örter.
- Tarayıcı FastAPI'ye doğrudan bağlanmaz, istek `frontend/src/app/api/remove-background/route.ts` vekilinden geçer. Vekil ayrıca Windows'ta boş gelen `.heic` content-type'ını uzantıdan düzeltir ve backend'in 413/503 yanıtlarını kullanıcı diline çevirir.
- **Hesaplar (Faz 4):** `frontend/.env.local`'e `NEXT_PUBLIC_SUPABASE_URL` ve `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` yazılmalı; boşsa site açılır ama giriş yapılamaz. **Arka plan kaldırma giriş ister** (ürün kararı, demo modunda da). Vekil oturumu gövdeyi okumadan önce kontrol ediyor. Supabase panelinde gereken ayarlar: Redirect URLs'te `http://localhost:3000/auth/callback` (sıfırlama bağlantısı `?next=` eklediği için yerelde `http://localhost:3000/**`), parola kuralı (en az 8, küçük + büyük harf + rakam + **sembol** — Dashboard'daki gerçek ayar "...and symbols (recommended)", bkz. ders 19), e-posta bağlantı süresi. Ayrıntı: `frontend/README.md` → "Hesaplar".
- **Geçmiş çalışmalar sunucuda:** `work-history.ts` artık `/api/projects` vekillerine gidiyor; kayıtlı sonuç görseli `/api/projects/[id]/result` üzerinden aynı kökenden veriliyor (R2 CORS'a bağlı değil, tuval kirlenmiyor). **Faz 5'ten beri R2 zorunlu:** arka plan kaldırma başarılı sonucu idempotency için geçici bir R2 nesnesi olarak saklamadan krediyi tüketmiyor; R2 yapılandırılmamışsa kesim hiç başlamaz ve `503 result_storage_unavailable` döner (eskiden bu cümle "kesim ve indirme akışı etkilenmez" diyordu). Yalnız arayüzü denemek için `USE_MOCK_BACKEND=true`.
- **Backend'de `GET /api/health` var** (`backend/app/api/routes/health.py`, diğer tüm uç noktalarla aynı `/api` öneki altında) — `{"status": "ok"}` döner. Bilinçli olarak sadece süreç canlılığını doğrular, model yüklü mü diye bakmaz: Faz 7'den beri API süreci modeli hiç yüklemiyor (kesim ayrı işçide); işçinin sağlığı bu uçtan görünmez; onun için yönetici ucu `GET /api/admin/cutout-queue` var (canlı işçi, kuyruk uzunluğu, en eski bekleyenin yaşı; işçi yokken `error` günlüğü). İşçi çalışmıyorsa kesimler sırada bekler (canlıda servis olarak izlenmesi açık takip maddesi 7'de). `backend/Dockerfile`'da bu uç noktaya bağlı bir `HEALTHCHECK` var. Arayüzde bu endpoint'i kullanan bir "servis ayakta mı" göstergesi henüz yok — istenirse eklenebilir.
- **Frontend testleri:** `cd frontend && npm test` (Vitest, 515 test). Kapsam; stüdyonun üç adımı, A4 varsayılanı, zeminin esnetilmeden kırpılması, biçim yönüne göre zemin süzme, yansıma yerleşimi, zemin kategorileri ve baskıya önerilmeyen zeminde CMYK onayı, yükleme kısıtları, arka plan kaldırma/zemin/proje/hesap vekilleri (oturum zorunluluğu dahil), CMYK yükleme limitleri, imzalı URL yenileme zamanlaması, kompozisyon geometrisi, logo/etiket yerleşimi, parola kuralı, profil doğrulaması, açık yönlendirme koruması ile kayıt formu, cursor geçmişi, yasal sürüm/yayın koruması, editör (pazaryeri, WhatsApp paylaşımı, logo reddi), açılıştaki önce/sonra ve Faz 5 incelemesinde eklenen idempotency anahtarı davranışı, stüdyonun masaüstü aşamalı akışı ve yalnız açılışta çıkan perde (matchMedia taklidiyle), zeminlerin düzden karmaşığa sırası, Çalışmalarım'da silme onayı, admin zemin süzgeçleri (kategori + yayın durumu), stüdyoda ilk döndürmede ürün boyutunun değişmemesi, zemin favorileri ile gölge boyutu/yoğunluğu ve yansıma mesafesi, oturum düşünce zemin listesinin boşalmaması, hesap silmede Origin kontrolü ile bekleyen checkout'un iptali, kesim işinin anahtarının ekranın ortak anahtarından ayrı tutulması (Kaan'ın PR #30 incelemesi), admin listesi/mutasyon yarışı (PR #25 incelemesi: mutasyondan önce başlayan periyodik GET'in yeni durumu geri alamaması — ilk testin tek bir mikro görev turu beklediği için yanlışlıkla düzeltmesiz de yeşil geçtiği fark edildi, birden fazla tur beklenecek şekilde güçlendirildi) ve yönetici ekleme/çıkarma için React bileşen testlerini içerir. **Tuzak:** Konva, "tainted" tuvalde `toDataURL` hatasını fırlatmıyor, yakalayıp boş string döndürüyor — boş sonuç hata olarak ele alınmazsa PNG düğmesi sessizce hiçbir şey yapmaz (tarayıcıda ölçüldü). Bileşen testleri Faz 7'de Kaan tarafından genişletildi (30.09.2026). **E2E (Playwright, 30.09.2026, Kaan):** `cd frontend && npm run e2e` (`e2e/`, masaüstü + 375 px telefon projesi); gerçek Supabase hesabı GEREKTİRMEZ: girişsiz akışlar (sayfalar, 404, oturum koruması, vekil uçların 401'i, giriş penceresi, yükleme reddi) olduğu gibi, OTURUMLU akışlar (hesap menüsü, çıkış, çalışmalar listesi ve liste hatası, yükleme → kesim → stüdyo, kesim hatası) `e2e/oturum.ts`'teki sahte oturum çerezi + taklit `/api/*` yanıtlarıyla sınanır. Giriş formu GÖNDERİLMEZ, production Supabase'e istek gitmez. **Sınır:** bunlar ARAYÜZÜN oturumlu davranışını sınar; Supabase entegrasyonunu, JWT doğrulamasını ve IDOR'u değil (onlar backend testlerinde gerçek tokenlarla). Taklit yanıt biçimi vekilin ürettiği camelCase'tir (`WorkRecord`), backend'inki değil. Adres `E2E_BASE_URL` ile değişir; sunucu açıksa onu kullanır. stüdyonun aşama içi araçları masaüstünde sınanır (`e2e/studyo.spec.ts`: biçim/zemin seçimi, 90° döndürme, aşamalar arası gezinme, PNG/JPEG indirmenin gerçek dosya imzası, otomatik taslak kaydı; tuval durumu TÜM Konva katmanlarının özetiyle ölçülür, ders 26). CMYK, WhatsApp, çoklu boyut indirme, logo ve etiket de sınanır (`e2e/cikti.spec.ts`); görsel ağırlık bütçesi `e2e/agirlik.spec.ts`'te. **CI'da ayrı bir iş olarak koşar** ("Frontend E2E (Playwright)"): hermetik (sahte Supabase, ulaşılamaz backend; `NEXT_PUBLIC_SUPABASE_URL` derlemeye sahte değerle verilir) ve **ZORUNLU KONTROL DEĞİL** — "protect main" kural setine eklemek Serhan'ın kararı; eklenirse iş adı değişmemeli. Üst çubuktaki "Giriş yap" düğmesi telefonda yalnız ikon olduğu için `aria-label` taşır (E2E bunu bulup eklettirdi; testler adına göre seçer).
- **Sayfa ağırlığı (Faz 7, 28.09.2026, Kaan):** `SiteShell` her sayfada çizildiği için oraya doğrudan içe aktarılan her bileşenin kodu BÜTÜN sayfalara iner. Stüdyo bu yüzden `components/composer/studio-host.tsx` üzerinden `next/dynamic` ile yalnız açılınca yükleniyor (ölçüm: sayfa başına ilk JS ~1050 → ~940 KB, gzip ~305 → ~275 KB; kalan kısım React çatısı + her sayfada gereken Supabase istemcisi). **Kural: kabuğa yalnız kapalıyken de gereken şey konur; tam ekran/katman bileşenleri (stüdyo gibi) açılınca yüklenir.** Ölçüm Next 16'da `next build` boyut yazmadığı için üretim sunucusunda (`next start`) sayfanın indirdiği dosyalar toplanarak yapıldı. Yüklenen fotoğraf ise **bilinçli olarak sıkıştırılmaz** — model girdisi özgün dosyadır (ROADMAP bölüm 2, WhatsApp sıkıştırması dersi). **Windows tuzağı:** proje OneDrive altında olduğu için `next start` açıkken ya da hemen ardından `next build` `.next` içinde `EPERM` verebilir; önce sunucu (portun sahibi süreç) kapatılır, gerekirse `.next` silinip yeniden derlenir.
- **Zemin kütüphanesi (öne alınan iş, 17.09.2026):** 93 zemin `backend/scripts/upload_backgrounds.py` ile R2 + `backgrounds` tablosuna "basic" olarak yüklendi; betik yükleme ucuyla aynı kontrolleri yapıp zemini aynı çözünürlükte JPEG %92'ye çevirir ve 480 px önizleme (`backgrounds/thumbs/<id>.jpg`) üretir. **Veritabanı yapısı bilinçli olarak değişmedi** (Kaan: "karışıklık olur"): kategori ve baskı uyarısı `frontend/src/lib/background-catalog.ts`'te (betikle üretilir, elle düzenlenmez), zemin kimliğine göre; katalogda olmayan zemin "Sade" sayılır. 4 kategori (`lib/background-categories.ts`): Sade, Doku & desen, Doğal & çiçekli, Lüks & koyu. Düşük çözünürlüklü 4 ChatGPT zemininde CMYK düğmesi önce "Bu görsel baskıya önerilmiyor. Yine de onaylıyor musunuz?" diye sorar — kontrol yalnız arayüzde, `/api/cmyk` hangi zeminin kullanıldığını bilmez. **Tuzak (PR #18'de KAPATILDI):** Faz 5'in hız sınırlayıcısı Redis ister ve Redis yoksa `GET /api/backgrounds` 500 veriyordu; vekil bütün 5xx'leri "200 + boş liste"ye çevirdiği için stüdyo sessizce gradyan yer tutuculara düşüyordu. Artık zemin listelemenin hız sınırı **fail-open** (para/webhook yüzeyleri fail-closed kaldı, bkz. yukarıdaki hız sınırı maddesi): Redis kapalıyken de 93 zemin dönüyor, yalnızca bir uyarı log'lanıyor. **Sıra (19.09.2026, Serhan):** kategori içinde zeminler DÜZDEN KARMAŞIĞA; sıra `frontend/src/lib/background-order.ts`'te, `backend/scripts/rank_backgrounds.py` R2'deki önizlemelerin kenar şiddetini ölçerek üretir (salt okuma, DB yapısı değişmedi). Yeni zemin yüklenince betik yeniden çalıştırılır; sırada olmayan zemin kategorisinin sonuna düşer. Arayüz de "kütüphane hazırlanıyor" ile "yüklenemedi"yi ayırıyor ve tekrar deneme sunuyor. Zeminler yine görünmüyorsa sıradaki şüpheli Redis değil, **R2 ayarları ya da CORS kuralı**. Yerelde Redis: `Yeni klasör\araclar\redis\` (redis-windows 8.10.1, kurulumsuz), `.claude/launch.json`'daki `redis` kaydı; backend'den önce başlatılır.
- **Stüdyo ve katalog düzenlemeleri (öne alınan iş, 17.09.2026, Kaan):** stüdyo **A4 ile açılır**, "Kare 2000×2000" kaldırıldı (beyaz zeminli Pazaryeri duruyor). Düzenleme **üç adım**: 1 Boyut ve zemin → 2 Ürün (yerleşim, parlaklık/kontrast/doygunluk, gölge, yansıma) → 3 Bitir (logo, etiket, indirme, CMYK, WhatsApp). Zemin artık **esnetilmiyor**, biçimi ortadan kırparak kaplıyor (`coverCrop`); fotoğraf/desenli zeminler yalnızca biçimin yönüne (dikey/yatay; kare = yatay) uyuyorsa listelenir, **Sade her biçimde** (`fitsOrientation`; yön katalogda, yükleme betiği ölçülerden üretir). "Işık havuzu" kaldırıldı, yerine **yansıma** (ayrı Konva katmanında `destination-in` ile silikleşen ayna kopya). **Gölge güçlendirildi** (`SHADOW` 50/34/%55): eski değer Konva'da ölçüldü, açık zeminde ~27/255, koyu zeminde ~0 koyulaşma veriyordu — önbellek teşhisi ölçümle çürütüldü, sebep zayıf değerlerdi. Katalog PNG yerine **JPEG + baskıya uygun CMYK** ve **logo** (stüdyoyla aynı depolama; `lib/print-download.ts`, `lib/logo-image.ts` ortak). Sol panelden eski çalışma ana sayfa dışındaki sayfalarda açılmıyordu: bekleyen çalışma `sessionStorage`'a yazılıp ana sayfaya gidiliyor (sağlayıcı her sayfada yeniden kuruluyor, bellek yetmez).
- **Aynı günün sonraki turları (17.09.2026, Kaan):** indirme sonrası soru (katalog boyutunda önce "şablona ekle" → `lib/catalog-handoff.ts` ile Katalog'da "Tam sayfa", sonra "ana menüye dön"); katalogda 6 şablon, sayfa rengi ve siyah/beyaz metin (`applyTemplateColors`); logo stüdyoda ve katalogda sürüklenip kare köşelerden boyutlandırılıyor (`LogoSettings.position`), renkleri çevrilebiliyor; stüdyoda **gölge kapalı başlıyor**. **Tuzak:** Konva önbelleği `shadowEnabled` değişince yenilenmiyor, gölge aç/kapa için `clearCache()`+`cache()` şart. **Gölge boyutu/yoğunluğu ve yansıma mesafesi (19.09.2026):** `Appearance`'a `shadowSize` (`SHADOW` çarpanı), `shadowOpacity` ve `reflectionGap` eklendi; aynı tuzak nedeniyle önbellek bu değerler değişince de yeniden alınıyor. Eski taslaklar `normalizeAppearance` ile varsayılanlara tamamlanıyor. **Tuzak:** `sessionStorage`'tan okurken silmek geliştirmede (StrictMode, efekt iki kez) veriyi kaybettiriyor — önce oku, teslim edince sil. Bülten `/bulten` (içerik `lib/bulletin.ts`); **altın kuru yok**: ücret/lisans/yazılı izin isteyen veri kaynağı eklenmez (TCMB ticari kullanımda yazılı izin istiyor). Telefonda liste düzenleri içeriğe göre farklı (`globals.css` `.mobile-rail` yalnızca görselli listelerde; diğerleri kısa liste, açılır başlık, sekme).
- **Stüdyo iyileştirmeleri (öne alınan iş, 21.09.2026, Kaan):** ayrıntı `ROADMAP.md` Faz 6. Kalıcı kurallar: (1) **editör ayarları otomatik kaydedilir** (1,5 sn gecikme + stüdyo/sekme kapanışında `keepalive` ile hemen) — yalnız "Yarım kalan"a düşmüş, yani oturumlu ve geçmişi açık çalışmalarda; (2) **zemin önizlemesi (hover) çıktıya ve kayda girmez**: sahne `previewBackground ?? selectedBackground` çizer, Tamamla'da önizleme kapalı çünkü dışa aktarma canlı sahneyi çiziyor; (3) **birden fazla boyutta indirme çizimi TEKRAR YAZMAZ**: görünmez ikinci `EditorStage` (`multi-format-export.tsx`) kurulur, dosya `onRenderReady` gelince alınır (erken alınsa zeminsiz iner, ders 23), yerleşim `mapTransformToStage` ile oranla taşınır, Pazaryeri her zaman düz beyaz; (4) **dışa aktarma tutamaçları ÖNCEKİ görünürlüğüne döndürür**, koşulsuz `show()` değil — Tamamla'nın temiz görünümünü eziyordu; (5) **"Önerilen" zeminler** kesimin ve zemin önizlemelerinin ortalama renginden (`lib/background-suggestions.ts`), renkler `localStorage`'ta; R2 CORS yoksa raf sessizce boş kalır. Ürün etiketi artık kutusuz tek satır yazı; `theme: "dark"` = açık yazı. Her indirmeden sonra logolu teşekkür kartı. **Tuzak:** yan çekmece kapalıyken ekran dışında ama gölgesi sayfaya taşıyordu — ekran dışı öğenin gölgesi/taşması da görünür.
- **Görsel varlıklar betikle üretilir, elle değil:** `node scripts/prepare-photos.mjs` (gerçek ürün fotoğraflarını web için hazırlar; kaynak `frontend/photo-source/`), `python scripts/generate-mock-cutout.py` (demo modunun örnek kesimi) ve `backend/.venv/Scripts/python frontend/scripts/prepare-before-after.py` (açılıştaki önce/sonra çifti; BiRefNet'i doğrudan çağırır, ~12 GB RAM ister). İkili bir dosyayı kaynağı olmadan commit etmek, ileride "bu nereden geldi, nasıl değiştirilir" sorusunu cevapsız bırakır.
- **README logosu öne alındı (Serhan, 17.09.2026):** Faz 6 kapanışı için planlanan iş, kullanıcı onayıyla şimdi yapıldı. Kök `README.md`'nin başında `docs/brand/vitrin-ai-logo-2.png` var. Marka işaretinin üç renk çeşidi de depoda duruyor: `vitrin-ai-logo.png` (beyaz), `vitrin-ai-logo-2.png` (altın), `vitrin-ai-logo-3.png` (siyah) — hepsi 1530×1040, saydam zeminli PNG. **README'de altın olan seçildi** çünkü GitHub hem açık hem koyu temada gösteriyor: beyaz çeşit açık temada, siyah çeşit koyu temada kayboluyor. İlk sürümde kullanılan `docs/brand/vitrin-ai-mark.svg` kaldırıldı (kullanıcı GitHub'da görünmediğini bildirdi). **Not:** PNG'lerdeki altın `#c9a15c`, arayüzün `--color-gold` değeri (`#d1a25b`) ile tam aynı değil; bu dosyalar arayüz bileşeninden (`frontend/src/components/brand-mark.tsx`) türetilmedi, ayrı tasarım çıktılarıdır — arayüz rengi değişirse bu dosyalar kendiliğinden güncellenmez.
- Ayrıntılı gerekçeler ve klasör yapısı için `frontend/README.md`.

## Açılış vitrini ve ana sayfa düzeni (kilitli karar — 28–30.09.2026, Serhan)

Ana sayfanın ilk ekranı bir **vitrin**: alttan yükselen el + takı sahneleri (tek taş yüzük, kutulu yüzük, damla kolye, alyans çifti), aralarında sürükleyerek/oklarla/klavyeyle geçilir; **dikey tekerlek asla yakalanmaz** (10.09'da yatay galeri bu yüzden kaldırılmıştı). "Yakından inceleyin" ya da fotoğrafa tıklamak: el yüzüğü bırakıp aşağı iner ve solar, takı havada bir tam tur dönerek 3D olarak odağa gelir; kapanış bunun tersi. Yakınlaşmada ürün adı takının altında büyük harfle, sağ panelde yalnız zemin seçimi (kütüphaneden), kesim/özgün karşılaştırması ve "Kendi fotoğrafınızı deneyin".

**Kurallar:**
1. **Varlıklar betikle üretilir, elle değil.** Takı modelleri Blender başsız betikleriyle (`frontend/scripts/hero-3d/*.py`, meshopt `.glb`, macOS: `/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P …`). El fotoğrafları Serhan'ın **Gemini (Pro aboneliği) ile ürettiği** görsellerdir (`~/vitrin-ai-hero-kaynak/el/`, **depo dışında**; görünür Gemini filigranı zemin gibi BiRefNet ile kesildiği için gider, görünmez SynthID kalır). Hazırlık: `prepare-hero-scenes.py` (BiRefNet ürün bölgesine uygulanır, el katmanları, zemin tonu), `prepare-hero-backdrops.py` (kütüphaneden zemin kopyaları — R2'den yalnız okur), `prepare-showcase-composites.py` (katalog/bülten kareleri). Sonra `npm run hero:versions`. **El katmanı** yapay zekayla üretilmiş takısız elden `scripts/build-hero-hands.py` ile kurulur (kaynak `photo-source/hero-el/`, ayrıntı `frontend/README.md` → "Açılış vitrini"); `prepare-hero-scenes.py` çalıştırılırsa bu betik de yeniden çalıştırılır.
2. **Adresler içerik özetiyle sürümlüdür** (`heroAsset()`, `?v=<özet>`); sürüm dosyası eskiyse test kırmızı yanar. Next 16 sorgu dizeli yerel görseli ancak `images.localPatterns`'ta izin varsa kabul eder (yalnız `/hero/**`).
3. **Yakınlaşma kodu (three.js, ~307 KB) açılışta inmez**: `next/dynamic` + boş anda önceden indirme (veri tasarrufu/2G-3G'de atlanır); modeller ve HDRI yalnız yakınlaşmada iner. Telefonda `dpr ≤ 1.5` ve pırlantada 3 iç yansıma (masaüstü 5). "Hareketi azalt" ve WebGL yokluğunda animasyon yerine yumuşak geçiş/statik kesim.
4. **Model elde tutulan ürünü kesince eli korur ve halkanın İÇİNİ DOLDURUR** (bilinen sınırlama, aşağıda genişletildi). Bu yüzden model fotoğrafın **ürün bölgesine** uygulanır (`PRODUCT_REGIONS`), maske elle düzeltilmez. Yakın plan karşılaştırmasında **halka yüzükte parmakların örttüğü yerler elips oturtularak onarılır** (`RING_BAND_REPAIR`); bu ELLE yapılmış bir düzeltmedir, panelin metni bu yüzden kesimin "ham model çıktısı" olduğunu söylemez.
5. **Ürün adı için Archivo (geniş kesim) yazı tipi** yalnız yakınlaşmada, Serhan'ın isteğiyle eklendi (OFL; Inter kilitli kararı bozulmadı, `preload:false`).
6. **Uygulamanın adı artık "Vitrin"** (30.09.2026); "Vitrin AI" adı ileride gelecek bir özelliğe ayrıldı ("Sahneyi Vitrin AI kursun" düğmesi bilerek kaldı). **Yasal metinlerde (KVKK/gizlilik/kullanım koşulları) ad da "Vitrin" yapıldı** (30.09.2026, Kaan'ın onayıyla; hukukçu kontrolü ayrıca sürüyor): yasal sürüm `2026-09-27` → `2026-09-30`, "Yürürlük" tarihi 30 Eylül 2026. **Yalnız yeni kayıtlar** yeni sürümü kabul eder (`terms_version` kayıtta yazılır, backend değeri doğrulamaz; mevcut kullanıcılardan yeniden onay İSTENMİYOR, bilinçli). **Tuzak:** "Yürürlük" tarihi üç sayfada ELLE yazılı; `lib/legal-texts.test.ts` sürüm-tarih uyumunu ve eski adın kalmadığını doğrular.
7. **Ana sayfa sırası** (koyu/açık dönüşümlü): vitrin → dene → **stüdyo turu** (canlı önizleme, kütüphane zeminleri) → **zeminler** (kategori sekmeleri, `home-gallery.json`, sayı katalogdan) → üç adım → ayrıntılar → **SSS** → teknik → **kapanış çağrısı**. "Tasarım yaklaşımımız" bölümü Apple'ı adıyla andığı için kaldırıldı.

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
(yalnızca indirme seçenekleri, görselin altında, iki satır: üstte bütün
çıktı düğmeleri KAYDIRMASIZ, altta solda ‹ Düzenle, sağda "CMYK ne demek?").
**Koyu perde YALNIZCA stüdyo açılışında** (`stage-curtain.tsx`; solda logo,
"0N / 03" ve aşama adı; "hareketi azalt"ta yok). Aşamalar arası perde
19.09.2026'da kaldırıldı (Serhan: "her adımda yorucu"). **Aşama geçişi
20.09.2026'da seçildi** (`stage-transition.ts`): tarayıcının sahne geçişi
(View Transitions) + panellerin yandan kayması BİRLİKTE, 1,1 sn — tuval eski
yerinden yeni yerine/boyutuna tarayıcı tarafından taşınırken eski panel gidilen
yönün tersine çıkar, yeni panel o yönden girer. Panel kayması DOM'da değil,
`::view-transition-old/new(studio-panel|studio-rail)` üzerindedir; geçiş boyunca
ekranda tarayıcının anlık görüntüleri vardır. **İki tuzak:** (1) bir geçiş adına
aynı anda yalnız BİR öge sahip olabilir — Aşama 2'de zemin barı ve sağ panel
ekranda olduğu için adları ayrı, aynı ad "snapshot capture failed" ile geçişi
iptal ettiriyor; (2) tuvalin yeni ölçüsü, görüntü ALINMADAN önce yazılmalı —
`useStageSize` ölçümü `ResizeObserver`'a bırakılmayıp geçiş geri çağrısında
senkron yapılıyor. Firefox'ta geçiş yok, aşama anında değişir. Denenip elenenler:
yönlü DOM kayması, karartma, bulanıklık, büyüme, yükselme, perde, dönme, yaklaşma.
Tamamla barının genişliği içerikten (`w-fit`): üst satırdaki
çıktı düğmeleri belirler, alt satır onlara hizalı. Üst
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
Aynı tur kesim işçisinin sağlığını da gözler, ama "işçi yok" alarmı bu işe
BAĞLI DEĞİL: API sürecinin kendi periyodik gözlemcisi var (02.10.2026).
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

### 8. Veritabanı yedeği henüz OTOMATİK değil — sahibi: Serhan

Supabase projesi **ücretsiz pakette** ve bu pakette Supabase otomatik yedek
almıyor; tek yedek `backend/scripts/backup_database.py`'nin ürettiği şifreli
döküm (27.09.2026'da production'dan alındı, geri yükleme testi birebir
geçti — `backend/README.md` → "Veritabanı yedeği"). Açık olanlar:

1. **Faz 7.5'e kadar:** yedek elle alınır (önemli bir değişiklikten ya da
   migration'dan önce `backup` çalıştırılır). Şifreleme anahtarı
   (`BACKUP_ENCRYPTION_KEY`) parola yöneticisine kopyalandı (Serhan, 29.09.2026).
2. **Faz 7.5:** günlük otomatik çalıştırma, ayrı özel R2 bucket'ı, saklama
   süresi, ayda bir `restore-test` (ROADMAP Faz 7.5). Ya da Supabase Pro.

### 10. Faz 7.5 güvenlik kapanış listesi — sahibi: Serhan (27.09.2026, PR #30 sonu)

Faz 7'de kod güvenlik incelemesi (`/cso`) ve OWASP ZAP (oturumsuz + oturumlu,
yerel) yapıldı; açık bulunmadı, bulunan her şey düzeltildi (`ROADMAP.md` Faz 7
"Güvenlik incelemesi"). Aşağıdakiler bilinçli olarak canlıya çıkışa bırakıldı ve
**Faz 7.5'e başlarken bu liste hatırlatılmalı** (ROADMAP Faz 7.5'te aynısı):

  1. **HSTS ve başlıkların canlıda doğrulanması.** Ön yüz CSP, tıklama tuzağı
     koruması, `nosniff`, `Permissions-Policy`, `Referrer-Policy`, COOP/CORP,
     `poweredByHeader` ve backend `nosniff`/CORP **Faz 7'ye çekildi
     (01.10.2026, Serhan'ın onayı)** — sahipleri aşağıdaki açık takip 11 ve 12.
     Burada kalan: canlıda HSTS, başlıkların canlı adreste ZAP pasif taramasıyla
     doğrulanması ve başlıklar oturunca CI'a ZAP pasif taraması
     (`zaproxy/action-baseline`).
  2. **Canlıda tarama** (yerel kit: `backend/scripts/zap/README.md`): test/staging ortamı kurulunca ZAP pasif taraması
     canlı adreste; AKTİF tarama yalnız staging'de (canlıda sahte kayıt ve
     ödeme denemesi üretir). 27.09.2026 taramalarının kapsamadıkları:
     R2'ye ve Supabase yönetici API'sine dayanan uçların içi (tarama
     sırasında bilerek koparılmıştı) ve ön yüzün oturumlu taraması.
  3. **Canlı Redis:** özel ağda, parolalı, RDB/AOF kapalı ve `CONFIG GET`
     izinli (ölçüm listesi madde 10).
  4. **Canlı altyapı denetimi:** HTTPS/HSTS, ters vekil, `TRUSTED_PROXY_IPS`
     (açık takip 3), R2 CORS ve bucket politikası (açık takip 2), Supabase
     Auth panel ayarları — "Require current password when changing
     password", "Secure password change", "Secure email change" (27.09.2026'da
     açıldı; değişirse `SECURITY.md` 3.1 güncellenir).
  5. **Profesyonel penetrasyon testi:** ücretsiz karşılığı yok; canlıya
     çıkmadan önce bütçe olursa staging'de.
  6. **CI'a eklenebilecekler (27.09.2026 değerlendirmesi):** kod kapsama
     raporu (`pytest-cov`, önce yalnız bilgi amaçlı), ZAP pasif taraması
     (madde 1'den sonra), uçtan uca tarayıcı testleri (Playwright, Kaan'ın
     Faz 7 işi). Backend kod kuralı kontrolü (`ruff`, yalnız pyflakes)
     27.09.2026'da eklendi.

### 11. Faz 7 kapanış denetiminden kalan işler — sahibi: Serhan (01.10.2026)

Kod, PR'lar ve ROADMAP taranınca çıkan, **Faz 7 kapanmadan bitmesi gereken**
işler; dağılım Serhan'ın onayıyla (`ROADMAP.md` Faz 7 → "kapanış denetimi").
Biri bitince buradan SİLİNİR.

**Serhan'ın Faz 7 kapanış işleri bitti (02.10.2026).** Faz 7 yalnız Kaan'ın
(açık takip 12) kalan işleriyle kapanır.

### 12. Faz 7 kapanış denetiminden kalan işler — sahibi: Kaan (01.10.2026)

Aynı denetimden Kaan'a düşenler; biri bitince buradan SİLİNİR.

> **Kaan'ın Claude Code oturumu için (Serhan'ın talimatı, 02.10.2026):** aşağıdaki
> işler ön yüz kodudur ve Kaan'ındır, ama şu noktalarda **Serhan'a SORULMADAN
> ilerlenmez** — ilgili adıma gelince durup Kaan'a "bunu Serhan'a sor" de
> (varsayım yapma, kendin karar verme):
>
> - **K2 (ön yüz başlıkları):** (a) CSP kaynak listesine **backend/altyapıya ait**
>   bir alan adı girecekse (R2 bucket adresi, Supabase proje adresi, hata izleme
>   sağlayıcısı/Sentry adresi, canlı alan adı): bunlar Serhan'ın altyapı
>   alanıdır; değeri kodda/`.env`'de bulabiliyorsan kullan, bulamıyor ya da
>   tanıyamıyorsan Serhan'a sor. (b) Report-Only ihlal listesinde tanımadığın
>   bir kaynak çıkarsa. (c) **Zorlayıcı kipe geçmeden önce** (yanlış bir CSP
>   canlıda zeminleri/stüdyoyu sessizce bozar). HSTS ve canlı başlık doğrulaması
>   Faz 7.5'te Serhan'ındır; yapma.
> - **K3 (E2E testleri):** (a) **vitrin 3D yakınlaşma**: WebGL yokken ve "hareketi
>   azalt"ta ekranda tam olarak ne görünmesi gerektiği Serhan'ın tasarımıdır
>   (özellik onun: `CLAUDE.md` "Açılış vitrini"). Önce kodu ve ilgili belgeyi
>   oku; davranış belirsiz ya da kodla belge çelişiyorsa Serhan'a sor, testi
>   tahminle yazma. (b) Ödeme, kuyruk ve admin testlerindeki **taklit yanıtlar
>   backend'in GERÇEK gövde biçimini taşımalı** (ders 22): biçimden emin
>   değilsen `backend/app/api/routes/*.py` ve `backend/tests/`'e bak, hâlâ
>   belirsizse Serhan'a sor. (c) **Gerçek Supabase + gerçek backend'e karşı**
>   uçtan uca test staging ister (Faz 7.5, Serhan'ın); başlama.
> - **K1 (zemin takılması):** ön yüz içinde kalır. Sunucu tarafında (R2, yükleme
>   betiği, `backgrounds` tablosu) orta boy zemin üretme fikri çıkarsa Serhan'a
>   sor (ders 24, 25 ve migration kuralı).
> - **Genel:** işin içinde `backend/`, bir migration, R2 yapılandırması, hız
>   sınırı ya da kimlik doğrulama dosyasında değişiklik gerekirse (ya da 429/503
>   gibi backend yanıt davranışlarını değiştirmek isteyen bir şey çıkarsa) önce
>   Serhan'a sor.

1. **Stüdyoda zemin değişiminde kalan takılma.** Zemin görselleri tam
   çözünürlükle (3508×2480) her karede iki kez çiziliyor (zemin seçimi 60–70
   ms'lik kare, ilk seçim ~390 ms; ölçüm `ROADMAP.md` Faz 7 "Stüdyoda zemin
   değiştirirken takılma"). Önerilen: ekranda tuval boyutuna (× dpr)
   küçültülmüş kopya, dışa aktarmada tam çözünürlük. **Çıktı kalitesine
   dokunabildiği için ölçülerek yapılır:** dışa aktarılan dosya önce/sonra
   piksel olarak karşılaştırılır; kare süresi aynı koşulda (dpr 1 ve 2, üretim
   derlemesi — ders 30, 40) yeniden ölçülür.
2. **Ön yüz güvenlik başlıkları** (`next.config.ts` `headers()`): CSP,
   `frame-ancestors`/`X-Frame-Options`, `nosniff`, `Permissions-Policy`,
   `Referrer-Policy`, COOP/CORP, `poweredByHeader: false`. CSP sayfanın
   yüklediği her kaynağı bilmeyi ister (Supabase, R2 imzalı görseller, Sentry
   DSN'i verilmişse, Konva ve HEIC WASM, three.js ve HDRI, `blob:`/`data:`);
   önce yalnız raporlayan kipte (`Content-Security-Policy-Report-Only`) açılıp
   ÜRETİM derlemesinde (`next start`, ders 39) konsol ihlalleri taranması
   önerilir (**Claude'ın önerisi, yöntemi Kaan seçer**; sıra: Report-Only →
   ihlallerden kaynak listesi → zorlayıcı kip → başlık testi + E2E yeşil). Başlıkların geldiğini doğrulayan bir test eklenir. Backend
   başlıkları Serhan'ın (açık takip 11).
3. **E2E'de testsiz akışlar** (`frontend/e2e/`): ödeme (`/paketler` →
   `/odeme/{id}` yoklaması; ders 21), oturumlu admin paneli, kuyrukta bekleme
   mesajı (~30 sn'den sonra nötr cümle; sahte zamanlayıcı), katalog editörü,
   hesap silme, vitrin 3D yakınlaşma (WebGL yok ve "hareketi azalt" dalları).
   Gerçek Supabase + gerçek backend ile uçtan uca test staging gerektirir →
   Faz 7.5.

### 7. Canlı sunucuda yapılacak ölçümler — sahibi: Serhan (Faz 7.5)

Faz 7'deki yük testi, bellek ve süre ölçümleri yerelde, tek makinede yapıldı
(ayrıntı `backend/README.md` → "Yük testi"). Canlı sunucu belli olunca
şunlar ölçülmeden production'a hazır denmez (`ROADMAP.md` Faz 7.5'te aynı
liste):

  1. **Bellek (RAM):** backend'in tepe bellek kullanımı Linux'ta, çalışan
     serviste yeniden ölçülür (referans 12 GB; macOS'ta yerel ölçüm 4,5–5 GB
     çıktı ama bellek sıkıştırması yüzünden karşılaştırılamaz). Sunucu boyutu
     bu ölçüme göre seçilir.
  2. **Kesim süresi:** production CPU'sunda fotoğraf başına süre (yerelde
     Apple M4'te ~13 sn). Süre kapasiteyi doğrudan belirler: tek süreçte
     dakikada 60 / süre kesim.
  3. **Yük testi:** `backend/scripts/load_test.py` production'a benzer bir
     sunucuda, yük üreticisi AYRI bir makineden koşulur (yerelde ikisi aynı
     CPU'yu paylaşıyordu). R2'ye yazmaz; ayrı bir test veritabanı gerekir.
  4. **Veritabanı bağlantı havuzu:** varsayılan (5 + 10 taşma) yerel yük
     testinde darboğazın bir parçası çıktı (havuz 40'ta iki uç 1,7–2,3 kat
     hızlandı). Doğru boyut Supabase pooler'ının bağlantı sınırıyla birlikte
     canlıda ölçülerek seçilir; sınırı aşan havuz bağlantı hatası üretir.
  5. **CMYK dönüşümü:** 40 MP'lik görselin production'da süresi ve belleği
     (Faz 6'dan taşınan madde, açık takip maddesi 1).
  6. **Hata izleme:** seçilen sağlayıcıya gerçek bir hata gönderilip
     maskelemenin orada da doğru göründüğü kontrol edilir.
  7. **Kesim kuyruğu kapasitesi:** aynı makinede 2 işçi ya da
     `MAX_CONCURRENT_INFERENCES=2` throughput'u artırıyor mu (yerelde 16 GB'lık
     makine bunu kaldırmadı, ders 31); sunucunun belleğine göre işçi sayısı
     seçilir. İşçi bir servis olarak (systemd) kurulur ve çöktüğünde yeniden
     başlatıldığı doğrulanır; işçi yoksa kesimler sırada bekler.
  8. **Boşta kalıştan sonraki ilk kesim:** işçi bir süre boşta kaldıktan sonra
     ilk kesimin süresi ölçülür. 27.09.2026'da bellek sıkışık Mac'te model
     diske atılmış, ilk kesim 30 sn sürmüştü (sonrakiler 9 sn). Sunucuda model
     bellekte kalmalı (yeterli RAM, takas tercihen kapalı).
  9. **GPU seçilirse:** `backend/scripts/profile_cutout.py` GPU sunucusunda
     koşulup kesim süresi tahmini (~0,3–1,5 sn) gerçek ölçüme çevrilir; FP32
     GPU çıktısı `compare_cutouts.py` ile CPU çıktısına karşı gerçek
     fotoğraflarda karşılaştırılır (kalite bozan hiçbir ayar yok — FP16/INT8
     kapsam dışı). Fiyatlar: `docs/research/sunucu-fiyatlari-2026-09-27.md`.
  10. **Redis diske yazmıyor mu:** kesim kuyruğu özgün fotoğrafı Redis'te
     tutuyor ve KVKK metni "diske yazılmaz" diyor. Canlı Redis'te RDB ve AOF
     kapalı olmalı (`--save "" --appendonly no`). API bunu her kuyruğa
     koymadan önce `CONFIG GET` ile doğruluyor ve açıksa fotoğrafı ALMIYOR
     (kredi iade + 503). **`CONFIG` yasaksa da fotoğrafı almıyor**
     (doğrulanamayan söz verilmiş sayılmaz — Codex incelemesi, 2. tur).
     Yani `CONFIG GET`'e izin vermeyen yönetilen bir Redis (bazı
     sağlayıcılar) kesim kuyruğuyla ÇALIŞMAZ; sağlayıcı seçilirken bu
     dikkate alınır, gerekirse bilinçli bir kararla koda dönülür.

  11. **Açılış vitrini (Faz 7.5):** gerçek bir orta sınıf telefonda 3D
     yakınlaşmanın akıcılığı ölçülür (M4'te 60 fps, telefon GPU'su hiç
     ölçülmedi); alan adı belli olunca `NEXT_PUBLIC_SITE_URL` verilir
     (paylaşım önizlemesi ve site haritası bu adresi kullanır); canlıda Safari
     ile üretim adresinde kontrol yapılır (ders 39).
  12. **Hız sınırı değerleri gerçek trafikle gözden geçirilir (02.10.2026):**
     değerler (okuma 600/dk, taslak kaydı 300/dk, çalışma silme 30/dk, hesap
     silme 5/saat; ayrıntı `backend/README.md` → "Hız sınırı kapsam
     envanteri") ölçülmüş üretim verisi değil, istemcinin istek sıklığının
     (kesim yoklaması 1,5 sn, checkout 5 sn, otomatik kayıt 1,5 sn gecikmeli)
     üstüne konmuş emniyet payları. Canlıda gerçek kullanıcı trafiğiyle
     bakılır: 429 sayıları (Sentry/günlük), meşru kullanıcının sınıra çarpıp
     çarpmadığı, çarpıyorsa hangi uçta; gerekirse gevşetilir, gereksiz bol
     kalan değerler sıkılaştırılır. Taslak kaydının fail-open kararı
     (`limit_project_write`) da bu turda gözden geçirilir. Aynı bakışta
     Next vekili arkasında kovaların doğru kullanıcıya bağlandığı
     (`TRUSTED_PROXY_IPS`, açık takip 3) doğrulanır.

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
   de facto Faz 7.5'in (canlıya çıkış) "launch öncesi son kapı" listesine düşüyor.
