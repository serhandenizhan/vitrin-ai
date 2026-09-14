import type { ReactNode } from "react";

import { SiteShell } from "@/components/site-shell";

export function LegalPage({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <SiteShell>
      <article className="surface-mist section-rhythm page-top">
        <div className="mx-auto w-full max-w-3xl px-5">
          <p className="text-gold text-[0.75rem] font-semibold tracking-[0.12em] uppercase">
            {eyebrow}
          </p>
          <h1 className="display-section mt-3 text-balance">{title}</h1>
          <p className="lede on-light-muted mt-5 max-w-2xl">{summary}</p>
          <div className="legal-copy mt-12 space-y-10">{children}</div>
        </div>
      </article>
    </SiteShell>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[1.375rem] font-semibold tracking-[-0.015em]">{title}</h2>
      <div className="on-light-muted mt-3 space-y-3 text-[0.9375rem] leading-relaxed">
        {children}
      </div>
    </section>
  );
}
