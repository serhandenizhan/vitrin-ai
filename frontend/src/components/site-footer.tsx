/**
 * Alt bilgi.
 *
 * 11.09.2026'da genisletildi (kullanici istegi): marka, sayfa baglantilari,
 * yasal metinler, sosyal medya ve telif satiri.
 *
 * SOSYAL MEDYA ADRESLERI HENUZ YOK. Kullanici sonra ekleyecek; o zamana kadar
 * `href: null` olan simgeler tiklanamaz durumda gorunuyor. Bos bir "#"
 * baglantisi sayfayi basa firlatirdi ve kullaniciya bozuk bir dugme hissi
 * verirdi (kok CLAUDE.md ders 8). Adres eklemek icin yalnizca SOSYAL
 * dizisindeki `href` doldurulur.
 *
 * YASAL METINLER DE HENUZ YAZILMADI (KVKK aydinlatma metni, gizlilik, kullanim
 * kosullari). Turkiye'de ticari bir site icin bunlar zorunlu; yerleri ayrildi
 * ve "yakinda" olarak isaretli. Odeme (Faz 5) acilmadan once yazilmalari
 * gerekiyor.
 *
 * Model sinirlamalarina dair dipnotlar korunuyor: bir aracin ne YAPAMADIGINI
 * soylemek, ilk basarisiz denemede guven kaybini onluyor.
 *
 * Sunucu bileseni: istemciye hic inmiyor.
 */

import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

const NOTES = [
  "İşlem süresi fotoğrafın boyutuna ve sunucunun o anki yoğunluğuna göre değişir.",
  "Ürün elde tutularak çekildiğinde el bazen kesimde kalır, bazen kalkar. En iyi sonuç için ürünü tek başına çekin.",
  "Parmak ya da başka bir nesnenin kapattığı kısımlar kesimde de eksik kalır.",
];

const SUTUNLAR: {
  baslik: string;
  ogeler: { label: string; href: string | null }[];
}[] = [
  {
    baslik: "Ürün",
    ogeler: [
      { label: "Deneyin", href: "/#dene" },
      { label: "Zeminler", href: "/#zeminler" },
      { label: "Nasıl çalışır", href: "/#nasil" },
      { label: "Teknik bilgiler", href: "/#teknik" },
    ],
  },
  {
    baslik: "Sayfalar",
    ogeler: [
      { label: "Katalog", href: "/katalog" },
      { label: "Paketler", href: "/paketler" },
    ],
  },
  {
    baslik: "Yasal",
    ogeler: [
      { label: "KVKK aydınlatma metni", href: null },
      { label: "Gizlilik politikası", href: null },
      { label: "Kullanım koşulları", href: null },
    ],
  },
];

/** Simgeler elle cizildi: lucide-react 1.x marka simgelerini kaldirdi. */
const SOSYAL: { ad: string; href: string | null; simge: React.ReactNode }[] = [
  {
    ad: "Instagram",
    href: null,
    simge: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="3.8" />
        <circle cx="17.1" cy="6.9" r="0.9" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    ad: "TikTok",
    href: null,
    simge: (
      <path d="M14 3.8v10.7a3.6 3.6 0 1 1-3.6-3.6M14 3.8c.4 2.6 2.2 4.3 5 4.5" />
    ),
  },
  {
    ad: "YouTube",
    href: null,
    simge: (
      <>
        <rect x="2.8" y="5.8" width="18.4" height="12.4" rx="4" />
        <path d="M10.4 9.4v5.2l4.4-2.6z" fill="currentColor" />
      </>
    ),
  },
  {
    ad: "LinkedIn",
    href: null,
    simge: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
        <path d="M8.2 10.5v6M12 16.5v-6m0 2.8c0-1.7 1.1-2.9 2.6-2.9s2.4 1.1 2.4 2.9v3.2" />
        <circle cx="8.2" cy="7.6" r="0.8" fill="currentColor" stroke="none" />
      </>
    ),
  },
];

export function SiteFooter() {
  return (
    <footer className="surface-charcoal">
      <div className="mx-auto w-full max-w-6xl px-5 pt-16 pb-8">
        <div className="grid gap-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Link href="/#top" className="inline-flex items-center gap-2.5">
              <BrandMark className="text-gold h-7 w-auto" />
              <span className="text-[1.125rem] font-semibold tracking-[-0.015em]">
                Vitrin AI
              </span>
            </Link>
            <p className="fine-print on-dark-muted mt-4 max-w-xs text-pretty">
              Kuyumcular için ürün fotoğrafı aracı. Arka planı kaldırın, zemini
              seçin, satışa hazır görseli indirin.
            </p>

            <ul className="mt-6 flex gap-2">
              {SOSYAL.map((hesap) => (
                <li key={hesap.ad}>
                  <a
                    href={hesap.href ?? undefined}
                    target={hesap.href ? "_blank" : undefined}
                    rel={hesap.href ? "noopener noreferrer" : undefined}
                    aria-label={hesap.href ? hesap.ad : `${hesap.ad} (yakında)`}
                    title={hesap.href ? hesap.ad : `${hesap.ad} yakında`}
                    aria-disabled={hesap.href ? undefined : true}
                    className={
                      "flex size-10 items-center justify-center rounded-full ring-1 ring-white/12 transition-colors " +
                      (hesap.href
                        ? "text-[#f3f0eb]/80 hover:bg-white/10 hover:text-[#f3f0eb]"
                        : "cursor-default text-[#f3f0eb]/40")
                    }
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="size-[1.1rem]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      {hesap.simge}
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {SUTUNLAR.map((sutun) => (
            <nav key={sutun.baslik} aria-label={sutun.baslik}>
              <h2 className="text-[0.875rem] font-semibold">{sutun.baslik}</h2>
              <ul className="mt-4 space-y-2.5">
                {sutun.ogeler.map((oge) => (
                  <li key={oge.label} className="fine-print">
                    {oge.href ? (
                      <Link
                        href={oge.href}
                        className="on-dark-muted transition-colors hover:text-[#f3f0eb]"
                      >
                        {oge.label}
                      </Link>
                    ) : (
                      <span className="text-[#f3f0eb]/35">
                        {oge.label}
                        <span className="ml-1.5 text-[0.75rem]">(yakında)</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <ol className="mt-14 space-y-1.5 border-t border-white/10 pt-6 text-[#f3f0eb]/45">
          {NOTES.map((note, index) => (
            <li key={note} className="flex gap-2 text-[0.75rem] leading-relaxed">
              <span className="shrink-0 tabular-nums">{index + 1}.</span>
              <span className="text-pretty">{note}</span>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-col gap-2 text-[0.75rem] text-[#f3f0eb]/45 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Vitrin AI. Tüm hakları saklıdır.</p>
          <p>Türkiye&apos;deki kuyumcular için geliştiriliyor.</p>
        </div>
      </div>
    </footer>
  );
}
