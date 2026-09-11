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
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pt-28 pb-16 lg:min-h-svh lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:pt-24 lg:pb-12">
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
                className="press bg-gold hover:bg-gold-soft flex min-h-11 items-center rounded-full px-6 text-[0.9375rem] font-medium text-black transition-colors duration-200"
              >
                Fotoğrafınızı deneyin
              </a>
              {/* Ikincil eylem de en az 44px yuksekliginde bir dokunma hedefi. */}
              <a
                href="#nasil"
                className="text-gold hover:text-gold-soft flex min-h-11 items-center text-[0.9375rem] transition-colors duration-200"
              >
                Nasıl çalıştığını görün&nbsp;&rsaquo;
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
