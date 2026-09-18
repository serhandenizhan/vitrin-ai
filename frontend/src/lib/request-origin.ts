/**
 * Tarayicinin GERCEKTEN baglandigi adres (ornek: http://192.168.1.181:3000).
 *
 * `request.url` / `nextUrl.origin` yetmiyor: `next start -H 0.0.0.0` ile
 * calisan sunucu onu dinledigi adresten kuruyor (`http://0.0.0.0:3000`).
 * Sonuc (Kaan, 17.09.2026): sitenin kendi istekleri "Gecersiz istek kaynagi"
 * diye reddediliyor, e-posta dogrulamasi sonrasi yonlendirme 0.0.0.0'a gidip
 * giris tamamlanamiyordu.
 *
 * NEDEN YALNIZCA `Host`, `X-Forwarded-*` DEGIL (guvenlik incelemesinde
 * bulundu, 18.09.2026): `Host` tarayicinin GERCEKTEN baglandigi adresi
 * tasir ve JS'ten degistirilemez (Fetch spec'inin yasakli baslik listesinde) —
 * bu yuzden guvenilir. `X-Forwarded-Host` / `X-Forwarded-Proto` ise SIRADAN
 * bir baslik; `fetch()` ile YAZILABILIR ve bu fonksiyon onu hicbir guvenilir
 * vekil kontrolu olmadan dogrudan okuyordu. Bu, backend'in kendi cozdugu
 * AYNI hatayi tekrar acardi: `backend/app/services/billing/limits.py`'deki
 * `client_ip()`, `X-Forwarded-For`'u yalnizca baglanan adres
 * `TRUSTED_PROXY_IPS` listesindeyse okuyor — "korlemesine guvenmek siniri
 * kaldirir" diye acikca yazili. Bu dosya o guven sinirini uygulamiyordu.
 *
 * Somut yol: `backend-proxy.ts::foreignOrigin` bu fonksiyonun sonucunu CSRF
 * benzeri bir Origin kontrolunde kullaniyor. `X-Forwarded-Host` guvenilseydi,
 * `Origin: https://evil.com` + `X-Forwarded-Host: evil.com` beraber
 * gonderildiginde kontrol saldirganin isteğini "kendi istegimiz" sanip
 * GECIRIRDI. Tarayici tabanli klasik CSRF'te bu ozel baslik preflight'a
 * takilip engellenir, ama proxy arkasinda `X-Forwarded-Host`'u SUZMEYEN bir
 * kurulumda dogrudan (tarayicisiz) bir istekle tetiklenebilirdi — dogrulanmis
 * bir istismar degil ama kapatilmasi bedava bir varsayim acigi.
 *
 * Ters vekil arkasinda gercekten X-Forwarded-* gerekiyorsa (ornegin TLS
 * sonlandiran bir proxy sonrasi sema degisiyorsa), backend'deki
 * `TRUSTED_PROXY_IPS` deseninin ayni turden bir guven listesiyle BURAYA da
 * eklenmesi gerekir — ayri bir karar ve degisiklik.
 */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("host")?.split(",")[0]?.trim() || url.host;
  return `${url.protocol}//${host}`;
}
