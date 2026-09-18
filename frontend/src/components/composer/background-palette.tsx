"use client";

/**
 * Menü kartındaki zemin seçici (Kaan, 18.09.2026): kategori sekmeleri +
 * ADLARIYLA yatay şerit.
 *
 * Kısa geçmiş: önce yatay şeritti (tekerlek yatay kaydırmıyordu, uzun uzun
 * sağa gitmek gerekiyordu), sonra dikey ızgara oldu (kart büyüdü, adlar
 * kayboldu, sağda ikinci bir kaydırma çubuğu çıktı). Kaan'ın kararı: hareket
 * SAĞA/SOLA olsun, adlar görünsün. Asıl kusur tekerlekti; artık tekerlek şeridi
 * yatay kaydırıyor (`use-horizontal-wheel.ts`) ve kaydırma çubuğu gizli.
 *
 * İnce kart turu (18.09.2026): kategori sekmeleri kartın BAŞLIK satırına
 * çıktı (bir satır kazanıldı, tuval o kadar büyüdü); adlar TEK satır —
 * iki satırlık ad kartın alt kenarında kesiliyor ve gizli kaydırma çubuğu
 * yüzünden hiç görünmüyordu ("zemin isimleri yazsın").
 *
 * Yumuşaklık: seçim halkası, büyüme ve ad rengi aynı uzun eğriyle geçiyor;
 * seçilen zemin şeridin ortasına YUMUŞAK kayıyor; kategori değişince seçim
 * camı (`GlassLens`) sekmeler arasında süzülüyor ve şerit bulanıktan netleşiyor.
 *
 * Korunan ürün kararları (17.09.2026, Serhan):
 * 1. SEÇİLİ ZEMİN yalnızca renkle değil — altın halka VE adıyla belirtiliyor.
 * 2. Her kategori sekmesinde kaç zemin olduğu yazar.
 * 3. Son kart yarım görünüyor (`palette-fade`): devamı olduğu belli olsun.
 */

import { useEffect, useRef } from "react";

import { GlassLens } from "@/components/composer/glass-lens";
import { ScrollArrows } from "@/components/composer/scroll-arrows";
import { useHorizontalWheel } from "@/components/composer/use-horizontal-wheel";
import type { BackgroundGroup } from "@/components/composer/use-background-selection";
import type { BackgroundCategory } from "@/lib/background-categories";
import type { Background } from "@/lib/backgrounds";

/** Seçim geçişlerinin ortak eğrisi — iOS'un yay hissine yakın, uzun kuyruklu. */
const SOFT = "duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]";

export function CategoryTabs({
  groups,
  shownGroup,
  onSelect,
}: {
  groups: BackgroundGroup[];
  shownGroup: BackgroundGroup | undefined;
  onSelect: (category: BackgroundCategory | null) => void;
}) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  useHorizontalWheel(stripRef);
  // Tek kategori varsa seçim sunulmuyor.
  if (groups.length < 2) return null;

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label="Zemin kategorileri"
      className="dock-strip relative flex min-w-0 gap-0.5 overflow-x-auto"
    >
      <GlassLens containerRef={stripRef} activeKey={shownGroup?.id} />
      {groups.map((group) => {
        const isShown = group.id === shownGroup?.id;
        return (
          <button
            key={group.id}
            type="button"
            role="tab"
            data-lens-key={group.id}
            aria-selected={isShown}
            // ACIK ad: metin parcalari ayri ogelerde oldugu icin hesaplanan ad
            // "Sade· 2" gibi bitisik cikiyordu (17.09'da testte olculdu).
            aria-label={`${group.label} · ${group.items.length}`}
            onClick={() => onSelect(group.id)}
            className={
              "press relative z-10 flex min-h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[0.75rem] whitespace-nowrap transition-colors " +
              SOFT +
              " " +
              (isShown ? "font-semibold text-[#f3f0eb]" : "on-dark-muted hover:text-[#f3f0eb]")
            }
          >
            {group.label}
            <span className="tabular-nums opacity-55" aria-hidden>
              {group.items.length}
            </span>
          </button>
        );
      })}
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
  // Kategori degisince bilesen UST bilesende `key` ile yeniden kuruluyor
  // (composition-editor.tsx): serit `glass-content-in` ile bulaniktan
  // netlesiyor ve tekerlek/ok dinleyicileri YENI seride baglaniyor. Anahtar
  // seridin kendisine verilseydi dinleyiciler eski ogede kalirdi.
  const stripRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  const hasCenteredRef = useRef(false);
  useHorizontalWheel(stripRef);

  // Seçili zemin şeridin ortasına getiriliyor — yalnızca şeridin KENDİ
  // kaydırması; `scrollIntoView` mobilde bütün stüdyoyu kaydırıyordu. İlk
  // açılışta anında (kart açılırken kayan şerit rahatsız ediyor), sonra
  // YUMUŞAK kayarak.
  useEffect(() => {
    const strip = stripRef.current;
    const selected = selectedRef.current;
    if (!strip || !selected) return;
    strip.scrollTo?.({
      left: selected.offsetLeft - (strip.clientWidth - selected.offsetWidth) / 2,
      behavior: hasCenteredRef.current ? "smooth" : "auto",
    });
    hasCenteredRef.current = true;
  }, [selectedId, items]);

  return (
    <ScrollArrows targetRef={stripRef} label="zeminler">
      <div
        ref={stripRef}
        aria-label="Zeminler"
        className="dock-strip palette-fade glass-content-in relative flex snap-x gap-2 overflow-x-auto px-2 pt-1.5 pb-1"
      >
        {items.map((background) => {
          const isActive = background.id === selectedId;
          return (
            <button
              key={background.id}
              ref={isActive ? selectedRef : undefined}
              type="button"
              onClick={() => onSelect(background.id)}
              aria-pressed={isActive}
              className="press w-[3.75rem] shrink-0 snap-start text-center"
            >
              <span
                className={
                  "block aspect-square w-full overflow-hidden rounded-[0.8rem] transition-[transform,box-shadow] " +
                  SOFT +
                  " " +
                  (isActive
                    ? "ring-gold scale-[1.06] ring-2 shadow-[0_6px_16px_-8px_rgb(0_0_0/0.6)]"
                    : "ring-1 ring-white/15 hover:scale-[1.04]")
                }
                style={
                  background.type === "placeholder"
                    ? { background: gradientCss(background.gradient) }
                    : undefined
                }
              >
                {background.type === "server" ? (
                  // <img>, CSS arka plani degil: `loading="lazy"` yalnizca
                  // gorunen ornekleri indiriyor ve onizleme yoksa tam boyutlu
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
              {/* Ad her zeminin altinda, TEK satir; secili olan altin ve kalin.
                  Yalnizca renge guvenilmiyor (erisilebilirlik). Uzun ad
                  `title` ile tamamen okunur. */}
              <span
                title={background.name}
                className={
                  "mt-1.5 block truncate text-[0.625rem] leading-3 transition-colors " +
                  SOFT +
                  " " +
                  (isActive ? "text-gold font-semibold" : "on-dark-muted")
                }
              >
                {background.name}
              </span>
            </button>
          );
        })}
      </div>
    </ScrollArrows>
  );
}
