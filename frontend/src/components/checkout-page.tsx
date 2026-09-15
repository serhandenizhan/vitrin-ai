"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/workspace-provider";
import { billingFetch } from "@/lib/billing";
type Checkout = { status: string; expires_at: string; checkout_form_content: string | null };
export function CheckoutPage({ id }: { id: string }) {
  const { user, isAuthLoaded, openSignIn } = useWorkspace();
  if (!isAuthLoaded) return null;
  if (!user) return <button className="underline" onClick={() => openSignIn()}>Ödemeye devam etmek için giriş yapın</button>;
  return <SignedInCheckout key={user.id + id} id={id} />;
}
function SignedInCheckout({ id }: { id: string }) {
  const [session, setSession] = useState<Checkout | null>(null);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => { try { const value = await billingFetch<Checkout>(`/api/subscriptions/checkout/${id}`); if (active) { setSession(value); setExpired(new Date(value.expires_at).getTime() <= Date.now()); setError(""); } } catch (error) { if (active) setError(error instanceof Error ? error.message : "Ödeme yüklenemedi."); } };
    void refresh(); const timer = setInterval(() => void refresh(), 5000);
    return () => { active = false; clearInterval(timer); };
  }, [id]);
  return <div className="mt-8">
    {error && <p role="alert">{error}</p>}
    {session?.status === "completed" ? <div role="status"><p>Aboneliğiniz doğrulandı ve kullanıma açıldı.</p><Link className="mt-4 inline-block underline" href="/hesap">Kredilerim ve ödeme geçmişim</Link></div> : expired || session?.status === "failed" ? <p>Bu ödeme oturumu sona erdi. <Link className="underline" href="/paketler">Yeni işlem başlatın</Link></p> : session?.checkout_form_content ?
      <iframe title="iyzico güvenli ödeme formu" className="h-[700px] w-full rounded-2xl border-0 bg-white" sandbox="allow-scripts allow-forms allow-popups allow-top-navigation-by-user-activation" referrerPolicy="no-referrer" srcDoc={`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="iyzipay-checkout-form" class="responsive"></div>${session.checkout_form_content}</body></html>`} /> : <p role="status">Ödeme formu hazırlanıyor veya ödeme doğrulanıyor…</p>}
  </div>;
}
