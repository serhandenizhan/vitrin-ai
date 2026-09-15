import { billingProxy } from "@/lib/billing-proxy";
export async function GET(request: Request) { return billingProxy("/api/subscriptions/me" + new URL(request.url).search); }
