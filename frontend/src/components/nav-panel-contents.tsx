"use client";

/**
 * Ust cubuk panellerinin icerikleri: Nasil calisir, Hakkinda.
 *
 * Kabuk `nav-panel.tsx` icinde; burada yalnizca metin ve duzen var. Ayri
 * dosyada olmalarinin sebebi, kabugun davranisini (odak, Escape, gecis)
 * icerikten ayri tutmak — icerik degistiginde davranisa dokunmak gerekmiyor.
 *
 * Metinler 11.09.2026'da elden gecirildi (kullanici istegi): model adi
 * (BiRefNet) ziyaretciye bir sey anlatmadigi icin cikarildi, "ilk istek uzun
 * surer" notu panelden kaldirildi. Bu not bekleme ekraninda
 * (processing-state.tsx) yerinde duruyor — orada gercekten isine yariyor.
 */

/* --- Nasil calisir ------------------------------------------------------ */

const ADIMLAR = [
  {
    no: "01",
    baslik: "Fotoğrafı yükleyin",
    metin:
      "Tezgâhta telefonla çektiğiniz fotoğraf yeterli. JPEG, PNG, WebP ve iPhone'un HEIC dosyaları kabul ediliyor, en fazla 20 MB.",
  },
  {
    no: "02",
    baslik: "Arka plan kalksın",
    metin:
      "Yapay zekâ ürünün kenarını buluyor. İnce zincir halkaları, parlayan metal ve küçük taşlar kesimde kalıyor. Fotoğrafın çözünürlüğü değişmiyor.",
  },
  {
    no: "03",
    baslik: "Sonucu inceleyin",
    metin:
      "Önce ve sonra arasındaki çizgiyi sürükleyin, büyüteçle kenarlara yakından bakın. İsterseniz saydam PNG'yi indirip kendi programınızda kullanın.",
  },
  {
    no: "04",
    baslik: "Vitrine yerleştirin",
    metin:
      "Bir zemin seçin, ürünü sürükleyip boyutunu ayarlayın, gölge ve ışık ekleyin. 2000×2000 PNG ya da JPEG olarak indirin.",
  },
  {
    no: "05",
    baslik: "Katalog hazırlayın",
    metin:
      "Görselleri katalog şablonlarına yerleştirip A4 sayfa olarak indirin. Matbaaya gidecek CMYK dosyası ücretli planlarla gelecek.",
  },
];

export function NasilCalisirIcerik() {
  return (
    <>
      <h2 className="display-feature max-w-xl text-balance">
        Tezgâhtan vitrine beş adım
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
    </>
  );
}

/* --- Hakkinda ----------------------------------------------------------- */

const HAKKINDA = [
  {
    baslik: "Amacımız",
    metin:
      "Bir yüzüğü satışa hazır göstermek için ya stüdyoya para veriyorsunuz ya da saatlerce fotoğraf düzenliyorsunuz. Çoğu zaman sorun ürün değil, arkasındaki tezgâh. Vitrin AI, telefonla çektiğiniz tek bir fotoğraftan temiz bir ürün görseli çıkarıyor.",
  },
  {
    baslik: "Misyonumuz",
    metin:
      "Ürünü tezgâhta çekip birkaç dakika içinde sitenize ya da Instagram'a koyabilmek. Bunun için ajansa, stüdyoya ya da Photoshop bilgisine ihtiyaç duymamak.",
  },
  {
    baslik: "Vizyonumuz",
    metin:
      "Bugün tarayıcıda arka plan kaldırıyor, zemin seçiyor ve katalog hazırlıyoruz. Sırada mobil uygulama var: fotoğrafı çektiğiniz telefonda düzenleyip doğrudan mağazanıza yüklemek.",
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
        Kuyumcular için geliştiriliyor. Özgün fotoğrafınızı sunucuda
        saklamıyoruz, işlem bitince bellekten siliniyor.
      </p>
    </>
  );
}
