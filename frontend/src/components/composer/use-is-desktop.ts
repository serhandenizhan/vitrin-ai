"use client";

import { useSyncExternalStore } from "react";

/**
 * Stüdyonun masaüstü düzeni (sağ panel) için ekran genişliği — Tailwind'in
 * `lg` sınırıyla aynı (64rem). Sunucuda ve `matchMedia` olmayan ortamda
 * (test) telefon düzeni döner.
 */
const QUERY = "(min-width: 64rem)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia?.(QUERY);
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => Boolean(window.matchMedia?.(QUERY).matches),
    () => false,
  );
}
