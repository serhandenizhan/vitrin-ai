/** Kesim kuyruğu sağlığı vekili (Faz 7 kapanışı, 02.10.2026). */
import { callBackend } from "@/lib/backend-proxy";
import { relayJson } from "@/lib/admin-api";

export async function GET(): Promise<Response> {
  const call = await callBackend("/api/admin/cutout-queue", {
    fallbackError: "Kesim kuyruğu durumu yüklenemedi.",
  });
  if (!call.ok) return call.response;
  return relayJson(call.response);
}
