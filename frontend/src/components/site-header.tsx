"use client";

/**
 * Ust cubuk.
 *
 * 11.09.2026'da yeniden kuruldu (kullanici: "soluk ve eski moda duruyor").
 * Onceki surum sayfa genisliginde, alt cizgili duz bir seritti. Simdi:
 *
 * 1) YUZEN KAPSUL. Cubuk kenarlardan 12 px iceride, tam yuvarlak koseli ve
 *    golgeli bir kapsul. Sayfa altindan akarken ayri bir katman gibi okunuyor;
 *    serit ise sayfanin bir parcasi gibi durup "gri bir bant" hissi veriyordu.
 * 2) SAYFANIN USTUNE BINIYOR. Kapsayici `-mb-15` ile kendi yuksekligi kadar
 *    yukari cekiliyor; boylece acilistaki koyu bolum cubugun ARKASINDAN
 *    basliyor ve ustte beyaz bir serit kalmiyor. Ilk bolumler bu payi
 *    `page-top` sinifiyla geri aliyor (bkz. globals.css).
 * 3) BULUNULAN SAYFA BELLI. Katalog ve Paketler'de ilgili baglanti dolu bir
 *    hap olarak gorunuyor; onceden hangi sayfada olundugu cubuktan
 *    anlasilmiyordu.
 * 4) TELEFONDA MENU VAR. Onceden `lg` altinda baglantilar tamamen
 *    kayboluyordu ve Katalog/Paketler'e telefondan ulasmanin yolu yoktu.
 *
 * Menudeki her oge ya bir YERE goturuyor ya bir sey ACIYOR, ikisi karisik
 * degil; panel acanlarin yanindaki ok bunu onceden soyluyor (kilitli karar,
 * bkz. kok CLAUDE.md "Arayuz tasarim dili").
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogIn, Menu, PanelLeft } from "lucide-react";

import { NavPanel } from "@/components/nav-panel";
import {
  HakkindaIcerik,
  NasilCalisirIcerik,
} from "@/components/nav-panel-contents";
import { BrandMark } from "@/components/brand-mark";
import { useWorkspace } from "@/components/workspace-provider";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/#dene", label: "Deneyin" },
  { href: "/katalog", label: "Katalog" },
  { href: "/paketler", label: "Paketler" },
];

/** Panel aciyor; sirasi menudeki gorunum sirasi. */
const PANELLER = [
  { ad: "nasil", etiket: "Nasıl çalışır" },
  { ad: "hakkinda", etiket: "Hakkında" },
] as const;

type PanelAdi = (typeof PANELLER)[number]["ad"] | "menu";

export function SiteHeader() {
  const { isSidebarOpen, toggleSidebar, works, openSignIn } = useWorkspace();
  const pathname = usePathname();
  // Ayni anda tek panel: iki panelin ust uste binmesi ya da biri acikken
  // digerinin arkasinda kalmasi mumkun olmasin.
  const [acikPanel, setAcikPanel] = useState<PanelAdi | null>(null);
  const kapat = () => setAcikPanel(null);

  return (
    <>
      <header className="pointer-events-none sticky top-0 z-50 -mb-15 h-15 px-3 pt-3">
        <nav
          aria-label="Ana gezinme"
          className={cn(
            "pointer-events-auto mx-auto flex h-12 w-full max-w-6xl items-center gap-1 rounded-full pr-1.5 pl-1.5 sm:gap-2",
            "bg-[#171614]/80 text-[#f3f0eb] ring-1 ring-white/[0.09] backdrop-blur-xl backdrop-saturate-150",
            "shadow-[0_12px_40px_-14px_rgba(0,0,0,0.75)]",
          )}
        >
          {/* Panel dugmesi en solda — calismalar ve ayarlar oraya bagli. */}
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
              "relative flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
              isSidebarOpen
                ? "bg-white/15 text-[#f3f0eb]"
                : "text-[#f3f0eb]/80 hover:bg-white/10 hover:text-[#f3f0eb]",
            )}
          >
            <PanelLeft className="size-[1.05rem]" strokeWidth={1.75} aria-hidden />
            {/* Gecmiste calisma varsa kucuk bir isaret — panelin bos olmadigini
                acmadan once belli ediyor. */}
            {works.length > 0 ? (
              <span
                aria-hidden
                className="bg-gold absolute top-1.5 right-1.5 size-1.5 rounded-full"
              />
            ) : null}
          </button>

          <Link
            href="/#top"
            onClick={kapat}
            className="flex h-full shrink-0 items-center gap-2 pr-2 pl-1 text-[1rem]"
          >
            <BrandMark className="text-gold h-[1.3rem] w-auto" />
            {/* Cok dar ekranda yalnizca isaret kaliyor: 320 px'te cubuk
                tasiyordu. Isaret tek basina markayi tasiyabiliyor. */}
            <span className="hidden font-semibold tracking-[-0.015em] whitespace-nowrap min-[380px]:inline">
              Vitrin AI
            </span>
          </Link>

          <span aria-hidden className="mx-1 hidden h-5 w-px bg-white/12 lg:block" />

          <ul className="hidden items-center gap-0.5 lg:flex">
            {LINKS.map((link) => {
              const aktif = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={aktif ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center rounded-full px-3.5 text-[0.875rem] transition-colors",
                      aktif
                        ? "bg-white/12 text-[#f3f0eb]"
                        : "text-[#f3f0eb]/70 hover:bg-white/[0.07] hover:text-[#f3f0eb]",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}

            {PANELLER.map((panel) => {
              const acik = acikPanel === panel.ad;
              return (
                <li key={panel.ad}>
                  <button
                    type="button"
                    onClick={() => setAcikPanel(acik ? null : panel.ad)}
                    aria-expanded={acik}
                    className={cn(
                      "flex h-9 items-center gap-1 rounded-full px-3.5 text-[0.875rem] transition-colors",
                      acik
                        ? "bg-white/12 text-[#f3f0eb]"
                        : "text-[#f3f0eb]/70 hover:bg-white/[0.07] hover:text-[#f3f0eb]",
                    )}
                  >
                    {panel.etiket}
                    <ChevronDown
                      className={cn(
                        "size-3.5 opacity-70 transition-transform duration-300",
                        acik && "rotate-180",
                      )}
                      strokeWidth={2}
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={openSignIn}
              className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[0.875rem] text-[#f3f0eb]/80 transition-colors hover:bg-white/10 hover:text-[#f3f0eb]"
            >
              <LogIn className="size-4" strokeWidth={1.75} aria-hidden />
              <span className="hidden sm:inline">Giriş yap</span>
            </button>

            <Link
              href="/#dene"
              onClick={kapat}
              className="press bg-gold hover:bg-gold-soft flex h-9 items-center rounded-full px-4 text-[0.875rem] font-medium whitespace-nowrap text-black transition-colors"
            >
              Hemen deneyin
            </Link>

            <button
              type="button"
              onClick={() => setAcikPanel(acikPanel === "menu" ? null : "menu")}
              aria-expanded={acikPanel === "menu"}
              aria-label="Menü"
              className={cn(
                "flex size-9 items-center justify-center rounded-full transition-colors lg:hidden",
                acikPanel === "menu"
                  ? "bg-white/15"
                  : "text-[#f3f0eb]/80 hover:bg-white/10",
              )}
            >
              <Menu className="size-[1.05rem]" strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        </nav>
      </header>

      {/* Telefon menusu: baglantilar gercek sayfalara goturuyor, panel
          ogeleri ise ilgili paneli aciyor — masaustundeki ayrimin aynisi. */}
      <NavPanel
        acik={acikPanel === "menu"}
        onKapat={kapat}
        etiket="Menü"
        ustBaslik="Menü"
      >
        <ul className="flex flex-col divide-y divide-white/10">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={kapat}
                aria-current={pathname === link.href ? "page" : undefined}
                className="flex min-h-13 items-center text-[1.25rem] font-semibold tracking-[-0.015em] aria-[current=page]:text-gold"
              >
                {link.label}
              </Link>
            </li>
          ))}
          {PANELLER.map((panel) => (
            <li key={panel.ad}>
              <button
                type="button"
                onClick={() => setAcikPanel(panel.ad)}
                className="flex min-h-13 w-full items-center justify-between text-left text-[1.25rem] font-semibold tracking-[-0.015em]"
              >
                {panel.etiket}
                <ChevronDown
                  className="size-4 -rotate-90 opacity-60"
                  strokeWidth={2}
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      </NavPanel>

      <NavPanel
        acik={acikPanel === "nasil"}
        onKapat={kapat}
        etiket="Nasıl çalışır"
        ustBaslik="Nasıl çalışır"
      >
        <NasilCalisirIcerik />
      </NavPanel>

      <NavPanel
        acik={acikPanel === "hakkinda"}
        onKapat={kapat}
        etiket="Vitrin AI hakkında"
        ustBaslik="Vitrin AI hakkında"
      >
        <HakkindaIcerik />
      </NavPanel>
    </>
  );
}
