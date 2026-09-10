/**
 * Paketler sayfasi.
 *
 * Onceden ust cubuktan acilan bir paneldi; kullanici karariyla kendi sayfasina
 * tasindi (10.09.2026). Sebep pratik: odeme akisi geldiginde (Faz 5) burada
 * paket secimi, fatura bilgisi ve odeme adimi olacak — bunlar bir panele
 * sigmaz ve paylasilabilir bir adres ister.
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
import { Check, Sparkles } from "lucide-react";

import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Paketler — Vitrin AI",
  description:
    "Vitrin AI paketleri: deneme, atölye ve mağaza planları. Ödeme sistemi hazırlanıyor.",
};

const PAKETLER = [
  {
    ad: "Deneme",
    ozet: "Kayıt gerekmeden, hemen",
    durum: "Şu anda açık",
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
    ozet: "Düzenli çalışan kuyumcu için",
    durum: "Fiyat belirleniyor",
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
    ozet: "Çok kullanıcılı ekipler için",
    durum: "Fiyat belirleniyor",
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

const SORULAR = [
  {
    soru: "Bugün ne kadar kullanabilirim?",
    cevap:
      "Sınır koymadık. Kayıt gerekmiyor, ücret alınmıyor; araç açık olduğu sürece istediğiniz kadar fotoğraf işleyebilirsiniz. Aynı anda tek fotoğraf işlendiği için yoğun anlarda kısa bir sıra beklemesi olabilir.",
  },
  {
    soru: "Ücretli plana geçince bugünkü çalışmalarım ne olacak?",
    cevap:
      "Çalışmalar şu anda yalnızca kullandığınız cihazda saklanıyor. Hesap sistemi açıldığında sunucuya taşınacak; taşınma öncesinde size bildirilecek.",
  },
  {
    soru: "Baskıya uygun (CMYK) çıktı ne demek?",
    cevap:
      "Matbaa, ekran için üretilen RGB dosyayı doğrudan basamaz; dosyanın CMYK renk uzayına, matbaanın kullandığı ICC profiliyle çevrilmiş olması gerekir. Bu dönüşüm tarayıcıda yapılamıyor (canvas yalnızca RGB üretir, PNG ise CMYK'yı hiç desteklemez), bu yüzden sunucu tarafında hazırlanıyor ve ücretli planlarda açılacak.",
  },
];

export default function PaketlerPage() {
  return (
    <SiteShell>
      <section className="surface-black section-rhythm">
        <div className="mx-auto w-full max-w-6xl px-5">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="fine-print on-dark-muted tracking-[0.08em] uppercase">
                Paketler
              </p>
              <h1 className="display-section mt-3 text-balance">
                Şimdilik ücretsiz, sonrası için üç plan
              </h1>
              <p className="lede on-dark-muted mx-auto mt-4 max-w-xl text-pretty">
                Ödeme sistemi henüz açılmadı. Aşağıdaki paketler hazırlanıyor;
                bugün aracı kayıt gerekmeden sınırsız deneyebilirsiniz.
              </p>
            </div>
          </Reveal>

          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {PAKETLER.map((paket, sira) => (
              <Reveal key={paket.ad} delay={sira * 90}>
                <div
                  className={
                    "flex h-full flex-col rounded-[1.25rem] p-6 " +
                    (paket.vurgulu
                      ? "ring-gold/55 bg-white/[0.07] ring-1"
                      : "bg-white/[0.035] ring-1 ring-white/10")
                  }
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="display-feature">{paket.ad}</h2>
                    {paket.vurgulu ? (
                      <span className="bg-gold rounded-full px-2.5 py-1 text-[0.625rem] font-semibold tracking-[0.04em] text-black uppercase">
                        Önerilen
                      </span>
                    ) : null}
                  </div>

                  <p className="fine-print on-dark-muted mt-1.5">
                    {paket.ozet}
                  </p>

                  <p
                    className={
                      "mt-6 text-[1.0625rem] font-medium " +
                      (paket.acik ? "text-gold" : "on-dark-muted")
                    }
                  >
                    {paket.durum}
                  </p>

                  <ul className="mt-6 flex-1 space-y-2.5">
                    {paket.maddeler.map((madde) => (
                      <li
                        key={madde}
                        className="flex gap-2.5 text-[0.875rem] leading-snug"
                      >
                        <Check
                          className="text-gold mt-0.5 size-4 shrink-0"
                          strokeWidth={2.25}
                          aria-hidden
                        />
                        <span className="on-dark-muted">{madde}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Calisir gibi gorunup hicbir sey yapmayan bir dugme
                      kullaniciya kendi hatasi hissi verir; kapali olan acikca
                      kapali duruyor (bkz. kok CLAUDE.md ders 8). */}
                  <div className="mt-8">
                    {paket.acik ? (
                      <Link
                        href="/#dene"
                        className="press bg-gold hover:bg-gold-soft flex min-h-11 items-center justify-center rounded-full px-5 text-[0.9375rem] font-medium text-black transition-colors"
                      >
                        Hemen deneyin
                      </Link>
                    ) : (
                      <span className="flex min-h-11 items-center justify-center rounded-full text-[0.9375rem] ring-1 ring-white/12">
                        <span className="on-dark-muted">Yakında</span>
                      </span>
                    )}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={300}>
            <p className="fine-print on-dark-muted mt-10 flex items-center justify-center gap-2">
              <Sparkles className="size-3.5" strokeWidth={1.75} aria-hidden />
              Fiyatlar belirlendiğinde burada duyurulacak.
            </p>
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
