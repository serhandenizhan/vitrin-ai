"use client";

/**
 * Ust cubuk panellerinin icerikleri: Nasil calisir, Paketler, Hakkinda.
 *
 * Kabuk `nav-panel.tsx` icinde; burada yalnizca metin ve duzen var. Ayri
 * dosyada olmalarinin sebebi, kabugun davranisini (odak, Escape, gecis)
 * icerikten ayri tutmak — icerik degistiginde davranisa dokunmak gerekmiyor.
 */



/* --- Nasil calisir ------------------------------------------------------ */

const ADIMLAR = [
  {
    no: "01",
    baslik: "Fotoğrafı yükleyin",
    metin:
      "Telefonla tezgâhta çektiğiniz kare yeterli. JPEG, PNG, WebP ve iPhone'un HEIC formatı doğrudan kabul ediliyor; 20 MB'a kadar.",
  },
  {
    no: "02",
    baslik: "Yapay zekâ sınırı bulur",
    metin:
      "BiRefNet, mücevher fotoğrafçılığının en zor kısmı için seçildi: ince zincir halkaları, yansıtıcı metal ve küçük taş kenarları. Çözünürlüğünüz birebir korunur.",
  },
  {
    no: "03",
    baslik: "Sonucu inceleyin",
    metin:
      "Önce/sonra çizgisini sürükleyin, büyüteçle kenarlara yakından bakın. Beğenmezseniz saydam PNG'yi indirip kendi programınızda kullanabilirsiniz.",
  },
  {
    no: "04",
    baslik: "Vitrine yerleştirin",
    metin:
      "Zemini seçin, ürünü sürükleyip ölçekleyin, gölge ve ışık havuzunu açın; 2000×2000 PNG veya JPEG olarak indirin.",
  },
  {
    no: "05",
    baslik: "Katalog ve baskı",
    metin:
      "Hazırladığınız görselleri katalog şablonlarına yerleştirip A4 oranında indirin. Matbaa baskısı için gereken CMYK dönüşümü ücretli planlarda açılacak.",
  },
];

export function NasilCalisirIcerik() {
  return (
    <>
      <h2 className="display-feature max-w-xl text-balance">
        Fotoğraftan satışa hazır görsele dört adım
      </h2>

      <ol className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {ADIMLAR.map((adim) => (
          <li key={adim.no} className="flex gap-4">
            <span className="text-gold fine-print pt-0.5 font-semibold tracking-[0.1em] tabular-nums">
              {adim.no}
            </span>
            <div>
              <h3 className="text-[1.0625rem] font-semibold tracking-[-0.01em]">
                {adim.baslik}
              </h3>
              <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-pretty text-[#f3f0eb]/65">
                {adim.metin}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <p className="fine-print mt-9 text-[#f3f0eb]/45">
        İlk istek modeli belleğe yüklediği için bir kereye mahsus daha uzun
        sürer; sonraki fotoğraflar belirgin şekilde daha hızlıdır.
      </p>
    </>
  );
}

/* --- Hakkinda ----------------------------------------------------------- */

const HAKKINDA = [
  {
    baslik: "Amacımız",
    metin:
      "Bir ürünü satışa hazır göstermek bugün ya pahalı bir çekim ya da saatler süren bir düzenleme işi. Vitrin AI bunu tezgâhın başında, telefonla çekilmiş tek bir kareden yapıyor. Aradaki farkı kapatan şey ürünün kendisi değil, arkasındaki dağınıklık.",
  },
  {
    baslik: "Misyonumuz",
    metin:
      "Her kuyumcunun kendi stüdyosu olsun. Ürünü tezgâhta çekip aynı dakikada vitrine koyabilmek; bunun için ajans, stüdyo ya da düzenleme bilgisi gerekmesin.",
  },
  {
    baslik: "Vizyonumuz",
    metin:
      "Vitrinden mobile tek akış. Kesim, zemin, ölçü ve dışa aktarma tek bir yerde — sonunda telefonun içinde, ürün tezgâhtan çıkmadan mağaza sayfasında.",
  },
];

export function HakkindaIcerik() {
  return (
    <>
      <div className="grid gap-8 sm:grid-cols-3 sm:gap-10">
        {HAKKINDA.map((bolum) => (
          <section key={bolum.baslik}>
            <h2 className="text-[1.375rem] font-semibold tracking-[-0.015em]">
              {bolum.baslik}
            </h2>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-pretty text-[#f3f0eb]/65">
              {bolum.metin}
            </p>
          </section>
        ))}
      </div>

      <p className="fine-print mt-10 text-[#f3f0eb]/45">
        Kuyumcular için geliştiriliyor. Fotoğraflar saklanmaz; görsel yalnızca
        işlem süresince bellekte tutulur.
      </p>
    </>
  );
}
