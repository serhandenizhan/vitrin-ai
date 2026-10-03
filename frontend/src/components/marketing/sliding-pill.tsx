"use client";

/**
 * Seçili düğmenin altında KAYAN vurgu (ana sayfa; Kaan, 03.10.2026: "butonlar
 * arasına geçiş ekle"). Stüdyodaki `GlassLens`'in ana sayfa karşılığı: o koyu
 * cam ve yalnız yatay; burada vurgu bölümün kendi renginde ve sekmeler
 * telefonda iki satıra kırılabildiği için (`flex-wrap`) dikeyde de kayıyor.
 *
 * Kullanım: düğmelerin kapsayıcısı `relative group/pills`, vurgu onun DOĞRUDAN
 * çocuğu; her düğme `data-pill-key` ve `relative z-10`; seçili düğmenin kendi
 * arka planı `group-data-[pill=on]/pills:bg-transparent` ile şeffaflaşır —
 * yoksa vurgu kayarken yeni düğme kendi rengiyle anında boyanır ve kayma
 * GÖRÜNMEZ. Vurgu ölçülemezse kapsayıcıya `data-pill=on` yazılmaz; düğmelerin
 * kendi seçili rengi çalışır.
 *
 * Kapsayıcı `parentElement` ile bulunur, ebeveynden gelen bir ref ile DEĞİL:
 * düzen efektleri çocuktan ebeveyne çalıştığı için ilk açılışta ebeveynin
 * ref'i henüz bağlı olmuyordu; vurgu hiç ölçülmüyor, ilk tıklama sıçrıyordu
 * (ölçüldü, 03.10.2026). Kendi `span`'inin ref'i kendi efektinden önce bağlıdır.
 *
 * İlk konum GEÇİŞSİZ verilir: sayfa açılırken vurgu soldan kayarak gelmesin.
 */

import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Box = { x: number; y: number; width: number; height: number };

export function SlidingPill({
  activeKey,
  className,
}: {
  /** Seçili düğmenin `data-pill-key` değeri. */
  activeKey: string | undefined;
  /** Vurgunun rengi (ör. `bg-[#f3f0eb]`). */
  className?: string;
}) {
  const selfRef = useRef<HTMLSpanElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [animated, setAnimated] = useState(false);

  useLayoutEffect(() => {
    const container = selfRef.current?.parentElement;
    if (!container) return;
    const measure = () => {
      const active = activeKey
        ? container.querySelector<HTMLElement>(`[data-pill-key="${activeKey}"]`)
        : null;
      if (!active || active.offsetWidth === 0) {
        delete container.dataset.pill;
        setBox(null);
        return;
      }
      container.dataset.pill = "on";
      setBox({ x: active.offsetLeft, y: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight });
    };
    measure();
    // Yazı tipi geç yüklenince ya da ekran döndürülünce düğme ölçüleri değişir.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => {
      observer.disconnect();
      delete container.dataset.pill;
    };
  }, [activeKey]);

  // İlk ölçüm geçişsiz çizildikten SONRA geçiş açılır.
  useLayoutEffect(() => {
    if (!box || animated) return;
    const frame = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(frame);
  }, [box, animated]);

  return (
    <span
      ref={selfRef}
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-0 left-0 z-0 rounded-full",
        animated && "sliding-pill",
        box ? className : "hidden",
      )}
      style={box ? { width: box.width, height: box.height, transform: `translate(${box.x}px, ${box.y}px)` } : undefined}
    />
  );
}
