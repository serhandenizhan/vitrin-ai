/**
 * Acilis bolumu.
 *
 * 11.09.2026'da iki sutuna alindi (kullanici: "ilk gorunum orantisiz, alttaki
 * gorseller kesiliyor"). Onceki surumde baslik, metin, dugmeler ve gorsel
 * UST USTE ortalanmisti; toplam yukseklik ~1400 px'e cikiyor ve 900 px'lik
 * bir dizustu ekranda gorsellerin yarisi ilk ekranin disinda kaliyordu.
 *
 * Simdi genis ekranda metin solda, gorsel sagda ve bolum tam olarak bir ekran
 * yuksekliginde (`lg:min-h-svh`). Gorsel artik genisligini degil ekranin
 * YUKSEKLIGINI esas aliyor, dolayisiyla her dizustu olcusunde butun olarak
 * gorunuyor. Telefonda eski dikey akis korunuyor; orada kaydirma dogal.
 */

import { HeroVisual } from "@/components/marketing/hero-visual";
import { Reveal } from "@/components/reveal";

export function Hero() {
  return (
    <section id="top" className="surface-black relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[38rem] bg-[radial-gradient(48%_72%_at_50%_0%,rgba(214,167,86,0.12),transparent_76%)]" />
      {/* Ust bosluk `--header-offset`den turuyor (bkz. globals.css) — yuzen
          ust cubugun yuksekligi degisirse burasi da otomatik guncellenir,
          elle senkron tutulan ayri bir sabit degil. */}
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pt-[calc(var(--header-offset)+3.25rem)] pb-16 lg:min-h-svh lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:pt-[calc(var(--header-offset)+2.25rem)] lg:pb-12">
        <div className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-left">
          <Reveal>
            <p className="eyebrow text-gold">Vitrin AI</p>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="display-hero max-w-xl text-balance">
              Ürününüz kalsın
              <br />
              Arka planı gitsin
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="lede on-dark-muted max-w-md text-pretty">
              Tezgâhta çektiğiniz fotoğrafı yükleyin, arka planı biz kaldıralım.
              En ince zincir bile yerinde kalır. Elinizde satışa hazır, şeffaf
              zeminli bir görsel olur.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 lg:justify-start">
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

        <Reveal delay={320} className="w-full">
          <HeroVisual />
        </Reveal>
      </div>
    </section>
  );
}
