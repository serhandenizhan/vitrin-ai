"use client";

/**
 * Stüdyonun ince araç çubuğu (Kaan, 18.09.2026 — iPhone Fotoğraflar düzeni).
 *
 * Altı araç tek sırada, adım sırasıyla ve ince ayraçlarla gruplu (Sahne ·
 * Düzenle · Tamamla — Kaan, 17.09.2026: "aşamalara böl"). Ayrı bir "Devam"
 * düğmesi yok; her araç tek dokunuşla açılır.
 *
 * Seçili aracın altında bir cam "mercek" KAYIYOR (Liquid Glass'taki gibi):
 * araçtan araca geçiş bir sıçrama değil, camın yer değiştirmesi olarak
 * hissediliyor. Mercek konumu ölçülerek veriliyor; ölçüm yoksa (ilk kare,
 * test ortamı) görünmez kalır, düğmenin kendi renk vurgusu yine çalışır.
 */

import { useRef, type ComponentType } from "react";

import { useDockVariant } from "@/components/composer/dock";
import { GlassLens } from "@/components/composer/glass-lens";
import { useHorizontalWheel } from "@/components/composer/use-horizontal-wheel";

export type ToolBarTool = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
};

export type ToolBarGroup = { step: number; label: string; tools: readonly ToolBarTool[] };

export function ToolBar({
  groups,
  activeTool,
  onToolChange,
}: {
  groups: readonly ToolBarGroup[];
  activeTool: string;
  onToolChange: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useHorizontalWheel(containerRef);
  const variant = useDockVariant();

  if (variant === "side") {
    // Sag panel: bes esit segment, ayrac yok (adimlar zaten ust barda),
    // okunur boyutta etiket; secili segmentin altinda cam mercek kayar.
    const all = groups.flatMap((group) => group.tools);
    return (
      <div
        ref={containerRef}
        role="tablist"
        aria-label="Araçlar"
        className="relative grid rounded-full bg-black/20 p-0.5"
        style={{ gridTemplateColumns: `repeat(${all.length}, minmax(0, 1fr))` }}
      >
        <GlassLens containerRef={containerRef} activeKey={activeTool} />
        {all.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              role="tab"
              data-lens-key={tool.id}
              aria-selected={isActive}
              onClick={() => onToolChange(tool.id)}
              className={
                "press relative z-10 flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-full text-[0.6875rem] leading-none transition-colors " +
                (isActive ? "font-medium text-[#f3f0eb]" : "on-dark-muted hover:text-[#f3f0eb]")
              }
            >
              <Icon className={"size-[1.0625rem] " + (isActive ? "text-gold" : "")} strokeWidth={isActive ? 2 : 1.6} aria-hidden />
              {tool.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Araçlar"
      className="dock-strip relative flex min-w-0 items-center overflow-x-auto"
    >
      <GlassLens containerRef={containerRef} activeKey={activeTool} />
      {groups.map((group, index) => (
        <div key={group.step} className="flex items-center">
          {index > 0 ? <span className="mx-1 h-5 w-px shrink-0 bg-white/15" aria-hidden /> : null}
          {group.tools.map((tool) => {
            const Icon = tool.icon;
            const isActive = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                role="tab"
                data-lens-key={tool.id}
                aria-selected={isActive}
                onClick={() => onToolChange(tool.id)}
                className={
                  "press relative z-10 flex h-[2.625rem] min-w-[3.25rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-full px-2 text-[0.625rem] leading-none transition-colors " +
                  (isActive ? "text-gold font-semibold" : "on-dark-muted hover:text-[#f3f0eb]")
                }
              >
                <Icon className="size-[1.0625rem]" strokeWidth={isActive ? 2.1 : 1.75} aria-hidden />
                {tool.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
