/**
 * Zemin kategorileri, yonu ve baski uyarisi (one alinan is, 17.09.2026).
 *
 * NEDEN VERITABANINDA DEGIL: Kaan'in karari — kategori ve baski uyarisi icin
 * tabloya yeni sutun eklemek "karisikliga sebep olur". Bilgi, yukleme
 * betiginin urettigi `background-catalog.ts` dosyasinda zemin kimligine gore
 * tutuluyor. Faz 6'daki yonetim paneli gelince veritabanina tasinabilir.
 *
 * Katalogda olmayan bir zemin (ornegin sonradan panelden yuklenen) "Sade"
 * sayiliyor ve baski uyarisi almiyor: listede kaybolmasin, secici bozulmasin.
 */
import { BACKGROUND_CATALOG } from "@/lib/background-catalog";
import type { Orientation } from "@/lib/composition";

export const BACKGROUND_CATEGORIES = [
  { id: "sade", label: "Sade" },
  { id: "doku", label: "Doku & desen" },
  { id: "dogal", label: "Doğal & çiçekli" },
  { id: "luks", label: "Lüks & koyu" },
] as const;

export type BackgroundCategory = (typeof BACKGROUND_CATEGORIES)[number]["id"];

export const DEFAULT_BACKGROUND_CATEGORY: BackgroundCategory = "sade";

export type BackgroundCatalogEntry = {
  category: BackgroundCategory;
  /** Zeminin gorsel yonu; yuklemede olculen genislik/yukseklikten. */
  orientation?: Orientation;
  /** Zeminin cozunurlugu baski icin dusuk: CMYK indirmeden once onay istenir. */
  printWarning?: boolean;
};

export function isBackgroundCategory(value: unknown): value is BackgroundCategory {
  return BACKGROUND_CATEGORIES.some((category) => category.id === value);
}

/** Yer tutucu gradyanlar ve katalogda olmayan zeminler "Sade". */
export function backgroundCategory(id: string): BackgroundCategory {
  const entry = BACKGROUND_CATALOG[id];
  return entry && isBackgroundCategory(entry.category)
    ? entry.category
    : DEFAULT_BACKGROUND_CATEGORY;
}

/**
 * Zemin bu yondeki bir bicimde gosterilsin mi (Kaan, 17.09.2026).
 *
 * Dikey bir zemin kare/yatay bicime, yatay bir zemin hikayeye konunca buyuk
 * kismi kirpiliyor ve kotu duruyor; bu yuzden fotograf ve desenli zeminler
 * yalnizca uygun bicimde listeleniyor. "Sade" (duz renk, degrade) ve yonu
 * bilinmeyen her zemin HER bicimde: kirpilmak onlari bozmuyor.
 */
export function fitsOrientation(id: string, orientation: Orientation): boolean {
  const entry = BACKGROUND_CATALOG[id];
  if (!entry || backgroundCategory(id) === "sade" || !entry.orientation) return true;
  return entry.orientation === orientation;
}

export function needsPrintWarning(id: string): boolean {
  return BACKGROUND_CATALOG[id]?.printWarning === true;
}

export const PRINT_WARNING_MESSAGE =
  "Bu görsel baskıya önerilmiyor. Yine de onaylıyor musunuz?";
