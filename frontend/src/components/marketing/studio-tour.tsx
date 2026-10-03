"use client";

/**
 * Stüdyo turu — "kesimden sonrasi" (30.09.2026).
 *
 * Ana sayfa yalniz arka plan kaldirmayi anlatiyordu; urunun ikinci yarisi
 * (zemin, isik, marka, boyut, teslim) hic gorunmuyordu. Bu bolum stüdyonun
 * yaptiklarini CANLI bir onizlemeyle gosterir: solda bes ozellik, sagda
 * gercek varliklarla kurulmus kucuk bir sahne (kutuphaneden zeminler,
 * aracin urettigi yuzuk kesimi). Secilen ozellik sahneyi degistirir;
 * kendiliginden hareket yok, her degisim bir tiklamanin cevabi.
 *
 * Bu bir MAKET degil ama stüdyonun kendisi de degil: sahne DOM'da kurulur
 * (tuval/Konva yuklenmez). Degerler stüdyonun gercek secenekleriyle ayni:
 * bicimler `OUTPUT_FORMATS`, etiket bicimi stüdyodaki tek satir etiket.
 */

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { Check } from "lucide-react";

import { backdropSrc, backdropSwatchSrc, HERO_BACKDROPS, type HeroBackdrop } from "@/lib/hero-backdrops";
import { closeSrc, HERO_SCENES } from "@/lib/hero-scenes";
import { OUTPUT_FORMATS, type OutputFormatName } from "@/lib/composition";
import { cn } from "@/lib/utils";
import { SlidingPill } from "@/components/marketing/sliding-pill";

type FeatureId = "zemin" | "isik" | "marka" | "boyut" | "teslim";

const FEATURES: { id: FeatureId; title: string; text: string }[] = [
  {
    id: "zemin",
    title: "Zemini seçin",
    text: "Sade renklerden kadifeye, mermerden doğal dekorlara kadar hazır bir kütüphane. Ürün zemine kendiliğinden oturur.",
  },
  {
    id: "isik",
    title: "Gölge ve yansıma",
    text: "Tek dokunuşla gölge ve ayna yansıması. Boyutunu, yoğunluğunu ve ürüne uzaklığını ayarlayın.",
  },
  {
    id: "marka",
    title: "Logonuz ve etiketiniz",
    text: "Logonuzu köşeye koyun; ayar, gram ve ürün kodunu tek satırlık bir etiketle yazın. Her çıktıda aynı yerde durur.",
  },
  {
    id: "boyut",
    title: "Her yere uygun boyut",
    text: "Katalog için A4, Instagram için gönderi ve hikâye, pazaryeri için beyaz zeminli kare. Birkaç boyutu tek seferde indirin.",
  },
  {
    id: "teslim",
    title: "Baskıya ve paylaşıma hazır",
    text: "Ekran için PNG ve JPEG, matbaa için baskıya uygun CMYK. Telefonda doğrudan WhatsApp'ta paylaşın.",
  },
];

/** Onizlemede secilebilen bicimler ve oranlari (stüdyonun kendi olculeri). */
const FORMATS: { id: OutputFormatName; label: string }[] = [
  { id: "catalog", label: "Katalog" },
  { id: "instagramPortrait", label: "Instagram" },
  { id: "instagramStory", label: "Hikâye" },
  { id: "marketplace", label: "Pazaryeri" },
];

const RING = HERO_SCENES[0];
const PREVIEW_BACKDROPS = HERO_BACKDROPS.filter((item) =>
  ["kum-tas", "yesil-kadife", "siyah-su", "mermer"].includes(item.id),
);

export function StudioTour() {
  const [feature, setFeature] = useState<FeatureId>("zemin");
  const [backdrop, setBackdrop] = useState<HeroBackdrop>(PREVIEW_BACKDROPS[0]);
  const [shadow, setShadow] = useState(true);
  const [reflection, setReflection] = useState(false);
  const [format, setFormat] = useState<OutputFormatName>("instagramPortrait");

  // Ozellik secilince sahne o ozelligi gosterecek hale gelir; kullanicinin
  // yaptigi ayarlar (zemin, isik) korunur.
  const choose = (id: FeatureId) => {
    setFeature(id);
    if (id === "isik") setReflection(true);
    if (id === "boyut" && format === "instagramPortrait") setFormat("catalog");
  };

  const marketplace = format === "marketplace";
  const branded = feature === "marka" || feature === "boyut" || feature === "teslim";
  const aspect = OUTPUT_FORMATS[format].outputWidth / OUTPUT_FORMATS[format].outputHeight;

  return (
    <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 md:mt-14 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-10 lg:gap-14">
      {/* Dar ekranda ozellikler onizlemenin USTUNDE yatay basliklar: dikey
          liste tek sutunda bir ekran boyu yer kapliyor, onizleme ekranin
          altinda kaliyordu ve bolum bos gorunuyordu (Serhan, Safari'de). */}
      <div className="md:hidden">
        <div role="tablist" aria-label="Stüdyo özellikleri" className="group/pills relative -mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <SlidingPill activeKey={feature} className="bg-[#f3f0eb]" />
          {FEATURES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              data-pill-key={item.id}
              aria-selected={item.id === feature}
              onClick={() => choose(item.id)}
              className={cn(
                "press relative z-10 h-10 shrink-0 rounded-full px-4 text-[0.875rem] font-medium whitespace-nowrap ring-1 transition-colors duration-[560ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
                item.id === feature
                  ? "bg-[#f3f0eb] text-[#1a1917] ring-transparent group-data-[pill=on]/pills:bg-transparent"
                  : "bg-white/[0.04] text-[#f3f0eb]/75 ring-white/12",
              )}
            >
              {item.title}
            </button>
          ))}
        </div>
        <p key={feature} className="on-dark-muted soft-fade mt-4 text-[0.9375rem] leading-relaxed text-pretty">
          {FEATURES.find((item) => item.id === feature)?.text}
        </p>
      </div>

      <ul role="tablist" aria-label="Stüdyo özellikleri" aria-orientation="vertical" className="hidden flex-col md:flex">
        {FEATURES.map((item) => {
          const active = item.id === feature;
          return (
            <li key={item.id} className="border-t border-white/10 last:border-b">
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => choose(item.id)}
                className="group flex w-full items-start gap-4 py-5 text-left"
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-2 h-2 w-2 shrink-0 rounded-full transition-colors duration-300",
                    active ? "bg-gold" : "bg-white/20 group-hover:bg-white/40",
                  )}
                />
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-[1.1875rem] font-semibold tracking-[-0.01em] transition-colors duration-300",
                      active ? "text-[#f3f0eb]" : "text-[#f3f0eb]/55 group-hover:text-[#f3f0eb]/85",
                    )}
                  >
                    {item.title}
                  </span>
                  {/* Aciklama yalniz secili maddede: liste kisa ve taranir kalir. */}
                  <span
                    className={cn(
                      "on-dark-muted grid text-[0.9375rem] leading-relaxed transition-[grid-template-rows,opacity,margin] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
                      active ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                    )}
                  >
                    <span className="overflow-hidden text-pretty">{item.text}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Onizleme: sabit yukseklikli bir sahne, icinde bicime gore
          genisligi degisen cerceve. */}
      <div className="flex flex-col items-center">
        <div className="studio-tour-stage relative flex w-full items-center justify-center rounded-[1.75rem] bg-white/[0.03] p-5 ring-1 ring-white/10 sm:p-8">
          <div
            className="studio-tour-frame relative overflow-hidden rounded-[0.9rem] shadow-[0_40px_80px_-40px_rgba(0,0,0,0.9)]"
            style={{ ["--studio-tour-aspect" as string]: aspect } as CSSProperties}
          >
            {/* Zeminler ust uste; secilen belirir (capraz gecis). */}
            <div className={cn("absolute inset-0 bg-white transition-opacity duration-500", marketplace ? "opacity-100" : "opacity-0")} />
            {PREVIEW_BACKDROPS.map((item) => (
              <Image
                key={item.id}
                src={backdropSrc(item)}
                alt=""
                fill
                sizes="(max-width: 1024px) 90vw, 40vw"
                className={cn(
                  "object-cover transition-opacity duration-500",
                  !marketplace && item.id === backdrop.id ? "opacity-100" : "opacity-0",
                )}
              />
            ))}

            {/* Urun: yuzuk kesimi, golge ve yansima. */}
            <div className="absolute inset-x-0 bottom-[16%] flex h-[46%] flex-col items-center">
              <div className="relative h-full min-h-0">
                <Image
                  src={closeSrc(RING).after}
                  alt="Arka planı kaldırılmış tek taş yüzük"
                  width={RING.close.width}
                  height={RING.close.height}
                  sizes="30vw"
                  className="relative z-10 h-full w-auto"
                />
                <span
                  aria-hidden
                  className={cn(
                    "absolute -bottom-[3%] left-1/2 h-[7%] w-[70%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(0,0,0,0.55),transparent)] blur-[4px] transition-opacity duration-500",
                    shadow ? "opacity-100" : "opacity-0",
                  )}
                />
                <Image
                  src={closeSrc(RING).after}
                  alt=""
                  aria-hidden
                  width={RING.close.width}
                  height={RING.close.height}
                  sizes="30vw"
                  className={cn(
                    "studio-tour-reflection absolute top-full left-0 h-full w-auto transition-opacity duration-500",
                    reflection && !marketplace ? "opacity-35" : "opacity-0",
                  )}
                />
              </div>
            </div>

            {/* Marka: logo ve etiket. */}
            <div
              className={cn(
                "pointer-events-none absolute inset-0 transition-opacity duration-500",
                branded ? "opacity-100" : "opacity-0",
                marketplace || backdrop.light ? "text-[#1a1917]" : "text-[#f3f0eb]",
              )}
            >
              <span className="absolute top-[5%] left-[6%] flex items-center gap-2">
                <span className="flex size-[1.9em] items-center justify-center rounded-full border border-current text-[0.7rem] font-semibold">
                  N
                </span>
                <span className="text-[0.6875rem] font-semibold tracking-[0.12em]">NUR KUYUMCULUK</span>
              </span>
              <span className="absolute right-[6%] bottom-[5%] text-[0.6875rem] font-medium opacity-90">
                22 ayar · 3,4 gr · YZ-1024
              </span>
            </div>

            {/* Teslim: cikti dosyalari. */}
            <div
              className={cn(
                "absolute inset-x-[6%] top-[13%] flex flex-wrap justify-center gap-1.5 transition-[opacity,transform] duration-500",
                feature === "teslim" ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
              )}
              aria-hidden={feature !== "teslim"}
            >
              {["PNG", "JPEG", "CMYK · baskı", "WhatsApp"].map((label) => (
                <span
                  key={label}
                  className="flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[0.6875rem] font-medium text-white backdrop-blur-md"
                >
                  <Check className="text-gold size-3" strokeWidth={2.5} aria-hidden />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Onizlemenin denetimleri: secili ozellige gore. `key`: ozellik
            degisince satir yeni bir dugum olur ve `soft-fade` yeniden oynar
            (ayni dugum kalsaydi animasyon hic oynamazdi — ders 29). Ozellikler
            arasi gecis "tak" diye olmasin (Kaan, 03.10.2026). */}
        <div key={feature} className="soft-fade mt-5 flex min-h-12 flex-wrap items-center justify-center gap-2">
          {feature === "zemin"
            ? PREVIEW_BACKDROPS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setBackdrop(item)}
                  aria-pressed={item.id === backdrop.id}
                  aria-label={item.name}
                  title={item.name}
                  className={cn(
                    "size-11 overflow-hidden rounded-xl ring-1 transition-[box-shadow]",
                    item.id === backdrop.id ? "ring-2 ring-[#f0c779]" : "ring-white/15 hover:ring-white/40",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- 2-3 KB'lik kucuk resim */}
                  <img src={backdropSwatchSrc(item)} alt="" className="h-full w-full object-cover" />
                </button>
              ))
            : null}
          {feature === "isik" ? (
            <>
              <Toggle label="Gölge" on={shadow} onChange={setShadow} />
              <Toggle label="Yansıma" on={reflection} onChange={setReflection} />
            </>
          ) : null}
          {feature === "boyut" ? (
            <div className="group/pills relative flex flex-wrap justify-center gap-2">
              <SlidingPill activeKey={format} className="bg-[#f3f0eb]" />
              {FORMATS.map((item) => (
                <Toggle key={item.id} pillKey={item.id} label={item.label} on={format === item.id} onChange={() => setFormat(item.id)} />
              ))}
            </div>
          ) : null}
          {feature === "marka" || feature === "teslim" ? (
            <p className="fine-print on-dark-muted">
              {feature === "marka" ? "Örnek logo ve etiket; stüdyoda kendi logonuzu yüklersiniz." : "Stüdyodan tek dokunuşla."}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** `pillKey`: tekli secim satirinda kayan vurgunun (SlidingPill) hedefi. */
function Toggle({ label, on, onChange, pillKey }: { label: string; on: boolean; onChange: (value: boolean) => void; pillKey?: string }) {
  return (
    <button
      type="button"
      data-pill-key={pillKey}
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={cn(
        "press relative z-10 h-10 rounded-full px-4 text-[0.875rem] font-medium ring-1 transition-colors duration-[560ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
        on ? "bg-[#f3f0eb] text-[#1a1917] ring-transparent group-data-[pill=on]/pills:bg-transparent" : "bg-white/[0.04] text-[#f3f0eb]/80 ring-white/12 hover:bg-white/10",
      )}
    >
      {label}
    </button>
  );
}
