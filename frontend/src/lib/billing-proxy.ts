import { callBackend, jsonError } from "@/lib/backend-proxy";
export async function billingProxy(path: string, request?: Request): Promise<Response> {
  let body: string | undefined;
  if (request) {
    if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return jsonError("Geçersiz istek kaynağı.", 403);
    const payload: unknown = await request.json().catch(() => null);
    if (!payload || JSON.stringify(payload).length > 16384) return jsonError("Geçersiz istek.", 400);
    body = JSON.stringify(payload);
  }
  const call = await callBackend(path, { method: request ? "POST" : "GET", body, headers: body ? { "Content-Type": "application/json" } : undefined, fallbackError: "Ödeme bilgileri alınamadı." });
  if (!call.ok) return call.response;
  return new Response(await call.response.text(), { status: call.response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
export async function publicBillingProxy(path: string): Promise<Response> {
  try {
    const upstream = await fetch(`${process.env.BACKEND_URL ?? "http://localhost:8000"}${path}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return new Response(await upstream.text(), { status: upstream.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch { return jsonError("Paket bilgileri şu anda alınamıyor.", 502); }
}
