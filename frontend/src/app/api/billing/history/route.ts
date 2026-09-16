import { billingProxy } from "@/lib/billing-proxy";
export async function GET(request: Request) { return billingProxy("/api/billing/history" + new URL(request.url).search); }
