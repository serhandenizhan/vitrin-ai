/**
 * Paketler sayfasi.
 *
 * Onceden ust cubuktan acilan bir paneldi; kullanici karariyla kendi sayfasina
 * tasindi (10.09.2026). Sebep pratik: odeme akisi geldiginde (Faz 5) burada
 * paket secimi, fatura bilgisi ve odeme adimi olacak — bunlar bir panele
 * sigmaz ve paylasilabilir bir adres ister.
 *
 * 11.09.2026'da daha "premium" gorunmesi icin yeniden duzenlendi (kullanici
 * istegi): onerilen plan altin kenarli ve bir basamak yukarida, her kartta
 * buyuk bir fiyat satiri var ve kartlarin altina tam bir karsilastirma
 * tablosu eklendi. Karsilastirma tablosu, kartlardaki madde listelerinin
 * "hangisinde ne var" sorusunu tek bakista cevaplamasi icin.
 *
 * FIYATLAR BILINCLI OLARAK YOK. Odeme sistemi yol haritasinda Faz 5'te; buraya
 * bir sayi yazmak karsiligi olmayan bir taahhut olurdu ve degistiginde guven
 * kaybettirirdi. Paketlerin ne ICERECEGI yaziliyor, fiyat "belirleniyor"
 * olarak isaretleniyor.
 *
 * Sunucu bileseni: istemciye hic inmiyor.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Check, Minus } from "lucide-react";

import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Paketler — Vitrin AI",
  description:
    "Vitrin AI paketleri: deneme, atölye ve mağaza planları. Ödeme sistemi hazırlanıyor.",
};

type Paket = {
  ad: string;
  ozet: string;
  fiyat: string;
  fiyatNotu: string;
  acik: boolean;
  vurgulu: boolean;
  maddeler: string[];
};

const PAKETLER: Paket[] = [
  {
    ad: "Deneme",
    ozet: "Kayıt olmadan, hemen",
    fiyat: "Ücretsiz",
    fiyatNotu: "Şu anda açık",
    acik: true,
    vurgulu: false,
    maddeler: [
      "Arka plan kaldırma",
      "Kompozisyon stüdyosu",
      "2000×2000 PNG ve JPEG",
      "Çalışmalar bu cihazda saklanır",
    ],
  },
  {
    ad: "Atölye",
    ozet: "Her hafta ürün çeken kuyumcu için",
    fiyat: "Yakında",
    fiyatNotu: "Fiyat belirleniyor",
    acik: false,
    vurgulu: true,
    maddeler: [
      "Aylık yüksek işlem hakkı",
      "Çalışmalar hesabınızda saklanır",
      "Genişletilmiş zemin kütüphanesi",
      "Baskıya uygun dışa aktarma (CMYK)",
      "Katalog şablonları",
      "Öncelikli işlem sırası",
    ],
  },
  {
    ad: "Mağaza",
    ozet: "Birden fazla kişiyle çalışan ekipler için",
    fiyat: "Yakında",
    fiyatNotu: "Fiyat belirleniyor",
    acik: false,
    vurgulu: false,
    maddeler: [
      "Atölye'deki her şey",
      "Ekip üyeleri ve ortak kütüphane",
      "Toplu yükleme",
      "Marka zeminleri ve şablonları",
      "Kurumsal fatura",
    ],
  },
];

/**
 * Karsilastirma tablosu. Degerler kartlardaki listelerden turetildi; bir
 * paketin icerigi degisirse iki yer birlikte guncellenir. `true`/`false`
 * isaret olarak, metin ise oldugu gibi gosteriliyor.
 */
const KARSILASTIRMA: { ozellik: string; degerler: (boolean | string)[] }[] = [
  { ozellik: "Arka plan kaldırma", degerler: [true, true, true] },
  { ozellik: "Kompozisyon stüdyosu", degerler: [true, true, true] },
  { ozellik: "2000×2000 PNG ve JPEG", degerler: [true, true, true] },
  {
    ozellik: "Çalışmaların saklandığı yer",
    degerler: ["Bu cihaz", "Hesabınız", "Hesabınız"],
  },
  { ozellik: "Aylık yüksek işlem hakkı", degerler: [false, true, true] },
  { ozellik: "Genişletilmiş zemin kütüphanesi", degerler: [false, true, true] },
  { ozellik: "Baskıya uygun dışa aktarma (CMYK)", degerler: [false, true, true] },
  { ozellik: "Katalog şablonları", degerler: [false, true, true] },
  { ozellik: "Öncelikli işlem sırası", degerler: [false, true, true] },
  { ozellik: "Ekip üyeleri ve ortak kütüphane", degerler: [false, false, true] },
  { ozellik: "Toplu yükleme", degerler: [false, false, true] },
  { ozellik: "Marka zeminleri ve şablonları", degerler: [false, false, true] },
  { ozellik: "Kurumsal fatura", degerler: [false, false, true] },
];

const SORULAR = [
  {
    soru: "Bugün ne kadar kullanabilirim?",
    cevap:
      "Bir sınır koymadık. Kayıt yok, ücret yok; istediğiniz kadar fotoğraf işleyebilirsiniz. Aynı anda tek fotoğraf işlendiği için yoğun anlarda kısa bir süre beklemeniz gerekebilir.",
  },
  {
    soru: "Ücretli plana geçince bugünkü çalışmalarım ne olacak?",
    cevap:
      "Çalışmalarınız şu anda yalnızca kullandığınız cihazda duruyor. Hesap sistemi açıldığında sunucuya taşınacak ve bunu yapmadan önce size haber vereceğiz.",
  },
  {
    soru: "Baskıya uygun (CMYK) çıktı ne demek?",
    cevap:
      "Ekranda gördüğünüz renkler matbaada olduğu gibi basılamaz. Matbaa, dosyanın kendi renk sistemine (CMYK) çevrilmiş olmasını ister. Bu çevirmeyi sunucuda yapıyoruz ve ücretli planlarla açacağız.",
  },
];

function PaketKarti({ paket }: { paket: Paket }) {
  return (
    <div
      className={
        "relative flex h-full flex-col rounded-[1.6rem] p-7 sm:p-8 " +
        (paket.vurgulu
          ? "paket-vurgulu bg-[#15130f] shadow-[0_30px_80px_-30px_rgba(212,175,110,0.45)]"
          : "bg-white/[0.035] ring-1 ring-white/10")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[1.25rem] font-semibold tracking-[-0.015em]">
          {paket.ad}
        </h2>
        {paket.vurgulu ? (
          <span className="bg-gold rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold text-black">
            Önerilen
          </span>
        ) : null}
      </div>

      <p className="fine-print on-dark-muted mt-1">{paket.ozet}</p>

      <div className="mt-8 border-b border-white/10 pb-7">
        <p
          className={
            "text-[2.5rem] leading-none font-semibold tracking-[-0.03em] " +
            (paket.acik ? "text-gold" : "text-[#f3f0eb]")
          }
        >
          {paket.fiyat}
        </p>
        <p className="fine-print on-dark-muted mt-2.5">{paket.fiyatNotu}</p>
      </div>

      <ul className="mt-7 flex-1 space-y-3">
        {paket.maddeler.map((madde) => (
          <li key={madde} className="flex gap-3 text-[0.9375rem] leading-snug">
            <span className="bg-gold/15 text-gold mt-px flex size-5 shrink-0 items-center justify-center rounded-full">
              <Check className="size-3" strokeWidth={2.75} aria-hidden />
            </span>
            <span className="text-[#f3f0eb]/80">{madde}</span>
          </li>
        ))}
      </ul>

      {/* Calisir gibi gorunup hicbir sey yapmayan bir dugme kullaniciya kendi
          hatasi hissi verir; kapali olan acikca kapali duruyor (bkz. kok
          CLAUDE.md ders 8). */}
      <div className="mt-9">
        {paket.acik ? (
          <Link
            href="/#dene"
            className="press bg-gold hover:bg-gold-soft flex min-h-12 items-center justify-center rounded-full px-5 text-[0.9375rem] font-medium text-black transition-colors"
          >
            Hemen deneyin
          </Link>
        ) : (
          <span
            className={
              "flex min-h-12 items-center justify-center rounded-full text-[0.9375rem] " +
              (paket.vurgulu
                ? "bg-white/[0.06] text-[#f3f0eb]/70 ring-1 ring-white/15"
                : "text-[#f3f0eb]/55 ring-1 ring-white/12")
            }
          >
            Yakında açılacak
          </span>
        )}
      </div>
    </div>
  );
}

function Hucre({ deger }: { deger: boolean | string }) {
  if (typeof deger === "string") {
    return <span className="text-[#f3f0eb]/80">{deger}</span>;
  }
  return deger ? (
    <Check
      className="text-gold mx-auto size-4"
      strokeWidth={2.5}
      aria-label="Var"
    />
  ) : (
    <Minus
      className="mx-auto size-4 text-[#f3f0eb]/25"
      strokeWidth={2}
      aria-label="Yok"
    />
  );
}

export default function PaketlerPage() {
  return (
    <SiteShell>
      <section className="surface-black section-rhythm page-top relative overflow-hidden">
        {/* Sayfanin tek susu: basligin arkasindan inen altin isik. Vurgulu
            kartin altin kenariyla ayni rengi tasiyor, goz once oraya gidiyor. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[36rem]"
          style={{
            background:
              "radial-gradient(50% 60% at 50% 0%, rgba(212,175,110,0.20), transparent 70%)",
          }}
        />

        <div className="relative mx-auto w-full max-w-6xl px-5">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="display-hero text-balance">
                İşinize göre bir plan
              </h1>
              <p className="lede on-dark-muted mx-auto mt-5 max-w-xl text-pretty">
                Ödeme sistemi henüz açık değil. Fiyatları netleştirirken aracı
                kayıt olmadan ve sınır olmadan kullanabilirsiniz.
              </p>
            </div>
          </Reveal>

          <div className="mt-16 grid items-stretch gap-5 lg:grid-cols-3 lg:gap-6">
            {PAKETLER.map((paket, sira) => (
              <Reveal
                key={paket.ad}
                delay={sira * 90}
                className={paket.vurgulu ? "lg:-my-4" : "lg:my-0"}
              >
                <PaketKarti paket={paket} />
              </Reveal>
            ))}
          </div>

          <Reveal delay={300}>
            <p className="fine-print on-dark-muted mt-12 text-center">
              Fiyatlar belli olduğunda bu sayfada duyuracağız.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="surface-charcoal section-rhythm">
        <div className="mx-auto w-full max-w-5xl px-5">
          <Reveal>
            <h2 className="display-section text-balance">
              Planları karşılaştırın
            </h2>
          </Reveal>

          <Reveal delay={100}>
            <div className="mt-10 overflow-x-auto">
              <table className="w-full min-w-[36rem] border-collapse text-left text-[0.9375rem]">
                <thead>
                  <tr className="border-b border-white/15">
                    <th scope="col" className="py-4 pr-4 font-normal">
                      <span className="sr-only">Özellik</span>
                    </th>
                    {PAKETLER.map((paket) => (
                      <th
                        key={paket.ad}
                        scope="col"
                        className={
                          "w-[22%] py-4 text-center font-semibold " +
                          (paket.vurgulu ? "text-gold" : "")
                        }
                      >
                        {paket.ad}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {KARSILASTIRMA.map((satir) => (
                    <tr key={satir.ozellik} className="border-b border-white/[0.07]">
                      <th
                        scope="row"
                        className="on-dark-muted py-3.5 pr-4 font-normal"
                      >
                        {satir.ozellik}
                      </th>
                      {satir.degerler.map((deger, sira) => (
                        <td
                          key={PAKETLER[sira].ad}
                          className={
                            "py-3.5 text-center " +
                            (PAKETLER[sira].vurgulu ? "bg-white/[0.03]" : "")
                          }
                        >
                          <Hucre deger={deger} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="surface-mist section-rhythm">
        <div className="mx-auto w-full max-w-3xl px-5">
          <Reveal>
            <h2 className="display-section text-balance">Sık sorulanlar</h2>
          </Reveal>

          <dl className="mt-10 divide-y divide-black/10 border-y border-black/10">
            {SORULAR.map((madde, sira) => (
              <Reveal key={madde.soru} delay={sira * 70}>
                <div className="py-7">
                  <dt className="text-[1.0625rem] font-semibold tracking-[-0.01em]">
                    {madde.soru}
                  </dt>
                  <dd className="on-light-muted mt-2 text-[0.9375rem] leading-relaxed text-pretty">
                    {madde.cevap}
                  </dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>
    </SiteShell>
  );
}
