/** Bonus krediyi geri alma vekili (Faz 6). Kullanılmış kısım kullanılmış kalır. */
import { callBackend, foreignOrigin, jsonError } from "@/lib/backend-proxy";
import { isUuid, relayJson } from "@/lib/admin-api";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context): Promise<Response> {
  const rejected = foreignOrigin(request);
  if (rejected) return rejected;
  const { id } = await params;
  if (!isUuid(id)) return jsonError("Kredi bulunamadı.", 404);
  const call = await callBackend(`/api/admin/credits/${id}/revoke`, {
    method: "POST",
    fallbackError: "Kredi geri alınamadı.",
  });
  if (!call.ok) return call.response;
  return relayJson(call.response);
}
