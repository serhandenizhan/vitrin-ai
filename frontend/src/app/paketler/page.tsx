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
 * FIYAT BU DOSYADA YAZILI DEGIL ve olmamali. Faz 5'te fiyatlar backend'de
 * immutable plan surumlerinde tutuluyor; kartlardaki tutar ve aylik kota
 * `GET /api/plans`ten geliyor (bkz. `components/billing-plans.tsx`). Burada
 * yalnizca SUNUM var: planin ozeti, madde listesi ve hangisinin onerildigi.
 * Yayimlanmamis bir plan kartta "Yakinda / Fiyat belirleniyor" olarak durur.
 *
 * 15.09.2026: PR #17'nin ilk hali bu sayfayi (393 satir) ucu duz beyaz kartlik
 * bir listeye indirmisti; tasarim dili Faz 2'de kilitli bir karar oldugu icin
 * sayfa geri getirildi ve kartlar dinamik fiyata baglandi.
 *
 * Sunucu bileseni; yalnizca kart izgarasi ve satin alma formu istemciye iniyor.
 */

import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";

import { BillingPlans, type PlanPresentation } from "@/components/billing-plans";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Paketler — Vitrin AI",
  description:
    "Vitrin AI paketleri: deneme, atölye ve mağaza planları. Aylık krediler ve güvenli ödeme.",
};

type Paket = {
  /** Backend'deki plan kimligi; fiyat/kota bu id ile eslestiriliyor. */
  id: string;
  ad: string;
  ozet: string;
  vurgulu: boolean;
  /** Kartta GOSTERILEN madde listesi — Mağaza'da "Atölye'deki her şey" gibi
   * kasıtlı bir özet cümlesi içerebilir, karşılaştırma tablosunun kaynağı
   * DEĞİL (bkz. `tumOzellikler`). */
  maddeler: string[];
  /**
   * Planın GERÇEKTEN sahip olduğu her özelliğin düz listesi — karşılaştırma
   * tablosu yalnızca buradan türüyor. Mağaza'nınki elle tekrar yazılmıyor,
   * Atölye'nin listesinin üzerine ekleniyor (aşağıya bakın): bu sayede bir
   * özellik Atölye'ye eklenince Mağaza'da da otomatik "var" görünüyor, iki
   * yerin elle senkron tutulması gerekmiyor.
   */
  tumOzellikler: string[];
};

const ORTAK_OZELLIKLER = [
  "Arka plan kaldırma",
  "Kompozisyon stüdyosu",
  "2000×2000 PNG ve JPEG",
  // Faz 4'ten beri her planda ayni (Deneme de hesap istiyor), bu yuzden
  // planlar arasinda degisen ayri bir "saklandigi yer" satiri artik yok.
  "Çalışmalar hesabınızda saklanır",
];

const ATOLYE_OZELLIKLERI = [
  ...ORTAK_OZELLIKLER,
  "Aylık yüksek işlem hakkı",
  "Genişletilmiş zemin kütüphanesi",
  "Baskıya uygun dışa aktarma (CMYK)",
  "Katalog şablonları",
  "Öncelikli işlem sırası",
];

const PAKETLER: Paket[] = [
  {
    id: "deneme",
    ad: "Deneme",
    ozet: "Ücretsiz bir hesapla, hemen",
    vurgulu: false,
    maddeler: ORTAK_OZELLIKLER,
    tumOzellikler: ORTAK_OZELLIKLER,
  },
  {
    id: "atolye",
    ad: "Atölye",
    ozet: "Her hafta ürün çeken kuyumcu için",
    vurgulu: true,
    maddeler: [
      "Aylık yüksek işlem hakkı",
      "Çalışmalar hesabınızda saklanır",
      "Genişletilmiş zemin kütüphanesi",
      "Baskıya uygun dışa aktarma (CMYK)",
      "Katalog şablonları",
      "Öncelikli işlem sırası",
    ],
    tumOzellikler: ATOLYE_OZELLIKLERI,
  },
  {
    id: "magaza",
    ad: "Mağaza",
    ozet: "Birden fazla kişiyle çalışan ekipler için",
    vurgulu: false,
    maddeler: [
      "Atölye'deki her şey",
      "Ekip üyeleri ve ortak kütüphane",
      "Toplu yükleme",
      "Marka zeminleri ve şablonları",
      "Kurumsal fatura",
    ],
    tumOzellikler: [
      ...ATOLYE_OZELLIKLERI,
      "Ekip üyeleri ve ortak kütüphane",
      "Toplu yükleme",
      "Marka zeminleri ve şablonları",
      "Kurumsal fatura",
    ],
  },
];

/**
 * Karsilastirma tablosu artik ELLE YAZILMIYOR: her satir, `PAKETLER[].
 * tumOzellikler`de en az bir planda gecen ozelliklerin BIRLESIMINDEN
 * (ilk gorulme sirasiyla) turuyor, her hucre de o planin listesinde o
 * ozellik var mi diye bakarak hesaplaniyor. Bir plana ozellik eklenip
 * digerinde unutulmasi artik mumkun degil — tabloda gorunecek tek yer
 * `tumOzellikler`.
 */
/** Istemci bilesenine gecen sunum verisi — fiyat ve kota ICERMEZ. */
const SUNUM: PlanPresentation[] = PAKETLER.map(({ id, ad, ozet, vurgulu, maddeler }) => ({
  id,
  ad,
  ozet,
  vurgulu,
  maddeler,
}));

const TUM_OZELLIKLER = Array.from(
  new Set(PAKETLER.flatMap((paket) => paket.tumOzellikler)),
);

const OZELLIK_SATIRLARI = TUM_OZELLIKLER.map((ozellik) => ({
  ozellik,
  degerler: PAKETLER.map((paket) => paket.tumOzellikler.includes(ozellik)),
}));

// Onceden burada elle yerlestirilen bir "saklandigi yer" metin satiri vardi
// (Deneme: "Bu cihaz"). Faz 4'te her plan hesapta sakladigi icin satir
// kalkti; tablo tamamen `tumOzellikler`den turuyor. `Cell` metin degerini
// hala destekliyor — planlar arasinda degisen bir metin satiri gerekirse diye.
const KARSILASTIRMA: { ozellik: string; degerler: (boolean | string)[] }[] =
  OZELLIK_SATIRLARI;

const SORULAR = [
  {
    soru: "Bugün ne kadar kullanabilirim?",
    cevap:
      "Bir sınır koymadık. Ücretsiz bir hesap açmanız yeterli, ücret yok; istediğiniz kadar fotoğraf işleyebilirsiniz. Aynı anda tek fotoğraf işlendiği için yoğun anlarda kısa bir süre beklemeniz gerekebilir.",
  },
  {
    soru: "Ücretli plana geçince bugünkü çalışmalarım ne olacak?",
    cevap:
      "Çalışmalarınız hesabınızda saklanıyor. Ücretli bir plana geçtiğinizde hepsi olduğu gibi hesabınızda kalır.",
  },
  {
    soru: "Baskıya uygun (CMYK) çıktı ne demek?",
    cevap:
      "Ekranda gördüğünüz renkler matbaada olduğu gibi basılamaz. Matbaa, dosyanın kendi renk sistemine (CMYK) çevrilmiş olmasını ister. Bu çevirmeyi sunucuda yapıyoruz ve ücretli planlarla açacağız.",
  },
];


function Cell({ deger }: { deger: boolean | string }) {
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
                Her fotoğraf için bir kredi. Ücretsiz bir hesapla hemen
                başlayabilir, aylık haklarınızı buradan yükseltebilirsiniz.
              </p>
            </div>
          </Reveal>

          {/* Kartlar ve satin alma formu istemci bileseninde: fiyat, kota ve
              satin alinabilirlik backend'den geliyor, sunum metni buradan. */}
          <BillingPlans catalog={SUNUM} />
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
                          <Cell deger={deger} />
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
