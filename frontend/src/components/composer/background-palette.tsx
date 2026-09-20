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
import { Heart } from "lucide-react";

import { GlassLens } from "@/components/composer/glass-lens";
import { ScrollArrows } from "@/components/composer/scroll-arrows";
import { useHorizontalWheel } from "@/components/composer/use-horizontal-wheel";
import type { BackgroundGroup, BackgroundShelf } from "@/components/composer/use-background-selection";
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
  onSelect: (category: BackgroundShelf | null) => void;
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
      // Sag paneldeki arac sekmeleriyle AYNI segment kontrolu (19.09.2026).
      className="dock-strip relative flex min-w-0 overflow-x-auto rounded-full bg-black/20 p-0.5"
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
              "press relative z-10 flex min-h-7 shrink-0 items-center gap-1 rounded-full px-3 text-[0.6875rem] whitespace-nowrap transition-colors " +
              SOFT +
              " " +
              (isShown ? "font-semibold text-[#f3f0eb]" : "on-dark-muted hover:text-[#f3f0eb]")
            }
          >
            {group.id === "favoriler" ? (
              <Heart className="text-gold size-3 fill-current" strokeWidth={0} aria-hidden />
            ) : null}
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

/**
 * macOS Dock düzeni (Kaan, 19.09.2026): görseller alta hizalı, üzerine gelinen
 * büyür, iki komşusu daha az büyür (`.mac-dock`, globals.css). Seçili zeminin
 * altında küçük bir nokta var; ad, şeridin başlığında yazıyor (üzerine
 * gelinenin, yoksa seçilinin adı) — seçim yine renkle birlikte ADIYLA da belli.
 */
export function BackgroundPalette({
  items,
  selectedId,
  onSelect,
  onHoverName,
  favoriteIds = [],
  gradientCss,
}: {
  items: Background[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** Üzerine gelinen zeminin adı (`null` = ayrıldı); başlıkta gösterilir. */
  onHoverName?: (name: string | null) => void;
  /** Begenilen zeminler — ornegin kosesinde kucuk altin kalp. */
  favoriteIds?: readonly string[];
  gradientCss: (stops: (number | string)[]) => string;
}) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  const hasCenteredRef = useRef(false);
  useHorizontalWheel(stripRef);

  // Seçili zemin şeridin ortasına getiriliyor — yalnızca şeridin KENDİ
  // kaydırması; `scrollIntoView` mobilde bütün stüdyoyu kaydırıyordu.
  // Zaten görünen bir zemin (kullanıcının az önce dokunduğu) KAYDIRILMIYOR:
  // seçilen zemin parmağın altından kayıp gidiyordu (Serhan, 19.09.2026).
  useEffect(() => {
    const strip = stripRef.current;
    const selected = selectedRef.current;
    if (!strip || !selected) return;
    if (hasCenteredRef.current) {
      const box = strip.getBoundingClientRect();
      const item = selected.getBoundingClientRect();
      if (item.left >= box.left + 8 && item.right <= box.right - 8) return;
    }
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
        onMouseLeave={() => onHoverName?.(null)}
        className="dock-strip relative flex items-center gap-3 overflow-x-auto px-3 py-2"
      >
        {items.map((background) => {
          const isActive = background.id === selectedId;
          return (
            <button
              key={background.id}
              ref={isActive ? selectedRef : undefined}
              type="button"
              onClick={() => onSelect(background.id)}
              onMouseEnter={() => onHoverName?.(background.name)}
              onFocus={() => onHoverName?.(background.name)}
              aria-pressed={isActive}
              title={background.name}
              className="press relative w-8 shrink-0"
            >
              <span
                className={
                  "block aspect-square w-full overflow-hidden rounded-full transition-shadow " +
                  SOFT +
                  " " +
                  (isActive
                    ? "ring-gold ring-2 ring-offset-2 ring-offset-[#1f1d1a]"
                    : "ring-1 ring-white/15")
                }
                style={
                  background.type === "placeholder"
                    ? { background: gradientCss(background.gradient) }
                    : undefined
                }
              >
                {background.type === "server" ? (
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
              {favoriteIds.includes(background.id) ? (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-[#1f1d1a] ring-1 ring-white/15"
                >
                  <Heart className="text-gold size-2 fill-current" strokeWidth={0} />
                </span>
              ) : null}
              {/* Ad erisilebilir metin olarak dugmede kaliyor; gorunur ad baslikta. */}
              <span className="sr-only">{background.name}</span>
            </button>
          );
        })}
      </div>
    </ScrollArrows>
  );
}
