"use client";

/**
 * Aşama geçiş perdesi (Kaan, 19.09.2026): "Arka plan ekle"ye basınca ve her
 * ✓ / geri geçişinde koyu cam bir perde iner; solda Vitrin AI logosu, ortada
 * büyük aşama numarası ve adı, altın çizgi soldan sağa dolar, perde yukarı
 * kalkar ve yeni aşama görünür.
 *
 * Zamanlama:
 * - `drop`: perde üstten iner (~320 ms) → `onCovered` (aşama BU ANDA
 *   değişir, eski düzen perdenin arkasında kalır) → içerik → perde kalkar.
 * - `initial`: stüdyo açılırken perde zaten kapalı başlar, yalnızca kalkar.
 * Toplam ~1,7 sn. "Hareketi azalt" açıkken perde gösterilmez; aşama anında
 * değişir (bkz. editördeki `goToStage`).
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

export const CURTAIN_COVER_MS = 320;
const CURTAIN_TOTAL_MS = 1700;

export function StageCurtain({
  stage,
  mode,
  onCovered,
  onDone,
}: {
  stage: number;
  mode: "initial" | "drop";
  onCovered?: () => void;
  onDone: () => void;
}) {
  const doneRef = useRef(false);
  const onCoveredRef = useRef(onCovered);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onCoveredRef.current = onCovered;
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    doneRef.current = false;
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDoneRef.current();
    };
    const covered = mode === "drop" ? window.setTimeout(() => onCoveredRef.current?.(), CURTAIN_COVER_MS) : null;
    // Yedek: animasyon hic ilerlemezse de perde kalkar.
    const fallback = window.setTimeout(finish, CURTAIN_TOTAL_MS + 400);
    return () => {
      if (covered !== null) window.clearTimeout(covered);
      window.clearTimeout(fallback);
    };
  }, [stage, mode]);

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
      className={
        "stage-curtain fixed inset-0 z-[70] flex items-center overflow-hidden bg-[#0c0b0a] text-[#f3f0eb] " +
        (mode === "drop" ? "stage-curtain-drop" : "stage-curtain-initial")
      }
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
