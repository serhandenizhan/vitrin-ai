/**
 * Ana sayfadaki kisa "Sik sorulanlar". Her cevap projenin dogrulanmis bir
 * gercegine dayanir (yasal metinler, stüdyo secenekleri, bilinen sinirlama);
 * rakam iceren sorular (kota, fiyat) Paketler sayfasina yonlendirir, burada
 * elle yazilmis bir sayi eskimesin.
 *
 * `<details>` ile: JavaScript'siz acilir kapanir, sunucu bileseni.
 */

import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { Reveal } from "@/components/reveal";

const QUESTIONS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Ücretsiz deneyebilir miyim?",
    a: (
      <>
        Evet. Ücretsiz bir hesap açtığınızda deneme hakkınız tanımlanır; ne kadar kaldığını
        hesabınızda görürsünüz. Planlar ve krediler{" "}
        <Link href="/paketler" className="text-gold underline-offset-4 hover:underline">
          Paketler
        </Link>{" "}
        sayfasında.
      </>
    ),
  },
  {
    q: "Fotoğraflarım nerede saklanıyor?",
    a: "Özgün fotoğrafınız yalnızca arka planı kaldırmak için işlenir ve çalışma geçmişinize kaydedilmez. Geçmiş açıksa hesabınızda yalnızca sonuç ve küçük önizleme saklanır; dilediğiniz zaman silebilirsiniz.",
  },
  {
    q: "iPhone fotoğrafı (HEIC) yükleyebilir miyim?",
    a: "Evet. iPhone'un HEIC dosyasını dönüştürmeden yükleyin. JPEG, PNG ve WebP de desteklenir; dosya başına 20 MB'a kadar.",
  },
  {
    q: "Ürünü elimde tutarak çekersem olur mu?",
    a: "En temiz sonuç ürün tek başına çekildiğinde alınır. Elde tutulan üründe el bazen kesimde kalır, parmağın örttüğü kısımlar da eksik çıkar. Çekim rehberinde birkaç basit öneri var.",
  },
  {
    q: "Hangi boyutlarda indirebilirim?",
    a: "Katalog için A4, Instagram için gönderi, dikey ve hikâye, pazaryeri için beyaz zeminli 2000×2000. Birkaç boyutu tek seferde indirebilirsiniz.",
  },
  {
    q: "Baskıya uygun (CMYK) çıktı ne demek?",
    a: "Ekranda gördüğünüz renkler matbaada olduğu gibi basılamaz; matbaa dosyanın kendi renk sistemine (CMYK) çevrilmiş olmasını ister. Bu çevirmeyi sunucuda yapıyoruz.",
  },
];

export function HomeFaq() {
  return (
    <section id="sss" className="surface-charcoal section-rhythm relative overflow-hidden">
      <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <Reveal>
          <h2 className="display-section text-balance">Sık sorulanlar</h2>
          <p className="lede on-dark-muted mt-4 max-w-sm text-pretty">
            Burada olmayan bir sorunuz mu var?{" "}
            <Link href="/destek" className="text-gold underline-offset-4 hover:underline">
              Destek sayfasından
            </Link>{" "}
            yazın.
          </p>
        </Reveal>
        <Reveal delay={80}>
          <div className="divide-y divide-white/10 border-y border-white/10">
            {QUESTIONS.map((item) => (
              <details key={item.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[1.0625rem] font-semibold tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <ChevronDown
                    className="size-5 shrink-0 text-[#f3f0eb]/50 transition-transform duration-300 group-open:rotate-180"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </summary>
                <p className="on-dark-muted -mt-1 pb-5 text-[0.9375rem] leading-relaxed text-pretty">{item.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
