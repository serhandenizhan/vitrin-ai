"use client";

/**
 * Ust cubuk.
 *
 * Apple'in gezinme cubugundan uyarlandi: ince (48px), sayfanin ustune
 * yapisik, arkasi bulanik ve yari saydam — altindaki bolumun rengi
 * degistikce cubuk da onunla birlikte koyulasip aciliyor. Baglantilar kucuk
 * (12px) ve dusuk kontrastta duruyor, dikkati icerikten calmiyor.
 *
 * Dokunma hedefleri: metin kucuk olsa da her tiklanabilir oge cubugun TAM
 * yuksekligini (48px) kapliyor (`flex h-full items-center`). Olculdu — bunu
 * yapmadan once logo ve baglantilar 15-26px yuksekliginde kaliyordu, bu da
 * telefonda isabet ettirmesi zor bir hedef demek. Gorsel olarak hicbir sey
 * degismiyor, yalnizca tiklama alani buyuyor.
 */

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#dene", label: "Deneyin" },
  { href: "#ozellikler", label: "Öne çıkanlar" },
  { href: "#nasil", label: "Nasıl çalışır" },
  { href: "#teknik", label: "Teknik bilgiler" },
];

export function SiteHeader() {
  return (
    <header
      className={cn(
        "sticky top-0 z-50 h-12 border-b border-white/10",
        // Apple'in cubugu da bu tonda: neredeyse siyah ama arkasindaki
        // icerigin rengini hafifce gecirecek kadar saydam.
        "bg-black/70 text-[#f5f5f7] backdrop-blur-xl backdrop-saturate-150",
      )}
    >
      <nav
        aria-label="Ana gezinme"
        className="mx-auto flex h-full w-full max-w-5xl items-center justify-between gap-4 px-5"
      >
        <a
          href="#top"
          className="flex h-full items-center text-[0.9375rem] font-semibold tracking-[-0.01em] whitespace-nowrap"
        >
          Vitrin <span className="text-gold">&nbsp;AI</span>
        </a>

        {/* Dar ekranda baglantilar gizleniyor: Apple da mobilde hamburger'a
            aliyor. Faz 2 icin sayfa zaten tek sutun akiyor, bolumler
            kaydirarak ulasilabilir durumda. */}
        <ul className="hidden h-full items-stretch gap-5 sm:flex">
          {LINKS.map((link) => (
            <li key={link.href} className="flex">
              <a
                href={link.href}
                className="flex h-full items-center px-1 text-[0.75rem] text-[#f5f5f7]/80 transition-colors duration-200 hover:text-[#f5f5f7]"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <a
          href="#dene"
          className="press bg-gold flex min-h-9 items-center rounded-full px-4 text-[0.75rem] font-medium whitespace-nowrap text-black"
        >
          Hemen deneyin
        </a>
      </nav>
    </header>
  );
}
