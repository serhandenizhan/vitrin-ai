"use client";

/**
 * Katalog sayfasinin ONIZLEMESI — her sablon icin tek bir bilesen.
 *
 * Sablona ozel JSX yok: yerlesim `catalog-templates.ts` icindeki kutulardan
 * geliyor ve yuzdeye ceviriliyor. Disa aktarma ayni kutulari piksele ceviriyor
 * (`catalog-export.ts`), dolayisiyla ekranda gorulen ile inen dosya ayrisamaz.
 */

import { type CSSProperties, useCallback, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";

import { CATALOG_HEIGHT, CATALOG_WIDTH } from "@/lib/catalog-export";
import {
  type Box,
  type CatalogTexts,
  type SlotTransform,
  type Template,
  slotPlacement,
  templateColor,
} from "@/lib/catalog-templates";

export type SlotContent = {
  url: string;
  name: string;
  width: number;
  height: number;
  transform: SlotTransform;
} | null;

export type CatalogPageViewProps = {
  template: Template;
  slots: SlotContent[];
  texts: CatalogTexts;
  /** Duzenlenebilir mod: bos yuvalar tiklanabilir, dolu yuvada silme cikar. */
  editable?: boolean;
  selectedSlot?: number | null;
  onSlotSelect?: (slot: number) => void;
  onSlotClear?: (slot: number) => void;
  /** Imlecle surukleme: kaydirma degerlerini gunceller. */
  onSlotMove?: (slot: number, x: number, y: number) => void;
  /** Tekerlekle olcek: carpani gunceller. */
  onSlotScale?: (slot: number, scale: number) => void;
};

/** 0-1 orani -> yuzde CSS'i. */
function boxStyle(box: Box): CSSProperties {
  return {
    position: "absolute",
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.width * 100}%`,
    height: `${box.height * 100}%`,
  };
}

export function CatalogPageView({
  template,
  slots,
  texts,
  editable = false,
  selectedSlot = null,
  onSlotSelect,
  onSlotClear,
  onSlotMove,
  onSlotScale,
}: CatalogPageViewProps) {
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ backgroundColor: template.paper }}
    >
      {/* Cizgiler — metin ve gorsel bantlarini ayiran ince kurallar. */}
      {template.rules.map((rule, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            ...boxStyle(rule.box),
            minHeight: 1,
            backgroundColor: templateColor(template, rule.color),
            opacity: rule.opacity,
          }}
        />
      ))}

      {/* Gorsel yuvalari. Her biri KENDI kutusunda kirpiliyor (`overflow-hidden`)
          — kullanici gorseli buyuttugunde metin bandina tasmasi mumkun degil.
          Onceki surumde yerlesim akisa birakildigi icin buyuk bir gorsel
          basligi asagi itebiliyordu. */}
      {template.slots.map((box, index) => {
        const content = slots[index] ?? null;
        const isSelected = selectedSlot === index;

        return (
          <div key={index} style={boxStyle(box)} className="overflow-hidden">
            {content ? (
              <SlotImage
                content={content}
                box={box}
                editable={editable}
                isSelected={isSelected}
                onSelect={() => onSlotSelect?.(index)}
                onClear={() => onSlotClear?.(index)}
                onMove={(x, y) => onSlotMove?.(index, x, y)}
                onScale={(scale) => onSlotScale?.(index, scale)}
              />
            ) : editable ? (
              <button
                type="button"
                onClick={() => onSlotSelect?.(index)}
                className={
                  "flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed transition-colors " +
                  (isSelected
                    ? "border-current opacity-70"
                    : "opacity-35 hover:opacity-60")
                }
                style={{
                  borderColor: templateColor(template, "ink"),
                  color: templateColor(template, "ink"),
                }}
              >
                <Plus className="size-5" strokeWidth={1.5} aria-hidden />
                <span className="text-[0.625rem]">Görsel ekleyin</span>
              </button>
            ) : null}
          </div>
        );
      })}

      {/* Metinler en ustte: hicbir kosulda gorselin altinda kalmiyorlar. */}
      {template.texts.map((element) => {
        const value = texts[element.field];
        if (!value) return null;

        return (
          <div
            key={element.field}
            style={{
              ...boxStyle(element.box),
              color: templateColor(template, element.color),
              fontSize: `${element.fontSizeRatio * 100}cqw`,
              letterSpacing: element.letterSpacing ? `${element.letterSpacing}em` : "-0.015em",
              fontWeight: element.field === "footer" ? 400 : 600,
              textAlign: element.align === "center" ? "center" : "left",
              lineHeight: 1.1,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: element.align === "center" ? "center" : "flex-start",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {element.uppercase ? value.toLocaleUpperCase("tr-TR") : value}
          </div>
        );
      })}
    </div>
  );
}

function SlotImage({
  content,
  box,
  editable,
  isSelected,
  onSelect,
  onClear,
  onMove,
  onScale,
}: {
  content: NonNullable<SlotContent>;
  box: Box;
  editable: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onClear: () => void;
  onMove: (x: number, y: number) => void;
  onScale: (scale: number) => void;
}) {
  // Yerlesim, disa aktarmayla AYNI fonksiyondan geliyor.
  //
  // Kutu, SAYFA BIRIMINDE veriliyor (oranlar x cikti olculeri) — daha once
  // 1x1 birim kutu geciliyordu ve bu, yuvanin gercek en-boy oranini yok
  // ediyordu: dar/uzun bir yuvada gorsel yuvaya BIREBIR geriliyor, yani
  // eziliyordu (tarayicida olculerek yakalandi: 900x900 kare bir gorsel
  // 190x349'luk yuvada 190x349 olarak ciziliyordu).
  const boxUnits = {
    width: box.width * CATALOG_WIDTH,
    height: box.height * CATALOG_HEIGHT,
  };
  const placementUnits = slotPlacement(
    boxUnits,
    { width: content.width, height: content.height },
    content.transform,
  );
  // Sonuc yuvanin KENDI olcusune gore yuzdeye ceviriliyor.
  const placement = {
    x: placementUnits.x / boxUnits.width,
    y: placementUnits.y / boxUnits.height,
    width: placementUnits.width / boxUnits.width,
    height: placementUnits.height / boxUnits.height,
  };

  const containerRef = useRef<HTMLDivElement | null>(null);
  // Surukleme durumu REF'te: `pointermove` icinde state okunsaydi kapanis eski
  // degeri gorur ve ilk hareket yutulurdu (Faz 2'de ayni tuzaga dusulmustu).
  const dragRef = useRef<{
    pointerStartX: number;
    pointerStartY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!editable) return;
      onSelect();
      dragRef.current = {
        pointerStartX: event.clientX,
        pointerStartY: event.clientY,
        originX: content.transform.x,
        originY: content.transform.y,
      };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture bazi tarayici/girdi kombinasyonlarinda reddediliyor;
        // yakalama olmadan da surukleme calisiyor.
      }
    },
    [editable, content.transform.x, content.transform.y, onSelect],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const container = containerRef.current;
      if (!drag || !container) return;

      // Kaydirma degerleri yuva kutusunun ORANI cinsinden tutuluyor, piksel
      // degil: onizleme kucuk, cikti 1240 px genisliginde ve ikisi ayni sayiyi
      // paylasmali. Piksel kullanilsaydi ekran boyutuna gore kayardi.
      const rect = container.getBoundingClientRect();
      onMove(
        drag.originX + (event.clientX - drag.pointerStartX) / rect.width,
        drag.originY + (event.clientY - drag.pointerStartY) / rect.height,
      );
    },
    [onMove],
  );

  const handlePointerEnd = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div
      ref={containerRef}
      className={
        "relative h-full w-full " +
        (editable ? "cursor-grab touch-none active:cursor-grabbing" : "")
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onWheel={(event) => {
        if (!editable) return;
        // Tekerlekle olcek: yerlestirmenin en dogal ikinci hareketi.
        // `deltaY` yukari negatif; buyutme yonu bu yuzden ters cevriliyor.
        const factor = event.deltaY > 0 ? 0.94 : 1.06;
        onScale(content.transform.scale * factor);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={content.url}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          left: `${placement.x * 100}%`,
          top: `${placement.y * 100}%`,
          width: `${placement.width * 100}%`,
          height: `${placement.height * 100}%`,
          objectFit: "fill",
          transform: `rotate(${content.transform.rotation}deg)`,
          // `max-width/height: none` ZORUNLU: Tailwind'in temel katmani tum
          // gorsellere `max-width: 100%` veriyor ve bu, %100'un uzerindeki
          // her olcegi SESSIZCE kirpiyordu — kaydirac degeri ve `style.width`
          // dogru guncelleniyor ama gorsel buyumuyordu (tarayicida olculerek
          // yakalandi: style.width %220 iken gercek genislik yuva genisligine
          // esitti).
          maxWidth: "none",
          maxHeight: "none",
        }}
      />

      {editable ? (
        <>
          {/* Secim cercevesi; tiklamayi yutmuyor ki surukleme kesintisiz
              calissin (`pointer-events-none`). */}
          <span
            aria-hidden
            className={
              "pointer-events-none absolute inset-0 rounded-md " +
              (isSelected ? "ring-gold ring-2 ring-inset" : "")
            }
          />
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onClear();
            }}
            aria-label="Görseli kaldır"
            className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75"
          >
            <Trash2 className="size-3" strokeWidth={1.75} aria-hidden />
          </button>
        </>
      ) : null}
    </div>
  );
}
