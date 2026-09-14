/**
 * Acilis gorseli: ayni urun, atolyede ve vitrinde.
 *
 * Gorseller GERCEK urun fotograflari (kullanici sagladi, telifi bize ait) —
 * onceki surumdeki uretilmis yuzuk yer tutucusunun yerini aldilar.
 *
 * Etiketler bilincli olarak "Once / Sonra" DEGIL, "Atolyede / Vitrinde":
 *  - Sagdaki kare bizim aracimizin ciktisi degil, ayri bir cekim. "Sonra"
 *    demek, kullaniciya bu sonucu bu araciin urettigini soylemek olurdu.
 *  - Ikisi birlikte urunun VAADINI anlatiyor (dagınık bir cekimden satisa
 *    hazir bir goruntuye), ki bu Faz 2 + Faz 3'un birlikte yaptigi is.
 *  - Aracin gercek ciktisini kullanici birkac ekran asagida KENDI
 *    fotografiyla goruyor; abartmaya gerek yok.
 *
 * `next/image` ile: kaynaklar 900 px WebP (bkz. scripts/prepare-photos.mjs),
 * `sizes` ile tarayici yalnizca ihtiyaci olan olcuyu indiriyor. Acilista
 * gorundukleri icin `priority` — LCP bu gorsel.
 */

import Image from "next/image";

const PANELS = [
  {
    src: "/photos/atolye.webp",
    alt: "Kuyumcu tezgâhında, takım ve talaş arasında duran pırlanta kolye",
    etiket: "Atölyede",
    vurgulu: false,
  },
  {
    src: "/photos/vitrin.webp",
    alt: "Aynı kolye, ceviz ve çelik bir vitrin standında sergilenirken",
    etiket: "Vitrinde",
    vurgulu: true,
  },
];

export function HeroVisual() {
  return (
    /* Genislik ekran YUKSEKLIGINDEN turetiliyor: iki kare yan yana ve her
       biri ~0.92 oraninda; `(100svh - 13rem)` yukseklige sigan genislik bu.
       Boylece acilis bolumu hangi dizustu olcusunde olursa olsun gorsel
       butun olarak ilk ekranda kaliyor (bkz. hero.tsx). */
    <div className="relative mx-auto w-full max-w-2xl lg:max-w-[min(100%,calc((100svh-13rem)*1.83))]">
      {/* Altin isik havuzu — kareleri siyah zeminden ayiran yumusak hale. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-10 -z-10 opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(58% 52% at 50% 50%, rgba(212,175,110,0.26), transparent 72%)",
        }}
      />

      <figure className="overflow-hidden rounded-2xl border border-white/12 shadow-2xl">
        <div className="grid grid-cols-2">
          {PANELS.map(({ src, alt, etiket, vurgulu }, index) => (
            <div
              key={src}
              className={index === 1 ? "relative border-l border-white/20" : "relative"}
            >
              <Image
                src={src}
                alt={alt}
                width={900}
                height={982}
                priority
                sizes="(max-width: 1024px) 50vw, 320px"
                className="h-full w-full object-cover"
              />
              <span
                className={
                  vurgulu
                    ? "bg-gold absolute top-3 right-3 rounded-full px-2.5 py-1 text-[0.625rem] font-medium tracking-[0.08em] text-black uppercase"
                    : "pointer-events-none absolute top-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[0.625rem] font-medium tracking-[0.08em] text-white uppercase backdrop-blur-sm"
                }
              >
                {etiket}
              </span>
            </div>
          ))}
        </div>
      </figure>

      <figcaption className="on-dark-muted fine-print mt-3 text-center text-balance">
        Örnek fotoğraflar. Aracın gerçek sonucunu hemen aşağıda kendi
        fotoğrafınızla görebilirsiniz.
      </figcaption>
    </div>
  );
}
