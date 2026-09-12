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

export function jsonError(message: string, status: number, code?: string): Response {
  return Response.json(code ? { error: message, code } : { error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function authRequired(): Response {
  return jsonError("Bu işlem için giriş yapın.", 401, AUTH_REQUIRED_CODE);
}

export type BackendCall =
  | { ok: true; response: Response }
  | { ok: false; response: Response };

export async function callBackend(
  path: string,
  init: { method?: string; body?: BodyInit; fallbackError: string },
): Promise<BackendCall> {
  const token = await getAccessToken();
  if (!token) return { ok: false, response: authRequired() };

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}${path}`, {
      method: init.method ?? "GET",
      body: init.body,
      headers: { Authorization: `Bearer ${token}` },
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
    return { ok: false, response: jsonError(message, upstream.status) };
  }

  return { ok: true, response: upstream };
}
