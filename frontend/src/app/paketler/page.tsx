import { SiteShell } from "@/components/site-shell";
import { BillingPlans } from "@/components/billing-plans";
export const metadata = { title: "Paketler — Vitrin AI", description: "Güncel paketler, aylık krediler ve güvenli ödeme." };
export default function PackagesPage() { return <SiteShell><section className="surface-mist section-rhythm page-top"><div className="mx-auto max-w-6xl px-5"><h1 className="display-section">İşinize uygun paket</h1><p className="lede mt-5 mb-10">Her fotoğraf için bir kredi. Fiyatlar ve aylık haklar burada güncel olarak gösterilir.</p><BillingPlans /></div></section></SiteShell>; }
