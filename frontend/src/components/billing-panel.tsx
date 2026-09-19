"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, CreditCard, Gauge, LoaderCircle, ReceiptText } from "lucide-react";

import { useWorkspace } from "@/components/workspace-provider";
import { billingFetch, money, type BillingTransaction, type Subscription } from "@/lib/billing";

export function BillingPanel() {
  const { user, isAuthLoaded, openSignIn } = useWorkspace();
  if (!isAuthLoaded) return null;
  if (!user) return <button className="glass-panel-light mt-6 min-h-11 rounded-full px-5 underline underline-offset-4" onClick={() => openSignIn()}>Kredileriniz ve ödemeleriniz için giriş yapın</button>;
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
      const [sub, history] = await Promise.all([
        billingFetch<Subscription>("/api/subscriptions/me"),
        billingFetch<{ items: BillingTransaction[]; next_cursor: string | null }>("/api/billing/history"),
      ]);
      setSubscription(sub);
      setItems(history.items);
      setCursor(history.next_cursor);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Ödeme bilgileri alınamadı.");
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const refresh = () => void load();
    window.addEventListener("billing-updated", refresh);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("billing-updated", refresh);
    };
  }, [load]);

  async function cancel() {
    setBusy(true);
    try {
      await billingFetch("/api/subscriptions/cancel", { idempotency_key: crypto.randomUUID() });
      await load();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "İptal tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  }

  const remaining = subscription
    ? subscription.admin_exempt
      ? "Sınırsız"
      : String(subscription.billing_issue ? 0 : Math.max(0, (subscription.period?.quota_snapshot ?? 0) - (subscription.period?.used_this_period ?? 0)) + (subscription.bonus_credits ?? 0))
    : "—";

  return (
    <section id="abonelik" className="glass-panel-light mt-8 rounded-3xl p-6 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-[#d6a756]/35 hover:shadow-[0_28px_60px_-34px_rgba(82,61,29,0.46)] sm:p-8" aria-label="Abonelik ve ödemeler">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-gold text-[0.75rem] font-semibold tracking-[0.1em] uppercase">Plan ve kullanım</p>
          <h2 className="mt-2 text-[1.5rem] font-semibold tracking-[-0.02em]">Abonelik ve krediler</h2>
        </div>
        <Link className="press rounded-full bg-black px-4 py-2 text-[0.8125rem] font-medium text-white" href="/paketler">Paketleri incele</Link>
      </div>

      {error ? <p role="status" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {!subscription && !error ? <p role="status" className="on-light-muted mt-6 flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin" aria-hidden /> Bilgiler yükleniyor…</p> : null}

      {subscription ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Metric icon={Gauge} label="Kalan kredi" value={remaining} />
          <Metric icon={CreditCard} label="Plan durumu" value={subscription.admin_exempt ? "Yönetici" : subscription.subscription?.status === "canceling" ? "İptal bekliyor" : subscription.subscription?.status === "canceled" ? "Yenileme kapalı" : "Aktif"} />
          <Metric icon={CalendarDays} label="Dönem sonu" value={subscription.period ? new Date(subscription.period.ends_at).toLocaleDateString("tr-TR") : "—"} />
        </div>
      ) : null}

      {subscription?.billing_issue ? <p role="status" className="mt-4 text-sm">{subscription.billing_issue.message}</p> : null}
      {subscription?.subscription?.status === "canceling" ? <p className="mt-4 text-sm">İptal talebiniz işleniyor. Sağlayıcı onayı bekleniyor.</p> : null}
      {subscription?.subscription?.status === "canceled" ? <p className="mt-4 text-sm">Yenileme iptal edildi. Satın aldığınız erişim dönem sonuna kadar sürer.</p> : null}
      {subscription &&
      subscription.period?.plan_id !== "deneme" &&
      subscription.subscription?.status !== "canceled" ? (
        <button disabled={busy || subscription?.subscription?.status === "canceling"} onClick={() => void cancel()} className="on-light-muted mt-4 text-sm underline underline-offset-4 disabled:opacity-50">{busy ? "İşleniyor…" : "Yenilemeyi iptal et"}</button>
      ) : null}

      <div className="mt-8 border-t border-black/8 pt-6">
        <h3 className="flex items-center gap-2 font-semibold"><ReceiptText className="size-4" strokeWidth={1.75} aria-hidden /> Ödeme geçmişi</h3>
        {items.length === 0 ? <p className="on-light-muted mt-3 text-sm">Henüz ödeme kaydı yok.</p> : null}
        <ul className="mt-2 divide-y divide-black/8">
          {items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4 py-4 text-sm">
              <div>
                <p className="font-medium">{({ charge: "Ödeme", refund: "İade", chargeback: "Banka itirazı", chargeback_reversal: "İtiraz sonucu" } as Record<string, string>)[item.type]}</p>
                <p className="on-light-muted mt-0.5">
                  <span>{new Date(item.created_at).toLocaleDateString("tr-TR")}</span>
                  <span aria-hidden> · </span>
                  <span>{item.invoice_reference ? `Fatura: ${item.invoice_reference}` : "Fatura numarası henüz eklenmedi"}</span>
                </p>
              </div>
              <strong className="whitespace-nowrap">{money(item.amount_minor_units, item.currency)}</strong>
            </li>
          ))}
        </ul>
        {cursor ? <button className="mt-3 text-sm underline underline-offset-4" onClick={async () => {
          try {
            const page = await billingFetch<{ items: BillingTransaction[]; next_cursor: string | null }>(`/api/billing/history?before=${cursor}`);
            setItems((old) => [...old, ...page.items]);
            setCursor(page.next_cursor);
          } catch {
            setError("Geçmiş yüklenemedi.");
          }
        }}>Daha eski ödemeler</button> : null}
      </div>
    </section>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/45 p-4 ring-1 ring-black/5 transition-[transform,background-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:bg-white/80 hover:shadow-[0_14px_30px_-24px_rgba(0,0,0,0.45)]">
      <span className="on-light-muted flex items-center gap-2 text-[0.75rem]"><Icon className="size-4" strokeWidth={1.75} aria-hidden />{label}</span>
      <strong className="mt-2 block text-[1.25rem] tracking-[-0.02em]">{value}</strong>
    </div>
  );
}
