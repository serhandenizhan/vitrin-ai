/**
 * Bonus kredi verme vekili (Faz 6).
 *
 * İdempotency anahtarı İSTEMCİDEN gelir ve formun ömrü boyunca aynı kalır:
 * ağda kaybolan bir yanıt yüzünden tekrar basılan "Ver" ikinci krediyi açmaz
 * (kök CLAUDE.md, erişim kuralı 4 — anahtar işi tanımlar).
 */
import { callBackend, foreignOrigin, jsonError } from "@/lib/backend-proxy";
import {
  CREDIT_AMOUNT_MAX,
  CREDIT_REASON_MAX,
  CREDIT_REASON_MIN,
  isUuid,
  relayJson,
} from "@/lib/admin-api";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context): Promise<Response> {
  const rejected = foreignOrigin(request);
  if (rejected) return rejected;
  const { id } = await params;
  if (!isUuid(id)) return jsonError("Kullanıcı bulunamadı.", 404);

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const amount = payload?.amount;
  const reason = typeof payload?.reason === "string" ? payload.reason.trim() : "";
  if (!Number.isInteger(amount) || (amount as number) < 1 || (amount as number) > CREDIT_AMOUNT_MAX) {
    return jsonError(`Kredi 1-${CREDIT_AMOUNT_MAX} arasında bir tam sayı olmalı.`, 400);
  }
  if (reason.length < CREDIT_REASON_MIN || reason.length > CREDIT_REASON_MAX) {
    return jsonError(`Gerekçe ${CREDIT_REASON_MIN}-${CREDIT_REASON_MAX} karakter olmalı.`, 400);
  }
  if (!isUuid(payload?.idempotencyKey)) return jsonError("İşlem anahtarı eksik.", 400);
  const body: Record<string, unknown> = {
    amount,
    reason,
    idempotency_key: payload.idempotencyKey,
  };
  if (typeof payload?.expiresAt === "string" && payload.expiresAt) {
    const expires = new Date(payload.expiresAt);
    if (Number.isNaN(expires.getTime())) return jsonError("Geçersiz son kullanma tarihi.", 400);
    // Saat dilimi ZORUNLU (backend `AwareDatetime`): ISO + Z ile gonderiliyor.
    body.expires_at = expires.toISOString();
  }

  const call = await callBackend(`/api/admin/users/${id}/credits`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    fallbackError: "Kredi verilemedi.",
  });
  if (!call.ok) return call.response;
  return relayJson(call.response, 201);
}
