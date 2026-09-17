"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/workspace-provider";
import { billingFetch, money, type Subscription, type BillingTransaction } from "@/lib/billing";

export function BillingPanel() {
  const { user, isAuthLoaded, openSignIn } = useWorkspace();
  if (!isAuthLoaded) return null;
  if (!user) return <button className="mt-6 min-h-11 underline" onClick={() => openSignIn()}>Kredileriniz ve ödemeleriniz için giriş yapın</button>;
  return <SignedInBillingPanel key={user.id} />;
}

function SignedInBillingPanel() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [items, setItems] = useState<BillingTransaction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [sub, history] = await Promise.all([billingFetch<Subscription>("/api/subscriptions/me"), billingFetch<{ items: BillingTransaction[]; next_cursor: string | null }>("/api/billing/history")]);
      setSubscription(sub); setItems(history.items); setCursor(history.next_cursor); setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "Ödeme bilgileri alınamadı."); }
  }, []);
  useEffect(() => { const initial = window.setTimeout(() => void load(), 0); const refresh = () => { void load(); }; window.addEventListener("billing-updated", refresh); return () => { window.clearTimeout(initial); window.removeEventListener("billing-updated", refresh); }; }, [load]);
  async function cancel() {
    setBusy(true);
    try { await billingFetch("/api/subscriptions/cancel", { idempotency_key: crypto.randomUUID() }); await load(); }
    catch (error) { setError(error instanceof Error ? error.message : "İptal tamamlanamadı."); }
    finally { setBusy(false); }
  }
  return <section className="mt-8 rounded-3xl border border-black/10 bg-white p-6" aria-label="Abonelik ve ödemeler">
    <h2 className="text-xl font-semibold">Abonelik ve krediler</h2>
    {error && <p role="status" className="mt-3 text-sm">{error}</p>}
    {subscription && <>
      <p className="mt-4 text-3xl font-semibold">{subscription.admin_exempt ? "Sınırsız" : subscription.billing_issue ? 0 : Math.max(0, (subscription.period?.quota_snapshot ?? 0) - (subscription.period?.used_this_period ?? 0))} <span className="text-base font-normal">kredi</span></p>
      {subscription.period && <p className="mt-2 text-sm">Dönem sonu: {new Date(subscription.period.ends_at).toLocaleDateString("tr-TR")}</p>}
      {subscription.billing_issue && <p role="status" className="mt-2 text-sm">{subscription.billing_issue.message}</p>}
      {subscription.subscription?.status === "canceling" && <p className="mt-2 text-sm">İptal talebiniz işleniyor. Sağlayıcı onayı bekleniyor.</p>}
      {subscription.subscription?.status === "canceled" && <p className="mt-2 text-sm">Yenileme iptal edildi. Satın aldığınız erişim dönem sonuna kadar sürer.</p>}
      <div className="mt-4 flex flex-wrap gap-4"><Link className="underline" href="/paketler">Paketleri incele</Link>
      {subscription.period?.plan_id !== "deneme" && subscription.subscription?.status !== "canceled" && <button disabled={busy || subscription.subscription?.status === "canceling"} onClick={() => void cancel()} className="underline disabled:opacity-50">Yenilemeyi iptal et</button>}</div>
    </>}
    <h3 className="mt-8 font-semibold">Ödeme geçmişi</h3>
    {items.length === 0 && <p className="mt-3 text-sm">Henüz ödeme kaydı yok.</p>}
    <ul className="divide-y divide-black/10">{items.map(item => <li key={item.id} className="py-4 text-sm flex justify-between gap-4"><div>{new Date(item.created_at).toLocaleDateString("tr-TR")} · {({ charge: "Ödeme", refund: "İade", chargeback: "Banka itirazı", chargeback_reversal: "İtiraz sonucu" } as Record<string, string>)[item.type]}<p>{item.invoice_reference ? `Fatura: ${item.invoice_reference}` : "Fatura numarası henüz eklenmedi"}</p></div><strong>{money(item.amount_minor_units, item.currency)}</strong></li>)}</ul>
    {cursor && <button className="mt-3 underline" onClick={async () => { try { const page = await billingFetch<{ items: BillingTransaction[]; next_cursor: string | null }>(`/api/billing/history?before=${cursor}`); setItems(old => [...old, ...page.items]); setCursor(page.next_cursor); } catch { setError("Geçmiş yüklenemedi."); } }}>Daha eski ödemeler</button>}
  </section>;
}
