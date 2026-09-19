"use client";

/**
 * Seçili öğenin altında KAYAN cam mercek (Liquid Glass'taki gibi).
 *
 * Araç çubuğunda ve zemin kategori sekmelerinde ortak (Kaan, 18.09.2026:
 * "sade, desen, doğal arasında geçerken de aynı softluk olsun"). Seçim bir
 * sıçrama değil, camın bir öğeden ötekine süzülmesi olarak hissediliyor.
 *
 * Konum ölçülerek veriliyor (`offsetLeft` / `offsetWidth`, kapsayıcı `relative`
 * olmalı). Ölçüm yoksa (ilk kare, test ortamı) mercek çizilmiyor; öğenin kendi
 * renk vurgusu yine çalışıyor.
 */

import { useLayoutEffect, useState, type RefObject } from "react";

export function GlassLens({
  containerRef,
  activeKey,
}: {
  containerRef: RefObject<HTMLElement | null>;
  /** Seçili öğenin `data-lens-key` değeri. */
  activeKey: string | undefined;
}) {
  const [lens, setLens] = useState<{ x: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const active = activeKey
      ? container?.querySelector<HTMLElement>(`[data-lens-key="${activeKey}"]`)
      : null;
    if (!container || !active || active.offsetWidth === 0) {
      setLens(null);
      return;
    }
    setLens({ x: active.offsetLeft, width: active.offsetWidth });
  }, [activeKey, containerRef]);

  if (!lens) return null;
  return (
    <span
      aria-hidden
      className="liquid-glass-pill glass-lens pointer-events-none absolute inset-y-0 left-0 rounded-full"
      style={{ width: lens.width, transform: `translateX(${lens.x}px)` }}
    />
  );
}
