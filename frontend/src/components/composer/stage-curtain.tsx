"use client";

/**
 * Stüdyo açılış perdesi (Kaan, 19.09.2026): "Arka plan ekle"ye basınca koyu
 * cam bir perde kapalı başlar; solda Vitrin AI logosu, ortada aşama numarası
 * ve adı, altın çizgi soldan sağa dolar, perde yukarı kalkar. Toplam ~1,5 sn.
 * "Hareketi azalt" açıkken gösterilmez.
 *
 * YALNIZCA AÇILIŞTA (Serhan, 19.09.2026): önceden her ✓ / geri geçişinde de
 * perde iniyordu ("drop" modu, ~1,7 sn); stüdyo içinde her adımda yorucu
 * bulunduğu için kaldırıldı. Aşamalar arası geçiş editörde (`goToStage`).
 *
 * `onDone` hem `animationend` ile hem bir zaman aşımıyla çağrılır: gizli
 * sekmede animasyon ilerlemezse perde ekranda kalmasın (kök CLAUDE.md ders 13).
 */

import { useEffect, useRef } from "react";

import { BrandMark } from "@/components/brand-mark";
import { STUDIO_STEPS } from "@/components/composer/studio-steps";

const DESCRIPTIONS: Record<number, string> = {
  1: "Biçimi ve zemini seçin",
  2: "Ürünü yerleştirin, ışığını ve markanızı ayarlayın",
  3: "Çıktınızı indirin",
};

const CURTAIN_TOTAL_MS = 1500;

export function StageCurtain({ stage, onDone }: { stage: number; onDone: () => void }) {
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    doneRef.current = false;
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDoneRef.current();
    };
    // Yedek: animasyon hic ilerlemezse de perde kalkar.
    const fallback = window.setTimeout(finish, CURTAIN_TOTAL_MS + 400);
    return () => window.clearTimeout(fallback);
  }, [stage]);

  const step = STUDIO_STEPS.find((item) => item.step === stage);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${stage}. aşama: ${step?.label ?? ""}`}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget || doneRef.current) return;
        doneRef.current = true;
        onDoneRef.current();
      }}
      className="stage-curtain stage-curtain-initial fixed inset-0 z-[70] flex items-center overflow-hidden bg-[#0c0b0a] text-[#f3f0eb]"
    >
      {/* Isik: perdenin ortasinda sicak, cok hafif bir parilti. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_70%_at_50%_55%,rgb(209_162_91/0.12),transparent_70%)]" />
      <div className="relative mx-auto flex w-full max-w-5xl items-center gap-10 px-10">
        <div className="curtain-logo shrink-0">
          <BrandMark className="text-gold h-14 w-auto" />
          <span className="mt-3 block text-[0.75rem] tracking-[0.18em] text-[#a8a29a]">VİTRİN AI</span>
        </div>
        <span aria-hidden className="curtain-divider h-24 w-px shrink-0 bg-white/15" />
        <div className="min-w-0">
          <span className="curtain-number text-gold block text-[0.875rem] font-medium tracking-[0.2em] tabular-nums">
            0{stage} / 03
          </span>
          <span className="curtain-title display-hero mt-2 block text-[#f3f0eb]">{step?.label}</span>
          <span className="curtain-sub mt-3 block text-[1.0625rem] text-[#a8a29a]">{DESCRIPTIONS[stage]}</span>
          <span aria-hidden className="mt-7 block h-px w-72 max-w-full overflow-hidden bg-white/10">
            <span className="curtain-line bg-gold block h-full w-full origin-left" />
          </span>
        </div>
      </div>
    </div>
  );
}
