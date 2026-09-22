"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
/**
 * Donen ikinci deger, olcumu HEMEN yapan fonksiyon: asama gecisinde tarayici
 * yeni ekranin goruntusunu alirken tuvalin yeni boyutunda olmasi gerekiyor.
 * `ResizeObserver` bir kare sonra haber verdigi icin gecisin SONUNDA tuval
 * "yerine oturuyordu" (Serhan, 20.09.2026: "senkronizeyi arttir").
 */
export function useStageSize(
  containerRef: { current: HTMLElement | null },
): [number, () => void] {
  const [displaySize, setDisplaySize] = useState(INITIAL_DISPLAY_SIZE);
  const observedRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  // KAPSAYICI DEGISEBILIR (Serhan, 19.09.2026): stüdyo ilk karede telefon
  // düzeniyle kurulup masaüstü düzenine geçiyor ve tuvalin kapsayıcısı YENİ
  // bir DOM düğümü oluyor. Eskiden gözlemci yalnız ilk düğüme bağlanıyordu;
  // sonraki bütün boyut değişimlerini kaçırıyor, Tamamla aşamasında tuval
  // 494 px kalırken kapsayıcısı 433 px'e daralıp görselin sağı ve altı
  // KESİLİYORDU (tarayıcıda ölçüldü). Artık her render'dan sonra düğümün
  // aynı olup olmadığına bakılıyor; değiştiyse gözlemci yeni düğüme taşınıyor.
  useEffect(() => {
    const container = containerRef.current;
    if (container === observedRef.current) return;
    observerRef.current?.disconnect();
    observedRef.current = container;
    if (!container) return;

    function applyWidth(width: number) {
      if (width <= 0) return;
      setDisplaySize(Math.max(1, Math.min(width, MAX_DISPLAY_SIZE)));
    }

    applyWidth(container.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => applyWidth(entry.contentRect.width));
    observer.observe(container);
    observerRef.current = observer;
  });

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      observedRef.current = null;
    },
    [],
  );

  const measureNow = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.getBoundingClientRect().width;
    if (width > 0) setDisplaySize(Math.max(1, Math.min(width, MAX_DISPLAY_SIZE)));
  }, [containerRef]);

  return [displaySize, measureNow];
}
