/**
 * Teknik bilgiler bolumu.
 *
 * Apple'in "Ayrintilara yakindan bakis." bolumundeki teknik ozellikler
 * izgarasindan uyarlandi: siyah zemin, kucuk puntolu (14px sinifi) ve
 * yogun bilgi, basliklari kalin.
 *
 * Buradaki her sayi projenin gercek yapilandirmasindan geliyor:
 * `backend/app/core/config.py` (dosya boyutu, piksel siniri, eszamanlilik)
 * ve kok CLAUDE.md "Bilinen kisit" (RAM, sure). Bir deger degisirse burasi
 * da guncellenmeli — dokumanlarla ayni senkron kurali (CLAUDE.md ders 9).
 */

import { Reveal } from "@/components/reveal";

const SPECS = [
  {
    baslik: "Desteklenen formatlar",
    satirlar: [
      "JPEG, PNG, WebP, HEIC/HEIF",
      "HEIC, iPhone'un varsayılan formatıdır ve dönüştürmeden yüklenebilir.",
    ],
  },
  {
    baslik: "Dosya sınırları",
    satirlar: [
      "En fazla 20 MB",
      "En fazla 40 megapiksel çözünürlük.",
    ],
  },
  {
    baslik: "Çıktı",
    satirlar: [
      "Şeffaf arka planlı PNG",
      "Giriş görselinin çözünürlüğü birebir korunur.",
    ],
  },
  {
    baslik: "İşlem süresi",
    satirlar: [
      "Fotoğraf başına birkaç saniye",
      "İlk istek, model belleğe yüklendiği için bir kereye mahsus daha uzun sürer.",
    ],
  },
  {
    baslik: "Sıra",
    satirlar: [
      "Aynı anda tek fotoğraf",
      "Model yüksek bellek kullandığı için istekler sıraya alınır; sistem meşgulse birkaç saniye sonra tekrar deneyin.",
    ],
  },
  {
    baslik: "Gizlilik",
    satirlar: [
      "Fotoğraflar saklanmıyor",
      "Görsel yalnızca işlem süresince bellekte tutulur, sonuç doğrudan tarayıcınıza döner.",
    ],
  },
];

export function Specs() {
  return (
    <section id="teknik" className="surface-black section-rhythm">
      <div className="mx-auto w-full max-w-5xl px-5">
        <Reveal>
          <h2 className="display-section max-w-2xl text-balance">
            Ayrıntılara yakından bakış.
          </h2>
        </Reveal>

        <dl className="mt-12 grid gap-x-10 gap-y-9 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3">
          {SPECS.map((spec, index) => (
            <Reveal key={spec.baslik} delay={(index % 3) * 80}>
              <dt className="border-t border-white/15 pt-4 text-[0.9375rem] font-semibold tracking-[-0.01em]">
                {spec.baslik}
              </dt>
              <dd className="mt-2">
                <p className="fine-print font-medium">{spec.satirlar[0]}</p>
                <p className="fine-print on-dark-muted mt-1 text-pretty">
                  {spec.satirlar[1]}
                </p>
              </dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
