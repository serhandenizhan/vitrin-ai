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

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Gauge, LogIn, LogOut, Menu, PanelLeft, ShieldCheck, UserRound } from "lucide-react";

import { useAdminStatus } from "@/components/admin/use-admin-status";
import { NavPanel } from "@/components/nav-panel";
import { NasilCalisirIcerik } from "@/components/nav-panel-contents";
import { BrandMark } from "@/components/brand-mark";
import { useWorkspace } from "@/components/workspace-provider";
import { displayName } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { billingFetch, type Subscription } from "@/lib/billing";

const LINKS = [
  { href: "/calismalar", label: "Çalışmalar" },
  { href: "/katalog", label: "Katalog" },
  { href: "/paketler", label: "Paketler" },
  { href: "/cekim-rehberi", label: "Rehber" },
  { href: "/bulten", label: "Bülten" },
];

/** Panel aciyor; sirasi menudeki gorunum sirasi. */
const PANELLER = [
  { ad: "nasil", etiket: "Nasıl çalışır" },
] as const;

type PanelAdi = (typeof PANELLER)[number]["ad"] | "menu";

export function SiteHeader() {
  const {
    toggleSidebar,
    openSignIn,
    user,
    isAuthLoaded,
  } = useWorkspace();
  const pathname = usePathname();
  // Ayni anda tek panel: iki panelin ust uste binmesi ya da biri acikken
  // digerinin arkasinda kalmasi mumkun olmasin.
  const [acikPanel, setAcikPanel] = useState<PanelAdi | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const closePanel = () => setAcikPanel(null);
  const isCompact = isScrolled && !isHovered && acikPanel === null;

  useEffect(() => {
    const update = () => setIsScrolled(window.scrollY > 64);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <>
      <header className="pointer-events-none sticky top-0 z-50 -mb-15 h-15 px-3 pt-3">
        <nav
          aria-label="Ana gezinme"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={cn(
            "pointer-events-auto mx-auto flex h-12 w-full max-w-6xl items-center gap-1 rounded-full pr-1.5 pl-1.5 sm:gap-2 lg:max-w-none",
            "bg-[#171614]/80 text-[#f3f0eb] ring-1 ring-white/[0.09] backdrop-blur-xl backdrop-saturate-150",
            "shadow-[0_12px_40px_-14px_rgba(0,0,0,0.75)] transition-[width,box-shadow,background-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
            isCompact
              ? "lg:w-[34.5rem] lg:bg-[#171614]/88 lg:shadow-[0_16px_48px_-16px_rgba(0,0,0,0.88)]"
              : "lg:w-[min(72rem,calc(100vw-1.5rem))]",
          )}
        >
          <button
            type="button"
            onClick={() => {
              closePanel();
              toggleSidebar();
            }}
            aria-label="Ayarlar panelini aç"
            title="Ayarlar"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-[#f3f0eb]/65 transition-[background-color,color,transform] hover:scale-105 hover:bg-white/10 hover:text-[#f3f0eb]"
          >
            <PanelLeft className="size-4" strokeWidth={1.75} aria-hidden />
          </button>

          <Link
            href="/#top"
            onClick={() => { setIsHovered(true); closePanel(); }}
            className="flex h-full shrink-0 items-center gap-2 pr-2 pl-1 text-[1rem]"
          >
            <BrandMark className="text-gold h-[1.3rem] w-auto" />
            {/* Cok dar ekranda yalnizca isaret kaliyor: 320 px'te cubuk
                tasiyordu. Isaret tek basina markayi tasiyabiliyor. */}
            <span className="hidden font-semibold tracking-[-0.015em] whitespace-nowrap min-[430px]:inline">
              Vitrin AI
            </span>
          </Link>

          <div className={cn("hidden min-w-0 items-center overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-400 ease-out lg:flex", isCompact ? "pointer-events-none max-w-0 -translate-y-1 opacity-0" : "max-w-[48rem] translate-y-0 opacity-100")} aria-hidden={isCompact || undefined} inert={isCompact ? true : undefined}>
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-white/12" />
          <ul className="flex items-center gap-0.5">
            {LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center rounded-full px-3.5 text-[0.875rem] transition-colors",
                      isActive
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
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
            {/* Oturum bilgisi gelene kadar yer tutucu: once "Giris yap"
                gorunup bir an sonra hesaba donmesi titreme gibi duruyordu. */}
            {!isAuthLoaded ? (
              <span aria-hidden className="h-9 w-9 sm:w-24" />
            ) : user ? (
              <AccountMenu />
            ) : (
              <button
                type="button"
                onClick={openSignIn}
                className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[0.875rem] text-[#f3f0eb]/80 transition-colors hover:bg-white/10 hover:text-[#f3f0eb]"
              >
                <LogIn className="size-4" strokeWidth={1.75} aria-hidden />
                <span className="hidden sm:inline">Giriş yap</span>
              </button>
            )}

            {/* Cok dar ekranda kisa metin: panel dugmesi + marka + giris
                ikonu + tam metinli CTA + menu dugmesi ust uste bindiginde
                (320 px'te olculdu) tasma yapiyordu. */}
            <Link
              href="/#dene"
              onClick={closePanel}
              className="press bg-gold hover:bg-gold-soft flex h-9 items-center rounded-full px-3 text-[0.875rem] font-medium whitespace-nowrap text-black transition-colors sm:px-4"
            >
              <span className="sm:hidden">Deneyin</span>
              <span className="hidden sm:inline">Hemen deneyin</span>
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
        onKapat={closePanel}
        etiket="Menü"
        ustBaslik="Menü"
      >
        <ul className="flex flex-col divide-y divide-white/10">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={closePanel}
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
        onKapat={closePanel}
        etiket="Nasıl çalışır"
        ustBaslik="Nasıl çalışır"
      >
        <NasilCalisirIcerik />
      </NavPanel>

    </>
  );
}

function AccountMenu() {
  const { user, signOut } = useWorkspace();
  // Yalniz gosterim: baglanti yoneticiye gorunur, yetki backend'de (Faz 6).
  const adminStatus = useAdminStatus(user?.id);
  const [open, setOpen] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [quotaError, setQuotaError] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("touchstart", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("touchstart", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void billingFetch<Subscription>("/api/subscriptions/me")
      .then((value) => { if (active) setSubscription(value); })
      .catch(() => { if (active) setQuotaError(true); });
    return () => { active = false; };
  }, [open]);

  if (!user) return null;
  const remaining = subscription
    ? subscription.admin_exempt
      ? "Sınırsız"
      : String(subscription.billing_issue ? 0 : Math.max(0, (subscription.period?.quota_snapshot ?? 0) - (subscription.period?.used_this_period ?? 0)) + (subscription.bonus_credits ?? 0))
    : quotaError ? "Alınamadı" : "Yükleniyor…";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => {
          if (!current) setQuotaError(false);
          return !current;
        })}
        aria-label={`Hesap menüsü: ${displayName(user)}`}
        aria-expanded={open}
        aria-haspopup="menu"
        title={user.email ?? undefined}
        className={cn(
          "flex h-9 max-w-[12rem] items-center gap-1.5 rounded-full px-3 text-[0.875rem] transition-colors",
          open ? "bg-white/12 text-[#f3f0eb]" : "text-[#f3f0eb]/80 hover:bg-white/10 hover:text-[#f3f0eb]",
        )}
      >
        <UserRound className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
        <span className="hidden truncate sm:inline">{displayName(user)}</span>
        <ChevronDown className={cn("hidden size-3 shrink-0 opacity-60 transition-transform sm:block", open && "rotate-180")} aria-hidden />
      </button>

      {open ? (
        <div role="menu" aria-label="Hesap menüsü" className="glass-panel soft-enter absolute top-full right-0 mt-2 w-64 overflow-hidden rounded-2xl p-2 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.9)]">
          <div className="border-b border-white/10 px-3 py-2.5">
            <p className="truncate text-sm font-medium">{displayName(user)}</p>
            <p className="on-dark-muted mt-0.5 truncate text-xs">{user.email}</p>
          </div>
          <Link href="/hesap" role="menuitem" onClick={() => setOpen(false)} className="mt-1 flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm text-white/78 transition-colors hover:bg-white/9 hover:text-white">
            <UserRound className="size-4" strokeWidth={1.75} aria-hidden />
            Profil
          </Link>
          {adminStatus === "admin" ? (
            <Link href="/admin" role="menuitem" onClick={() => setOpen(false)} className="flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm text-white/78 transition-colors hover:bg-white/9 hover:text-white">
              <ShieldCheck className="size-4" strokeWidth={1.75} aria-hidden />
              Yönetim paneli
            </Link>
          ) : null}
          <div className="flex min-h-10 items-center justify-between gap-3 rounded-xl px-3 text-sm" aria-label={`Kalan kredi: ${remaining}`}>
            <span className="flex items-center gap-3 text-white/62"><Gauge className="size-4" strokeWidth={1.75} aria-hidden />Kalan kredi</span>
            <strong className="text-gold text-xs font-semibold tabular-nums">{remaining}</strong>
          </div>
          <div className="my-1 h-px bg-white/10" />
          <button type="button" role="menuitem" onClick={() => { setOpen(false); void signOut(); }} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200">
            <LogOut className="size-4" strokeWidth={1.75} aria-hidden />
            Çıkış yap
          </button>
        </div>
      ) : null}
    </div>
  );
}
