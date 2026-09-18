import type { Metadata } from "next";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import { SupportCenter } from "@/components/support-center";

export const metadata: Metadata = { title: "Destek — Vitrin AI", description: "Sorun bildirin, geliştirme önerin ve sık sorulan sorulara ulaşın." };

export default function DestekPage() {
  return <SiteShell><section className="surface-black page-top min-h-screen py-28 sm:py-32"><Reveal className="mx-auto max-w-3xl px-5 text-center"><p className="text-gold text-xs font-semibold tracking-[0.18em] uppercase">Destek merkezi</p><h1 className="display-hero mt-4 text-balance">Sorunları birlikte çözelim</h1><p className="lede on-dark-muted mx-auto mt-4 max-w-xl text-pretty">Sık sorulan yanıtları inceleyin; karşılaştığınız sorunu veya ürünü geliştirecek fikrinizi doğrudan paylaşın.</p></Reveal><Reveal delay={120} className="mt-14"><SupportCenter /></Reveal></section></SiteShell>;
}
