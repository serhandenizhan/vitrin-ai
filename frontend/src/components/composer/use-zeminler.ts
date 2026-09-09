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
  type SunucuZemini,
  type Zemin,
  YER_TUTUCU_ZEMINLER,
  yenilemeGecikmesiHesapla,
  zeminListesiOlustur,
  zeminleriGetir,
} from "@/lib/backgrounds";

export type ZeminDurumu = {
  zeminler: Zemin[];
  /** Sunucudan gercek zemin geldi mi — arayuzde bilgilendirme icin. */
  sunucuZeminiVar: boolean;
  yukleniyor: boolean;
};

export function useZeminler(): ZeminDurumu {
  const [sunucuZeminleri, setSunucuZeminleri] = useState<SunucuZemini[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  // Zamanlayici id'si ref'te: her yenilemede yenisi kuruluyor, eskisi
  // temizleniyor. State'te tutmak gereksiz bir render turu acardi.
  const zamanlayiciRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bilesen kaldirildiktan sonra ucan bir istek state'e yazmasin.
  const canliRef = useRef(true);

  const yenile = useCallback(async () => {
    const gelen = await zeminleriGetir();
    if (!canliRef.current) return;
    setSunucuZeminleri(gelen);
    setYukleniyor(false);
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

    const gecikme = yenilemeGecikmesiHesapla(sunucuZeminleri);
    if (gecikme === null) return;

    zamanlayiciRef.current = setTimeout(() => {
      void yenile();
    }, gecikme);

    return () => {
      if (zamanlayiciRef.current !== null) clearTimeout(zamanlayiciRef.current);
    };
  }, [sunucuZeminleri, yenile]);

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

  const zeminler = useMemo(
    () => zeminListesiOlustur(sunucuZeminleri),
    [sunucuZeminleri],
  );

  return {
    zeminler: zeminler.length > 0 ? zeminler : YER_TUTUCU_ZEMINLER,
    sunucuZeminiVar: sunucuZeminleri.length > 0,
    yukleniyor,
  };
}
