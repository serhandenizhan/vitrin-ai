"use client";

/**
 * Zemin listesini ceker ve imzali URL'ler olmeden ONCE yeniler.
 *
 * Yenileme mantiginin kendisi `@/lib/backgrounds` icinde saf fonksiyonlar
 * halinde duruyor (test edilebilmesi icin); burada yalnizca React'a baglaniyor:
 * ilk cekim, zamanlayici ve temizlik.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type ServerBackground,
  type Background,
  PLACEHOLDER_BACKGROUNDS,
  calculateRefreshDelay,
  createBackgroundList,
  fetchBackgrounds,
} from "@/lib/backgrounds";

export type BackgroundState = {
  backgrounds: Background[];
  /** Sunucudan gercek zemin geldi mi — arayuzde bilgilendirme icin. */
  hasServerBackground: boolean;
  isLoading: boolean;
};

export function useBackgrounds(): BackgroundState {
  const [serverBackgrounds, setServerBackgrounds] = useState<ServerBackground[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Zamanlayici id'si ref'te: her yenilemede yenisi kuruluyor, eskisi
  // temizleniyor. State'te tutmak gereksiz bir render turu acardi.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bilesen kaldirildiktan sonra ucan bir istek state'e yazmasin.
  const isMountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const fetched = await fetchBackgrounds();
    if (!isMountedRef.current) return;
    setServerBackgrounds(fetched);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void refresh();
    return () => {
      isMountedRef.current = false;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [refresh]);

  // Her yeni listede zamanlayici yeniden kuruluyor: gecikme, listedeki EN ERKEN
  // olen URL'e gore hesaplaniyor (bkz. calculateRefreshDelay).
  useEffect(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);

    const delay = calculateRefreshDelay(serverBackgrounds);
    if (delay === null) return;

    timerRef.current = setTimeout(() => {
      void refresh();
    }, delay);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [serverBackgrounds, refresh]);

  // Sekme uzun sure arka planda kalirsa tarayici zamanlayiciyi kisabiliyor ya da
  // erteleyebiliyor; kullanici geri dondugunde URL'ler olmus olabilir. Gorunur
  // hale gelisi ikinci bir yenileme tetikleyicisi olarak kullaniyoruz —
  // zamanlayici tek basina yeterli degil.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refresh]);

  const backgrounds = useMemo(
    () => createBackgroundList(serverBackgrounds),
    [serverBackgrounds],
  );

  return {
    backgrounds: backgrounds.length > 0 ? backgrounds : PLACEHOLDER_BACKGROUNDS,
    hasServerBackground: serverBackgrounds.length > 0,
    isLoading,
  };
}
