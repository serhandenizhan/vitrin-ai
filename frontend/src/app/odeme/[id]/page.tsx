import { CheckoutPage } from "@/components/checkout-page";
import { SiteShell } from "@/components/site-shell";
export const metadata = { title: "Ödeme — Vitrin AI", robots: { index: false } };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SiteShell><section className="surface-mist section-rhythm page-top"><div className="mx-auto max-w-3xl px-5"><h1 className="display-section">Güvenli ödeme</h1><CheckoutPage id={id} /></div></section></SiteShell>;
}
