/**
 * Tarayıcıda hata izleme (Faz 7) — ayarlar ve temizleme `lib/error-tracking.ts`.
 *
 * DSN boşsa SDK hiç içe aktarılmaz: dinamik `import()` ayrı bir parça üretir
 * ve ancak DSN varken indirilir. Bedeli, sayfa yüklenirken SDK hazır olmadan
 * atılan çok erken bir hatanın kaçabilmesi — kapalıyken her kullanıcının
 * fazladan SDK indirmesinden iyi bir takas.
 */
import { ERROR_TRACKING_DSN, errorTrackingOptions } from "@/lib/error-tracking";

if (ERROR_TRACKING_DSN) {
  void import("@sentry/nextjs").then((Sentry) => Sentry.init(errorTrackingOptions()));
}
