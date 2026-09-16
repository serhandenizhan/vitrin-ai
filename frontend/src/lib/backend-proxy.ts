/**
 * Oturum gerektiren FastAPI uc noktalarina giden vekil cagrilarinin ortak
 * kismi (Faz 4).
 *
 * Her vekil ayni uc seyi yapiyor: oturumdaki token'i `Authorization` ile
 * iletmek, backend'e ulasilamazsa anlasilir bir mesaj donmek ve 401'i arayuzun
 * giris penceresini acmasini saglayan `auth_required` koduna cevirmek. Bunlar
 * her route'ta ayri yazilsaydi biri mutlaka digerinden ayrisirdi.
 */
import { getAccessToken } from "@/lib/supabase/access-token";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

/** Liste ve silme hizli; gorsel yukleme 20 MB'a kadar cikabiliyor. */
const BACKEND_TIMEOUT_MS = 60_000;

export const AUTH_REQUIRED_CODE = "auth_required";

export function jsonError(
  message: string,
  status: number,
  code?: string,
  extra?: Record<string, string | boolean>,
): Response {
  return Response.json(
    { error: message, ...(code ? { code } : {}), ...(extra ?? {}) },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function authRequired(): Response {
  return jsonError("Bu işlem için giriş yapın.", 401, AUTH_REQUIRED_CODE);
}

/**
 * Baska bir sitenin tarayicidan tetikledigi mutasyonu reddeder (CSRF).
 *
 * Oturum cerezde tutuldugu icin tarayici, baska bir sitenin gonderdigi istege
 * de cerezi ekler. Kontrol tek yerde duruyor: odeme vekillerinde olup geri
 * donulemez hesap silmede OLMAMASI, tam da ayri ayri yazildigi icin
 * gozden kacmisti.
 */
export function foreignOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return jsonError("Geçersiz istek kaynağı.", 403);
  }
  return null;
}

export type BackendCall =
  | { ok: true; response: Response }
  | { ok: false; response: Response };

export async function callBackend(
  path: string,
  init: {
    method?: string;
    body?: BodyInit;
    headers?: HeadersInit;
    fallbackError: string;
  },
): Promise<BackendCall> {
  const token = await getAccessToken();
  if (!token) return { ok: false, response: authRequired() };

  let upstream: Response;
  try {
    const headers = new Headers(init.headers);
    // Cagiranin baska bir kullanicinin token'ini dayatmasina izin verme.
    headers.set("Authorization", `Bearer ${token}`);
    upstream = await fetch(`${BACKEND_URL}${path}`, {
      method: init.method ?? "GET",
      body: init.body,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
  } catch {
    return {
      ok: false,
      response: jsonError(
        "Sunucuya ulaşılamadı. Servis çalışmıyor olabilir.",
        502,
      ),
    };
  }

  // Vekilin gecerli saydigi token'i backend reddetti (tam bu arada suresi
  // doldu, kullanici silindi): arayuz giris penceresini acsin.
  if (upstream.status === 401) return { ok: false, response: authRequired() };

  if (!upstream.ok) {
    const payload = (await upstream.json().catch(() => null)) as {
      detail?: unknown;
    } | null;
    // Backend hatalari Turkce yaziliyor; dogrulama mesaji aynen aktariliyor.
    const message =
      typeof payload?.detail === "string" && payload.detail.length > 0
        ? payload.detail
        : init.fallbackError;
    const detail = payload?.detail as
      | {
          code?: string;
          message?: string;
          checkout_url?: string;
          retry_safe?: boolean;
        }
      | undefined;
    // Backend, cozumu icin gereken adresi hataya koyabiliyor (devam eden
    // satin alma). YALNIZCA kendi `/odeme/` yolumuz gecirilir: backend'den
    // gelen serbest bir URL'i arayuze tasimak acik yonlendirme olurdu.
    // `retry_safe`: kredinin HIC tuketilmedigini ya da iade edildigini
    // backend'in acikca soylemesi. Istemci yeni bir idempotency anahtarina
    // yalnizca bu bayrakla gecer.
    const extra: Record<string, string | boolean> = {};
    if (
      typeof detail?.checkout_url === "string" &&
      /^\/odeme\/[a-f0-9-]{36}$/i.test(detail.checkout_url)
    ) {
      extra.checkout_url = detail.checkout_url;
    }
    if (detail?.retry_safe === true) extra.retry_safe = true;
    const response = jsonError(typeof detail?.message === "string" ? detail.message : message, upstream.status, typeof detail?.code === "string" ? detail.code : undefined, Object.keys(extra).length ? extra : undefined);
    const retry = upstream.headers.get("Retry-After");
    if (retry) response.headers.set("Retry-After", retry);
    return { ok: false, response };
  }

  return { ok: true, response: upstream };
}
