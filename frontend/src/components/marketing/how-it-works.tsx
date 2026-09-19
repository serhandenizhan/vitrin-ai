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
      "Elde tutulan üründe el bazen kesimde kalıyor, bazen kalkıyor. Ürünü masaya ya da kadifenin üzerine tek başına koyun.",
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
    <section id="nasil" className="surface-charcoal section-rhythm relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(45%_80%_at_50%_0%,rgba(214,167,86,0.14),transparent_74%)]" />
      <div className="relative mx-auto w-full max-w-5xl px-5">
        <Reveal>
          <h2 className="display-section max-w-2xl text-balance">
            Üç adımda bitiyor
          </h2>
        </Reveal>

        <ol className="mt-8 grid gap-6 sm:mt-16 sm:grid-cols-3 sm:gap-10">
          {STEPS.map((step, index) => (
            <Reveal
              as="li"
              key={step.numara}
              delay={index * 90}
              // Telefonda altin cizgili zaman cizelgesi.
              className="border-gold/60 border-l-2 pl-4 sm:border-0 sm:pl-0"
            >
              <span className="text-gold block text-[0.8125rem] font-semibold tracking-[0.08em] tabular-nums">
                {step.numara}
              </span>
              <p className="display-feature mt-3 text-balance">{step.baslik}</p>
              <p className="lede on-dark-muted mt-2.5 text-pretty">
                {step.aciklama}
              </p>
            </Reveal>
          ))}
        </ol>

        {/* Cekim rehberi — ayri bir kart icinde, cunku bunlar adim degil oneri */}
        <Reveal delay={120}>
          <div className="glass-panel mt-10 rounded-3xl p-6 sm:mt-20 sm:p-10">
            <h3 className="display-feature text-balance">
              En iyi sonuç için üç öneri
            </h3>
            <p className="lede on-dark-muted mt-2.5 max-w-2xl text-pretty">
              Sonucu en çok etkileyen şey fotoğrafın kendisi. Çekerken bu üçüne
              dikkat ederseniz kenarlar çok daha temiz çıkar.
            </p>

            <ul className="mt-5 grid gap-4 sm:mt-8 sm:grid-cols-3 sm:gap-7">
              {TIPS.map((tip) => (
                <li key={tip.baslik}>
                  <p className="text-[0.9375rem] font-semibold tracking-[-0.01em]">
                    {tip.baslik}
                  </p>
                  <p className="fine-print on-dark-muted mt-1.5 text-pretty">
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
