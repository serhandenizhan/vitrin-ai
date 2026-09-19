"use client";

/**
 * Yatay şeritlerin iki yanındaki cam oklar (Kaan, 18.09.2026: "sağa sola oklar bırak").
 *
 * Bir ok yalnızca o yönde gidilecek yer varsa görünür; her basış görünen
 * genişliğin ~%80'i kadar kaydırır (bir "sayfa", son kart bir sonraki sayfada
 * yine görünür kalsın diye tam genişlik değil). Durum kaydırma ve boyut
 * değişiminde güncellenir — efektin gövdesinde değil, olay geri çağrısında
 * (React Compiler efekt içi senkron `setState`'i kaskad render sayıyor).
 */

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function useScrollArrows(ref: RefObject<HTMLElement | null>) {
  const [edges, setEdges] = useState({ canLeft: false, canRight: false });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    function update() {
      const target = element!;
      const max = target.scrollWidth - target.clientWidth;
      const next = { canLeft: target.scrollLeft > 2, canRight: target.scrollLeft < max - 2 };
      setEdges((current) =>
        current.canLeft === next.canLeft && current.canRight === next.canRight ? current : next,
      );
    }
    const frame = requestAnimationFrame(update);
    element.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [ref]);

  function scrollPage(direction: -1 | 1) {
    const element = ref.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: "smooth" });
  }

  return { ...edges, scrollPage };
}

/**
 * Şeridi saran kutu. Oklar şeridin ÜSTÜNE binmez (Kaan, 19.09.2026: "oklar çok
 * kötü duruyor"): iki yanda ayrılmış kenar payında, şeritten bağımsız durur.
 * Gidilecek yer yoksa ok kaybolmaz, soluklaşır — kenar payı sabit kaldığı
 * için şerit de oklar belirip kaybolurken kıpırdamaz.
 */
export function ScrollArrows({
  targetRef,
  label,
  children,
}: {
  targetRef: RefObject<HTMLElement | null>;
  /** Okların erişilebilir adında kullanılır ("Önceki zeminler"). */
  label: string;
  children?: ReactNode;
}) {
  const { canLeft, canRight, scrollPage } = useScrollArrows(targetRef);
  const button =
    "press absolute top-1/2 z-20 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/8 text-[#f3f0eb] ring-1 ring-white/15 transition-[opacity,background-color] duration-200 hover:bg-white/16";
  return (
    <div className="relative px-9">
      {children}
      <button
        type="button"
        onClick={() => scrollPage(-1)}
        aria-label={`Önceki ${label}`}
        tabIndex={canLeft ? 0 : -1}
        aria-hidden={canLeft ? undefined : true}
        className={button + " left-1 " + (canLeft ? "opacity-100" : "pointer-events-none opacity-20")}
      >
        <ChevronLeft className="size-4" strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => scrollPage(1)}
        aria-label={`Sonraki ${label}`}
        tabIndex={canRight ? 0 : -1}
        aria-hidden={canRight ? undefined : true}
        className={button + " right-1 " + (canRight ? "opacity-100" : "pointer-events-none opacity-20")}
      >
        <ChevronRight className="size-4" strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
