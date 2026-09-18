"use client";

/**
 * Stüdyonun alt kontrolleri: İNCE BAR + üstünde MENÜ KARTI (Kaan, 18.09.2026).
 *
 * Aynı gün dört kez yinelendi; her turun sebebi bir sonrakinin kuralı:
 * - sağda denetçi + altta dock → göz ve fare iki yere gidiyordu;
 * - içerik boyunda tek panel → bar her araçta birkaç piksel kayıyordu;
 * - sabit ama kalın panel → görsel bütünlüğü bozdu;
 * - geri tuşu kartı KAPATIYORDU → "geri" araçlar arasında gezinmeli, kartı
 *   kapatmak ayrı bir iş.
 *
 * Şimdi:
 * - Bar HİÇ KIPIRDAMAZ: kart sabit yükseklikli bir alanın altına hizalı açılır.
 * - Barın solunda ‹ GERİ: bir önceki araca (Boyut ↔ Zemin), Görünüm'de açık
 *   kaydıraçtan önce Görünüm menüsüne.
 * - Barın sağında KÜÇÜLT: kart ve bar tek küçük bir hapa iner, tuval o yeri
 *   alarak büyür (tuvalin büyümesi `.stage-fit-collapsed`'te, AYNI eğriyle).
 */

import { useRef, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronUp } from "lucide-react";

import { ScrollArrows } from "@/components/composer/scroll-arrows";
import { useHorizontalWheel } from "@/components/composer/use-horizontal-wheel";

export type DockProps = {
  /** Açık menünün adı; aynı zamanda erişilebilir ad. */
  title: string;
  /** Başlığın sağındaki bağlam denetimi. */
  action?: ReactNode;
  children?: ReactNode;
  /** Seçili aracın ince ayarları (kaydıraçlar, alanlar). */
  settings?: ReactNode;
  /** Araç çubuğu (barın içeriği). */
  tools: ReactNode;
  /** Küçültülmüş hapta gösterilen araç adı. */
  activeToolLabel: string;
  isCollapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  /**
   * İnce kart (Zemin, Boyut — tek satırlık menüler). Kart alanı 1,5rem
   * kısalır, tuval AYNI miktarda büyür (`.stage-fit-compact`); ikisi aynı
   * eğriyle birlikte hareket eder (Kaan, 18.09.2026).
   */
  compact?: boolean;
  /** Menü içindeki katman; değişince içerik "camdan" yeniden gelir. */
  layerKey: string;
  onBack: () => void;
  canGoBack: boolean;
  /** Geri tuşunun erişilebilir adı (nereye döneceğini söyler). */
  backLabel: string;
};

export function Dock({
  title,
  action,
  children,
  settings,
  tools,
  activeToolLabel,
  isCollapsed,
  onCollapsedChange,
  compact = false,
  layerKey,
  onBack,
  canGoBack,
  backLabel,
}: DockProps) {
  return (
    <div className="flex w-full max-w-[min(40rem,100%)] flex-col items-center">
      {/* Kart alanı SABİT (küçültülünce sıfıra iner): kart alta hizalı, bu
          yüzden kart boyu değişse de bar kaymıyor. */}
      <div
        className={
          "dock-card-area flex w-full items-end justify-center " +
          (isCollapsed
            ? "h-0 opacity-0"
            : (compact ? "h-[9rem]" : "h-[10.5rem]") + " pb-2.5 opacity-100")
        }
        aria-hidden={isCollapsed || undefined}
      >
        {!isCollapsed ? (
          <div
            role="group"
            aria-label={title}
            className="liquid-glass glass-morph-in flex max-h-full w-full flex-col rounded-[1.75rem] px-2 pt-2 pb-1.5"
          >
            <div className="flex min-h-8 shrink-0 items-center gap-2 px-2">
              <span className="min-w-0 shrink-0 truncate text-[0.8125rem] font-semibold tracking-[-0.01em] sm:flex-1">
                {title}
              </span>
              {action}
            </div>
            <div key={layerKey} className="glass-content-in dock-scroll min-h-0 overflow-y-auto px-0.5">
              {children}
              {settings ? <div className="mt-1 space-y-3 px-2 pb-1">{settings}</div> : null}
            </div>
          </div>
        ) : null}
      </div>

      {isCollapsed ? (
        <button
          type="button"
          onClick={() => onCollapsedChange(false)}
          aria-label="Barı büyüt"
          className="press liquid-glass glass-morph-in flex h-11 items-center gap-2 rounded-full pr-4 pl-3 text-[0.8125rem] font-medium"
        >
          <ChevronUp className="size-4" strokeWidth={2.25} aria-hidden />
          {activeToolLabel}
        </button>
      ) : (
        <div className="liquid-glass glass-morph-in flex h-[3.25rem] max-w-full items-center gap-1 rounded-full px-1">
          <button
            type="button"
            onClick={onBack}
            disabled={!canGoBack}
            aria-label={backLabel}
            title={backLabel}
            className="press liquid-glass-pill flex size-[2.625rem] shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-35"
          >
            <ChevronLeft className="size-[1.125rem]" strokeWidth={2.25} aria-hidden />
          </button>
          <span className="mx-0.5 h-6 w-px shrink-0 bg-white/15" aria-hidden />
          {tools}
          <span className="mx-0.5 h-6 w-px shrink-0 bg-white/15" aria-hidden />
          <button
            type="button"
            onClick={() => onCollapsedChange(true)}
            aria-label="Barı küçült"
            title="Barı küçült"
            className="press liquid-glass-pill flex size-[2.625rem] shrink-0 items-center justify-center rounded-full"
          >
            <ChevronDown className="size-[1.125rem]" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Menü içindeki şerit — yalnızca birkaç öğeli, ortalanmış eylem satırları
 * için (biçim, yerleşim, marka, indirme). Zemin ızgara (bkz.
 * `background-palette.tsx`).
 */
export function DockStrip({ children, label, centered = false }: { children: ReactNode; label: string; centered?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useHorizontalWheel(ref);
  return (
    <ScrollArrows targetRef={ref} label={label.toLocaleLowerCase("tr")}>
      <div
        ref={ref}
        aria-label={label}
        className={"dock-strip flex snap-x scroll-px-4 gap-2 overflow-x-auto px-2 pt-1.5 pb-2 " + (centered ? "justify-start sm:justify-center" : "palette-fade")}
      >
        {children}
      </div>
    </ScrollArrows>
  );
}
