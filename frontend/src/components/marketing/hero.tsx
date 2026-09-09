/**
 * Acilis bolumu.
 *
 * Apple'in urun sayfasi acilisindan uyarlandi: siyah zemin, ust etiket
 * (urun adi), cok buyuk ve siki harf arali bir baslik, tek satirlik bir alt
 * cumle, sonra hap bicimli birincil eylem ve yaninda ok'lu ikincil baglanti.
 * Gorsel metnin altinda ve tam ortada duruyor.
 */

import { HeroVisual } from "@/components/marketing/hero-visual";
import { Reveal } from "@/components/reveal";

export function Hero() {
  return (
    <section id="top" className="surface-black section-rhythm overflow-hidden">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-5 px-5 text-center">
        <Reveal>
          <p className="eyebrow text-gold">Vitrin AI</p>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="display-hero max-w-3xl text-balance">
            Ürününüz kalsın
            <br />
            Arka planı gitsin
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p className="lede on-dark-muted max-w-xl text-pretty">
            Kuyum ürünü fotoğrafınızı yükleyin. Yapay zekâ, en ince zincir
            halkasına kadar ürünün sınırını bulup arka planı kaldırsın; geriye
            satışa hazır, şeffaf arka planlı bir görsel kalsın.
          </p>
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
            <a
              href="#dene"
              className="press bg-gold hover:bg-gold-soft flex min-h-11 items-center rounded-full px-6 text-[0.9375rem] font-medium text-black transition-colors duration-200"
            >
              Fotoğrafınızı deneyin
            </a>
            {/* Ikincil eylem de en az 44px yuksekliginde bir dokunma hedefi:
                Apple'da bu bir metin baglantisi ama telefonda parmakla
                isabet ettirilebilir bir alan kapliyor. */}
            <a
              href="#nasil"
              className="text-gold hover:text-gold-soft flex min-h-11 items-center text-[0.9375rem] transition-colors duration-200"
            >
              Nasıl çalıştığını görün&nbsp;&rsaquo;
            </a>
          </div>
        </Reveal>

        <Reveal delay={320} className="w-full">
          <div className="mt-8 w-full">
            <HeroVisual />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
