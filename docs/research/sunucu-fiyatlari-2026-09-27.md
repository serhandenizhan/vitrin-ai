# Sunucu seçenekleri ve fiyatları — GPU'lu ve GPU'suz (27.09.2026)

**Amaç:** Faz 7.5'teki sunucu kararına örnek bir fiyat tablosu (Serhan'ın
isteği). Karar bu belgeyle VERİLMEZ: fiyatlar sık değişiyor (Hetzner
15.06.2026'da CPX/CCX fiyatlarını iki katından fazla artırdı); karar anında
sağlayıcının kendi sayfasından yeniden doğrulanır (kök `CLAUDE.md` ders 19).
Fiyatlar KDV hariç; kur çevrimi bilinçli olarak yapılmadı.

## Neye ihtiyacımız var (ölçülenler)

- **Kesim sürenin %93–99'u model hesabı** (`backend/scripts/profile_cutout.py`,
  27.09.2026, Apple M4): 1 MP'de 11,0 sn'nin 10,9'u, 12 MP'de 10,0 sn'nin 9,3'ü.
  Model dışı adımlar (açma, küçültme, maske büyütme, PNG) en fazla ~0,6 sn.
- **Kaliteye dokunan optimizasyon yok** (Serhan): FP16/INT8 niceleme, düşük
  giriş çözünürlüğü, lite model kapsam dışı. GPU'da da **FP32** çalışılır.
- **CPU'da bellek:** model başına tepe ~12–14 GB (Linux ölçümü); bellek
  sıkışırsa boştaki model diske atılıp ilk kesim ~30 sn'ye çıkıyor (ölçüldü).
  → CPU sunucusu **en az 32 GB** olmalı (API + işçi + Postgres bağlantıları +
  işletim sistemi payı).
- **GPU'da:** BiRefNet yazarlarının ölçümü (1024×1024, **FP32**): A100 87 ms,
  RTX 4090 96 ms, V100 384 ms; FP32 GPU belleği ~4,8 GB
  ([BiRefNet README](https://github.com/ZhengPeng7/BiRefNet)). Bu PyTorch
  ölçümü; bizim ONNX yolumuz için temkinli ×1,5–2 → model **~0,2–0,8 sn**,
  model dışı adımlarla **kesim başına ~0,3–1,5 sn** (bugün ~10–12 sn).
  **GPU'ya geçmeden önce** FP32 GPU çıktısı `compare_cutouts.py` ile CPU
  çıktısına karşı gerçek fotoğraflarda karşılaştırılır (kalite kuralı).

## Seçenekler

### A) Yalnız CPU (bugünkü mimari aynen)

| Sağlayıcı / plan | Donanım | Aylık | Not |
| --- | --- | --- | --- |
| Hetzner CX53 | 16 **paylaşımlı** vCPU, 32 GB | €29,49 | Ucuz ama paylaşımlı çekirdek: kesim süresi komşu yüküne göre dalgalanır |
| Hetzner CCX33 | 8 **ayrılmış** vCPU, 32 GB | €138,49 | Süre tutarlı; 8 çekirdekte kesim M4'ten yavaş olabilir — ölçülmeli |
| Hetzner CCX43 | 16 ayrılmış vCPU, 64 GB | €275,99 | 2 işçiye bellek yeter (2 × ~14 GB) |

Kaynak: [costgoat.com/pricing/hetzner](https://costgoat.com/pricing/hetzner)
(sayfa 05.09.2026'da güncellenmiş; Hetzner'in fiyat artışı notu:
[docs.hetzner.com](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)).

**Kesim:** ~10–15 sn (sunucu CPU'suna göre ölçülecek). **Kapasite:** işçi
başına dakikada ~4–6 kesim; ikinci işçi = ikinci ~14 GB.

### B) Aylık GPU'lu ayrılmış sunucu (her şey tek makinede)

| Sağlayıcı / plan | Donanım | Aylık | Not |
| --- | --- | --- | --- |
| Hetzner GEX45 | RTX PRO 4000 Blackwell 24 GB, i5-13500, 64 GB RAM | **€214 + €209 kurulum** | Almanya/Finlandiya (AB veri konumu). Fiyat haber kaynağından ([dohohub](https://dohohub.com/news/hetzner-gex45-entry-level-gpu-server)); Hetzner sayfası rakamı göstermedi — **doğrulanmalı** |
| (referans) Hetzner GEX44 | RTX 4000 SFF Ada 20 GB | €184 + €79 kurulum | Mart 2024 basın bülteni ([hetzner.com](https://www.hetzner.com/pressroom/new-gpu-server/)); yeni model GEX45 |

**Kesim:** ~0,3–1,5 sn (tahmin). **Kapasite:** tek GPU'da dakikada onlarca
kesim. API, işçi ve Redis aynı makinede; aylık sabit fiyat.

### C) Saatlik GPU bulut (sürekli açık)

| Sağlayıcı | GPU | Saatlik | Sürekli açık ≈ aylık (730 sa) |
| --- | --- | --- | --- |
| RunPod Secure Cloud | L4 24 GB | $0,49 | ~$358 |
| RunPod Secure Cloud | RTX 4090 24 GB | $0,74 | ~$540 |
| DigitalOcean | RTX 4000 Ada | $0,76 | ~$555 |
| AWS g6.xlarge (Frankfurt) | L4 24 GB, 16 GiB RAM | $1,0064 | ~$735 |

Kaynaklar: [runpod.io/pricing](https://www.runpod.io/pricing),
[digitalocean.com GPU Droplets](https://www.digitalocean.com/pricing/gpu-droplets),
AWS g6.xlarge eu-central-1 ([DoiT](https://www.doit.com/compute/spot/eu-central-1/g6.xlarge)).
RunPod "Community Cloud" daha ucuz ($0,34–0,44/sa) ama donanım üçüncü
kişilere ait — müşteri fotoğrafı için uygun değil.

### D) Sunucusuz GPU (saniye başı ödeme, boşta ücret yok)

| Sağlayıcı | GPU | Saniye başı | 1.000 kesim (≈2 sn GPU/kesim) |
| --- | --- | --- | --- |
| Modal | L4 | $0,000222 | ~$0,44 |
| Modal | A10 | $0,000306 | ~$0,61 |
| RunPod Serverless | 24 GB sınıfı | $0,69/sa ≈ $0,000192 | ~$0,38 |

Kaynaklar: [modal.com/pricing](https://modal.com/pricing) (aylık $30 ücretsiz
kredi), [runpod.io/pricing](https://www.runpod.io/pricing). **Kesin maliyet
kesim başına kuruşlar**, ama iki bedel var: (1) **soğuk başlangıç** — uzun
boşluktan sonraki ilk istek konteynerin açılıp ~1 GB modeli yüklemesini
bekler (saniyeler–onlarca saniye); sürekli sıcak tutmak C seçeneğinin
fiyatına döner. (2) API, Redis ve Postgres bağlantısı için yine küçük bir CPU
sunucusu gerekir (ör. Hetzner CX serisi, €5–30/ay). Mimari uyumlu: Faz 7'nin
kuyruğunda işçi API'den ayrı; işçiyi sunucusuz GPU'da çalıştırmak API'ye
dokunmadan yapılabilir.

## Aylık hacme göre kaba karşılaştırma

| Aylık kesim | A: CPU (CCX33) | B: GPU aylık (GEX45) | D: Sunucusuz + küçük API sunucusu |
| --- | --- | --- | --- |
| 1.000 | €138 · kesim ~10–15 sn | €214 · <1,5 sn | ~€10–35 · <1,5 sn (+ soğuk başlangıç) |
| 10.000 | €138 · yoğun saatte sıra uzar | €214 · <1,5 sn | ~€15–40 |
| 50.000 | €276+ (2 işçi) · sıra uzun | €214 · <1,5 sn | ~€30–60 |

(D satırındaki GPU payı 2 sn/kesim varsayımıyla; soğuk başlangıç ve API
sunucusu dahil kaba aralık.)

## KVKK notu

Kesim için müşterinin **özgün fotoğrafı** GPU'ya gider. Hetzner (AB) veri
konumu açısından en sade seçenek; Modal/RunPod/AWS'de bölge seçimi ve yurt
dışı aktarım (KVKK md. 9) ayrıca değerlendirilir ve aydınlatma metnine
alıcı olarak yazılır — hata izleme sağlayıcısında yaptığımız gibi.

## İlk izlenim (karar değil)

- Düşük hacimle başlarken en düşük maliyet **D** (sunucusuz GPU) — ama soğuk
  başlangıç "müşteriye hissettirme" kararına ters düşebilir; ölçülmeli.
- Sabit fiyat, AB veri konumu ve her kesimin <1,5 sn sürmesi için **B**
  (Hetzner GEX45) güçlü aday: CPU'lu CCX33'ten ayda ~€75 fazla, ~10 kat hızlı.
- **A** yalnız trafik çok düşük ve 10–15 sn kabul edilebilirse mantıklı.
