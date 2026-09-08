"use client";

/**
 * Isleme sirasindaki bekleme ekrani.
 *
 * Neden gecen sureyi sayiyoruz: CPU inference gercek fotograflarda ~15sn,
 * modelin ilk yuklendigi istekte ~30-35sn suruyor (bkz. kok CLAUDE.md
 * "Bilinen kisit"). Donmus gibi gorunen bir ekranda kullanici sekmeyi
 * kapatiyor; gecen sureyi ve ne beklendigini gostermek bunu onluyor.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/** Bu surenin uzerinde "ilk istek olabilir" aciklamasi gosteriliyor. */
const SLOW_AFTER_SECONDS = 20;

export function ProcessingState() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-4 py-16 text-center"
    >
      <Loader2
        className="text-muted-foreground size-6 animate-spin"
        strokeWidth={1.5}
        aria-hidden
      />

      <div className="flex flex-col gap-1">
        <span className="text-base font-medium">Arka plan kaldırılıyor</span>
        <span className="text-muted-foreground text-sm tabular-nums">
          {elapsedSeconds} saniye
        </span>
      </div>

      <p className="text-muted-foreground max-w-sm text-xs leading-relaxed">
        {elapsedSeconds >= SLOW_AFTER_SECONDS
          ? "Bu ilk istek olabilir — model belleğe yükleniyor ve bu bir kereye mahsus daha uzun sürer. Sonraki fotoğraflar belirgin şekilde daha hızlı işlenir."
          : "İnce zincir halkaları ve taş kenarları tek tek ayrıştırılıyor."}
      </p>
    </div>
  );
}
