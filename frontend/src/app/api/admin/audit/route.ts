/** Denetim günlüğü vekili (Faz 6, 19.09.2026). Yalnız okuma; yetki backend'de. */
import { callBackend } from "@/lib/backend-proxy";
import { AUDIT_PER_PAGE, isAuditAction, isUuid, relayJson } from "@/lib/admin-api";

export async function GET(request: Request): Promise<Response> {
  const incoming = new URL(request.url).searchParams;
  const params = new URLSearchParams({ per_page: String(AUDIT_PER_PAGE) });
  const page = Number(incoming.get("page") ?? "1");
  params.set("page", String(Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1));
  // Bilinmeyen eylem backend'e hic gitmiyor (orada da 422 ile reddediliyor).
  const action = incoming.get("action");
  if (isAuditAction(action)) params.set("action", action);
  const actor = incoming.get("actor");
  if (isUuid(actor)) params.set("actor", actor);

  const call = await callBackend(`/api/admin/audit?${params}`, {
    fallbackError: "Günlük yüklenemedi.",
  });
  if (!call.ok) return call.response;
  return relayJson(call.response);
}
