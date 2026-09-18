"use client";

import { useCallback, useMemo, useState } from "react";

import {
  BACKGROUND_CATEGORIES,
  type BackgroundCategory,
  backgroundCategory,
  fitsOrientation,
} from "@/lib/background-categories";
import type { Background } from "@/lib/backgrounds";
import { type OutputFormat, formatOrientation } from "@/lib/composition";

export type BackgroundGroup = (typeof BACKGROUND_CATEGORIES)[number] & {
  items: Background[];
};

export type BackgroundSelection = {
  /** Sahneye cizilecek zemin — liste bos kalmadigi icin her zaman var. */
  selected: Background;
  /** Secici izgarasinda gosterilecek kategori (bos kategoriler yok). */
  shownGroup: BackgroundGroup | undefined;
  groups: BackgroundGroup[];
  /**
   * Bicime uyan zeminlerin tamami. Kategori sekmesi hic olusmadiginda
   * (hicbir zemin kategoriye girmiyorsa) izgaranin yedegi bu liste.
   */
  fitting: Background[];
  select: (id: string) => void;
  showCategory: (category: BackgroundCategory | null) => void;
  activeCategory: BackgroundCategory | null;
};

/**
 * Zemin secimi, bicime gore filtreleme ve kategori sekmeleri.
 *
 * Secili zemin id ile tutuluyor, nesneyle degil: liste yenilendiginde (imzali
 * URL'ler tazelendiginde) nesne kimligi degisiyor ama id ayni kaliyor,
 * dolayisiyla kullanicinin secimi yenilemeden SAG CIKIYOR. Nesneyi
 * saklasaydik her yenilemede secim ilk zemine donerdi.
 *
 * Yalnizca bicimin yonune uyan zeminler gosteriliyor (Kaan, 17.09.2026):
 * dikey bir zemin kare bicime, yatay bir zemin hikayeye konunca buyuk kismi
 * kirpiliyordu. "Sade" her bicimde (bkz. lib/background-categories.ts
 * `fitsOrientation`). Bicim degisince secili zemin uymuyorsa ilk uyan zemine
 * geciliyor — bu, secimin TURETILMIS olmasindan dolayi kendiliginden oluyor,
 * ayri bir efekt gerekmiyor.
 */
export function useBackgroundSelection(
  backgrounds: Background[],
  format: OutputFormat,
  initialSelectedId: string | null = null,
): BackgroundSelection {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  /**
   * Kullanicinin elle actigi zemin kategorisi. `null`: secili zeminin
   * kategorisi gosteriliyor — boylece "Pazaryeri" duz beyazi sectiginde sekme
   * de kendiliginden "Sade"ye geciyor, secili zemin gorunmez bir sekmede kalmiyor.
   */
  const [activeCategory, setActiveCategory] = useState<BackgroundCategory | null>(null);

  const orientation = formatOrientation(format);
  const fitting = useMemo(
    () => backgrounds.filter((background) => fitsOrientation(background.id, orientation)),
    [backgrounds, orientation],
  );

  const selected: Background =
    fitting.find((background) => background.id === selectedId) ??
    fitting[0] ??
    backgrounds[0];

  /**
   * Zeminler kategorilere ayriliyor (one alinan is, 17.09.2026): 90'dan fazla
   * zemin tek izgarada karisiyordu. Bos kategori sekmesi gosterilmiyor;
   * yalnizca bir kategori doluysa (ornegin sunucu zemini yokken) sekme hic yok.
   */
  const groups = useMemo(
    () =>
      BACKGROUND_CATEGORIES.map((category) => ({
        ...category,
        items: fitting.filter(
          (background) => backgroundCategory(background.id) === category.id,
        ),
      })).filter((group) => group.items.length > 0),
    [fitting],
  );

  const shownGroup =
    groups.find(
      (group) => group.id === (activeCategory ?? backgroundCategory(selected.id)),
    ) ?? groups[0];

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setActiveCategory(null);
  }, []);

  return {
    selected,
    shownGroup,
    groups,
    fitting,
    select,
    showCategory: setActiveCategory,
    activeCategory,
  };
}
