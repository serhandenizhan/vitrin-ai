"use client";

/**
 * "Hos geldiniz, Kaan" bildirimi (Faz 4, kullanici istegi 13.09.2026).
 *
 * Ne zaman cikiyor: giris yapildiginda ve e-posta dogrulama baglantisindan
 * donuldugunde — bir kez. Sayfa yenilemede, token yenilemede ya da ayni
 * oturumda baska sekme acildiginda tekrar cikmiyor (bkz. workspace-provider
 * `welcomeName`).
 *
 * Birkac saniye sonra kendiliginden kayboluyor; kapat dugmesi de var. Ekran
 * okuyucuya `role="status"` ile, dikkati bolmeden okunuyor.
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { useWorkspace } from "@/components/workspace-provider";
import { cn } from "@/lib/utils";

const VISIBLE_MS = 4500;
/** CSS gecis suresiyle ayni; kaybolma animasyonu bitmeden bilesen kalkmasin. */
const FADE_MS = 400;

export function WelcomeToast() {
  const { welcomeName, dismissWelcome } = useWorkspace();
  const [isShown, setShown] = useState(false);

  useEffect(() => {
    if (!welcomeName) return;
    // Ilk karede gorunmez cizilip hemen ardindan gorunur yapiliyor: gecis
    // ancak boyle calisiyor. setTimeout (rAF degil) — bkz. kok CLAUDE.md ders 13.
    const enter = setTimeout(() => setShown(true), 20);
    const leave = setTimeout(() => setShown(false), VISIBLE_MS);
    const remove = setTimeout(dismissWelcome, VISIBLE_MS + FADE_MS);
    return () => {
      clearTimeout(enter);
      clearTimeout(leave);
      clearTimeout(remove);
    };
  }, [welcomeName, dismissWelcome]);

  if (!welcomeName) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[4.5rem] z-[55] flex justify-center px-4">
      <div
        role="status"
        className={cn(
          "pointer-events-auto flex items-center gap-3 rounded-full bg-[#171614]/90 py-2 pr-2 pl-5 text-[0.9375rem] text-[#f3f0eb] shadow-[0_18px_40px_-16px_rgba(0,0,0,0.6)] ring-1 ring-white/10 backdrop-blur-xl",
          "transition-[opacity,transform] duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          isShown ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
        )}
      >
        <span>
          Hoş geldiniz, <strong className="text-gold font-semibold">{welcomeName}</strong>
        </span>
        <button
          type="button"
          onClick={() => setShown(false)}
          aria-label="Bildirimi kapat"
          className="flex size-8 items-center justify-center rounded-full text-[#f3f0eb]/60 transition-colors hover:bg-white/10 hover:text-[#f3f0eb]"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
