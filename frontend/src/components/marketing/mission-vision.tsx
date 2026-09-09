/**
 * Misyon ve vizyon — tek alanda.
 *
 * Bilincli olarak KISA. Bu tur bolumler cogu sitede uzun ve kimse okumuyor;
 * burada iki paragraf ve olculebilir uc madde var. Yazilan her cumle projenin
 * kendi gercegine dayaniyor (hedef kitle Turk kuyumcular, model karari,
 * cozunurluk korunmasi) — genel gecer "musteri odakli, yenilikci" cumleleri
 * yok, cunku onlar bilgi tasimiyor.
 *
 * Sunucu bileseni: istemciye hic inmiyor.
 */

import { Reveal } from "@/components/reveal";

const OLCULER = [
  {
    deger: "En ince halka",
    metin:
      "Model, mücevher fotoğrafçılığının en zor kısmı için seçildi: ince zincirler, yansıtıcı metal, küçük taşlar.",
  },
  {
    deger: "Çözünürlük korunur",
    metin:
      "Giriş görselinin ölçüsü birebir korunuyor; kesim küçültülmüş bir kopya değil.",
  },
  {
    deger: "Fotoğraf saklanmaz",
    metin:
      "Görsel yalnızca işlem süresince bellekte tutulur, sonuç doğrudan tarayıcınıza döner.",
  },
];

export function MissionVision() {
  return (
    <section id="misyon" className="surface-charcoal section-rhythm">
      <div className="mx-auto w-full max-w-5xl px-5">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <div>
              <p className="fine-print on-dark-muted tracking-[0.08em] uppercase">
                Misyonumuz
              </p>
              <h2 className="display-feature mt-3 text-balance">
                Her kuyumcunun bir stüdyosu olsun.
              </h2>
              <p className="lede on-dark-muted mt-4 text-pretty">
                Bir ürünü satışa hazır göstermek bugün ya pahalı bir çekim ya da
                saatler süren bir düzenleme işi. Vitrin AI bunu tezgâhın başında,
                telefonla çekilmiş tek bir kareden yapıyor — aradaki farkı
                kapatan şey ürünün kendisi değil, arkasındaki dağınıklık.
              </p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div>
              <p className="fine-print on-dark-muted tracking-[0.08em] uppercase">
                Vizyonumuz
              </p>
              <h2 className="display-feature mt-3 text-balance">
                Vitrinden mobile, tek akış.
              </h2>
              <p className="lede on-dark-muted mt-4 text-pretty">
                Web yalnızca başlangıç. Hedef, kuyumcunun ürünü tezgâhta
                çekip aynı dakikada mağaza sayfasına koyabilmesi: kesim, zemin,
                ölçü ve dışa aktarma tek bir yerde, telefonun içinde.
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal delay={160}>
          <dl className="mt-14 grid gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-3">
            {OLCULER.map((olcu) => (
              <div key={olcu.deger} className="surface-charcoal p-6">
                <dt className="text-[0.9375rem] font-semibold tracking-[-0.01em]">
                  {olcu.deger}
                </dt>
                <dd className="on-dark-muted mt-2 text-[0.8125rem] leading-relaxed text-pretty">
                  {olcu.metin}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
