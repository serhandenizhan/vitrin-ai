/**
 * Tek zemin vekilleri (Faz 6, Kaan): paket/yayın durumu değiştirme ve silme.
 *
 * İkisi de geri dönüşü olan/olmayan bir DURUM değişikliği olduğu için Origin
 * kontrolü var (kredi ve hesap silme vekilleriyle aynı desen). Gövde bilinen
 * iki alanla yeniden kuruluyor: istemcinin gönderdiği `r2_key` gibi bir alan
 * backend'e hiç ulaşmıyor.
 */
import { isUuid, relayJson } from "@/lib/admin-api";
import { callBackend, foreignOrigin, jsonError } from "@/lib/backend-proxy";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context): Promise<Response> {
  const rejected = foreignOrigin(request);
  if (rejected) return rejected;
  const { id } = await params;
  if (!isUuid(id)) return jsonError("Zemin bulunamadı.", 404);

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const body: Record<string, unknown> = {};
  if (payload?.tier !== undefined) {
    if (payload.tier !== "basic" && payload.tier !== "full") {
      return jsonError("Geçersiz paket seviyesi.", 400);
    }
    body.tier = payload.tier;
  }
  if (payload?.isActive !== undefined) {
    if (typeof payload.isActive !== "boolean") return jsonError("Geçersiz yayın durumu.", 400);
    body.is_active = payload.isActive;
  }
  if (Object.keys(body).length === 0) return jsonError("Değiştirilecek bir alan gönderin.", 400);

  const call = await callBackend(`/api/admin/backgrounds/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    fallbackError: "Zemin güncellenemedi.",
  });
  if (!call.ok) return call.response;
  return relayJson(call.response);
}

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const rejected = foreignOrigin(request);
  if (rejected) return rejected;
  const { id } = await params;
  if (!isUuid(id)) return jsonError("Zemin bulunamadı.", 404);

  const call = await callBackend(`/api/admin/backgrounds/${id}`, {
    method: "DELETE",
    fallbackError: "Zemin silinemedi.",
  });
  if (!call.ok) return call.response;
  return relayJson(call.response);
}
