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
 *
 * Masaüstü (Kaan, 19.09.2026): zeminler tuvalin altında SABİT bir şeride
 * çıktı, kalan araçlar SAĞDAKİ panele (`variant="side"`). Tuval alttaki
 * kart payını geri alıp sola kayarak büyüdü. Aynı içerik, aynı geri/küçült
 * kuralları; yalnız yerleşim değişiyor. Telefonda alt bar düzeni duruyor —
 * dar ekranda sağ panel tuvali sıkıştırırdı.
 */

import { createContext, useContext, useRef, type ComponentType, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronUp, X } from "lucide-react";

import { ScrollArrows } from "@/components/composer/scroll-arrows";
import { useHorizontalWheel } from "@/components/composer/use-horizontal-wheel";

/**
 * Panelin yerlesimi: menu icerigi (serit, eylem) buna gore kendini dizer.
 * Sag panelde yatay serit yerine alt alta SATIRLAR (19.09.2026 referans gorseli).
 */
const DockVariantContext = createContext<"bottom" | "side">("bottom");
export function useDockVariant() {
  return useContext(DockVariantContext);
}

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
  /** "bottom": tuvalin altında bar + kart (telefon). "side": sağda panel (masaüstü). */
  variant?: "bottom" | "side";
  /** Sag panel basligindaki arac simgesi. */
  icon?: ToolIcon;
  /**
   * Sag panelde secili ADIMIN butun araclari alt alta kart olarak (referans
   * gorsel, 19.09.2026). Verilmezse tek kart (`title`/`children`) gosterilir.
   */
  sections?: DockSection[];
  /** Sag panelin altindaki sabit satir (asama gecis dugmeleri). */
  footer?: ReactNode;
  activeSection?: string;
  onSectionFocus?: (id: string) => void;
};

type ToolIcon = ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;

export type DockSection = {
  id: string;
  title: string;
  icon?: ToolIcon;
  action?: ReactNode;
  body?: ReactNode;
  settings?: ReactNode;
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
  variant = "bottom",
  icon,
  sections,
  activeSection,
  onSectionFocus,
  footer,
}: DockProps) {
  if (variant === "side") {
    return (
      <DockVariantContext.Provider value="side">
        <SideDock
          {...{ title, action, children, settings, tools, activeToolLabel, isCollapsed, onCollapsedChange, layerKey, onBack, canGoBack, backLabel, icon, sections, activeSection, onSectionFocus, footer }}
        />
      </DockVariantContext.Provider>
    );
  }
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
 * Sağ panel: üstte bar (geri · araçlar · küçült), altında seçili aracın
 * menüsü panelin kalan yüksekliğini doldurur. Küçültülünce panel dar bir
 * cam şeride iner, tuval genişleyerek o yeri alır (aynı eğri: `.side-dock`).
 */
function SideDock({
  title,
  action,
  children,
  settings,
  tools,
  activeToolLabel,
  isCollapsed,
  onCollapsedChange,
  layerKey,
  icon: Icon,
  footer,
}: Omit<DockProps, "compact" | "variant">) {
  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={() => onCollapsedChange(false)}
        aria-label="Barı büyüt"
        className="press liquid-glass soft-enter flex w-11 flex-col items-center gap-2 rounded-full py-3 text-[0.75rem] font-medium"
      >
        <ChevronLeft className="size-4" strokeWidth={2.25} aria-hidden />
        <span className="[writing-mode:vertical-rl]">{activeToolLabel}</span>
      </button>
    );
  }
  // Panel v2 (19.09.2026, tasarim Claude'a birakildi): tek kart; ustte
  // esit sekmeli segment kontrolu + kapat, altinda secili aracin GRUPLU
  // LISTESI (iOS Ayarlar dili). Tekrarlanan baslik yok — hangi aracin acik
  // oldugunu sekme soyluyor. Altin yalnizca SECILI durumda.
  void Icon;
  return (
    <div className="side-dock liquid-glass flex max-h-full min-h-0 flex-col rounded-[1.5rem] p-2">
      <div className="flex shrink-0 items-center gap-1">
        <div className="min-w-0 flex-1">{tools}</div>
        <button
          type="button"
          onClick={() => onCollapsedChange(true)}
          aria-label="Barı küçült"
          title="Paneli kapat"
          className="press on-dark-muted flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-white/10 hover:text-[#f3f0eb]"
        >
          <X className="size-4" strokeWidth={1.5} aria-hidden />
        </button>
      </div>
      <div role="group" aria-label={title} className="flex min-h-0 flex-col">
        <div key={layerKey} className="glass-content-in dock-scroll min-h-0 space-y-3 overflow-y-auto px-2 pt-3 pb-2">
          {action ? (
            <div className="flex min-h-5 items-center justify-end px-1 text-[0.75rem]">{action}</div>
          ) : null}
          {children}
          {settings ? <div className="space-y-3">{settings}</div> : null}
        </div>
      </div>
      {footer ? <div className="mt-1 shrink-0 border-t border-white/10 px-1 pt-2">{footer}</div> : null}
    </div>
  );
}

/**
 * Sag paneldeki gruplu liste kutusu: satirlar ince cizgilerle ayrilir.
 * Paneldeki butun secenekler bu kutularin icinde durur — tek gorsel dil.
 */
export const PANEL_GROUP =
  "overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.07] divide-y divide-white/[0.07]";
/** Gruplu listedeki tek satir. */
export const PANEL_ROW =
  "flex min-h-11 w-full items-center gap-3 px-3.5 text-left text-[0.8125rem] transition-colors";

/**
 * Menü içindeki şerit — yalnızca birkaç öğeli, ortalanmış eylem satırları
 * için (biçim, yerleşim, marka, indirme). Zemin ızgara (bkz.
 * `background-palette.tsx`).
 */
export function DockStrip({
  children,
  label,
  centered = false,
  wrap = false,
}: {
  children: ReactNode;
  label: string;
  centered?: boolean;
  /**
   * Kaydirma YOK, dugmeler alt satira sarar (Tamamla asamasi, masaustu —
   * Serhan, 19.09.2026: "alt dock kaydirmali olmasin"). Dugmeler az ve hepsi
   * ayni anda gorulmeli; gizli kaydirma devamini sakliyordu.
   */
  wrap?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useHorizontalWheel(ref);
  const variant = useDockVariant();
  if (wrap) {
    return (
      <div aria-label={label} className="flex flex-wrap justify-center gap-2 px-2 pt-1.5 pb-2">
        {children}
      </div>
    );
  }
  if (variant === "side") {
    return (
      <div aria-label={label} className={PANEL_GROUP + " flex flex-col"}>
        {children}
      </div>
    );
  }
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
