/** Kullanım istatistikleri vekili (Faz 6). */
import { callBackend } from "@/lib/backend-proxy";
import { STATS_DAY_OPTIONS, relayJson } from "@/lib/admin-api";

export async function GET(request: Request): Promise<Response> {
  const days = Number(new URL(request.url).searchParams.get("days") ?? "30");
  const safeDays = (STATS_DAY_OPTIONS as readonly number[]).includes(days) ? days : 30;
  const call = await callBackend(`/api/admin/stats?days=${safeDays}`, {
    fallbackError: "İstatistikler yüklenemedi.",
  });
  if (!call.ok) return call.response;
  return relayJson(call.response);
}
