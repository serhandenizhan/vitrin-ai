/**
 * Sitenin dis adresi (paylasim onizlemesi, site haritasi). Alan adi henuz
 * yok (kok CLAUDE.md, acik takip 2): `NEXT_PUBLIC_SITE_URL` verilmezse
 * Vercel'in adresi, o da yoksa yerel adres kullanilir. Canlida alan adi
 * belli olunca `.env`e yazilir.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
