"use client";

/**
 * Zemin galerisinin kategori sekmeleri ve kartlari. Her kart: kutuphaneden
 * bir zemin + ustunde acilis vitrinindeki yuzugun kesimi + temas golgesi.
 * Stüdyonun yaptigi seyin kucuk bir onizlemesi — ayni urun, farkli vitrin.
 */

import Image from "next/image";
import { useState } from "react";

import { BACKGROUND_CATEGORIES, type BackgroundCategory } from "@/lib/background-categories";
import { heroAsset } from "@/lib/hero-asset";
import { closeSrc, HERO_SCENES } from "@/lib/hero-scenes";
import gallery from "@/lib/home-gallery.json";
import { cn } from "@/lib/utils";
import { SlidingPill } from "@/components/marketing/sliding-pill";

const GALLERY = gallery as Record<BackgroundCategory, string[]>;
const RING = HERO_SCENES[0];

export function BackgroundsGallery() {
  const [category, setCategory] = useState<BackgroundCategory>("sade");
  const ring = closeSrc(RING).after;

  return (
    <div className="mt-8 sm:mt-10">
      {/* Secili sekmenin vurgusu bir sekmeden otekine KAYAR (Kaan, 03.10.2026). */}
      <div role="tablist" aria-label="Zemin kategorileri" className="group/pills relative flex flex-wrap gap-2">
        <SlidingPill activeKey={category} className="bg-[#1a1917]" />
        {BACKGROUND_CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-pill-key={item.id}
            aria-selected={category === item.id}
            onClick={() => setCategory(item.id)}
            className={cn(
              "press relative z-10 h-10 rounded-full px-5 text-[0.9375rem] font-medium transition-colors duration-[560ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
              category === item.id
                ? "bg-[#1a1917] text-[#f3f0eb] group-data-[pill=on]/pills:bg-transparent"
                : "bg-black/[0.05] text-[#1a1917] hover:bg-black/[0.09]",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <ul
        key={category}
        role="tabpanel"
        aria-label={BACKGROUND_CATEGORIES.find((item) => item.id === category)?.label}
        className="mobile-rail soft-fade mt-6 grid gap-4 sm:grid-cols-3 sm:gap-5"
      >
        {GALLERY[category].map((id) => (
          <li key={id}>
            <figure className="group relative aspect-[4/3] overflow-hidden rounded-[1.25rem] ring-1 ring-black/[0.06]">
              <Image
                src={heroAsset(`zemin/galeri/${id}.webp`)}
                alt=""
                fill
                sizes="(max-width: 640px) 88vw, 30vw"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
              />
              {/* Temas golgesi: yuzuk zemine oturuyormus gibi. */}
              <span
                aria-hidden
                className="absolute bottom-[13%] left-1/2 h-[4%] w-[26%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(0,0,0,0.45),transparent)] blur-[3px]"
              />
              <Image
                src={ring}
                alt="Arka planı kaldırılmış tek taş yüzük, bu zeminin üzerinde"
                width={RING.close.width}
                height={RING.close.height}
                sizes="(max-width: 640px) 40vw, 12vw"
                className="absolute bottom-[14%] left-1/2 h-[72%] w-auto -translate-x-1/2 drop-shadow-[0_10px_18px_rgba(0,0,0,0.25)]"
              />
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}
