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
import { Studio } from "@/components/composer/studio";
import { AppTour } from "@/components/marketing/app-tour";
import { Hero } from "@/components/marketing/hero";
import { Highlights } from "@/components/marketing/highlights";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Specs } from "@/components/marketing/specs";
import { Reveal } from "@/components/reveal";
import { SignInNotice } from "@/components/sign-in-notice";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WorkSidebar } from "@/components/work-sidebar";
import { WorkspaceProvider } from "@/components/workspace-provider";

export default function HomePage() {
  return (
    /* Saglayici cocuklarini prop olarak aldigi icin asagidaki tanitim
       bolumleri sunucu bileseni olarak kalmaya devam ediyor. */
    <WorkspaceProvider>
      <WorkSidebar />
      <SignInNotice />
      {/* Tam ekran calisma alani; yalnizca acikken bir sey ciziyor. */}
      <Studio />
      <SiteHeader />

      <main className="flex-1">
        <Hero />

        {/*
          Uygulama turu aracin USTUNDE. Misyon/vizyon ve amac, sayfada bolum
          olarak DEGIL ust cubuktaki "Hakkinda" panelinde (bkz. about-panel.tsx):
          araci kullanmak icin gerekli olmayan metinler ziyaretciyi aractan bir
          ekran uzaklastiriyordu.

          Bu, CLAUDE.md'deki "arac tanitim bolumlerinin sonuna degil acilistan
          hemen sonraya konuldu" kararinin kullanici tarafindan revize edilmis
          hali (10.09.2026). Maliyeti biliniyor: "dene" bolumu bir ekran asagi
          indi. Karsiligi, ziyaretcinin araci denemeden once ne oldugunu
          gormesi. Tur bilincli olarak TEK EKRAN yuksekliginde ve yatay
          kaydirmali tutuldu ki arac uzaga dusmesin; hero'daki birincil dugme
          zaten dogrudan #dene'ye gidiyor.
        */}
        <AppTour />

        <section id="dene" className="surface-mist section-rhythm">
          <div className="mx-auto w-full max-w-3xl px-5">
            <Reveal>
              <div className="mb-9 text-center">
                <h2 className="display-section text-balance">
                  Kendi fotoğrafınızla deneyin.
                </h2>
                <p className="lede on-light-muted mx-auto mt-3 max-w-lg text-pretty">
                  Kayıt gerekmiyor. Fotoğrafınızı yükleyin, sonucu saniyeler
                  içinde görün.
                </p>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <BackgroundRemover />
            </Reveal>
          </div>
        </section>

        <Highlights />
        <HowItWorks />
        <Specs />
      </main>

      <SiteFooter />
    </WorkspaceProvider>
  );
}
