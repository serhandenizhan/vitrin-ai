"use client";

/** Tuvalin altında ayrı satırda duran, ekran merkezine hizalı araç paleti. */

import type { ReactNode } from "react";

export type DockProps = {
  /** Solda duran arac adi; ayni zamanda erisilebilir ad. */
  title: string;
  /** Sagda duran baglam denetimi (ornegin kategori menusu dugmesi). */
  action?: ReactNode;
  children: ReactNode;
};

export function Dock({ title, action, children }: DockProps) {
  return (
    <div
      role="group"
      aria-label={title}
      className="glass-panel pointer-events-auto w-full max-w-[min(42rem,100%)] rounded-2xl px-3 pt-2.5 pb-3"
    >
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <span className="text-[0.8125rem] font-medium tracking-[-0.01em]">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

/**
 * Dock icindeki yatay serit.
 *
 * `palette-fade` sag kenari solduruyor: son kart YARIM gorunsun ve devaminin
 * oldugu belli olsun (Serhan'in istegi — "devaminin oldugu yarim kalan son
 * kartla belli olsun"). Kaydirma yoksa maske zararsiz.
 */
export function DockStrip({ children, label, centered = false }: { children: ReactNode; label: string; centered?: boolean }) {
  return (
    <div
      aria-label={label}
      // Dört yandaki gerçek iç boşluk, ilk/son kartın büyüyen seçim halkasını
      // dock sınırının ve sağdaki solma maskesinin dışında tutar.
      className={"dock-strip flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pt-2 pb-3 " + (centered ? "justify-center flex-wrap" : "palette-fade")}
    >
      {children}
    </div>
  );
}
