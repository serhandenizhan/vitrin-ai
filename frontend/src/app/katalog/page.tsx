/**
 * Katalog sayfasi.
 *
 * Hazirlanan gorselleri dergi/katalog sayfasina yerlestirir. Kendi rotasinda
 * duruyor — ana sayfada DEGIL: katalog kurmak, arka plan kaldirmaktan ayri bir
 * is ve ayri bir oturum. Ana sayfaya konsaydi akisi uzatir, oraya gelen
 * ziyaretciyi ilgilenmedigi bir arayuzle karsilardi.
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
      <section className="surface-mist section-rhythm">
        <div className="mx-auto w-full max-w-6xl px-5">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="fine-print on-light-muted tracking-[0.08em] uppercase">
                Katalog
              </p>
              <h1 className="display-section mt-3 text-balance">
                Ürünleriniz için sayfa hazırlayın
              </h1>
              <p className="lede on-light-muted mx-auto mt-4 max-w-xl text-pretty">
                Arka planını kaldırdığınız görselleri bir şablona yerleştirin,
                başlığı yazın ve sayfayı indirin. Dergiye, kataloğa ya da
                sosyal medyaya hazır.
              </p>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="mt-12">
              <CatalogEditor />
            </div>
          </Reveal>

          <Reveal delay={220}>
            {/*
              Matbaa gercegi kullanicidan gizlenmiyor. Indirilen PNG dijital
              katalog ve prova icin dogru; gercek matbaa baskisi CMYK ister ve
              bu donusum tarayicida yapilamiyor.
            */}
            <p className="on-light-muted fine-print mx-auto mt-10 max-w-2xl text-center text-pretty">
              İndirilen sayfa A4 oranında ve 150 nokta/inç karşılığında; dijital
              katalog, sosyal medya ve matbaa provası için yeterli. Gerçek
              matbaa baskısı CMYK renk dönüşümü ister — bu dönüşüm tarayıcıda
              yapılamadığı için sunucu tarafında hazırlanıyor ve ücretli
              planlarda açılacak.
            </p>
          </Reveal>
        </div>
      </section>
    </SiteShell>
  );
}
