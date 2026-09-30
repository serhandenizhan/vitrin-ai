"use client";

/**
 * Etkilesimli once/sonra (one alinan is, 13.09.2026 — ROADMAP Faz 4 altindaki
 * 9. madde onerisi 5). 28.09.2026'dan beri acilis vitrininin yakinlasma
 * gorunumunde, her sahnenin kendi gorsel cifti ile (`hero-zoom.tsx`).
 *
 * Ziyaretci daha fotograf yuklemeden aracin sonucunu KENDI ELIYLE surukleyerek
 * goruyor. Iki gorsel GERCEK ve BIREBIR HIZALI olmali: "sonra", "once"nin
 * AYNI kadrajindan BiRefNet'in urettigi kesim (bkz.
 * scripts/prepare-hero-scenes.py). Hizasiz bir cift kullanilsaydi urun iki
 * tarafta farkli yerde durur ve karsilastirma yaniltici olurdu.
 *
 * Inceleme ekranindaki `OnceSonra` (comparison-view.tsx) ile ayni teknik:
 * ustteki gorsel `clip-path` ile kirpiliyor, olceklenmiyor — iki taraf ayni
 * pikselde kaliyor. Buyutec yok: burasi tanitim, inceleme degil.
 *
 * Klavye: gorunmez degil, gorsel olarak ince bir kaydirac var; odaklaninca ok
 * tuslariyla cizgi tasiniyor.
 */

import { useCallback, useRef, useState } from "react";
import Image from "next/image";

type HeroBeforeAfterProps = {
  before: string;
  after: string;
  beforeAlt: string;
  afterAlt: string;
  width: number;
  height: number;
  /** `next/image` icin; kaydiracin ekrandaki genisligi. */
  sizes?: string;
  /**
   * Cerceve bundan daha dikey olmaz (en / boy). Cok dikey bir gorsel
   * (kolye) daralip etiketleri ust uste bindiriyordu; o zaman gorsel
   * ustten kirpilir, alt kenar (tas) korunur.
   */
  minAspect?: number;
};

export function HeroBeforeAfter({
  before,
  after,
  beforeAlt,
  afterAlt,
  width,
  height,
  sizes = "(max-width: 1024px) 90vw, 420px",
  minAspect = 0,
}: HeroBeforeAfterProps) {
  const aspect = Math.max(width / height, minAspect);
  const cropped = aspect > width / height;
  const [ratio, setRatio] = useState(0.5);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Surukleme durumu REF'te: `pointermove` icinde state okunsaydi kapanis eski
  // degeri gorur ve ilk hareket yutulurdu (comparison-view.tsx ile ayni ders).
  const isDraggingRef = useRef(false);

  const updateFromPointer = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const box = container.getBoundingClientRect();
    if (box.width === 0) return;
    setRatio(Math.min(1, Math.max(0, (clientX - box.left) / box.width)));
  }, []);

  return (
    <div>
      <div
        ref={containerRef}
        style={{ aspectRatio: cropped ? String(aspect) : `${width} / ${height}` }}
        className="relative w-full cursor-ew-resize touch-none overflow-hidden rounded-2xl border border-white/12 shadow-2xl select-none"
        onPointerDown={(event) => {
          isDraggingRef.current = true;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Bazi tarayici/girdi kombinasyonlarinda reddediliyor; yakalamasiz
            // da surukleme calisiyor.
          }
          updateFromPointer(event.clientX);
        }}
        onPointerMove={(event) => {
          if (isDraggingRef.current) updateFromPointer(event.clientX);
        }}
        onPointerUp={() => {
          isDraggingRef.current = false;
        }}
        onPointerCancel={() => {
          isDraggingRef.current = false;
        }}
      >
        <Image
          src={before}
          alt={beforeAlt}
          width={width}
          height={height}
          draggable={false}
          sizes={sizes}
          style={cropped ? { objectPosition: "50% 100%" } : undefined}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Kesim saydam: dama deseni uzerinde, arka planin gercekten gittigi
            gorulsun. Kirpma soldan; cizginin solu kesim, sagi ozgun. */}
        <Image
          src={after}
          alt={afterAlt}
          width={width}
          height={height}
          draggable={false}
          sizes={sizes}
          style={{ clipPath: `inset(0 ${(1 - ratio) * 100}% 0 0)`, objectPosition: cropped ? "50% 100%" : undefined }}
          className="checkerboard absolute inset-0 h-full w-full object-cover"
        />

        <div
          aria-hidden
          style={{ left: `${ratio * 100}%` }}
          className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.2)]"
        >
          <span className="absolute top-1/2 left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg">
            <svg viewBox="0 0 24 24" className="size-4" fill="none">
              <path
                d="M9 7 4.5 12 9 17M15 7l4.5 5-4.5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>

        <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[0.5625rem] font-medium tracking-[0.06em] text-white uppercase backdrop-blur-sm md:top-3 md:left-3 md:px-2.5 md:py-1 md:text-[0.625rem] md:tracking-[0.08em]">
          Kesim
        </span>
        <span className="bg-gold pointer-events-none absolute top-2 right-2 rounded-full px-2 py-0.5 text-[0.5625rem] font-medium tracking-[0.06em] text-black uppercase md:top-3 md:right-3 md:px-2.5 md:py-1 md:text-[0.625rem] md:tracking-[0.08em]">
          Özgün
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(ratio * 100)}
        onChange={(event) => setRatio(Number(event.target.value) / 100)}
        aria-label="Önce ve sonra arasındaki çizgi"
        // Yerel kaydirac, 24 px yukseklik: `appearance-none` + `h-1` hem
        // tutamaci Chrome'da gizliyor hem dokunma alanini 4 px'e indiriyordu.
        className="accent-gold mt-2 h-6 w-full cursor-pointer"
      />
    </div>
  );
}
