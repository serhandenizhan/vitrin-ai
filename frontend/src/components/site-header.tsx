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

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, LogIn, PanelLeft } from "lucide-react";

import { NavPanel } from "@/components/nav-panel";
import {
  HakkindaIcerik,
  NasilCalisirIcerik,
} from "@/components/nav-panel-contents";
import { BrandMark } from "@/components/brand-mark";
import { useWorkspace } from "@/components/workspace-provider";
import { cn } from "@/lib/utils";

/*
 * Menudeki her oge ya bir YERE goturuyor ya bir sey ACIYOR — ikisi karisik
 * degil. Tek baglanti "Deneyin"; digerleri panel aciyor ve yanlarindaki ok
 * bunu onceden soyluyor.
 *
 * Panel iceriklerinin ortak yani: hicbiri araci KULLANMAK icin gerekli degil.
 * Sayfaya bolum olarak konduklarinda ziyaretcinin araca ulasmasi her biri icin
 * bir ekran geciktiriyordu.
 *
 * Menu bilincli olarak KISA.
 *
 * Onceden dort baglanti vardi: Deneyin / One cikanlar / Nasil calisir /
 * Teknik bilgiler. Dordu de sayfanin ayni akisinda ust uste duran bolumlere
 * gidiyordu, yani menu kullaniciya bir SECIM sunmuyor, yalnizca ayni sayfanin
 * icindekilerini tekrar ediyordu — ve hangisinin gerekli oldugu belirsizdi.
 *
 * Kalan iki baglanti gercekten ayri iki niyete karsilik geliyor: "denemek
 * istiyorum" ve "once nasil calistigini anlamak istiyorum". One cikanlar ve
 * teknik bilgiler sayfada duruyor, kaydirinca geliniyor; menude yer kaplamiyor.
 */
const LINKS = [
  { href: "/#dene", label: "Deneyin" },
  { href: "/katalog", label: "Katalog" },
  { href: "/paketler", label: "Paketler" },
];

/** Panel aciyor; sirasi menudeki gorunum sirasi.
 *
 * "Paketler" buradan CIKARILDI: kendi sayfasina tasindi (10.09.2026). Odeme
 * akisi geldiginde (Faz 5) orada paket secimi, fatura bilgisi ve odeme adimi
 * olacak; bunlar bir panele sigmaz ve paylasilabilir bir adres ister. */
const PANELLER = [
  { ad: "nasil", etiket: "Nasıl çalışır" },
  { ad: "hakkinda", etiket: "Hakkında" },
] as const;

type PanelAdi = (typeof PANELLER)[number]["ad"];

export function SiteHeader() {
  const { isSidebarOpen, toggleSidebar, works, openSignIn } = useWorkspace();
  // Ayni anda tek panel: iki panelin ust uste binmesi ya da biri acikken
  // digerinin arkasinda kalmasi mumkun olmasin.
  const [acikPanel, setAcikPanel] = useState<PanelAdi | null>(null);

  return (
    <>
    <header
      className={cn(
        "sticky top-0 z-50 h-14 border-b border-white/10",
        "bg-black/70 text-[#f3f0eb] backdrop-blur-xl backdrop-saturate-150",
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
              ? "bg-white/15 text-[#f3f0eb]"
              : "text-[#f3f0eb]/85 hover:bg-white/10 hover:text-[#f3f0eb]",
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

        <Link
          href="/#top"
          className="flex h-full shrink-0 items-center gap-2 text-[1.0625rem]"
        >
          <BrandMark className="text-gold h-[1.45rem] w-auto" />
          {/* Cok dar ekranda yalnizca isaret kaliyor: 320 px'te panel dugmesi
              + isaret + yazi + giris + eylem toplami 346 px'e ciktigi ve
              cubuk 41 px tastigi olculdu. Isaret tek basina markayi
              tasiyabiliyor, kaybolan sey yalnizca tekrar. */}
          <span className="hidden font-semibold tracking-[-0.01em] whitespace-nowrap min-[380px]:inline">
            Vitrin <span className="text-gold">AI</span>
          </span>
        </Link>

        {/* Baglantilar markanin hemen devaminda, ortada degil — ortalanmis bir
            menu genis ekranda savruk duruyor. */}
        <ul className="ml-4 hidden h-full items-stretch gap-1 lg:flex">
          {LINKS.map((link) => (
            <li key={link.href} className="flex">
              <Link
                href={link.href}
                className="flex h-full items-center rounded-md px-3 text-[0.875rem] text-[#f3f0eb]/75 transition-colors hover:bg-white/8 hover:text-[#f3f0eb]"
              >
                {link.label}
              </Link>
            </li>
          ))}

          {PANELLER.map((panel) => {
            const acik = acikPanel === panel.ad;
            return (
              <li key={panel.ad} className="flex">
                <button
                  type="button"
                  onClick={() => setAcikPanel(acik ? null : panel.ad)}
                  aria-expanded={acik}
                  className={cn(
                    "flex h-full items-center gap-1 rounded-md px-3 text-[0.875rem] transition-colors",
                    acik
                      ? "bg-white/12 text-[#f3f0eb]"
                      : "text-[#f3f0eb]/75 hover:bg-white/8 hover:text-[#f3f0eb]",
                  )}
                >
                  {panel.etiket}
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform duration-300",
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

        <div className="ml-auto flex h-full items-center gap-1.5 sm:gap-2.5">
          <button
            type="button"
            onClick={openSignIn}
            className="flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[0.875rem] text-[#f3f0eb]/85 transition-colors hover:bg-white/10 hover:text-[#f3f0eb]"
          >
            <LogIn className="size-4" strokeWidth={1.75} aria-hidden />
            <span className="hidden sm:inline">Giriş yap</span>
          </button>

          <Link
            href="/#dene"
            className="press bg-gold hover:bg-gold-soft flex min-h-9 items-center rounded-full px-4 text-[0.875rem] font-medium whitespace-nowrap text-black transition-colors"
          >
            <span className="sm:hidden">Deneyin</span>
            <span className="hidden sm:inline">Hemen deneyin</span>
          </Link>
        </div>
      </nav>
    </header>

    <NavPanel
      acik={acikPanel === "nasil"}
      onKapat={() => setAcikPanel(null)}
      etiket="Nasıl çalışır"
      ustBaslik="Nasıl çalışır"
    >
      <NasilCalisirIcerik />
    </NavPanel>

    <NavPanel
      acik={acikPanel === "hakkinda"}
      onKapat={() => setAcikPanel(null)}
      etiket="Vitrin AI hakkında"
      ustBaslik="Vitrin AI hakkında"
    >
      <HakkindaIcerik />
    </NavPanel>
    </>
  );
}
