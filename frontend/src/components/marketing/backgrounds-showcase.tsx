/**
 * Zemin galerisi — ayni yuzuk, kutuphanenin gercek zeminlerinde.
 *
 * 30.09.2026'da yenilendi. Onceki surum kutuphane kurulmadan once uretilmis
 * uc gradyan zemini ve eski ahsap standli kolye fotografini gosteriyordu;
 * artik stüdyodaki kutuphanenin KENDISINDEN, her kategoriden uc zemin
 * (kopyalari `scripts/prepare-hero-backdrops.py` uretir, secim
 * `lib/home-gallery.json`). Uzerindeki yuzuk acilis vitrinindeki yuzugun
 * aracla uretilmis kesimi.
 *
 * Zemin sayisi sabit bir metin degil, katalogdan sayilir: kutuphane
 * buyudukce bolum kendiliginden dogru kalir.
 *
 * Sunucu bileseni; yalniz kategori sekmeleri istemcide.
 */

import { BackgroundsGallery } from "@/components/marketing/backgrounds-gallery";
import { Reveal } from "@/components/reveal";
import { BACKGROUND_CATALOG } from "@/lib/background-catalog";
import { BACKGROUND_CATEGORIES } from "@/lib/background-categories";

export function BackgroundsShowcase() {
  const total = Object.keys(BACKGROUND_CATALOG).length;
  return (
    <section id="zeminler" className="surface-white section-rhythm light-veil relative overflow-hidden">
      <div className="relative mx-auto w-full max-w-6xl px-5">
        <Reveal>
          <div className="max-w-xl">
            <h2 className="display-section text-balance">Tek fotoğraf, {total} zemin</h2>
            <p className="lede on-light-muted mt-4 text-pretty">
              Ürünü bir kez kesin, stüdyodaki {BACKGROUND_CATEGORIES.length} kategoriden hangi
              zemin işinize yarıyorsa onu seçin. Aşağıdakiler kütüphanenin kendisinden.
            </p>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <BackgroundsGallery />
        </Reveal>
      </div>
    </section>
  );
}
