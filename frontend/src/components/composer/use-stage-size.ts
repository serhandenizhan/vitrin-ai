"use client";

import { useEffect, useState } from "react";

/**
 * Baslangic olcusu bilincli olarak KUCUK.
 *
 * Ust sinirdan baslamak, ilk olcum yapilana kadar gecen tek karede sahnenin
 * kapsayicisindan tasmasina yol aciyor. Kucukten baslayip buyumek, ters
 * yondeki tasmadan gorsel olarak daha az rahatsiz edici.
 */
export const INITIAL_DISPLAY_SIZE = 240;

/**
 * Sahnenin ekrandaki ust siniri. 17.09.2026'da 560'tan buyutuldu (Kaan: daha
 * genis duzenleme alani); dikey bicimlerde tuval ayrica ekran yuksekligine
 * gore sinirlaniyor (kapsayicinin `maxWidth`i).
 */
export const MAX_DISPLAY_SIZE = 768;

/**
 * Sahnenin ekran boyutunu kapsayicisina gore olcer.
 *
 * Sahne kare ve kapsayicisina sigmali. `ResizeObserver`, `window.resize`
 * yerine kullaniliyor: kapsayici, pencere degismeden de (panel acilip
 * kapandiginda) genislik degistiriyor.
 *
 * AMA ilk olcum observer'a BIRAKILMIYOR, `getBoundingClientRect()` ile elle
 * yapiliyor. Sebep: `ResizeObserver` geri cagrilari, HTML spesifikasyonunda
 * "update the rendering" adiminin parcasi olarak teslim ediliyor — kare
 * uretmeyen bir baglamda (gizli sekme, gorunmez gomulu panel) HIC
 * calismayabiliyorlar. Bu dogrulama sirasinda birebir gozlendi: 434 px
 * genisliginde gercek bir ogeye takilan taze bir observer sifir olcum verdi.
 * Ilk olcum tek basina dogru boyutu belirledigi icin, observer artik yalnizca
 * SONRAKI degisiklikleri (panel acilip kapanmasi, pencere boyutu) izliyor.
 */
export function useStageSize(
  containerRef: { current: HTMLElement | null },
): number {
  const [displaySize, setDisplaySize] = useState(INITIAL_DISPLAY_SIZE);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function applyWidth(width: number) {
      if (width <= 0) return;
      setDisplaySize(
        Math.max(INITIAL_DISPLAY_SIZE, Math.min(width, MAX_DISPLAY_SIZE)),
      );
    }

    applyWidth(container.getBoundingClientRect().width);

    const observer = new ResizeObserver(([entry]) =>
      applyWidth(entry.contentRect.width),
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  return displaySize;
}
