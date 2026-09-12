/**
 * Giris/e-posta dogrulama sonrasi donulecek adresi guvenli hale getirir.
 *
 * ACIK YONLENDIRME (ROADMAP Faz 4, SECURITY.md): `?next=` kullanicinin
 * degistirebildigi bir parametre. Oldugu gibi kullanilsaydi
 * `?next=https://sahte-site.com` ya da `?next=//sahte-site.com` bizim alan
 * adimizdan gelen bir baglantiyla kullaniciyi baska bir siteye gonderirdi —
 * oltalamanin klasik yolu. Yalnizca site ICI mutlak yollar kabul ediliyor.
 */
export function safeRedirectPath(
  next: string | null | undefined,
  fallback = "/",
): string {
  if (!next) return fallback;
  // Tek "/" ile baslamali. "//" ve "/\" tarayicida baska bir alan adina
  // (protocol-relative) donusuyor.
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  // Kontrol karakterleri (sekme, satir sonu) tarayici tarafindan silinip
  // "/<sekme>/sahte-site.com" -> "//sahte-site.com" haline gelebiliyor.
  if (hasControlCharacter(next)) return fallback;
  return next;
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
