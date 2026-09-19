/** Kullanıcı listesi vekili (Faz 6). Arama yalnızca e-posta ile (ad araması Faz 7'ye ertelendi). */
import { callBackend } from "@/lib/backend-proxy";
import { USERS_PER_PAGE, relayJson } from "@/lib/admin-api";

export async function GET(request: Request): Promise<Response> {
  const incoming = new URL(request.url).searchParams;
  const params = new URLSearchParams({ per_page: String(USERS_PER_PAGE) });
  const page = Number(incoming.get("page") ?? "1");
  params.set("page", String(Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1));
  const query = incoming.get("query")?.trim();
  if (query) params.set("query", query.slice(0, 254));

  const call = await callBackend(`/api/admin/users?${params}`, {
    fallbackError: "Kullanıcılar yüklenemedi.",
  });
  if (!call.ok) return call.response;
  return relayJson(call.response);
}
