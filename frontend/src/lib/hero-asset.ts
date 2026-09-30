/**
 * Acilis vitrininin varlik adresleri, icerik surumuyle: `/hero/<yol>?v=<ozet>`.
 * Ozetleri `scripts/hash-hero-assets.mjs` uretir (`npm run hero:versions`).
 * Listede olmayan bir dosya istenirse hata: yanlis yazilmis bir ad sessizce
 * 404 donmesin.
 */

import versions from "@/lib/hero-asset-versions.json";

const table = versions as Record<string, string>;

export function heroAsset(path: string): string {
  const version = table[path];
  if (!version) throw new Error(`hero-asset-versions.json icinde ${path} yok (npm run hero:versions)`);
  return `/hero/${path}?v=${version}`;
}
