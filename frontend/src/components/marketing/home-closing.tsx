/**
 * Sayfanin kapanisi: tek bir eylem cagrisi. Onceki "Tasarim yaklasimimiz"
 * bolumunun yerine (30.09.2026): o bolum ziyaretciye bir sey anlatmiyordu
 * ve metni Apple'i adiyla aniyordu (tasarim dili: Apple'in metin ve marka
 * ogeleri kullanilmaz).
 */

import Link from "next/link";

import { Reveal } from "@/components/reveal";

export function HomeClosing() {
  return (
    <section className="surface-black section-rhythm relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[26rem] bg-[radial-gradient(40%_70%_at_50%_100%,rgba(214,167,86,0.16),transparent_76%)]"
      />
      <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center px-5 text-center">
        <Reveal>
          <h2 className="display-section text-balance">İlk vitrininizi bugün hazırlayın</h2>
          <p className="lede on-dark-muted mx-auto mt-4 max-w-md text-pretty">
            Tezgâhta çektiğiniz bir fotoğraf yeter. Gerisini birkaç dokunuşla stüdyoda
            tamamlarsınız.
          </p>
        </Reveal>
        <Reveal delay={100}>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
            <a
              href="#dene"
              className="press flex min-h-12 items-center rounded-full bg-[linear-gradient(135deg,#f0c779,#d6a756)] px-7 text-[0.9375rem] font-semibold text-[#171614] shadow-[0_14px_32px_-14px_rgba(214,167,86,0.85),inset_0_1px_0_rgba(255,255,255,0.55)] ring-1 ring-[#f4d79b]/40"
            >
              Fotoğrafınızı deneyin
            </a>
            <Link
              href="/paketler"
              className="group flex min-h-12 items-center rounded-full bg-white/[0.045] px-6 text-[0.9375rem] font-medium text-[#f3f0eb]/82 ring-1 ring-white/14 transition-colors hover:bg-white/9 hover:text-white"
            >
              Paketleri görün <span className="text-gold ml-2">&rsaquo;</span>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
