/**
 * Katalog sayfasi.
 *
 * Hazirlanan gorselleri dergi/katalog sayfasina yerlestirir. Kendi rotasinda
 * duruyor — ana sayfada DEGIL: katalog kurmak, arka plan kaldirmaktan ayri bir
 * is ve ayri bir oturum. Ana sayfaya konsaydi akisi uzatir, oraya gelen
 * ziyaretciyi ilgilenmedigi bir arayuzle karsilardi.
 *
 * 11.09.2026'da Paketler sayfasinin diline getirildi (kullanici: "paketler
 * sayfasina uyduralım, güzel premium bir görüntü olsun"). Acilis artik koyu
 * bir bolum ve ustunde altin bir isik — Paketler'in basligiyla ayni kurulus.
 * Sablon galerisi de artik BOS degil: her onizleme kartinda site zeminlerinden
 * ornek gorseller var (bkz. catalog-editor.tsx `galleryPreviewSlots`);
 * onceden bos yuvalar ozellikle koyu "Kapak" sablonunda duz bir siyah
 * dikdortgen gibi durup sayfayi eksik gosteriyordu.
 *
 * Kapsam notu: ozellik tamamen istemci tarafinda; backend'e, veritabanina ya
 * da yol haritasindaki hicbir faza dokunmuyor (bkz. catalog-editor.tsx).
 */

import type { Metadata } from "next";

import { CatalogEditor } from "@/components/catalog/catalog-editor";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Katalog — Vitrin AI",
  description:
    "Hazırladığınız ürün görsellerini katalog ve dergi sayfası şablonlarına yerleştirin.",
};

export default function CatalogPage() {
  return (
    <SiteShell>
      <section className="surface-black section-rhythm page-top relative overflow-hidden">
        {/* Paketler'deki isikla ayni gerekce: goz once basliga gitsin. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[32rem]"
          style={{
            background:
              "radial-gradient(50% 60% at 50% 0%, rgba(212,175,110,0.18), transparent 70%)",
          }}
        />

        <div className="relative mx-auto w-full max-w-2xl px-5 text-center">
          <Reveal>
            <h1 className="display-hero text-balance">
              Ürünleriniz için sayfa hazırlayın
            </h1>
            <p className="lede on-dark-muted mx-auto mt-5 max-w-xl text-pretty">
              Arka planını kaldırdığınız görselleri bir şablona yerleştirin,
              başlığı yazın ve sayfayı indirin. Dergiye, kataloğa ya da sosyal
              medyaya hazır.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="surface-mist section-rhythm">
        <div className="mx-auto w-full max-w-6xl px-5">
          <Reveal>
            <CatalogEditor />
          </Reveal>

          <Reveal delay={120}>
            {/*
              Matbaa gercegi kullanicidan gizlenmiyor. Indirilen PNG dijital
              katalog ve prova icin dogru; gercek matbaa baskisi CMYK ister ve
              bu donusum tarayicida yapilamiyor.
            */}
            <p className="on-light-muted fine-print mx-auto mt-10 max-w-2xl text-center text-pretty">
              İndirilen sayfa A4 oranında ve 150 nokta/inç karşılığında; dijital
              katalog, sosyal medya ve matbaa provası için yeterli. Gerçek
              matbaa baskısı için dosyanın CMYK renklerine çevrilmesi gerekiyor.
              Bu dönüşümü sunucuda hazırlıyoruz, ücretli planlarla açılacak.
            </p>
          </Reveal>
        </div>
      </section>
    </SiteShell>
  );
}
