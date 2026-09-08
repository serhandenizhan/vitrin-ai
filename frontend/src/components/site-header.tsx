"use client";

/**
 * Ust cubuk.
 *
 * Apple'in gezinme cubugundan uyarlandi: sayfanin ustune yapisik, arkasi
 * bulanik ve yari saydam.
 *
 * Ilk surumden iki farki var, ikisi de ekran goruntusu uzerinden olculerek
 * duzeltildi:
 *
 * 1) ICERIK ARTIK TAM GENISLIKTE. Onceden govde `max-w-5xl` ile ortalaniyordu;
 *    1877 px'lik bir ekranda logo sayfanin ortasina yakin duruyor ve solda
 *    kocaman bir bosluk kaliyordu. Simdi marka en solda, baglantilar onun
 *    devaminda, eylemler en sagda — alanin tamami kullaniliyor.
 * 2) BAGLANTI PUNTOSU BUYUDU (12 px -> 14 px) ve cubuk 48 px'ten 56 px'e
 *    cikti. Masaustunde 12 px, cevresindeki 64 px'lik basliklarin yaninda
 *    okunmuyordu.
 *
 * Dokunma hedefleri: metin kucuk olsa da her tiklanabilir oge cubugun tam
 * yuksekligini kapliyor (`flex h-full items-center`).
 */

import { LogIn, PanelLeft } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { useWorkspace } from "@/components/workspace-provider";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#dene", label: "Deneyin" },
  { href: "#ozellikler", label: "Öne çıkanlar" },
  { href: "#nasil", label: "Nasıl çalışır" },
  { href: "#teknik", label: "Teknik bilgiler" },
];

export function SiteHeader() {
  const { isSidebarOpen, toggleSidebar, works, openSignIn } = useWorkspace();

  return (
    <header
      className={cn(
        "sticky top-0 z-50 h-14 border-b border-white/10",
        "bg-black/70 text-[#f5f5f7] backdrop-blur-xl backdrop-saturate-150",
      )}
    >
      <nav
        aria-label="Ana gezinme"
        className="flex h-full w-full items-center gap-2 px-3 sm:gap-4 sm:px-6"
      >
        {/* Panel dugmesi en solda ve cubugun en belirgin noktasinda —
            calismalar ve ayarlar oraya bagli. */}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-expanded={isSidebarOpen}
          aria-label={
            isSidebarOpen
              ? "Çalışmalarım ve ayarlar panelini kapat"
              : "Çalışmalarım ve ayarlar panelini aç"
          }
          className={cn(
            "relative flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors",
            isSidebarOpen
              ? "bg-white/15 text-[#f5f5f7]"
              : "text-[#f5f5f7]/85 hover:bg-white/10 hover:text-[#f5f5f7]",
          )}
        >
          <PanelLeft className="size-[1.15rem]" strokeWidth={1.75} aria-hidden />
          {/* Gecmiste calisma varsa kucuk bir isaret — panelin bos olmadigini
              acmadan once belli ediyor. */}
          {works.length > 0 ? (
            <span
              aria-hidden
              className="bg-gold absolute top-1.5 right-1.5 size-1.5 rounded-full"
            />
          ) : null}
        </button>

        <a
          href="#top"
          className="flex h-full shrink-0 items-center gap-2 text-[1.0625rem]"
        >
          <BrandMark className="text-gold size-[1.4rem]" />
          {/* Cok dar ekranda yalnizca isaret kaliyor: 320 px'te panel dugmesi
              + isaret + yazi + giris + eylem toplami 346 px'e ciktigi ve
              cubuk 41 px tastigi olculdu. Isaret tek basina markayi
              tasiyabiliyor, kaybolan sey yalnizca tekrar. */}
          <span className="hidden font-semibold tracking-[-0.01em] whitespace-nowrap min-[380px]:inline">
            Vitrin <span className="text-gold">AI</span>
          </span>
        </a>

        {/* Baglantilar markanin hemen devaminda, ortada degil — ortalanmis bir
            menu genis ekranda savruk duruyor. */}
        <ul className="ml-4 hidden h-full items-stretch gap-1 lg:flex">
          {LINKS.map((link) => (
            <li key={link.href} className="flex">
              <a
                href={link.href}
                className="flex h-full items-center rounded-md px-3 text-[0.875rem] text-[#f5f5f7]/75 transition-colors hover:bg-white/8 hover:text-[#f5f5f7]"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex h-full items-center gap-1.5 sm:gap-2.5">
          <button
            type="button"
            onClick={openSignIn}
            className="flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[0.875rem] text-[#f5f5f7]/85 transition-colors hover:bg-white/10 hover:text-[#f5f5f7]"
          >
            <LogIn className="size-4" strokeWidth={1.75} aria-hidden />
            <span className="hidden sm:inline">Giriş yap</span>
          </button>

          <a
            href="#dene"
            className="press bg-gold hover:bg-gold-soft flex min-h-9 items-center rounded-full px-4 text-[0.875rem] font-medium whitespace-nowrap text-black transition-colors"
          >
            <span className="sm:hidden">Deneyin</span>
            <span className="hidden sm:inline">Hemen deneyin</span>
          </a>
        </div>
      </nav>
    </header>
  );
}
