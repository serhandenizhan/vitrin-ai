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

export function LegalNotice({ children }: { children: ReactNode }) {
  return (
    <aside className="glass-panel-light rounded-2xl border-l-4 border-l-[#d6a756] p-5 text-[0.875rem] leading-relaxed text-[#4d4942]">
      {children}
    </aside>
  );
}

export function LegalTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white/45 shadow-sm">
      <table className="w-full min-w-[44rem] border-collapse text-left text-[0.8125rem] leading-relaxed">
        <thead className="bg-[#171614] text-[#f3f0eb]">
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col" className="px-4 py-3 font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/8">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="align-top transition-colors hover:bg-white/55">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3.5">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
