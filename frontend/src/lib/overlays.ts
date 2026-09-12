/**
 * Kompozisyonun ustune binen katmanlar: kuyumcunun LOGOSU ve URUN ETIKETI
 * (ayar, gram, urun kodu). One alinan is, 13.09.2026 (ROADMAP Faz 4 altindaki
 * 9. madde onerileri 1 ve 2).
 *
 * Saf geometri ve dogrulama burada, Konva'dan bagimsiz: `composition.ts` ile
 * ayni gerekce — Node ortaminda canvas yuklemeden test edilebilsin.
 *
 * KONUMLAR SAHNE KOORDINATINDA (mantiksal olcu). Disa aktarma sahneyi tam 2
 * katina buyuttugu icin logo ve etiket ciktida da ayni oranda duruyor.
 */

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export const CORNERS: { id: Corner; label: string }[] = [
  { id: "top-left", label: "Sol üst" },
  { id: "top-right", label: "Sağ üst" },
  { id: "bottom-left", label: "Sol alt" },
  { id: "bottom-right", label: "Sağ alt" },
];

/** Kenar boslugu: sahnenin kisa kenarinin bu orani. */
export const OVERLAY_MARGIN_RATIO = 0.04;

/* --- Logo --------------------------------------------------------------- */

export type LogoSettings = {
  corner: Corner;
  /** Logonun uzun kenari, sahnenin kisa kenarina orani. */
  size: number;
  /** 0-1; filigran gibi hafif durabilsin. */
  opacity: number;
};

export const DEFAULT_LOGO: LogoSettings = { corner: "bottom-right", size: 0.18, opacity: 0.9 };
export const LOGO_SIZE_RANGE = { min: 0.08, max: 0.35 } as const;
export const LOGO_OPACITY_RANGE = { min: 0.2, max: 1 } as const;

/** Kabul edilen logo turleri. SVG yok: dis kaynak cagirabilir, tuvali kirletebilir. */
export const LOGO_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_LOGO_FILE_BYTES = 5 * 1024 * 1024;
/** Tarayicida saklamadan once logo bu olcuye kucultuluyor (uzun kenar, px). */
export const LOGO_STORAGE_MAX_EDGE = 600;

export function logoFileProblem(file: { type: string; size: number }): string | null {
  if (!(LOGO_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    return "Logo PNG, JPEG ya da WebP olmalı. Saydam arka plan için PNG önerilir.";
  }
  if (file.size > MAX_LOGO_FILE_BYTES) return "Logo en fazla 5 MB olabilir.";
  return null;
}

/* --- Urun etiketi -------------------------------------------------------- */

export const KARAT_OPTIONS = ["8K", "14K", "18K", "21K", "22K", "24K"] as const;

export type ProductLabel = {
  enabled: boolean;
  karat: string;
  /** Kullanicinin yazdigi ham deger; ciziminde `formatGram` ile. */
  gram: string;
  code: string;
  corner: Corner;
  theme: "dark" | "light";
};

export const DEFAULT_LABEL: ProductLabel = {
  enabled: false,
  karat: "",
  gram: "",
  code: "",
  corner: "top-left",
  theme: "dark",
};

export const MAX_CODE_LENGTH = 24;

/**
 * "3,45" / "3.45" / " 12 " -> "3,45 gr" / "12 gr". Gecersizse null.
 * En fazla iki ondalik; 0'dan buyuk ve 10.000 gramdan kucuk (yazim hatasi
 * olarak "34500" gibi bir deger etikete dusmesin).
 */
export function formatGram(input: string): string | null {
  const normalized = input.trim().replace(",", ".");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!(value > 0 && value < 10_000)) return null;
  const text = Number.isInteger(value)
    ? String(value)
    : value.toFixed(normalized.split(".")[1].length).replace(".", ",");
  return `${text} gr`;
}

/** Urun kodu: harf, rakam, bosluk, - _ / . ; en fazla 24 karakter. */
export function sanitizeCode(input: string): string {
  return input
    .replace(/[^\p{L}\p{N} ._/-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CODE_LENGTH);
}

/**
 * Etikette gorunecek tek satir: "22K · 3,45 gr · Kod A-102".
 * Bos ya da gecersiz parca atlaniyor; hic parca yoksa null (etiket cizilmez).
 */
export function labelText(label: ProductLabel): string | null {
  if (!label.enabled) return null;
  const parts: string[] = [];
  if ((KARAT_OPTIONS as readonly string[]).includes(label.karat)) parts.push(label.karat);
  const gram = formatGram(label.gram);
  if (gram) parts.push(gram);
  const code = sanitizeCode(label.code);
  if (code) parts.push(`Kod ${code}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function gramProblem(input: string): string | null {
  if (!input.trim()) return null;
  return formatGram(input) ? null : "Gramı sayı olarak yazın, örneğin 3,45";
}

/* --- Yerlesim ------------------------------------------------------------ */

export type Box = { x: number; y: number; width: number; height: number };

export function overlayMargin(stageWidth: number, stageHeight: number): number {
  return Math.min(stageWidth, stageHeight) * OVERLAY_MARGIN_RATIO;
}

/** Verilen olcudeki kutunun koseye yaslanmis sol-ust konumu. */
export function placeInCorner(
  corner: Corner,
  width: number,
  height: number,
  stageWidth: number,
  stageHeight: number,
): Box {
  const margin = overlayMargin(stageWidth, stageHeight);
  const x = corner.endsWith("left") ? margin : stageWidth - margin - width;
  const y = corner.startsWith("top") ? margin : stageHeight - margin - height;
  return { x, y, width, height };
}

/** Logo kutusu: uzun kenar `size * kisa kenar`, oran korunuyor. */
export function logoBox(
  imageWidth: number,
  imageHeight: number,
  settings: LogoSettings,
  stageWidth: number,
  stageHeight: number,
): Box {
  const longEdge = Math.min(stageWidth, stageHeight) * settings.size;
  const scale = longEdge / Math.max(imageWidth, imageHeight);
  return placeInCorner(
    settings.corner,
    imageWidth * scale,
    imageHeight * scale,
    stageWidth,
    stageHeight,
  );
}

/**
 * Logo ile etiket AYNI koseye konduysa ust uste binmesinler: etiket logonun
 * ic tarafina (ust koselerde altina, alt koselerde ustune) kaydiriliyor.
 */
export function stackLabelBox(label: Box, labelCorner: Corner, logo: Box | null, logoCorner: Corner | null): Box {
  if (!logo || logoCorner !== labelCorner) return label;
  const gap = Math.max(label.height * 0.35, 6);
  const y = labelCorner.startsWith("top") ? logo.y + logo.height + gap : logo.y - gap - label.height;
  return { ...label, y };
}

/** Etiket olculeri: yazi boyu ve ic bosluk sahnenin kisa kenarina gore. */
export function labelMetrics(stageWidth: number, stageHeight: number) {
  const shortEdge = Math.min(stageWidth, stageHeight);
  const fontSize = shortEdge * 0.032;
  return {
    fontSize,
    paddingX: fontSize * 0.9,
    paddingY: fontSize * 0.55,
  };
}
