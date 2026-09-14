/**
 * Tek bir gecmis calismayi silme vekili (Faz 4).
 *
 * Sahiplik kontrolu backend'de (`user_id` filtresi, baskasinin kaydi 404).
 * Burada yalnizca kimligin bir UUID oldugu dogrulaniyor: adrese eklenen deger
 * backend'de baska bir yola gitmesin.
 */
import { callBackend, jsonError } from "@/lib/backend-proxy";
import { isProjectId } from "@/lib/project-record";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const { id } = await params;
  if (!isProjectId(id)) return jsonError("Çalışma bulunamadı.", 404);
  const expectedUserId = request.headers.get("X-Expected-User-Id");
  if (!expectedUserId) return jsonError("Oturum kimliği eksik.", 409);

  const call = await callBackend(`/api/projects/${id}`, {
    method: "DELETE",
    headers: { "X-Expected-User-Id": expectedUserId },
    fallbackError: "Çalışma silinemedi.",
  });
  if (!call.ok) return call.response;
  return new Response(null, { status: 204 });
}
