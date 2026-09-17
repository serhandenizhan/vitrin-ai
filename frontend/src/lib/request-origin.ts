/**
 * Tarayicinin GERCEKTEN baglandigi adres (ornek: http://192.168.1.181:3000).
 *
 * `request.url` / `nextUrl.origin` yetmiyor: `next start -H 0.0.0.0` ile
 * calisan sunucu onu dinledigi adresten kuruyor (`http://0.0.0.0:3000`).
 * Sonuc (Kaan, 17.09.2026): sitenin kendi istekleri "Gecersiz istek kaynagi"
 * diye reddediliyor, e-posta dogrulamasi sonrasi yonlendirme 0.0.0.0'a gidip
 * giris tamamlanamiyordu. Host basligini baska bir site tarayiciya
 * degistirtemez; ters vekil arkasinda X-Forwarded-* basliklari kullaniliyor.
 */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const first = (name: string) => request.headers.get(name)?.split(",")[0]?.trim() || null;
  const host = first("x-forwarded-host") ?? first("host") ?? url.host;
  const proto = first("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
