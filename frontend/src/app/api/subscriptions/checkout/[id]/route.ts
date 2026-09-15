import { billingProxy } from "@/lib/billing-proxy";
import { jsonError } from "@/lib/backend-proxy";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
 const { id } = await context.params;
 if (!UUID.test(id)) return jsonError("Geçersiz ödeme kimliği.",400);
 return billingProxy(`/api/subscriptions/checkout/${id}`);
}
/** Devam eden satın almayı bırakıp başka bir plan seçebilmek için (Faz 5, madde 7). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 const { id } = await context.params;
 if (!UUID.test(id)) return jsonError("Geçersiz ödeme kimliği.",400);
 return billingProxy(`/api/subscriptions/checkout/${id}/cancel`, request);
}
