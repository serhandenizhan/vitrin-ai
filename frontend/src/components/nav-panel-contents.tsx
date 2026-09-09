"use client";

/**
 * Ust cubuk panellerinin icerikleri: Nasil calisir, Paketler, Hakkinda.
 *
 * Kabuk `nav-panel.tsx` icinde; burada yalnizca metin ve duzen var. Ayri
 * dosyada olmalarinin sebebi, kabugun davranisini (odak, Escape, gecis)
 * icerikten ayri tutmak — icerik degistiginde davranisa dokunmak gerekmiyor.
 */

import { Check, Sparkles } from "lucide-react";

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

/* --- Paketler ----------------------------------------------------------- */

/**
 * Fiyatlar HENUZ YOK ve bilincli olarak uydurulmadi.
 *
 * Odeme sistemi yol haritasinda Faz 5'te (iyzico, kredi modeli). Buraya
 * "199 TL/ay" gibi bir sayi yazmak, karsiligi olmayan bir taahhut olurdu ve
 * degistiginde kullanicida guven kaybi yaratirdi. Paketler ne ICERECEGI
 * yaziliyor, fiyat "belirleniyor" olarak isaretleniyor.
 */
const PAKETLER = [
  {
    ad: "Deneme",
    ozet: "Kayıt gerekmeden, hemen",
    durum: "Şu anda açık",
    vurgulu: false,
    maddeler: [
      "Arka plan kaldırma",
      "Kompozisyon stüdyosu",
      "2000×2000 dışa aktarma",
      "Çalışmalar bu cihazda saklanır",
    ],
  },
  {
    ad: "Atölye",
    ozet: "Düzenli çalışan kuyumcu için",
    durum: "Fiyat belirleniyor",
    vurgulu: true,
    maddeler: [
      "Aylık yüksek işlem hakkı",
      "Çalışmalar hesabınızda saklanır",
      "Genişletilmiş zemin kütüphanesi",
      "Öncelikli işlem sırası",
    ],
  },
  {
    ad: "Mağaza",
    ozet: "Çok kullanıcılı ekipler için",
    durum: "Fiyat belirleniyor",
    vurgulu: false,
    maddeler: [
      "Ekip üyeleri ve ortak kütüphane",
      "Toplu yükleme",
      "Marka zeminleri",
      "Kurumsal fatura",
    ],
  },
];

export function PaketlerIcerik() {
  return (
    <>
      <h2 className="display-feature max-w-xl text-balance">
        Şimdilik ücretsiz, sonrası için üç plan
      </h2>
      <p className="lede mt-3 max-w-xl text-pretty text-[#f3f0eb]/65">
        Ödeme sistemi henüz açılmadı. Aşağıdaki paketler hazırlanıyor; bugün
        aracı kayıt gerekmeden sınırsız deneyebilirsiniz.
      </p>

      <div className="mt-9 grid gap-4 sm:grid-cols-3">
        {PAKETLER.map((paket) => (
          <div
            key={paket.ad}
            className={
              "rounded-2xl p-5 " +
              (paket.vurgulu
                ? "ring-gold/60 bg-white/[0.07] ring-1"
                : "bg-white/[0.04] ring-1 ring-white/10")
            }
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[1.0625rem] font-semibold tracking-[-0.01em]">
                {paket.ad}
              </h3>
              {paket.vurgulu ? (
                <span className="bg-gold rounded-full px-2 py-0.5 text-[0.625rem] font-semibold tracking-[0.04em] text-black uppercase">
                  Önerilen
                </span>
              ) : null}
            </div>

            <p className="fine-print mt-1 text-[#f3f0eb]/55">{paket.ozet}</p>

            <p
              className={
                "mt-4 text-[0.9375rem] font-medium " +
                (paket.durum === "Şu anda açık"
                  ? "text-gold"
                  : "text-[#f3f0eb]/45")
              }
            >
              {paket.durum}
            </p>

            <ul className="mt-4 space-y-2">
              {paket.maddeler.map((madde) => (
                <li
                  key={madde}
                  className="flex gap-2 text-[0.8125rem] leading-snug text-[#f3f0eb]/70"
                >
                  <Check
                    className="text-gold mt-0.5 size-3.5 shrink-0"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                  {madde}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="fine-print mt-8 flex items-center gap-2 text-[#f3f0eb]/45">
        <Sparkles className="size-3.5" strokeWidth={1.75} aria-hidden />
        Fiyatlar belirlendiğinde burada duyurulacak.
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
