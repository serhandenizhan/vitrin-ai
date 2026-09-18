"use client";

/**
 * Dock'taki zemin paleti (17.09.2026, Serhan).
 *
 * Dort urun karari burada:
 *
 * 1. SECILI ZEMIN yalnizca renkle degil, altin ince bir halka VE ADIYLA
 *    belirtiliyor. Yalnizca renge guvenmek, birbirine yakin iki zemin arasinda
 *    (ve renk korlugunde) secimin hangisi oldugunu okunamaz kiliyordu.
 * 2. KATEGORI CHIP'LERI surekli bir satir kaplamiyor; baslikta duran
 *    "Doku & desen · 17" dugmesi bir menu aciyor. Chip satiri dock'un
 *    yuksekliginin ucte birini yiyordu.
 * 3. Son kart YARIM gorunuyor (`palette-fade`): devaminin oldugu belli olsun.
 * 4. "Devam" burada degil, denetcide sabit kaliyor.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import type { BackgroundGroup } from "@/components/composer/use-background-selection";
import type { BackgroundCategory } from "@/lib/background-categories";
import type { Background } from "@/lib/backgrounds";

export function CategoryMenuButton({
  groups,
  shownGroup,
  onSelect,
}: {
  groups: BackgroundGroup[];
  shownGroup: BackgroundGroup | undefined;
  onSelect: (category: BackgroundCategory | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Disari tiklayinca kapaniyor. Escape, asagidaki kapsayici olayinda
  // ele aliniyor: boylece olay belgeye ulasip studyoyu da kapatmiyor.
  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  // Tek kategori varsa menu bir secim sunmuyor; dugme de gosterilmiyor.
  if (groups.length < 2) return null;

  return (
    <div
      ref={containerRef}
      className="relative"
      onKeyDown={(event) => {
        if (!isOpen || event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        // ACIK `aria-label`: erisilebilir ad metin dugumlerinden hesaplanirken
        // her ogenin katkisi ayri ayri kirpiliyor ve ad "Sade· 2" gibi bitisik
        // cikiyordu (testte olculdu). Gorsel bicimlendirme bozulmadan okunur
        // bir ad vermenin tek yolu bu.
        aria-label={`${shownGroup?.label ?? ""} · ${shownGroup?.items.length ?? 0}`}
        className="press on-dark-muted flex min-h-8 items-center gap-1 rounded-full px-2 text-[0.75rem] whitespace-nowrap hover:text-[#f3f0eb]"
      >
        {shownGroup?.label}
        <span className="tabular-nums opacity-70" aria-hidden>
          · {shownGroup?.items.length}
        </span>
        <ChevronDown className="size-3.5" strokeWidth={1.75} aria-hidden />
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label="Zemin kategorileri"
          className="glass-panel soft-enter absolute right-0 bottom-full z-10 mb-2 min-w-44 rounded-xl p-1"
        >
          {groups.map((group) => {
            const isShown = group.id === shownGroup?.id;
            return (
              <button
                key={group.id}
                type="button"
                role="menuitemradio"
                aria-checked={isShown}
                onClick={() => {
                  onSelect(group.id);
                  setIsOpen(false);
                }}
                className={
                  "press flex min-h-9 w-full items-center justify-between gap-4 rounded-lg px-3 text-[0.8125rem] " +
                  (isShown ? "text-gold bg-white/8" : "hover:bg-white/8")
                }
              >
                {group.label}
                <span className="tabular-nums opacity-55">{group.items.length}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function BackgroundPalette({
  items,
  selectedId,
  onSelect,
  gradientCss,
}: {
  items: Background[];
  selectedId: string;
  onSelect: (id: string) => void;
  gradientCss: (stops: (number | string)[]) => string;
}) {
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  // Yalnızca yatay şeridi kaydır: scrollIntoView mobilde tüm stüdyoyu
  // aşağı kaydırıp tuvalin üstünü navbarın arkasına götürüyordu.
  useEffect(() => {
    const selected = selectedRef.current;
    const strip = selected?.parentElement;
    if (!selected || !strip) return;
    const item = selected.getBoundingClientRect();
    const viewport = strip.getBoundingClientRect();
    strip.scrollTo?.({ left: strip.scrollLeft + item.left - viewport.left - (viewport.width - item.width) / 2 });
  }, [selectedId, items]);

  return (
    <>
      {items.map((background) => {
        const isActive = background.id === selectedId;
        return (
          <button
            key={background.id}
            ref={isActive ? selectedRef : undefined}
            type="button"
            onClick={() => onSelect(background.id)}
            aria-pressed={isActive}
            className="press w-20 shrink-0 snap-start text-center"
          >
            <span
              // Halka `ring` yardimcilariyla veriliyor, keyfi `shadow-[...]`
              // ile degil: keyfi coklu golge denendiginde Tailwind iki katman
              // uretti ama ikisi de SEFFAF kaldi (tarayicida olculdu).
              className={
                "block aspect-square w-full overflow-hidden rounded-xl transition-transform duration-200 " +
                (isActive
                  ? "ring-gold scale-105 ring-2 ring-offset-2 ring-offset-transparent"
                  : "ring-1 ring-white/15 hover:scale-105")
              }
              style={
                background.type === "placeholder"
                  ? { background: gradientCss(background.gradient) }
                  : undefined
              }
            >
              {background.type === "server" ? (
                // <img>, CSS arka plani degil: `loading="lazy"` yalnizca
                // gorunen simgeleri indiriyor ve onizleme yoksa tam boyutlu
                // gorsele dusmek icin `onError` gerekiyor.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={background.thumbnailUrl ?? background.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  onError={(event) => {
                    const image = event.currentTarget;
                    if (image.dataset.fallback === "1") return;
                    image.dataset.fallback = "1";
                    image.src = background.url;
                  }}
                  className="size-full object-cover"
                />
              ) : null}
            </span>
            {/* Ad, SECILI olanda altin ve tam okunur; digerlerinde soluk.
                Yalnizca renge guvenilmiyor (erisilebilirlik). */}
            <span
              className={
                "mt-2 block min-h-8 text-[0.6875rem] leading-4 " +
                (isActive ? "text-gold font-medium" : "on-dark-muted")
              }
            >
              {background.name}
            </span>
          </button>
        );
      })}
    </>
  );
}
