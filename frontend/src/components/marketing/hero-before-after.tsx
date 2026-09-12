"use client";

/**
 * Acilistaki etkilesimli once/sonra (one alinan is, 13.09.2026 — ROADMAP
 * Faz 4 altindaki 9. madde onerisi 5).
 *
 * Ziyaretci daha fotograf yuklemeden aracin sonucunu KENDI ELIYLE surukleyerek
 * goruyor. Iki gorsel GERCEK ve BIREBIR HIZALI:
 *  - `once.webp`: vitrin karesinin kendisi.
 *  - `sonra.webp`: ayni kareden BiRefNet'in urettigi kesim, ayni pencereden
 *    kirpilmis (bkz. scripts/prepare-before-after.py). Hizalama olculdu:
 *    kesimin opak piksellerinde ortalama renk farki ~2 (12 px kaydirildiginda
 *    ~25). Hizasiz bir cift kullanilsaydi kolye iki tarafta farkli yerde durur
 *    ve karsilastirma yaniltici olurdu.
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

export function HeroBeforeAfter() {
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
        className="relative aspect-square w-full cursor-ew-resize touch-none overflow-hidden rounded-2xl border border-white/12 shadow-2xl select-none"
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
          src="/showcase/once.webp"
          alt="Vitrin standında duran pırlanta kolyenin özgün fotoğrafı"
          width={900}
          height={900}
          priority
          draggable={false}
          sizes="(max-width: 1024px) 90vw, 560px"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Kesim saydam: dama deseni uzerinde, arka planin gercekten gittigi
            gorulsun. Kirpma soldan; cizginin solu kesim, sagi ozgun. */}
        <Image
          src="/showcase/sonra.webp"
          alt="Aynı fotoğraftan aracın ürettiği, arka planı kaldırılmış kesim"
          width={900}
          height={900}
          priority
          draggable={false}
          sizes="(max-width: 1024px) 90vw, 560px"
          style={{ clipPath: `inset(0 ${(1 - ratio) * 100}% 0 0)` }}
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

        <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[0.625rem] font-medium tracking-[0.08em] text-white uppercase backdrop-blur-sm">
          Kesim
        </span>
        <span className="bg-gold pointer-events-none absolute top-3 right-3 rounded-full px-2.5 py-1 text-[0.625rem] font-medium tracking-[0.08em] text-black uppercase">
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
        className="accent-gold mt-3 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15"
      />
    </div>
  );
}
