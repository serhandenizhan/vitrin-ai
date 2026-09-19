/**
 * Zemin yönetim paneli vekilleri (Faz 6, Kaan).
 *
 * GET listeyi (pasifler dahil), POST yeni zemin yüklemesini iletir. Gövde
 * BİLİNEN ALANLARLA YENİDEN KURULUYOR: istemcinin gönderdiği fazladan form
 * alanı backend'e hiç ulaşmıyor (diğer admin vekilleriyle aynı desen).
 *
 * Buradaki tür/boyut kontrolleri GÜVENLİK SINIRI DEĞİL, yalnızca kullanıcıyı
 * boşuna yüklemekten kurtarıyor — son sözü `validate_upload` (magic-byte +
 * piksel sınırı) söylüyor.
 */
import { relayJson } from "@/lib/admin-api";
import { callBackend, foreignOrigin, jsonError } from "@/lib/backend-proxy";
import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  formatBytes,
  resolveContentType,
} from "@/lib/upload-constraints";

export async function GET(): Promise<Response> {
  const call = await callBackend("/api/admin/backgrounds", {
    fallbackError: "Zeminler yüklenemedi.",
  });
  if (!call.ok) return call.response;
  return relayJson(call.response);
}

export async function POST(request: Request): Promise<Response> {
  const rejected = foreignOrigin(request);
  if (rejected) return rejected;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return jsonError("Bir görsel seçin.", 400);
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return jsonError(
      `Dosya çok büyük (${formatBytes(file.size)}). En fazla ${MAX_FILE_SIZE_MB} MB olabilir.`,
      400,
    );
  }
  const contentType = resolveContentType({ name: file.name, type: file.type });
  if (!contentType) {
    return jsonError("Desteklenmeyen dosya türü. JPEG, PNG, WebP veya HEIC seçin.", 400);
  }
  const tier = form?.get("tier");
  if (tier !== "basic" && tier !== "full") return jsonError("Geçersiz paket seviyesi.", 400);

  const upstream = new FormData();
  // Windows'ta .heic icin tarayici bos content-type bildiriyor; uzantidan
  // turetilen tur backend'in beyan kontrolunu gecmesi icin yeniden kuruluyor
  // (arka plan kaldirma vekiliyle ayni tuzak).
  upstream.append("file", new File([file], file.name, { type: contentType }));
  upstream.append("tier", tier);

  const call = await callBackend("/api/admin/backgrounds", {
    method: "POST",
    body: upstream,
    fallbackError: "Zemin yüklenemedi.",
  });
  if (!call.ok) return call.response;
  return relayJson(call.response, 201);
}
