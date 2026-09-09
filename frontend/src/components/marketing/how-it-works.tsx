/**
 * "Nasil calisir" bolumu.
 *
 * Apple'in acik zeminli anlatim bolumlerinden uyarlandi: buyuk baslik, sonra
 * numaralandirilmis uc adim. Numaralar dekoratif degil — gercek bir sira
 * bildirdikleri icin `<ol>` kullaniliyor.
 *
 * Ucuncu adimda cekim rehberi var: cikti kalitesini en cok dusuren iki etken
 * modelin degil GIRDININ sorunu (bkz. kok ROADMAP.md "Bilinen sinirlamalar"),
 * ve bunu kullaniciya soylemek model tarafinda hicbir sey degistirmeden
 * sonucu belirgin iyilestiriyor.
 */

import { Reveal } from "@/components/reveal";

const STEPS = [
  {
    numara: "01",
    baslik: "Fotoğrafı yükleyin",
    aciklama:
      "Sürükleyip bırakın ya da seçin. JPEG, PNG, WebP ve HEIC destekleniyor; en fazla 20 MB.",
  },
  {
    numara: "02",
    baslik: "Arka plan kalksın",
    aciklama:
      "Yapay zekâ ürünün sınırını bulup arka planı ayırıyor. İşlem birkaç saniye sürüyor; ilk fotoğrafta model belleğe yüklendiği için biraz daha uzun.",
  },
  {
    numara: "03",
    baslik: "Sonucu indirin",
    aciklama:
      "Şeffaflığı dama deseninin üzerinde kontrol edin, memnunsanız PNG olarak indirin.",
  },
];

const TIPS = [
  {
    baslik: "Ürünü elde tutmayın",
    aciklama:
      "Elde tutulan üründe model bazen eli de koruyor, bazen kaldırıyor — davranış öngörülemiyor. Ürün masada ya da kadife üzerinde tek başına dursun.",
  },
  {
    baslik: "Özgün dosyayı gönderin",
    aciklama:
      "WhatsApp'tan geçen fotoğraf sıkıştırıldığı için kenarlar bulanıklaşıyor. Doğrudan galeriden yükleyin.",
  },
  {
    baslik: "Ürünün tamamı görünsün",
    aciklama:
      "Parmakla ya da başka bir nesneyle kapanan kısımlar çıktıda da eksik kalır; kaynakta görünmeyen piksel üretilemez.",
  },
];

export function HowItWorks() {
  return (
    <section id="nasil" className="surface-mist section-rhythm">
      <div className="mx-auto w-full max-w-5xl px-5">
        <Reveal>
          <h2 className="display-section max-w-2xl text-balance">
            Üç adım. Hepsi bu.
          </h2>
        </Reveal>

        <ol className="mt-12 grid gap-10 sm:mt-16 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <Reveal as="li" key={step.numara} delay={index * 90}>
              <span className="text-gold block text-[0.8125rem] font-semibold tracking-[0.08em] tabular-nums">
                {step.numara}
              </span>
              <p className="display-feature mt-3 text-balance">{step.baslik}</p>
              <p className="lede on-light-muted mt-2.5 text-pretty">
                {step.aciklama}
              </p>
            </Reveal>
          ))}
        </ol>

        {/* Cekim rehberi — ayri bir kart icinde, cunku bunlar adim degil oneri */}
        <Reveal delay={120}>
          <div className="mt-16 rounded-2xl bg-white p-7 sm:mt-20 sm:p-10">
            <h3 className="display-feature text-balance">
              En iyi sonuç için üç öneri.
            </h3>
            <p className="lede on-light-muted mt-2.5 max-w-2xl text-pretty">
              Çıktı kalitesini en çok düşüren etkenler modelin değil, girdinin
              sorunu. Bu üç madde, model tarafında hiçbir şey değiştirmeden
              sonucu belirgin şekilde iyileştiriyor.
            </p>

            <ul className="mt-8 grid gap-7 sm:grid-cols-3">
              {TIPS.map((tip) => (
                <li key={tip.baslik}>
                  <p className="text-[0.9375rem] font-semibold tracking-[-0.01em]">
                    {tip.baslik}
                  </p>
                  <p className="fine-print on-light-muted mt-1.5 text-pretty">
                    {tip.aciklama}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
