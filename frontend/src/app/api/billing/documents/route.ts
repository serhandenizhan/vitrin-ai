import { publicBillingProxy } from "@/lib/billing-proxy";
export async function GET() { return publicBillingProxy("/api/billing/documents"); }
