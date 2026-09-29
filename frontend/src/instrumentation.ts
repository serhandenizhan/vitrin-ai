/**
 * Next sunucusu (vekiller, sunucu bileşenleri) ve edge (`proxy.ts`) için hata
 * izleme (Faz 7). Tarayıcı tarafı `instrumentation-client.ts`'te; ayarlar ve
 * temizleme ortak (`lib/error-tracking.ts`). DSN boşken iki fonksiyon da hiçbir
 * şey yapmaz ve SDK yüklenmez.
 */
import type { Instrumentation } from "next";

import { ERROR_TRACKING_DSN, errorTrackingOptions } from "@/lib/error-tracking";

export async function register() {
  if (!ERROR_TRACKING_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init(errorTrackingOptions());
}

// Next'in yakaladığı sunucu hataları (render, route handler, server action).
// İsteğin başlıkları olaya eklenir; çerez ve Authorization `beforeSend`'de silinir.
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!ERROR_TRACKING_DSN) return;
  const { captureRequestError } = await import("@sentry/nextjs");
  captureRequestError(...args);
};
