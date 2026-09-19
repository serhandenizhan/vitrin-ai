/**
 * Yönetim paneli sayfası (Faz 6, Kaan).
 *
 * Sayfanın kendisi bir sunucu bileşeni ve herkese açık — gösterdiği hiçbir
 * veri sunucuda üretilmiyor. Yetki kontrolü her istekte backend'de
 * (`require_admin`); arayüzün bir ekranı gizlemesi yetkilendirme sayılmaz
 * (`SECURITY.md` 3.2). Arama motorlarına kapalı.
 */
import type { Metadata } from "next";

import { AdminPanel } from "@/components/admin/admin-panel";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Yönetim — Vitrin AI",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <SiteShell>
      <section className="surface-black page-top min-h-screen py-28 sm:py-32">
        <Reveal className="mx-auto max-w-3xl px-5 text-center">
          <p className="text-gold text-xs font-semibold tracking-[0.18em] uppercase">Yönetim</p>
          <h1 className="display-hero mt-4 text-balance">Yönetim paneli</h1>
          <p className="lede on-dark-muted mx-auto mt-4 max-w-xl text-pretty">
            Kullanımı izleyin, kullanıcıları bulun, bonus kredi verin ve hesap işlemlerini yönetin.
          </p>
        </Reveal>
        <Reveal delay={120} className="mt-12">
          <AdminPanel />
        </Reveal>
      </section>
    </SiteShell>
  );
}
