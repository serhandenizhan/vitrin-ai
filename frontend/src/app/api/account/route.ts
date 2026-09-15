/**
 * Hesap silme vekili (Faz 4).
 *
 * Asil is backend'de (`DELETE /api/account`): R2 gorselleri ve Supabase
 * kullanicisi siliniyor. Silme gizli sunucu anahtari istiyor; o anahtar
 * yalnizca backend'de duruyor, bu katmanda ve tarayicida yok.
 */
import { callBackend, foreignOrigin, jsonError } from "@/lib/backend-proxy";

export async function DELETE(request: Request): Promise<Response> {
  // Geri dondurulemez bir islem; odeme mutasyonlariyla ayni kaynak kontrolu.
  const rejected = foreignOrigin(request);
  if (rejected) return rejected;
  const payload = (await request.json().catch(() => null)) as { email?: unknown } | null;
  if (typeof payload?.email !== "string" || !payload.email.trim()) {
    return jsonError("Hesabı silmek için e-posta adresinizi yazın.", 400);
  }

  const call = await callBackend("/api/account", {
    method: "DELETE",
    body: JSON.stringify({ email: payload.email }),
    headers: { "Content-Type": "application/json" },
    fallbackError: "Hesabınız silinemedi.",
  });
  if (!call.ok) return call.response;
  if (call.response.status === 202) return Response.json(await call.response.json(), { status: 202, headers: { "Cache-Control": "no-store" } });
  return new Response(null, { status: 204 });
}
