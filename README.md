# vitrin-ai

Kuyumcular için AI destekli ürün fotoğrafı platformu. Kullanıcı bir ürün fotoğrafı
(yüzük, kolye vb.) yükler; AI çok yüksek kenar hassasiyetiyle arka planı kaldırır,
ardından kullanıcı kesimi özel arka plan tasarımlarından birinin üzerine yerleştirip
ölçeklendirebilir, döndürebilir ve yeniden konumlandırabilir. Önce web uygulaması
(MVP), uzun vadeli hedef mobil uygulama.

Bu, projenin ikinci iterasyonudur — kod tabanı sıfırdan yazılıyor, ancak önceki
iterasyonda alınan teknik kararlar (bkz. `CLAUDE.md` ve `ROADMAP.md`) geçerliliğini
koruyor.

## Durum

**Faz 0 — Kurulum** tamamlandı. Faz 1 (backend/AI motoru) ve Faz 2 (frontend MVP)
sırada.

## Ekip

- **Serhan** — Backend, AI/ML, veritabanı, ödemeler, altyapı
- **Kaan** — Frontend, canvas editörü, kullanıcı deneyimi

## Teknoloji yığını

- Backend: Python, FastAPI, Celery/RQ + Redis
- AI modeli: BiRefNet (`ZhengPeng7/BiRefNet`, MIT lisanslı ağırlıklar)
- Veritabanı: PostgreSQL (production'da Supabase)
- Nesne depolama: Cloudflare R2
- Frontend: Next.js, TypeScript, Tailwind, shadcn/ui, Konva.js
- Kimlik doğrulama: Supabase Auth
- Ödemeler: iyzico

Tam gerekçe ve karar geçmişi için `ROADMAP.md`, güvenlik standartları için
`SECURITY.md`, geliştirme rehberi için `CLAUDE.md` dosyalarına bakın.

## Depo yapısı

```
/backend    FastAPI uygulaması, AI inference servisi (Faz 1'de kurulacak)
/frontend   Next.js web uygulaması (Faz 2'de kurulacak)
/mobile     React Native uygulaması (Faz 8'de eklenecek)
```

## Yerel geliştirme

```bash
cp .env.example .env   # değerleri düzenleyin
docker compose up -d   # yerel PostgreSQL'i başlatır
```

Backend ve frontend kurulum talimatları ilgili fazlar tamamlandığında bu dosyaya
ve alt `README.md` dosyalarına eklenecek.
