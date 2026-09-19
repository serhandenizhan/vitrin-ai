/**
 * Tek kullanıcı vekili (Faz 6): ayrıntı ve yönetici eliyle hesap silme.
 *
 * Silme geri döndürülemez: hesap silme ve ödeme mutasyonlarıyla aynı kaynak
 * (Origin) kontrolü var; backend ayrıca kullanıcının e-postasının yazılmasını
 * ve hedefin yönetici olmamasını istiyor.
 */
import { callBackend, foreignOrigin, jsonError } from "@/lib/backend-proxy";
import { isUuid, relayJson } from "@/lib/admin-api";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return jsonError("Kullanıcı bulunamadı.", 404);
  const call = await callBackend(`/api/admin/users/${id}`, {
    fallbackError: "Kullanıcı bilgileri yüklenemedi.",
  });
  if (!call.ok) return call.response;
  return relayJson(call.response);
}

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const rejected = foreignOrigin(request);
  if (rejected) return rejected;
  const { id } = await params;
  if (!isUuid(id)) return jsonError("Kullanıcı bulunamadı.", 404);
  const payload = (await request.json().catch(() => null)) as { email?: unknown } | null;
  if (typeof payload?.email !== "string" || !payload.email.trim()) {
    return jsonError("Silmek için kullanıcının e-posta adresini yazın.", 400);
  }
  const call = await callBackend(`/api/admin/users/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ email: payload.email.trim() }),
    headers: { "Content-Type": "application/json" },
    fallbackError: "Hesap silinemedi.",
  });
  if (!call.ok) return call.response;
  return relayJson(call.response, 202);
}
