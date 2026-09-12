/**
 * Hesap silme vekili (Faz 4).
 *
 * Asil is backend'de (`DELETE /api/account`): R2 gorselleri ve Supabase
 * kullanicisi siliniyor. Silme gizli sunucu anahtari istiyor; o anahtar
 * yalnizca backend'de duruyor, bu katmanda ve tarayicida yok.
 */
import { callBackend } from "@/lib/backend-proxy";

export async function DELETE(): Promise<Response> {
  const call = await callBackend("/api/account", {
    method: "DELETE",
    fallbackError: "Hesabınız silinemedi.",
  });
  if (!call.ok) return call.response;
  return new Response(null, { status: 204 });
}
