/**
 * Yakinlasmadaki "bir zemine koyun" ornekleri ve sahnenin yerlesim
 * hesaplari (DOM'suz, test edilebilir).
 *
 * Zeminler kutuphanedeki zeminlerin KENDISI (ayni kimlik; kopyalari
 * `scripts/prepare-hero-backdrops.py` uretir). Ziyaretci, stüdyoda
 * karsilasacagi zemini goruyor — urunun ikinci isi: kesilen urunu bir
 * vitrine koymak.
 */

import { heroAsset } from "@/lib/hero-asset";

export type HeroBackdrop = {
  id: string;
  name: string;
  /** Gorselin dogal olculeri (betigin yazdigi dosya). */
  width: number;
  height: number;
  /**
   * Yuzugun alt ucunun oturacagi nokta, gorselin kesri olarak: kaidenin,
   * tasin ya da kumasin ustu. Elle, gorsele bakilarak secildi.
   */
  anchor: { x: number; y: number };
  /** Yuzugun boyuna gore gorselin boyu: kaideyle yuzugun orani. */
  scale: number;
  /** Acik zeminde urun adi koyu yazilir (okunsun). */
  light: boolean;
};

export const HERO_BACKDROPS: HeroBackdrop[] = [
  { id: "yesil-kadife", name: "Yeşil kadife", width: 2400, height: 1309, anchor: { x: 0.5, y: 0.5 }, scale: 2.1, light: false },
  { id: "kum-tas", name: "Kum ve taş", width: 2400, height: 1309, anchor: { x: 0.5, y: 0.58 }, scale: 2.4, light: true },
  { id: "siyah-su", name: "Siyah su", width: 2400, height: 1309, anchor: { x: 0.5, y: 0.45 }, scale: 2.4, light: false },
  { id: "mermer", name: "Mermer", width: 2400, height: 1309, anchor: { x: 0.56, y: 0.62 }, scale: 1.9, light: true },
  { id: "saten", name: "Saten", width: 2400, height: 1309, anchor: { x: 0.5, y: 0.62 }, scale: 1.9, light: true },
];

export function backdropSrc(backdrop: HeroBackdrop): string {
  return heroAsset(`zemin/${backdrop.id}.webp`);
}

export function backdropSwatchSrc(backdrop: HeroBackdrop): string {
  return heroAsset(`zemin/${backdrop.id}-kucuk.webp`);
}

/** Yakinlasmada yuzugun sahnedeki yeri (piksel): merkez ve boy. */
export type ZoomFocus = { x: number; y: number; height: number };

/**
 * Genis ekranda sol-orta (sagda panel), telefonda ust yari; yuzugun altinda
 * urun adina yer kalir. 3D sahne ile zemin katmani AYNI hesabi kullanir;
 * ayri yazilsalardi yuzuk kaideden kayardi.
 */
export function zoomFocus(width: number, height: number): ZoomFocus {
  const wide = width >= 768;
  if (wide) {
    return {
      x: Math.min(width * 0.36, width - 26 * 16 - 180),
      y: height * 0.45,
      height: Math.min(height * 0.5, width * 0.36),
    };
  }
  // Telefonda ust cubuk + "Vitrine don" dugmesinin altinda kalsin (olculdu:
  // 0.22'de yuzugun tepesi cubuga degiyordu).
  return { x: width / 2, y: height * 0.28, height: Math.min(height * 0.22, width * 0.5) };
}

export type Rect = { left: number; top: number; width: number; height: number };

/**
 * Zemin gorselinin kutusu: oturma noktasi TAM yuzugun alt ucuna gelir VE
 * gorsel kapsayiciyi tamamen kaplar (bosluk kalmaz). Ikisini birden
 * saglayan en kucuk boy secilir: `scale` bir alt sinir — kaideyi yuzuge
 * oranla buyutmek, yuzugu kaideden kaydirmaktan (ilk surumde oldu) iyidir.
 */
export function backdropRect(backdrop: HeroBackdrop, focus: ZoomFocus, width: number, height: number): Rect {
  const aspect = backdrop.width / backdrop.height;
  const { x: ax, y: ay } = backdrop.anchor;
  const ringBottom = focus.y + focus.height / 2;
  const h = Math.max(
    height,
    width / aspect,
    focus.height * backdrop.scale,
    // Oturma noktasinin ustunde, altinda, solunda, saginda yeterli gorsel olsun.
    ringBottom / ay,
    (height - ringBottom) / (1 - ay),
    focus.x / ax / aspect,
    (width - focus.x) / (1 - ax) / aspect,
  );
  const w = h * aspect;
  return { left: focus.x - ax * w, top: ringBottom - ay * h, width: w, height: h };
}
