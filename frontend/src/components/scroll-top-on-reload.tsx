"use client";

/**
 * Sayfa YENILENINCE (adres cubugunda # yoksa) en uste doner. Safari yenilemede
 * eski kaydirma konumunu geri yukluyordu ve ana sayfa vitrin yerine "fotografi
 * yukleyin" bolumunde aciliyordu (Serhan). Geri/ileri gezinmesine dokunmaz.
 */

import { useEffect } from "react";

export function ScrollTopOnReload() {
  useEffect(() => {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (entry?.type === "reload" && !window.location.hash) {
      window.scrollTo(0, 0);
      // Safari geri yuklemeyi bizden SONRA yapabiliyor; bir kare sonra tekrar.
      requestAnimationFrame(() => window.scrollTo(0, 0));
    }
  }, []);
  return null;
}
