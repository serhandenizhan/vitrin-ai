/**
 * "Ben yönetici miyim?" vekili (Faz 6). Menüdeki "Yönetim" bağlantısı ve
 * `/admin` sayfasının ilk ekranı buna bakıyor. YETKİLENDİRME DEĞİL — her admin
 * ucu backend'de ayrıca kontrol ediliyor.
 */
import { callBackend } from "@/lib/backend-proxy";
import { relayJson } from "@/lib/admin-api";

export async function GET(): Promise<Response> {
  const call = await callBackend("/api/admin/me", { fallbackError: "Yetki bilgisi alınamadı." });
  if (!call.ok) return call.response;
  return relayJson(call.response);
}
