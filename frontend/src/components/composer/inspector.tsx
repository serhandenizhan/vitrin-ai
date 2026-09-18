"use client";

/**
 * Sagda yuzen denetci (17.09.2026, Serhan).
 *
 * Uc bolum: adim haplari, o adimin ARACLARI ve secili aracin ince ayarlari.
 * Bitirici eylem (Devam / Indir) her zaman en altta ve ayni yerde duruyor —
 * kullanici nereye basacagini aramasin.
 *
 * TELEFONDA (lg alti) sagda yer yok: denetci dock'un ustunden acilan kisa bir
 * cekmeceye donuyor. Tuval ve dock ayrı bloklarda; kaydırırken birbirlerini örtmez.
 */

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export type InspectorTool = { id: string; label: string };

export type InspectorProps = {
  steps: readonly { id: number; label: string }[];
  step: number;
  onStepChange: (step: number) => void;
  tools: InspectorTool[];
  activeTool: string;
  onToolChange: (id: string) => void;
  /** Secili aracin sayisal/metin denetimleri. */
  children?: ReactNode;
  /** Devam ya da Indir. */
  footer: ReactNode;
  /** Telefonda cekmece acik mi. */
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export function Inspector({
  steps,
  step,
  onStepChange,
  tools,
  activeTool,
  onToolChange,
  children,
  footer,
  isOpen,
  onOpenChange,
}: InspectorProps) {
  return (
    <div className="glass-panel pointer-events-auto w-full rounded-2xl p-2.5 lg:w-[17rem]">
      <div role="tablist" aria-label="Düzenleme adımları" className="flex gap-1">
        {steps.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={step === item.id}
            // Ayni sebeple acik ad (bkz. background-palette.tsx): numara ve
            // etiket ayri ogelerde oldugu icin ad "1Boyut" gibi cikiyordu.
            aria-label={`${item.id} ${item.label}`}
            onClick={() => onStepChange(item.id)}
            className={
              "press min-h-9 flex-1 rounded-xl px-1.5 text-[0.75rem] leading-tight transition-colors " +
              (step === item.id
                ? "bg-gold font-medium text-[#1a1917]"
                : "on-dark-muted hover:bg-white/8 hover:text-[#f3f0eb]")
            }
          >
            <span className="mr-1 tabular-nums opacity-70">{item.id}</span>
            {item.label}
          </button>
        ))}
      </div>

      {/* Telefonda cekmece basligi; masaustunde hic gorunmuyor. */}
      <button
        type="button"
        onClick={() => onOpenChange(!isOpen)}
        aria-expanded={isOpen}
        className="press on-dark-muted mt-2 flex min-h-9 w-full items-center justify-between rounded-xl px-2 text-[0.8125rem] hover:text-[#f3f0eb] lg:hidden"
      >
        Ayarlar
        <ChevronDown
          className={"size-4 transition-transform " + (isOpen ? "rotate-180" : "")}
          strokeWidth={1.75}
          aria-hidden
        />
      </button>

      <div className={(isOpen ? "block" : "hidden") + " lg:block"}>
        <div
          role="tablist"
          aria-label="Araçlar"
          className="mt-2 flex gap-1 lg:mt-3 lg:flex-col"
        >
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              role="tab"
              aria-selected={activeTool === tool.id}
              onClick={() => onToolChange(tool.id)}
              className={
                "press min-h-9 flex-1 rounded-xl px-2.5 text-left text-[0.8125rem] transition-colors lg:flex-none " +
                (activeTool === tool.id
                  ? "bg-white/10 font-medium text-[#f3f0eb]"
                  : "on-dark-muted hover:bg-white/6 hover:text-[#f3f0eb]")
              }
            >
              {tool.label}
            </button>
          ))}
        </div>

        {children ? (
          <div className="mt-3 max-h-[min(22rem,40dvh)] space-y-3 overflow-y-auto border-t border-white/10 px-0.5 pt-3">
            {children}
          </div>
        ) : null}
      </div>

      <div className="mt-2.5">{footer}</div>
    </div>
  );
}
