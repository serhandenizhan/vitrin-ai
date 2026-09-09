"use client";

/**
 * "Hakkında" — ust cubuktan acilan panel: uygulamanin amaci, misyon ve vizyon.
 *
 * NEDEN SAYFA BOLUMU DEGIL DE PANEL:
 * Bu uc metin, araci kullanmak icin gerekli DEGIL. Sayfaya bolum olarak
 * konduklarinda ziyaretcinin araca ulasmasi bir ekran gecikiyor ve ana menu
 * "Deneyin / Ozellikler / Nasil calisir / Teknik bilgiler / Misyon" diye
 * uzayip hangisinin gerekli oldugu belirsizlesiyordu. Panel, isteyen icin bir
 * tiklama uzakta; istemeyen icin hic yok.
 *
 * Desen Apple'in urun sayfalarindaki acilir baslik ("+") ve gezinme
 * panellerinden uyarlandi: ust cubugun altindan asagi aciliyor, arkasi
 * bulanik, Escape ile kapaniyor.
 */

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

const BOLUMLER = [
  {
    baslik: "Amacımız",
    metin:
      "Bir ürünü satışa hazır göstermek bugün ya pahalı bir çekim ya da saatler süren bir düzenleme işi. Vitrin AI bunu tezgâhın başında, telefonla çekilmiş tek bir kareden yapıyor. Aradaki farkı kapatan şey ürünün kendisi değil, arkasındaki dağınıklık.",
  },
  {
    baslik: "Misyonumuz",
    metin:
      "Her kuyumcunun kendi stüdyosu olsun. Ürünü tezgâhta çekip aynı dakikada vitrine koyabilmek; bunun için ajans, stüdyo ya da düzenleme bilgisi gerekmesin.",
  },
  {
    baslik: "Vizyonumuz",
    metin:
      "Vitrinden mobile tek akış. Kesim, zemin, ölçü ve dışa aktarma tek bir yerde — sonunda telefonun içinde, ürün tezgâhtan çıkmadan mağaza sayfasında.",
  },
];

export type AboutPanelProps = {
  acik: boolean;
  onKapat: () => void;
};

export function AboutPanel({ acik, onKapat }: AboutPanelProps) {
  const panelId = useId();
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
      {/* Arka plan: panel disina tiklayinca kapansin. Her zaman DOM'da,
          gorunurlugu sinifla degisiyor — boylece gecis animasyonu calisiyor
          (bkz. kok CLAUDE.md ders 13: durum degistiren sinif ciftlerinde
          bilesik secici). */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden={!acik}
        onClick={onKapat}
        className={
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 " +
          (acik ? "opacity-100" : "pointer-events-none opacity-0")
        }
      />

      <div
        id={panelId}
        role="region"
        aria-label="Vitrin AI hakkında"
        aria-hidden={!acik}
        className={
          "hakkinda-panel fixed inset-x-0 top-14 z-40 border-b border-white/10 bg-black/85 text-[#f5f5f7] backdrop-blur-xl backdrop-saturate-150 " +
          (acik ? "hakkinda-panel-acik" : "")
        }
      >
        <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:py-14">
          <div className="flex items-start justify-between gap-6">
            <p className="fine-print tracking-[0.08em] text-[#f5f5f7]/55 uppercase">
              Vitrin AI hakkında
            </p>
            <button
              ref={kapatDugmesiRef}
              type="button"
              onClick={onKapat}
              aria-label="Kapat"
              tabIndex={acik ? 0 : -1}
              className="-mt-2 flex size-9 shrink-0 items-center justify-center rounded-full text-[#f5f5f7]/70 transition-colors hover:bg-white/10 hover:text-[#f5f5f7]"
            >
              <X className="size-4" strokeWidth={1.75} aria-hidden />
            </button>
          </div>

          <div className="mt-8 grid gap-8 sm:grid-cols-3 sm:gap-10">
            {BOLUMLER.map((bolum) => (
              <section key={bolum.baslik}>
                <h2 className="text-[1.375rem] font-semibold tracking-[-0.015em]">
                  {bolum.baslik}
                </h2>
                <p className="mt-3 text-[0.9375rem] leading-relaxed text-pretty text-[#f5f5f7]/70">
                  {bolum.metin}
                </p>
              </section>
            ))}
          </div>

          <p className="fine-print mt-10 text-[#f5f5f7]/45">
            Kuyumcular için geliştiriliyor. Fotoğraflar saklanmaz; görsel
            yalnızca işlem süresince bellekte tutulur.
          </p>
        </div>
      </div>
    </>
  );
}
