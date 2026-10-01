"use client";

/**
 * Sik sorulanlar satiri: yumusak acilip kapanan akordeon.
 *
 * Onceden yerel `<details>` idi ve `tak` diye aciliyordu (Kaan, 30.09.2026:
 * sitenin geri kalanindaki yumusak gecislerle ayni olsun). Yukseklik
 * `grid-template-rows: 0fr -> 1fr` ile animasyonlu (sabit yukseklik bilmeye
 * gerek yok), eğri sitenin geri kalanindakiyle ayni. Kapaliyken cevap `inert`:
 * odaklanamaz ve ekran okuyucuya gorunmez. "Hareketi azalt"ta gecis yok.
 */

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

export function FaqItem({ question, children }: { question: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-pointer items-center justify-between gap-6 py-5 text-left text-[1.0625rem] font-semibold tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-[#f0c779]/60"
      >
        {question}
        <ChevronDown
          className={`size-5 shrink-0 text-[#f3f0eb]/50 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          strokeWidth={1.75}
          aria-hidden
        />
      </button>
      <div
        id={panelId}
        inert={!open}
        className={`faq-panel grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <p className="on-dark-muted -mt-1 pb-5 text-[0.9375rem] leading-relaxed text-pretty">{children}</p>
        </div>
      </div>
    </div>
  );
}
