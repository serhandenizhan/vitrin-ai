import { billingProxy } from "@/lib/billing-proxy";
import { jsonError } from "@/lib/backend-proxy";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
 const { id } = await context.params;
 if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return jsonError("Geçersiz ödeme kimliği.",400);
 return billingProxy(`/api/subscriptions/checkout/${id}`);
}
