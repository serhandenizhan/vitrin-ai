import type { Metadata } from "next";
import Link from "next/link";

import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Ürün Çekim Rehberi — Vitrin AI",
  description: "Takı fotoğraflarında temiz arka plan kaldırma sonucu için çekim önerileri.",
};

const STEPS = [
  ["Zemini sadeleştirin", "Ürünle benzer renkte olmayan, düz ve desensiz bir zemin seçin. İnce zinciri karmaşık kumaş üzerinde çekmeyin."],
  ["Işığı yumuşatın", "Pencere ışığı veya difüz bir lamba kullanın. Sert flaş, metalde patlayan beyaz alanlar ve taş çevresinde keskin gölgeler oluşturur."],
  ["Ürünü ayırın", "Ürünün tamamını kadraja alın ve kenarlarda boşluk bırakın. Birden fazla takıyı birbirine değecek biçimde yığmayın."],
  ["Elinizi kadrajdan çıkarın", "Model eldeki ürünü ve eli her zaman ayıramaz. Ürünü stand, misina veya sade bir yüzeyle sabitleyin."],
  ["Netliği kontrol edin", "Kamerayı ürüne dokunarak netleyin, lensi temizleyin ve telefonu mümkünse iki elle sabit tutun."],
  ["Özgün dosyayı yükleyin", "Ekran görüntüsü yerine kameranın JPEG, PNG, WebP veya HEIC dosyasını kullanın. En fazla 20 MB yükleyebilirsiniz."],
] as const;

export default function ShootingGuidePage() {
  return (
    <SiteShell>
      <section className="surface-charcoal section-rhythm page-top">
        {/* Diger sayfalarla ayni giris animasyonu (Kaan, 17.09.2026: rehberde yoktu). */}
        <Reveal className="mx-auto w-full max-w-5xl px-5">
          <p className="text-gold text-[0.75rem] font-semibold tracking-[0.12em] uppercase">
            Çekim rehberi
          </p>
          <h1 className="display-section mt-3 max-w-3xl text-balance">
            Temiz bir kesim, doğru çekimle başlar
          </h1>
          <p className="lede on-dark-muted mt-5 max-w-2xl">
            Stüdyo ekipmanı gerekmez. Telefon, sade bir zemin ve birkaç küçük ayar çoğu
            üründe sonucu belirgin biçimde iyileştirir.
          </p>
        </Reveal>
      </section>

      <section className="surface-mist section-rhythm">
        <div className="mx-auto w-full max-w-5xl px-5">
          {/* Genis ekranda kartlar. */}
          <div className="hidden gap-4 sm:grid sm:grid-cols-2">
          {STEPS.map(([title, text], index) => (
            <Reveal key={title} delay={index * 60} className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
              <span className="text-gold text-[0.75rem] font-semibold tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h2 className="mt-3 text-[1.25rem] font-semibold tracking-[-0.015em]">{title}</h2>
              <p className="on-light-muted mt-2 text-[0.9375rem] leading-relaxed">{text}</p>
            </Reveal>
          ))}
          </div>
          {/* Telefonda acilir basliklar (Kaan, 17.09.2026): alti kart alt alta
              cok uzuyordu, yana kaydirma da yoruyordu. Ilki acik geliyor. */}
          <div className="divide-y divide-black/8 overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 sm:hidden">
          {STEPS.map(([title, text], index) => (
            <details key={title} open={index === 0} className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
                <span className="text-gold w-6 text-[0.75rem] font-semibold tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 text-[1rem] font-semibold tracking-[-0.01em]">{title}</span>
                <span aria-hidden className="text-black/40 transition-transform group-open:rotate-45 text-[1.25rem] leading-none">+</span>
              </summary>
              <p className="on-light-muted px-4 pb-4 pl-13 text-[0.9375rem] leading-relaxed">{text}</p>
            </details>
          ))}
          </div>
        </div>
      </section>

      <section className="surface-white section-rhythm">
        <Reveal className="mx-auto w-full max-w-3xl px-5 text-center">
          <h2 className="display-feature text-balance">Çekmeden önce son kontrol</h2>
          <p className="on-light-muted mt-4">
            Ürün tamamen görünür, kenarlar net, ışık dengeli ve el kadrajın dışındaysa
            hazırsınız.
          </p>
          <Link
            href="/#dene"
            className="press bg-foreground text-background mt-7 inline-flex min-h-11 items-center rounded-full px-6 text-[0.9375rem] font-medium"
          >
            Fotoğrafı deneyin
          </Link>
        </Reveal>
      </section>
    </SiteShell>
  );
}
