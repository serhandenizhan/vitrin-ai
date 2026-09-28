/**
 * Acilis bolumu.
 *
 * 28.09.2026'dan beri bir VITRIN (one alinan is, ROADMAP): ekranin altindan
 * el + taki sahneleri yukseliyor, ziyaretci aralarinda kaydirabiliyor ve
 * birine yakinlasinca el parilti tozuna donusup kayboluyor, taki 3D olarak
 * kaliyor. Baslik bunun cumlesi: urun kalir, arka plan gider.
 *
 * Bolum en fazla BIR ekran boyunda; altinda site oldugu gibi devam eder.
 * Baslik, dugmeler ve aciklama sunucu bileseni olarak burada ciziliyor;
 * istemciye yalnizca vitrin (`hero-showcase.tsx`) iniyor.
 *
 * Onceki surum (11.09.2026): solda metin, sagda once/sonra kaydiraci. O
 * kaydirac artik yakinlasma gorunumunde, her sahnenin kendi fotografiyla.
 */

import { HeroShowcase } from "@/components/marketing/hero-showcase";
import { Reveal } from "@/components/reveal";

export function Hero() {
  return (
    // `overflow-clip`, `hidden` DEGIL: hidden bir kutu programla kaydirilabilir
    // ve Safari odaklanan (ekrandan buyuk) fotografi gostermek icin bolumun
    // icini kaydiriyordu. clip hic kaydirilamaz.
    <section id="top" className="surface-black relative isolate overflow-clip">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%] bg-[radial-gradient(42%_60%_at_50%_100%,rgba(214,167,86,0.14),transparent_76%)]"
      />
      <HeroShowcase
        lede={
          <p className="fine-print text-pretty">
            Tezgâhta çektiğiniz fotoğrafı yükleyin, arka planı biz kaldıralım.
            En ince zincir bile yerinde kalır.
          </p>
        }
      >
        <div className="flex flex-col items-center gap-6 text-center">
          <Reveal>
            {/* Sitenin hero olcegi (64 px) burada bir kademe kucuk: sahne
                taki one ciksin diye (Serhan, 28.09.2026). Satir ici stil:
                ayni ozgullukteki iki font-size yardimcisinin kazanani siraya
                kalirdi (ders 13). */}
            <h1 className="display-hero text-balance" style={{ fontSize: "clamp(2.25rem, 4.1vw, 3.25rem)" }}>
              Ürününüz kalsın
              <br />
              Arka planı gitsin
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
              <a
                href="#dene"
                className="press flex min-h-12 items-center rounded-full bg-[linear-gradient(135deg,#f0c779,#d6a756)] px-7 text-[0.9375rem] font-semibold text-[#171614] shadow-[0_14px_32px_-14px_rgba(214,167,86,0.85),inset_0_1px_0_rgba(255,255,255,0.55)] ring-1 ring-[#f4d79b]/40 transition-[transform,box-shadow,filter] duration-300 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_18px_38px_-14px_rgba(214,167,86,0.95)]"
              >
                Fotoğrafınızı deneyin
              </a>
              {/* Ikincil eylem de en az 44px yuksekliginde bir dokunma hedefi. */}
              <a
                href="#nasil"
                className="group flex min-h-12 items-center rounded-full bg-white/[0.045] px-6 text-[0.9375rem] font-medium text-[#f3f0eb]/82 ring-1 ring-white/14 backdrop-blur-md transition-[background-color,color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:bg-white/9 hover:text-white hover:shadow-[0_14px_30px_-18px_rgba(255,255,255,0.35)]"
              >
                Nasıl çalıştığını görün <span className="text-gold ml-2 transition-transform duration-300 group-hover:translate-x-1">&rsaquo;</span>
              </a>
            </div>
          </Reveal>
        </div>
      </HeroShowcase>
    </section>
  );
}
