/**
 * "Öne çıkanlar" bolumu.
 *
 * Apple'in "Iste one cikan basliklar." bolumunden uyarlandi: koyu zemin
 * uzerinde, her biri tek cumlelik ve buyuk puntolu (28px sinifi) maddeler.
 * Cumleler kasitli olarak kisa — bu bolum okunmuyor, TARANIYOR.
 *
 * Icerik uydurma degil: her madde projenin dogrulanmis bir gercegine
 * dayaniyor (bkz. kok ROADMAP.md bolum 2 ve backend/README.md).
 */

import { Reveal } from "@/components/reveal";

const HIGHLIGHTS = [
  {
    baslik: "İnce zincirler ve taş kenarları",
    aciklama:
      "İnce halkalar, parlayan metal ve küçük taşlar kesimde kaybolmuyor. Kenarlar temiz çıkıyor.",
  },
  {
    baslik: "Çözünürlüğünüz aynı kalıyor",
    aciklama:
      "Yüklediğiniz fotoğraf hangi boyuttaysa kesim de o boyutta iner. Küçültme ya da yeniden sıkıştırma yok.",
  },
  {
    baslik: "iPhone'dan çektiğiniz gibi",
    aciklama:
      "iPhone'un HEIC dosyasını olduğu gibi yükleyin. Dönüştürmenize ya da WhatsApp'tan geçirmenize gerek yok; WhatsApp fotoğrafı sıkıştırıp kaliteyi düşürüyor.",
  },
  {
    baslik: "Şeffaf PNG olarak iniyor",
    aciklama:
      "Sonuç, arka planı olmayan bir PNG. Kendi zemininize koyun, kataloğa yerleştirin, pazaryerine yükleyin.",
  },
];

export function Highlights() {
  return (
    <section id="ozellikler" className="surface-charcoal section-rhythm">
      <div className="mx-auto w-full max-w-5xl px-5">
        <Reveal>
          <h2 className="display-section max-w-2xl text-balance">
            Farkı ayrıntılarda görürsünüz
          </h2>
        </Reveal>

        <ul className="mt-12 grid gap-x-10 gap-y-12 sm:mt-16 sm:grid-cols-2">
          {HIGHLIGHTS.map((item, index) => (
            <Reveal as="li" key={item.baslik} delay={index * 90}>
              <p className="display-feature text-balance">{item.baslik}</p>
              <p className="lede on-dark-muted mt-3 text-pretty">
                {item.aciklama}
              </p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
