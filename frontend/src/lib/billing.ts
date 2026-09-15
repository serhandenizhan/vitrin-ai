export type Plan = { id: string; name: string; plan_version_id: string; price_minor_units: number; currency: string; monthly_quota: number; background_tier: "basic" | "full"; trial_period_days: number };
export type BillingDocument = { document_type: string; document_version: string; document_hash: string; locale: string; text: string };
export type Subscription = { subscription: { status: string; access_until: string | null; deletion_requested_at: string | null }; period: { quota_snapshot: number; used_this_period: number; ends_at: string; plan_id: string } | null; admin_exempt: boolean; billing_issue: { message: string } | null };
export type BillingTransaction = { id: string; type: string; status: string; amount_minor_units: number; currency: string; invoice_reference: string | null; created_at: string };
export const money = (amount: number, currency = "TRY") => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(amount / 100);
export async function billingFetch<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(value?.error ?? value?.detail?.message ?? "İşlem tamamlanamadı.");
  return value as T;
}
