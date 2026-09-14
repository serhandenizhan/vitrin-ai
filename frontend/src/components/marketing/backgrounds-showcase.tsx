/**
 * Zemin galerisi — ayni urun, uc farkli zeminde.
 *
 * Gorsellerin hepsi ARACIN GERCEK CIKTISI: `scripts/prepare-showcase.mjs`
 * kendi urun fotografimizi calisan backend'e gonderip kesimi uretiyor ve
 * editordekiyle BIREBIR ayni gradyanlarin uzerine yerlestiriyor. Sayfada
 * gosterilen zemin ile kullanicinin editorde karsilasacagi zemin ayni; farkli
 * olsaydi sayfa, urunun vermedigi bir seyi gostermis olurdu.
 *
 * Neden bu bolum var: "arka plani kaldiriyoruz" cumlesi tek basina soyut.
 * Ayni urunun uc zeminde yan yana durmasi, aracin ne ise yaradigini tek
 * bakista anlatiyor — ve sayfaya urunun kendi malzemesinden gorsel katiyor.
 *
 * Sunucu bileseni: istemciye hic inmiyor.
 */

import Image from "next/image";

import { Reveal } from "@/components/reveal";

const ZEMINLER = [
  {
    src: "/showcase/vitrin-kadife.webp",
    ad: "Kadife siyah",
    not: "Beyaz ve parlak metaller için",
  },
  {
    src: "/showcase/vitrin-altin.webp",
    ad: "Altın hale",
    not: "Sarı altın ve pırlanta için",
  },
  {
    src: "/showcase/vitrin-sicak-gri.webp",
    ad: "Sıcak gri",
    not: "Katalog ve pazaryeri için",
  },
];

export function BackgroundsShowcase() {
  return (
    <section id="zeminler" className="surface-black section-rhythm">
      <div className="mx-auto w-full max-w-6xl px-5">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="fine-print on-dark-muted tracking-[0.08em] uppercase">
              Zeminler
            </p>
            <h2 className="display-section mt-3 text-balance">
              Tek fotoğraf, istediğiniz kadar vitrin
            </h2>
            <p className="lede on-dark-muted mx-auto mt-4 max-w-xl text-pretty">
              Aşağıdaki üç kare aynı fotoğraftan çıktı. Ürünü bir kez kesin,
              sonra hangi zemin işinize yarıyorsa onu seçin.
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-3 sm:gap-5">
          {ZEMINLER.map((zemin, sira) => (
            /* Kartlar sirayla beliriyor: hepsi ayni anda gelince goz nereye
               bakacagini bilemiyor, kisa bir kademe bakisi soldan saga
               yonlendiriyor. */
            <Reveal key={zemin.src} delay={sira * 90}>
              <figure className="group">
                <div className="overflow-hidden rounded-[1.25rem] ring-1 ring-white/12">
                  <Image
                    src={zemin.src}
                    alt={`Kolye, ${zemin.ad.toLowerCase()} zemin üzerinde`}
                    width={900}
                    height={900}
                    sizes="(max-width: 640px) 92vw, 30vw"
                    /* Uzerine gelince cok hafif buyuyor — Apple'in urun
                       kartlarindaki gibi, fark edilir ama dikkat dagitmaz. */
                    className="aspect-square w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                  />
                </div>
                <figcaption className="mt-3 flex items-baseline justify-between gap-3 px-1">
                  <span className="text-[0.9375rem] font-medium tracking-[-0.01em]">
                    {zemin.ad}
                  </span>
                  <span className="fine-print on-dark-muted text-right">
                    {zemin.not}
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>

        <Reveal delay={280}>
          <p className="fine-print on-dark-muted mt-8 text-center">
            Bu üç kare aracın gerçek çıktısı. Hepsi en üstteki kolye
            fotoğrafından üretildi.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
