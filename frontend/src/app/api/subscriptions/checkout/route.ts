import { billingProxy } from "@/lib/billing-proxy";
export async function POST(request: Request) { return billingProxy("/api/subscriptions/checkout", request); }
