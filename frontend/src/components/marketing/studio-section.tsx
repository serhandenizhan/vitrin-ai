/**
 * Stüdyo bolumu: "kesimden sonrasi". Baslik sunucuda; etkilesimli tur
 * (`studio-tour.tsx`) istemcide.
 */

import { Reveal } from "@/components/reveal";
import { StudioTour } from "@/components/marketing/studio-tour";

export function StudioSection() {
  return (
    <section id="studyo" className="surface-black section-rhythm relative overflow-hidden">
      <div className="relative mx-auto w-full max-w-6xl px-5">
        <Reveal>
          <div className="max-w-2xl">
            <h2 className="display-section text-balance">Kesimden sonrası stüdyoda</h2>
            <p className="lede on-dark-muted mt-4 max-w-xl text-pretty">
              Arka planı kalkan ürün doğrudan stüdyoya geçer. Zemin, ışık, markanız ve
              boyut aynı ekranda; indirdiğiniz görsel satışa hazır.
            </p>
          </div>
        </Reveal>
        <Reveal delay={100}>
          <StudioTour />
        </Reveal>
      </div>
    </section>
  );
}
