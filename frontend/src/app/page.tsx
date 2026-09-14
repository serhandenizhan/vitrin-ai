/**
 * Vitrin AI — ana sayfa (Faz 2).
 *
 * Kurgu, apple.com/tr'nin urun sayfalarindan uyarlandi: tam genislikte,
 * donusumlu koyu/acik bolumler; her bolumun tek bir isi var ve kaydirdikca
 * ortaya cikiyor.
 *
 * Onemli fark: Apple'da urun bir fotograf, bizde CALISAN ARACIN KENDISI.
 * Bu yuzden arac tanitim bolumlerinin sonuna degil, acilistan hemen sonraya
 * konuldu — ziyaretci once deneyip sonra okuyabilsin.
 *
 * Sayfanin durum tasiyan tek parcasi `BackgroundRemover`; geri kalan her sey
 * sunucu bileseni, yani istemciye hic inmiyor.
 */

import { BackgroundRemover } from "@/components/background-remover";
import { BackgroundsShowcase } from "@/components/marketing/backgrounds-showcase";
import { Hero } from "@/components/marketing/hero";
import { Highlights } from "@/components/marketing/highlights";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Specs } from "@/components/marketing/specs";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";

export default function HomePage() {
  return (
    <SiteShell>
        <Hero />

        <section id="dene" className="surface-mist section-rhythm">
          <div className="mx-auto w-full max-w-3xl px-5">
            <Reveal>
              <div className="mb-9 text-center">
                <h2 className="display-section text-balance">
                  Kendi fotoğrafınızla deneyin
                </h2>
                <p className="lede on-light-muted mx-auto mt-3 max-w-lg text-pretty">
                  Fotoğrafınızı yükleyin, ücretsiz hesabınızla sonucu hemen
                  görün.
                </p>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <BackgroundRemover />
            </Reveal>
          </div>
        </section>

        {/* Zemin galerisi araci HEMEN takip ediyor: kullanici kendi
            fotografini denedikten sonra "peki baska ne yapabilirim"
            sorusunun cevabi bu. */}
        <BackgroundsShowcase />

        <Highlights />
        <HowItWorks />
        <Specs />
    </SiteShell>
  );
}
