/**
 * Frontend hata izleme ayarları ve temizleyicileri (Faz 7).
 *
 * Tarayıcı (`src/instrumentation-client.ts`), Next sunucusu ve edge
 * (`src/instrumentation.ts`) ile kök hata sınırı (`app/global-error.tsx`) aynı
 * ayarları buradan alır; temizleme mantığı tek yerde ve SDK'ya bağlı olmadan
 * test edilir (`error-tracking.test.ts`). Backend karşılığı
 * `backend/app/core/monitoring.py` — kurallar bilinçli olarak aynı.
 *
 * `NEXT_PUBLIC_SENTRY_DSN` boşsa SDK hiç YÜKLENMEZ: çağıranlar önce
 * `ERROR_TRACKING_DSN`'e bakıp SDK'yı ancak o zaman dinamik içe aktarır, yani
 * kapalıyken kullanıcının tarayıcısına tek bayt fazladan inmez. DSN tasarımı
 * gereği herkese açık bir değerdir (yalnız olay GÖNDERMEYE yarar).
 *
 * GİTMEYENLER (`SECURITY.md` bölüm 6): istek gövdesi ve çerezler, kimlik
 * bilgisi başlıkları, adreslerdeki sorgu dizesi (şifre sıfırlama kodu,
 * e-posta, `next` yönlendirmesi orada taşınıyor), tıklama kırıntıları (bir
 * öğenin metnini — ör. ürün adını — taşıyabilir), kullanıcı bilgisi, oturum
 * kaydı (replay) ve performans izi. Kalan her metinde e-posta, JWT ve
 * `Bearer` token'ı maskelenir.
 */

import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

// Next derlemede `process.env.NEXT_PUBLIC_*` ifadelerini sabit değere çevirir;
// ifade bu yüzden tam bu biçimde yazılmalı (dinamik erişim çevrilmez).
export const ERROR_TRACKING_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || "";
const ENVIRONMENT = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() || "local";

export const REDACTED = "[silindi]";

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-expected-user-id",
  "idempotency-key",
  "x-forwarded-for",
  "x-real-ip",
]);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const BEARER = /bearer\s+[A-Za-z0-9._~+/=-]+/gi;
// Supabase çerezleri (`sb-<proje>-auth-token=...`) bir metne karışırsa.
const SUPABASE_COOKIE = /sb-[A-Za-z0-9-]+-auth-token(?:\.\d+)?=[^;\s]+/g;

export function maskText(text: string): string {
  return text
    .replace(JWT, "[token]")
    .replace(BEARER, "Bearer [token]")
    .replace(SUPABASE_COOKIE, "[oturum-çerezi]")
    .replace(EMAIL, "[e-posta]");
}

function maskEverywhere<T>(value: T): T {
  if (typeof value === "string") return maskText(value) as T;
  if (Array.isArray(value)) return value.map(maskEverywhere) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, maskEverywhere(item)]),
    ) as T;
  }
  return value;
}

/** Mutlak ya da göreli bir adresten sorgu dizesini ve parça (#) kısmını atar. */
export function stripQuery(url: string): string {
  return url.split(/[?#]/, 1)[0];
}

type Json = Record<string, unknown>;

/** `beforeSend`: yalnız TİPİ SDK'dan; çalışma anında SDK'ya bağlı değil. */
export function scrubEvent(sdkEvent: ErrorEvent): ErrorEvent {
  const event = sdkEvent as unknown as Json;
  const request = event.request as Json | undefined;
  if (request && typeof request === "object") {
    const headers = request.headers as Record<string, string> | undefined;
    if (headers && typeof headers === "object") {
      request.headers = Object.fromEntries(
        Object.entries(headers).map(([name, value]) => [
          name,
          SENSITIVE_HEADERS.has(name.toLowerCase()) ? REDACTED : value,
        ]),
      );
    }
    for (const field of ["cookies", "data", "query_string"]) {
      if (field in request) request[field] = REDACTED;
    }
    if (typeof request.url === "string") request.url = stripQuery(request.url);
  }
  delete event.user;
  const breadcrumbs = event.breadcrumbs as Breadcrumb[] | undefined;
  if (Array.isArray(breadcrumbs)) {
    event.breadcrumbs = breadcrumbs
      .map((crumb) => scrubBreadcrumb(crumb))
      .filter((crumb): crumb is Breadcrumb => crumb !== null);
  }
  return maskEverywhere(event) as unknown as ErrorEvent;
}

/** `beforeBreadcrumb`: `null` dönen kırıntı hiç kaydedilmez. */
export function scrubBreadcrumb(sdkCrumb: Breadcrumb): Breadcrumb | null {
  const crumb = sdkCrumb as unknown as Json;
  // Tıklama/klavye kırıntıları öğenin metnini taşıyabilir: hiç tutulmaz.
  if (typeof crumb.category === "string" && crumb.category.startsWith("ui.")) {
    return null;
  }
  const data = crumb.data as Json | undefined;
  if (data && typeof data === "object") {
    for (const key of ["url", "from", "to"]) {
      if (typeof data[key] === "string") data[key] = stripQuery(data[key] as string);
    }
  }
  return maskEverywhere(crumb) as unknown as Breadcrumb;
}

/**
 * `Sentry.init`'e verilecek ortak ayarlar. `tracesSampleRate` bilinçli olarak
 * YOK: @sentry/nextjs'te bu anahtarın hiç verilmemesi performans izini
 * tamamen kapatır. Oturum kaydı (Replay) entegrasyonu da eklenmez.
 */
export function errorTrackingOptions() {
  return {
    dsn: ERROR_TRACKING_DSN,
    environment: ENVIRONMENT,
    sendDefaultPii: false,
    // Sunucu (Node) SDK'sında `LocalVariablesAsync` entegrasyonu yüklü; açık
    // olsaydı hata anındaki değişkenleri (form alanları, token) gönderirdi.
    // Varsayılanı kapalı ama bir sürüm değiştirirse diye açıkça kapatılıyor
    // (backend'de `include_local_variables=False`). Tarayıcıda etkisiz.
    includeLocalVariables: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
