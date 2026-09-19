/**
 * Yönetici yetkisi verme/kaldırma vekili (Faz 6, PR #25 incelemesinden Codex'in
 * bulduğu eksik: `admin_add`/`admin_remove` denetim eylemleri tanımlıydı ama
 * onları kullanan bir uç yoktu).
 *
 * Hesap silme ve ödeme mutasyonlarıyla aynı kaynak (Origin) kontrolü var;
 * backend ayrıca hedefin e-postasının doğru yazılmasını istiyor (yanlış
 * hesaba tıklanarak yönetici yapılamaz/yetkisi alınamaz) ve son yöneticinin
 * kaldırılmasını reddediyor.
 */
import { callBackend, foreignOrigin, jsonError } from "@/lib/backend-proxy";
import { isUuid, relayJson } from "@/lib/admin-api";

type Context = { params: Promise<{ id: string }> };

function readEmail(payload: unknown): string | null {
  const email = (payload as { email?: unknown } | null)?.email;
  return typeof email === "string" && email.trim() ? email.trim() : null;
}

export async function POST(request: Request, { params }: Context): Promise<Response> {
  const rejected = foreignOrigin(request);
  if (rejected) return rejected;
  const { id } = await params;
  if (!isUuid(id)) return jsonError("Kullanıcı bulunamadı.", 404);
  const email = readEmail(await request.json().catch(() => null));
  if (!email) return jsonError("Yönetici yapmak için kullanıcının e-posta adresini yazın.", 400);

  const call = await callBackend(`/api/admin/users/${id}/admin`, {
    method: "POST",
    body: JSON.stringify({ email }),
    headers: { "Content-Type": "application/json" },
    fallbackError: "Yönetici yetkisi verilemedi.",
  });
  if (!call.ok) return call.response;
  return relayJson(call.response, 201);
}

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const rejected = foreignOrigin(request);
  if (rejected) return rejected;
  const { id } = await params;
  if (!isUuid(id)) return jsonError("Kullanıcı bulunamadı.", 404);
  const email = readEmail(await request.json().catch(() => null));
  if (!email) return jsonError("Yönetici yetkisini kaldırmak için kullanıcının e-posta adresini yazın.", 400);

  const call = await callBackend(`/api/admin/users/${id}/admin`, {
    method: "DELETE",
    body: JSON.stringify({ email }),
    headers: { "Content-Type": "application/json" },
    fallbackError: "Yönetici yetkisi kaldırılamadı.",
  });
  if (!call.ok) return call.response;
  return relayJson(call.response, 200);
}
