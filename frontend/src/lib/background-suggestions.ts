/**
 * Urune gore onerilen zeminler (Kaan, 21.09.2026 — one alinan is).
 *
 * Yapay zeka yok, bilincli olarak basit bir renk hesabi:
 *  1. Kesimin OPAK piksellerinin ortalama rengi (saydam alan sayilmaz).
 *  2. Her zeminin kucuk onizlemesinin ortalama rengi (tarayicida olculup
 *     bu tarayicida onbellege aliniyor; zeminin kendisi degismedigi surece
 *     bir daha olculmuyor).
 *  3. Puan: urun ile zemin arasindaki ACIKLIK farki (urun zeminden ayrilsin),
 *     notr zemine kucuk bir arti (mucevheri rengiyle yarismayan zemin), ve
 *     urunle AYNI renk ailesinden doygun zemine eksi (altin urun altin
 *     zeminde kaybolur).
 *
 * Zemin rengi olculemezse (R2 CORS kurali eksik, onizleme gelmedi) o zemin
 * yalnizca oneriye girmez; hicbir sey bozulmaz.
 */

export type Rgb = [number, number, number];
export type Hsl = { h: number; s: number; l: number };

export const SUGGESTION_COUNT = 6;
const COLOR_CACHE_KEY = "vitrin-ai:background-colors";

export function rgbToHsl([r, g, b]: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

/** Iki zemin rengi arasindaki acinin en kisa yolu (0..180 derece). */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Bir zeminin bu urun icin puani; buyuk olan daha iyi. */
export function suggestionScore(product: Hsl, background: Hsl): number {
  const contrast = Math.abs(background.l - product.l);
  const neutral = (1 - background.s) * 0.35;
  const clash =
    background.s > 0.25 && product.s > 0.2 && hueDistance(product.h, background.h) < 35 ? 0.4 : 0;
  return contrast + neutral - clash;
}

/**
 * Iki zemin rengi bundan yakinsa "ayni zemin" sayiliyor. Olculdu: yalnizca
 * puana gore dizince altin bir yuzuge alti oneriden dordu neredeyse ayni beyaz
 * cikiyordu (Saf Beyaz, Duz beyaz, Sis beyazi...) — secenek sunmayan bir raf.
 */
const NEAR_DUPLICATE_DISTANCE = 40;

function rgbDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Puanlari en iyiden kotuye dizip ilk `count` zemin kimligini dondurur.
 * Daha iyi puanli bir zemine renkce cok yakin olanlar SONA itiliyor (silinmiyor):
 * raf farkli secenekler gosteriyor, liste yine tam.
 */
export function rankSuggestions(
  product: Hsl,
  colors: ReadonlyMap<string, Rgb>,
  count = SUGGESTION_COUNT,
): string[] {
  const sorted = [...colors.entries()]
    .map(([id, rgb]) => ({ id, rgb, score: suggestionScore(product, rgbToHsl(rgb)) }))
    .sort((a, b) => b.score - a.score);
  const distinct: typeof sorted = [];
  const similar: typeof sorted = [];
  for (const entry of sorted) {
    const isDuplicate = distinct.some((kept) => rgbDistance(kept.rgb, entry.rgb) < NEAR_DUPLICATE_DISTANCE);
    (isDuplicate ? similar : distinct).push(entry);
  }
  return [...distinct, ...similar].slice(0, count).map((entry) => entry.id);
}

/** RGBA piksel dizisinin ortalamasi; `minAlpha` alti (saydam) sayilmaz. */
export function averageColor(data: Uint8ClampedArray, minAlpha = 0): Rgb | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < minAlpha) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n += 1;
  }
  return n === 0 ? null : [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** Konva gradyan dizisinin (`[oran, renk, ...]`) ortalama rengi. */
export function gradientColor(stops: (number | string)[]): Rgb | null {
  const colors = stops
    .filter((stop): stop is string => typeof stop === "string" && /^#[0-9a-f]{6}$/i.test(stop))
    .map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb);
  if (colors.length === 0) return null;
  return [0, 1, 2].map((c) => Math.round(colors.reduce((sum, rgb) => sum + rgb[c], 0) / colors.length)) as Rgb;
}

/** Gorseli kucuk bir tuvale cizip ortalama rengini olcer (tarayicida). */
export function measureImage(url: string, minAlpha: number): Promise<Rgb | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 48;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return resolve(null);
        context.drawImage(image, 0, 0, 48, 48);
        resolve(averageColor(context.getImageData(0, 0, 48, 48).data, minAlpha));
      } catch {
        // CORS'suz zemin tuvali kirletir, getImageData firlatir: oneriye girmez.
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

export function readColorCache(): Record<string, Rgb> {
  try {
    const raw = window.localStorage.getItem(COLOR_CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Rgb>) : {};
  } catch {
    return {};
  }
}

export function writeColorCache(cache: Record<string, Rgb>): void {
  try {
    window.localStorage.setItem(COLOR_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* depolama kapali — bir dahaki acilista yeniden olculur */
  }
}
