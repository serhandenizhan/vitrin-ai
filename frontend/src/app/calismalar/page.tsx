import type { Metadata } from "next";
import { WorksPage } from "@/components/works-page";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = { title: "Çalışmalar — Vitrin AI", description: "Yarım kalan ve tamamlanan Vitrin AI çalışmalarınız." };

export default function CalismalarPage() {
  return <SiteShell><section className="surface-black page-top min-h-screen py-28 sm:py-32"><div className="mx-auto max-w-3xl px-5 text-center"><p className="text-gold text-xs font-semibold tracking-[0.18em] uppercase">Çalışma alanı</p><h1 className="display-hero mt-4 text-balance">Kaldığınız yerden devam edin</h1><p className="lede on-dark-muted mx-auto mt-4 max-w-xl text-pretty">Kaydettiğiniz çalışmalar yarım kalanlarda, çıktısını indirdiğiniz hazır görseller tamamlananlarda durur.</p></div><div className="mt-12"><WorksPage /></div></section></SiteShell>;
}
