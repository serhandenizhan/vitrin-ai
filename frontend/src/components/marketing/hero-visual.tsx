/**
 * Acilis gorseli: aracin GERCEK ciktisiyla surukenebilir once/sonra.
 *
 * 13.09.2026'ya kadar burada iki sabit fotograf vardi ("Atolyede / Vitrinde").
 * O ikisi aracin ciktisi degil, ayri cekimlerdi — bu yuzden etiketleri bilincli
 * olarak "Once / Sonra" degildi. Kullanici onerisiyle (9. madde, oneri 5, one
 * alinan is) yerine aracin kendi kesimiyle etkilesimli bir karsilastirma geldi:
 * artik "sonra" gercekten aracin sonucu, abartma yok.
 *
 * Etkilesim istemcide (`hero-before-after.tsx`); bu dosya sunucu bileseni
 * olarak kaliyor ve yalnizca cerceveyi ciziyor.
 */

import { HeroBeforeAfter } from "@/components/marketing/hero-before-after";

export function HeroVisual() {
  return (
    /* Genislik ekran YUKSEKLIGINDEN turetiliyor: gorsel kare; `(100svh - 13rem)`
       yukseklige sigan genislik bu. Boylece acilis bolumu hangi dizustu
       olcusunde olursa olsun gorsel butun olarak ilk ekranda kaliyor (bkz.
       hero.tsx). */
    <div className="relative mx-auto w-full max-w-md lg:max-w-[min(100%,calc(100svh-13rem))]">
      {/* Altin isik havuzu — kareyi siyah zeminden ayiran yumusak hale. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-10 -z-10 opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(58% 52% at 50% 50%, rgba(212,175,110,0.26), transparent 72%)",
        }}
      />

      <HeroBeforeAfter />

      <p className="on-dark-muted fine-print mt-3 text-center text-balance">
        Çizgiyi sürükleyin. Soldaki kesim, aynı fotoğraftan aracın kendisiyle
        üretildi.
      </p>
    </div>
  );
}
