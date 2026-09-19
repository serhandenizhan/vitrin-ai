/**
 * Kullanıcının beğendiği zeminler (öne alınan iş, 19.09.2026, Kaan).
 *
 * BİLİNÇLİ GEÇİCİ ÇÖZÜM: favoriler yalnızca BU TARAYICIDA (localStorage)
 * tutuluyor — logo ayarlarıyla aynı yaklaşım. Başka cihazda görünmez.
 * Hesaba bağlamak (tablo + RLS + API) ayrı bir iş; bkz. ROADMAP.md.
 *
 * Depolama kapalı/dolu olabilir (gizli pencere, kota): her okuma ve yazma
 * try/catch içinde, başarısızlıkta favoriler yalnızca oturum boyunca yaşar.
 */
export const FAVORITES_STORAGE_KEY = "vitrin-ai:favorite-backgrounds";

/** Aşırı büyümeyi önlemek için üst sınır; kütüphane ~100 zemin. */
const MAX_FAVORITES = 200;

export function readFavoriteBackgrounds(): string[] {
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string").slice(0, MAX_FAVORITES);
  } catch {
    return [];
  }
}

export function writeFavoriteBackgrounds(ids: readonly string[]): void {
  try {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_FAVORITES)));
  } catch {
    // Depolama yoksa favori yalnizca bu oturumda kalir.
  }
}

/** Favoriyse çıkarır, değilse EN BAŞA ekler (son beğenilen önde). */
export function toggleFavorite(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [id, ...ids];
}
