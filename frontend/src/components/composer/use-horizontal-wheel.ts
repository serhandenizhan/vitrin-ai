"use client";

/**
 * Fare tekerleğinin DİKEY hareketini yatay şeritte SAĞA/SOLA kaydırmaya çevirir
 * (Kaan, 18.09.2026: "aşağı yukarı değil sağa sola doğru hareket olsun").
 *
 * Yatay şeridin asıl kusuru buydu: masaüstünde tekerlek yatay kaydırmıyordu ve
 * kullanıcı ya kaydırma çubuğunu tutmak ya Shift'e basmak zorundaydı. Dokunmatik
 * yüzey zaten yatay (deltaX) gönderiyorsa ona dokunulmuyor.
 *
 * Dinleyici `passive: false` ile elle bağlanıyor: React'in `onWheel`'ı pasif,
 * orada `preventDefault` sayfanın da kaymasını durduramıyor. Şerit ucuna
 * dayandığında olay serbest bırakılıyor — sayfa kaydırması kilitlenmesin.
 */

import { useEffect, type RefObject } from "react";

export function useHorizontalWheel(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    function onWheel(event: WheelEvent) {
      const target = element!;
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const max = target.scrollWidth - target.clientWidth;
      if (max <= 0) return;
      const atStart = target.scrollLeft <= 0 && event.deltaY < 0;
      const atEnd = target.scrollLeft >= max - 1 && event.deltaY > 0;
      if (atStart || atEnd) return;
      event.preventDefault();
      target.scrollLeft += event.deltaY;
    }
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [ref]);
}
