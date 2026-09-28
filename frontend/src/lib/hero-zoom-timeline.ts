/**
 * Yakinlasmanin zaman cizelgesi (saniye). Acilis ileri, kapanis GERI oynar:
 * ayni cizelge tersten okunur.
 *
 * Serhan'in tarifi (28.09.2026): el yuzugu BIRAKIR ve asagi inip kaybolur;
 * yuzuk havada DONEREK buyur ve sahnenin odagina gelir. Kapanis bunun tersi:
 * yuzuk donerek kuculup yerine doner, el asagidan gelip onu yakalar.
 * (Onceki surumde el parilti tozuna donusuyordu; yerine bu secildi.)
 *
 *   0.00         yuzugu 3D model tutar (el katmaninda yuzuk silinmis; ayni yer, ayni poz)
 *   0.00 - 0.85  el asagi iner ve solar (hizlanarak: birakilan bir sey gibi)
 *   0.10 - 1.20  yuzuk bir tam tur donerek odaga tasinir ve buyur (travel)
 *   1.00         kunye paneli acilir
 */

export const ZOOM_END = 1.2;
/** Oynatma hizi, iki yonde ayni. */
export const ZOOM_SPEED = 1;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeInQuad = (value: number) => value * value;
const easeInOutCubic = (value: number) =>
  value < 0.5 ? 4 * value * value * value : 1 - (-2 * value + 2) ** 3 / 2;

export type ZoomFrame = {
  /** 0 = el yerinde, 1 = el asagida ve gorunmez. */
  drop: number;
  /** 0 = yuzuk fotograftaki yerinde, 1 = sahnenin odaginda. */
  travel: number;
  panel: boolean;
};

export function zoomFrame(seconds: number): ZoomFrame {
  return {
    drop: easeInQuad(clamp01(seconds / 0.85)),
    travel: easeInOutCubic(clamp01((seconds - 0.1) / 1.1)),
    panel: seconds >= 1.0,
  };
}

/** Yolculuk boyunca yuzugun kendi ekseni etrafinda donusu (radyan): bir tam tur. */
export function travelSpin(travel: number): number {
  return travel * Math.PI * 2;
}
