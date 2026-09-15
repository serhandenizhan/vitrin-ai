"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/workspace-provider";
import { billingFetch, money, type Plan, type BillingDocument } from "@/lib/billing";

export function BillingPlans() {
  const { user, isAuthLoaded } = useWorkspace();
  if (!isAuthLoaded) return <p>Paketler yükleniyor…</p>;
  return <BillingPlansForUser key={user?.id ?? "anonymous"} />;
}

function BillingPlansForUser() {
  const { user, openSignIn } = useWorkspace();
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [documents, setDocuments] = useState<BillingDocument[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  useEffect(() => { billingFetch<Plan[]>("/api/plans").then(setPlans).catch(error => setError(error.message)); }, []);
  async function choose(plan: Plan) {
    if (!user) { openSignIn(); return; }
    setSelected(plan); setAccepted(false); setKey(crypto.randomUUID()); setError("");
    try { setDocuments(await billingFetch<BillingDocument[]>("/api/billing/documents")); }
    catch { setError("Satış sözleşmeleri yüklenemedi."); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!user) { openSignIn(); return; } if (!selected || !accepted || busy) return;
    const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      const result = await billingFetch<{ checkout_url: string }>("/api/subscriptions/checkout", { plan_id: selected.id, expected_plan_version_id: selected.plan_version_id, idempotency_key: key,
        consents: documents.map(({ document_type, document_hash, document_version }) => ({ document_type, document_hash, document_version })),
        customer: { name: form.get("name"), surname: form.get("surname"), gsmNumber: form.get("phone"), identityNumber: form.get("identity"), billingAddress: { address: form.get("address"), contactName: `${form.get("name")} ${form.get("surname")}`, city: form.get("city"), country: "Turkey" } } });
      if (!active.current) return;
      if (!/^\/odeme\/[a-f0-9-]{36}$/.test(result.checkout_url)) throw new Error("Ödeme adresi doğrulanamadı.");
      window.location.assign(result.checkout_url);
    } catch (error) { setError(error instanceof Error ? error.message : "Satın alma başlatılamadı."); }
    finally { setBusy(false); }
  }
  return <>
    {error && <p role="alert" className="my-4 rounded-xl border p-4">{error}</p>}
    <div className="grid gap-6 md:grid-cols-3">{plans.map(plan => <article key={plan.plan_version_id} className="rounded-3xl border border-black/10 bg-white p-8">
      <h2 className="text-2xl font-semibold">{plan.name}</h2><p className="mt-6 text-4xl font-semibold">{money(plan.price_minor_units)}</p><p className="mt-2 text-sm">Aylık · {plan.monthly_quota} fotoğraf</p>
      <p className="mt-6">{plan.background_tier === "full" ? "Tüm zeminler" : "Temel zeminler"}</p>
      {plan.trial_period_days > 0 && <p className="mt-2 text-sm">İlk aboneliğinizde {plan.trial_period_days} gün deneme. Ardından aylık {money(plan.price_minor_units)}.</p>}
      {plan.price_minor_units === 0 ? <Link href="/" className="mt-8 inline-block rounded-full bg-black px-6 py-3 text-white">Deneyin</Link> : <button onClick={() => void choose(plan)} className="mt-8 rounded-full bg-black px-6 py-3 text-white">Paketi seç</button>}
    </article>)}</div>
    {plans.length > 0 && plans.every(p => p.price_minor_units === 0) && <p className="mt-6 text-sm">Ücretli paketler, fiyatları doğrulandıktan sonra burada yayımlanacak.</p>}
    {selected && <form onSubmit={submit} className="soft-enter mx-auto mt-10 max-w-xl rounded-3xl bg-white p-8">
      <h2 className="text-2xl font-semibold">{selected.name} · Fatura bilgileri</h2>
      <p className="mt-3 text-sm">Ödeme için giriş yapmış olmanız gerekir. Kart bilgilerinizi bir sonraki adımda iyzico formuna gireceksiniz. Kimlik ve adres bilgileri ödeme sağlayıcısına iletilir.</p>
      {[["name", "Ad", "text"], ["surname", "Soyad", "text"], ["phone", "Telefon (+905xxxxxxxxx)", "tel"], ["identity", "T.C. kimlik numarası", "text"], ["city", "Şehir", "text"], ["address", "Fatura adresi", "text"]].map(([name, label, type]) => <label className="mt-4 block text-sm" key={name}>{label}<input required name={name} type={type} maxLength={name === "address" ? 500 : 100} className="mt-2 block w-full rounded-xl border border-black/20 p-3" /></label>)}
      {documents.map(document => <details key={document.document_type} className="mt-4 rounded-xl border p-4"><summary>{document.document_type === "distance_sales" ? "Mesafeli satış sözleşmesi" : "Ön bilgilendirme formu"}</summary><p className="mt-3 whitespace-pre-wrap text-sm">{document.text || "Sözleşme henüz yayımlanmadı."}</p><p className="mt-2 text-xs">Sürüm: {document.document_version}</p></details>)}
      <label className="mt-5 flex gap-3 text-sm"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} required />Ön bilgilendirme formunu ve mesafeli satış sözleşmesini okudum, kabul ediyorum.</label>
      <p className="mt-4 text-sm">Yeni paket doğrulandığında yeni dönem başlar. Kullanılmayan krediler devretmez; dönemler arasında oranlama yapılmaz.</p>
      <button disabled={busy || !accepted || documents.length !== 2 || documents.some(d => !d.text)} className="mt-6 rounded-full bg-black px-6 py-3 text-white disabled:opacity-40">{busy ? "Hazırlanıyor…" : "Güvenli ödemeye geç"}</button>
    </form>}
  </>;
}
