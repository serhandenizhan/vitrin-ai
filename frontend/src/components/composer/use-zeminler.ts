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
  const zamanlayiciRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bilesen kaldirildiktan sonra ucan bir istek state'e yazmasin.
  const canliRef = useRef(true);

  const yenile = useCallback(async () => {
    const gelen = await fetchBackgrounds();
    if (!canliRef.current) return;
    setServerBackgrounds(gelen);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    canliRef.current = true;
    void yenile();
    return () => {
      canliRef.current = false;
      if (zamanlayiciRef.current !== null) clearTimeout(zamanlayiciRef.current);
    };
  }, [yenile]);

  // Her yeni listede zamanlayici yeniden kuruluyor: gecikme, listedeki EN ERKEN
  // olen URL'e gore hesaplaniyor (bkz. yenilemeGecikmesiHesapla).
  useEffect(() => {
    if (zamanlayiciRef.current !== null) clearTimeout(zamanlayiciRef.current);

    const gecikme = calculateRefreshDelay(serverBackgrounds);
    if (gecikme === null) return;

    zamanlayiciRef.current = setTimeout(() => {
      void yenile();
    }, gecikme);

    return () => {
      if (zamanlayiciRef.current !== null) clearTimeout(zamanlayiciRef.current);
    };
  }, [serverBackgrounds, yenile]);

  // Sekme uzun sure arka planda kalirsa tarayici zamanlayiciyi kisabiliyor ya da
  // erteleyebiliyor; kullanici geri dondugunde URL'ler olmus olabilir. Gorunur
  // hale gelisi ikinci bir yenileme tetikleyicisi olarak kullaniyoruz —
  // zamanlayici tek basina yeterli degil.
  useEffect(() => {
    function gorunurlukDegisti() {
      if (document.visibilityState === "visible") void yenile();
    }
    document.addEventListener("visibilitychange", gorunurlukDegisti);
    return () =>
      document.removeEventListener("visibilitychange", gorunurlukDegisti);
  }, [yenile]);

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
