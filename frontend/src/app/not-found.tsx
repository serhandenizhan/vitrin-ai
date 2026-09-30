import Link from "next/link";

import { SiteShell } from "@/components/site-shell";

export const metadata = { title: "Sayfa bulunamadı — Vitrin", robots: { index: false } };

export default function NotFound() {
  return (
    <SiteShell>
      <section className="surface-black page-top flex min-h-[70svh] items-center justify-center px-5 pb-24 text-center">
        <div className="max-w-md">
          <p className="text-gold text-[0.9375rem] font-semibold">404</p>
          <h1 className="display-section mt-3 text-balance">Bu sayfa vitrinde yok</h1>
          <p className="lede on-dark-muted mt-4 text-pretty">
            Aradığınız adres taşınmış ya da hiç var olmamış olabilir. Ana sayfadan devam edebilirsiniz.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/"
              className="press flex min-h-12 items-center rounded-full bg-[linear-gradient(135deg,#f0c779,#d6a756)] px-7 text-[0.9375rem] font-semibold text-[#171614]"
            >
              Ana sayfaya dön
            </Link>
            <Link
              href="/destek"
              className="flex min-h-12 items-center rounded-full bg-white/[0.045] px-6 text-[0.9375rem] font-medium text-[#f3f0eb]/82 ring-1 ring-white/14 hover:bg-white/9"
            >
              Destek
            </Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
