"use client";

import { useEffect, useState } from "react";

/**
 * Bir URL'den `HTMLImageElement` yukler.
 *
 * `useImage` benzeri bir paket eklemek yerine elle yaziliyor: tek ihtiyacimiz
 * olan sey bu ve `crossOrigin` ayarini kendimiz kontrol etmemiz gerekiyor —
 * R2'den gelen imzali URL'ler farkli bir kaynaktan geliyor ve `crossOrigin`
 * ayarlanmazsa canvas "tainted" hale gelir; Konva bu durumda SecurityError'i
 * kendisi yakalayip BOS bir veri URL'i dondurur (bkz. composition-editor.tsx).
 *
 * `crossOrigin` ayarliyken bucket'in CORS kurali o origin'i icermiyorsa ise
 * tarayici gorseli HIC yuklemiyor: `onerror` calisiyor ve sahne gradyana
 * dusuyor. Kucuk onizleme (CSS arka plani oldugu icin CORS gerektirmiyor)
 * yine gorunuyor — yani eksik kural gozle fark edilmiyor, cikti zeminsiz
 * iniyor. Tarayicida sahte bir CORS'suz origin'le birebir olculdu. Kuralin
 * gercek bucket'ta dogrulanmasi: `backend/scripts/check_r2_cors.py`.
 *
 * Kendi dosyasinda duruyor ki test edilebilsin: `use-loaded-image.test.ts`,
 * `keepPrevious` ile hata yolunun birlikte davranisini dogruluyor (asagidaki
 * `failedUrl` notuna bakin).
 */
export function useLoadedImage(
  url: string | null,
  { keepPrevious = false }: { keepPrevious?: boolean } = {},
): HTMLImageElement | null {
  // Yuklenen gorsel, GELDIGI URL ile birlikte saklaniyor. Yalnizca gorseli
  // saklasaydik, URL degistigi anda (zemin degistirildiginde) yenisi yuklenene
  // kadar EKSIGININ yerine bir onceki zemin gorunurdu. URL'i yaninda tutmak,
  // "bu gorsel su anki url'e mi ait" sorusunu render sirasinda cevaplatiyor;
  // boylece efekt icinde senkron `setState` cagirmaya da gerek kalmiyor
  // (React Compiler bunu hakli olarak uyariyor: kaskad render uretir).
  const [loaded, setLoaded] = useState<{
    url: string;
    image: HTMLImageElement;
  } | null>(null);
  // BASARISIZ url ayrica isaretleniyor. `keepPrevious` acikken bunu takip
  // etmemek sessiz bir YANLIS CIKTI uretiyordu: yeni zemin yuklenemedigi
  // halde asagidaki karsilastirma onceki gorseli SURESIZ dondurdugu icin
  // kullanici secili gordugu zeminden baskasiyla dosya indiriyordu (PR #18
  // incelemesi). Artik "henuz yuklenmedi" (onceki kalir) ile "yuklenemedi"
  // (gradyana duser) ayri iki durum.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;

    const img = new window.Image();
    img.crossOrigin = "anonymous";

    let cancelled = false;
    img.onload = () => {
      if (!cancelled) setLoaded({ url, image: img });
    };
    img.onerror = () => {
      if (!cancelled) setFailedUrl(url);
    };
    img.src = url;

    return () => {
      cancelled = true;
    };
  }, [url]);

  // `keepPrevious`: zemin degistirilirken yenisi yuklenene kadar ONCEKI zemin
  // kaliyor. Onceden bu arada gradyan (siyah) ciziliyordu ve her zemin
  // seciminde ekran once kararip sonra degisiyordu (Kaan'in kaydi, 17.09.2026).
  if (loaded === null || url === null) return null;
  // Kesinlesmis hata `keepPrevious`i gecersiz kiliyor: kirik bir zemini
  // gostermektense zemini yok saymak daha az yaniltici, ama YANLIS zemini
  // gostermek ikisinden de kotu.
  if (failedUrl === url) return null;
  return loaded.url === url || keepPrevious ? loaded.image : null;
}
