"use client";

/**
 * Ust cubuktan acilan panel — Hakkinda, Nasil calisir ve Paketler icin ortak
 * kabuk.
 *
 * NEDEN PANEL, NEDEN SAYFA BOLUMU DEGIL:
 * Bu ucunun icerigi de araci KULLANMAK icin gerekli degil. Sayfaya bolum
 * olarak konduklarinda ziyaretcinin araca ulasmasi her biri icin bir ekran
 * geciktiriyor ve menu "hangisi gerekli" sorusunu dogurur hale geliyordu.
 * Panel, isteyen icin bir tiklama uzakta; istemeyen icin hic yok.
 *
 * Desen Apple'in acilir gezinme panellerinden uyarlandi: ust cubugun altindan
 * asagi aciliyor, arkasi bulanik, Escape ve disina tiklama ile kapaniyor.
 *
 * Ayni anda yalnizca bir panel acik olabiliyor; bunu `SiteHeader` tek bir
 * "acik panel adi" durumuyla yonetiyor — iki panelin ust uste binmesi ya da
 * biri acikken digerinin arkasinda kalmasi mumkun degil.
 */

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export type NavPanelProps = {
  acik: boolean;
  onKapat: () => void;
  /** Ekran okuyucuya panelin ne oldugunu soyler. */
  etiket: string;
  /** Panelin sol ustundeki kucuk baslik. */
  ustBaslik: string;
  children: React.ReactNode;
};

export function NavPanel({
  acik,
  onKapat,
  etiket,
  ustBaslik,
  children,
}: NavPanelProps) {
  const kapatDugmesiRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!acik) return;

    function tusaBasildi(olay: KeyboardEvent) {
      if (olay.key === "Escape") onKapat();
    }
    document.addEventListener("keydown", tusaBasildi);
    // Odak panele tasiniyor: klavyeyle acan kullanici iceride kalsin, aksi
    // halde odak hala ust cubuktaki dugmede oluyor ve panelin acildigi ekran
    // okuyucuya gecmiyor.
    kapatDugmesiRef.current?.focus();
    return () => document.removeEventListener("keydown", tusaBasildi);
  }, [acik, onKapat]);

  return (
    <>
      {/* Arka plan her zaman DOM'da; gorunurlugu sinifla degisiyor ki gecis
          animasyonu calissin. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden={!acik}
        onClick={onKapat}
        className={
          "fixed inset-0 z-40 bg-black/45 backdrop-blur-[3px] transition-opacity duration-300 " +
          (acik ? "opacity-100" : "pointer-events-none opacity-0")
        }
      />

      <div
        role="region"
        aria-label={etiket}
        aria-hidden={!acik}
        className={
          "nav-panel fixed inset-x-0 top-14 z-40 max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-white/10 bg-[#0c0b0a]/92 text-[#f3f0eb] backdrop-blur-2xl backdrop-saturate-150 " +
          (acik ? "nav-panel-acik" : "")
        }
      >
        <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:py-14">
          <div className="flex items-start justify-between gap-6">
            <p className="fine-print tracking-[0.08em] text-[#f3f0eb]/50 uppercase">
              {ustBaslik}
            </p>
            <button
              ref={kapatDugmesiRef}
              type="button"
              onClick={onKapat}
              aria-label="Kapat"
              tabIndex={acik ? 0 : -1}
              className="-mt-2 flex size-9 shrink-0 items-center justify-center rounded-full text-[#f3f0eb]/65 transition-colors hover:bg-white/10 hover:text-[#f3f0eb]"
            >
              <X className="size-4" strokeWidth={1.75} aria-hidden />
            </button>
          </div>

          {/* Icerik, panel acildiginda kisa bir gecikmeyle yukselerek geliyor
              (bkz. globals.css `.nav-panel-icerik`) — panelin kendisi inerken
              icerik de ayni yonde hareket edince gecis tek bir hareket gibi
              okunuyor. */}
          <div className="nav-panel-icerik mt-8">{children}</div>
        </div>
      </div>
    </>
  );
}
