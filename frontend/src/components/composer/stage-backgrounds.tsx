"use client";

/**
 * Aşamalı stüdyonun zemin seçicileri (Kaan, 19.09.2026 — masaüstü).
 *
 * - `BackgroundLibrary`: Aşama 1 "Sahne"de sağdaki GENİŞ kütüphane. Zeminler
 *   rahatça görülebilecek boyutta, adlarıyla, üç sütunlu ızgarada; her kartın
 *   köşesinde beğen düğmesi.
 * - `BackgroundRail`: Aşama 2 "Düzenle"de sol kenarda DİK duran ince bar.
 *   Kullanıcı düzenlerken zemini değiştirmek isterse diye orada; seçim ve
 *   favoriler Aşama 1 ile aynı durumu paylaşıyor.
 *
 * İki bileşen de yalnızca GÖSTERİM: seçim, kategori ve favori durumu
 * editörde (`use-background-selection.ts`, `lib/favorite-backgrounds.ts`).
 */

import { useEffect, useRef, type ReactNode } from "react";
import { Heart, Sparkles } from "lucide-react";

import type { BackgroundGroup, BackgroundShelf } from "@/components/composer/use-background-selection";
import type { Background } from "@/lib/backgrounds";

type Common = {
  groups: BackgroundGroup[];
  shownGroup: BackgroundGroup | undefined;
  items: Background[];
  selectedId: string;
  favoriteIds: readonly string[];
  onSelect: (id: string) => void;
  /** Fare bir zeminin uzerine gelince id, cikinca null (tuvalde onizleme). */
  onPreview?: (id: string | null) => void;
  onShowCategory: (category: BackgroundShelf | null) => void;
  onToggleFavorite: (id: string) => void;
  gradientCss: (stops: (number | string)[]) => string;
};

function swatchStyle(
  background: Background,
  gradientCss: Common["gradientCss"],
): React.CSSProperties | undefined {
  return background.type === "placeholder" ? { background: gradientCss(background.gradient) } : undefined;
}

/**
 * Onizleme olaylari: YALNIZCA fare. Dokunmatikte `pointerenter` dokunusla
 * birlikte geliyor ve cikis hic gelmeyebiliyor; tuval takili kalirdi.
 */
function previewHandlers(id: string, onPreview: Common["onPreview"]) {
  if (!onPreview) return {};
  return {
    onPointerEnter: (event: React.PointerEvent) => {
      if (event.pointerType === "mouse") onPreview(id);
    },
    onPointerLeave: (event: React.PointerEvent) => {
      if (event.pointerType === "mouse") onPreview(null);
    },
  };
}

function Thumb({ background }: { background: Background }) {
  if (background.type !== "server") return null;
  return (
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
  );
}

/**
 * Secili zemini gorunur alana getirir — yalnizca kendi kaydirmasiyla ve
 * YALNIZCA gorunur degilse (Serhan, 19.09.2026). Eskiden her secimde secilen
 * zemini ortaya kaydiriyordu: tiklanan zemin imlecin altindan kayip gidiyor,
 * panel gereksiz yere oynuyordu. Artik tiklanan zemin zaten gorunur oldugu
 * icin hic kaydirma olmuyor; kaydirma yalnizca acilista, kategori degisince
 * ya da secim baska yerden (bicim degisimi) gelip ogeyi gorunmez biraktiginda.
 */
function useKeepSelectedVisible(selectedId: string, itemsKey: string) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const scroller = scrollerRef.current;
    const selected = selectedRef.current;
    if (!scroller || !selected) return;
    // Olcum ekran koordinatinda: offsetTop, offsetParent'a bagli oldugu icin
    // kaydirma kutusuna gore degil baska bir ataya gore cikabiliyor.
    const box = scroller.getBoundingClientRect();
    const item = selected.getBoundingClientRect();
    // Halka ve kenar solmasi icin kucuk bir pay.
    const margin = 12;
    const isVisible = item.top >= box.top + margin && item.bottom <= box.bottom - margin;
    if (isVisible) return;
    scroller.scrollTo?.({
      top: scroller.scrollTop + item.top - box.top - (box.height - item.height) / 2,
      behavior: "auto",
    });
  }, [selectedId, itemsKey]);
  return { scrollerRef, selectedRef };
}

function ShelfTabs({
  groups,
  shownGroup,
  onShowCategory,
  vertical = false,
}: Pick<Common, "groups" | "shownGroup" | "onShowCategory"> & { vertical?: boolean }) {
  if (groups.length < 2) return null;
  return (
    <div
      role="tablist"
      aria-label="Zemin kategorileri"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      className={
        vertical
          ? "flex flex-col gap-0.5"
          : // Icerik genisliginde ve ORTADA (Serhan, 19.09.2026): tam genislikte
            // sola yaslanmis serit, sagda bos bir bant birakiyordu.
            "dock-strip mx-auto flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-full bg-black/20 p-0.5"
      }
    >
      {groups.map((group) => {
        const isShown = group.id === shownGroup?.id;
        return (
          <button
            key={group.id}
            type="button"
            role="tab"
            aria-selected={isShown}
            aria-label={`${group.label} · ${group.items.length}`}
            title={group.label}
            onClick={() => onShowCategory(group.id)}
            className={
              "press flex shrink-0 items-center justify-center gap-1 rounded-full transition-colors duration-300 " +
              (vertical ? "min-h-7 px-1 text-[0.625rem] " : "min-h-8 px-2.5 text-[0.75rem] ") +
              (isShown ? "bg-white/12 font-medium text-[#f3f0eb]" : "on-dark-muted hover:text-[#f3f0eb]")
            }
          >
            {group.id === "favoriler" ? (
              <Heart className="text-gold size-3 shrink-0 fill-current" strokeWidth={0} aria-hidden />
            ) : group.id === "oneriler" ? (
              <Sparkles className="text-gold size-3 shrink-0" strokeWidth={2} aria-hidden />
            ) : null}
            {vertical && (group.id === "favoriler" || group.id === "oneriler") ? null : (
              <span className="truncate">{group.label}</span>
            )}
            {vertical ? null : (
              <span className="tabular-nums opacity-55" aria-hidden>
                {group.items.length}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function FavoriteButton({
  background,
  isFavorite,
  onToggle,
  className = "",
}: {
  background: Background;
  isFavorite: boolean;
  onToggle: (id: string) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(background.id)}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? `${background.name} favorilerden çıkar` : `${background.name} favorilere ekle`}
      title={isFavorite ? "Favorilerden çıkar" : "Favorilere ekle"}
      className={"press flex items-center justify-center rounded-full transition-opacity " + className}
    >
      <Heart
        className={"size-3.5 " + (isFavorite ? "text-gold fill-current" : "text-white")}
        strokeWidth={2}
        aria-hidden
      />
    </button>
  );
}

/** Asama 1: sagdaki genis kutuphane. `header`/`footer` editorden gelir. */
export function BackgroundLibrary({
  header,
  footer,
  notice,
  ...props
}: Common & { header?: ReactNode; footer?: ReactNode; notice?: ReactNode }) {
  const { groups, shownGroup, items, selectedId, favoriteIds, onSelect, onPreview, onShowCategory, onToggleFavorite, gradientCss } = props;
  const { scrollerRef, selectedRef } = useKeepSelectedVisible(selectedId, shownGroup?.id ?? "");
  return (
    <div role="group" aria-label="Zemin" className="liquid-glass flex h-full min-h-0 flex-col rounded-[1.5rem] p-3">
      {header}
      <div className="mt-3 shrink-0">
        <ShelfTabs groups={groups} shownGroup={shownGroup} onShowCategory={onShowCategory} />
      </div>
      <div
        ref={scrollerRef}
        aria-label="Zeminler"
        // p-1.5: secim halkasi (2px) + ofseti (2px) kutunun DISINA tasiyor;
        // pay olmadan kenar sutun/satirlardaki halka kaydirma alaninda kirpiliyordu.
        className="dock-scroll mt-2 grid min-h-0 flex-1 auto-rows-min grid-cols-3 gap-x-2.5 gap-y-3 overflow-y-auto p-1.5 pb-2"
      >
        {items.map((background) => {
          const isActive = background.id === selectedId;
          const isFavorite = favoriteIds.includes(background.id);
          return (
            <div
              key={background.id}
              ref={isActive ? (element) => { selectedRef.current = element; } : undefined}
              className="group relative min-w-0"
            >
              <button
                type="button"
                onClick={() => onSelect(background.id)}
                {...previewHandlers(background.id, onPreview)}
                aria-pressed={isActive}
                className="press block w-full text-left"
              >
                <span
                  className={
                    "block aspect-square w-full overflow-hidden rounded-xl transition-shadow duration-300 " +
                    (isActive ? "ring-gold ring-2 ring-offset-2 ring-offset-[#1f1d1a]" : "ring-1 ring-white/12")
                  }
                  style={swatchStyle(background, gradientCss)}
                >
                  <Thumb background={background} />
                </span>
                <span
                  className={
                    "mt-1.5 block truncate text-[0.6875rem] leading-tight transition-colors " +
                    (isActive ? "text-gold font-medium" : "on-dark-muted")
                  }
                >
                  {background.name}
                </span>
              </button>
              <FavoriteButton
                background={background}
                isFavorite={isFavorite}
                onToggle={onToggleFavorite}
                className={
                  "absolute top-1.5 right-1.5 size-7 bg-black/45 backdrop-blur-sm " +
                  (isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")
                }
              />
            </div>
          );
        })}
      </div>
      {notice}
      {footer}
    </div>
  );
}

/**
 * Asama 2: sol kenarda DIK, ince zemin bari (Kaan, 19.09.2026). Onceki ince
 * bar ile ayni; yalnizca yuvarlak zeminler IKI SIRA. `compact`: panel
 * kapaliyken tek sira.
 */
export function BackgroundRail({
  selected,
  compact = false,
  ...props
}: Common & { selected: Background; compact?: boolean }) {
  const { groups, shownGroup, items, selectedId, favoriteIds, onSelect, onPreview, onShowCategory, onToggleFavorite, gradientCss } = props;
  const { scrollerRef, selectedRef } = useKeepSelectedVisible(selectedId, shownGroup?.id ?? "");
  return (
    <div role="group" aria-label="Zemin" className="liquid-glass flex h-full min-h-0 w-full flex-col items-center rounded-[1.5rem] px-1.5 py-2.5">
      <span className="on-dark-muted mb-2 text-[0.625rem] font-medium tracking-[0.06em]">ZEMİN</span>
      <div className="w-full px-0.5">
        <ShelfTabs groups={groups} shownGroup={shownGroup} onShowCategory={onShowCategory} vertical />
      </div>
      <div className="my-2 h-px w-8 shrink-0 bg-white/10" aria-hidden />
      <div
        ref={scrollerRef}
        aria-label="Zeminler"
        className={
          // py-4 kenar solmasindan (rail-fade, 0,625rem) genis: en ust/alt
          // zeminin halkasi solmada kaybolmuyor; px-1.5 yan halkalar icin.
          "dock-scroll rail-fade min-h-0 flex-1 overflow-y-auto py-4 " +
          (compact ? "flex w-full flex-col items-center gap-2.5" : "grid auto-rows-min grid-cols-2 gap-2 px-1.5")
        }
      >
        {items.map((background) => {
          const isActive = background.id === selectedId;
          return (
            <button
              key={background.id}
              ref={isActive ? (element) => { selectedRef.current = element; } : undefined}
              type="button"
              onClick={() => onSelect(background.id)}
              {...previewHandlers(background.id, onPreview)}
              aria-pressed={isActive}
              title={background.name}
              className={"press relative shrink-0 " + (compact ? "size-11" : "size-10")}
            >
              <span
                className={
                  "block size-full overflow-hidden rounded-full transition-shadow duration-300 " +
                  (isActive ? "ring-gold ring-2 ring-offset-2 ring-offset-[#1f1d1a]" : "ring-1 ring-white/15")
                }
                style={swatchStyle(background, gradientCss)}
              >
                <Thumb background={background} />
              </span>
              <span className="sr-only">{background.name}</span>
              {favoriteIds.includes(background.id) ? (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-[#1f1d1a] ring-1 ring-white/15"
                >
                  <Heart className="text-gold size-2 fill-current" strokeWidth={0} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <FavoriteButton
        background={selected}
        isFavorite={favoriteIds.includes(selected.id)}
        onToggle={onToggleFavorite}
        className="mt-2 size-8 shrink-0 hover:bg-white/10"
      />
    </div>
  );
}
