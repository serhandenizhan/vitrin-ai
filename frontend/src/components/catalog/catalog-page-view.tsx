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

import {
  CIKTI_GENISLIK,
  CIKTI_YUKSEKLIK,
} from "@/lib/catalog-export";
import {
  type Kutu,
  type Sablon,
  type YuvaDonusumu,
  yuvaYerlesimi,
} from "@/lib/catalog-templates";

export type YuvaIcerigi = {
  url: string;
  ad: string;
  genislik: number;
  yukseklik: number;
  donusum: YuvaDonusumu;
} | null;

export type CatalogPageViewProps = {
  sablon: Sablon;
  yuvalar: YuvaIcerigi[];
  metinler: { ustEtiket: string; baslik: string; altBilgi: string };
  /** Duzenlenebilir mod: bos yuvalar tiklanabilir, dolu yuvada silme cikar. */
  duzenlenebilir?: boolean;
  seciliYuva?: number | null;
  onYuvaSecildi?: (yuva: number) => void;
  onYuvaBosaltildi?: (yuva: number) => void;
  /** Imlecle surukleme: kaydirma degerlerini gunceller. */
  onYuvaTasindi?: (yuva: number, x: number, y: number) => void;
  /** Tekerlekle olcek: carpani gunceller. */
  onYuvaOlceklendi?: (yuva: number, olcek: number) => void;
};

/** 0-1 orani -> yuzde CSS'i. */
function kutuStili(kutu: Kutu): CSSProperties {
  return {
    position: "absolute",
    left: `${kutu.x * 100}%`,
    top: `${kutu.y * 100}%`,
    width: `${kutu.g * 100}%`,
    height: `${kutu.y2 * 100}%`,
  };
}

export function CatalogPageView({
  sablon,
  yuvalar,
  metinler,
  duzenlenebilir = false,
  seciliYuva = null,
  onYuvaSecildi,
  onYuvaBosaltildi,
  onYuvaTasindi,
  onYuvaOlceklendi,
}: CatalogPageViewProps) {
  const renk = (ad: "vurgu" | "murekkep" | "solgun") =>
    ad === "vurgu"
      ? sablon.vurgu
      : ad === "solgun"
        ? sablon.solgun
        : sablon.murekkep;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ backgroundColor: sablon.kagit }}
    >
      {/* Cizgiler — metin ve gorsel bantlarini ayiran ince kurallar. */}
      {sablon.cizgiler.map((cizgi, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            ...kutuStili(cizgi.kutu),
            minHeight: 1,
            backgroundColor: renk(cizgi.renk),
            opacity: cizgi.opaklik,
          }}
        />
      ))}

      {/* Gorsel yuvalari. Her biri KENDI kutusunda kirpiliyor (`overflow-hidden`)
          — kullanici gorseli buyuttugunde metin bandina tasmasi mumkun degil.
          Onceki surumde yerlesim akisa birakildigi icin buyuk bir gorsel
          basligi asagi itebiliyordu. */}
      {sablon.yuvalar.map((kutu, sira) => {
        const icerik = yuvalar[sira] ?? null;
        const secili = seciliYuva === sira;

        return (
          <div key={sira} style={kutuStili(kutu)} className="overflow-hidden">
            {icerik ? (
              <YuvaGorseli
                icerik={icerik}
                kutu={kutu}
                duzenlenebilir={duzenlenebilir}
                secili={secili}
                onSec={() => onYuvaSecildi?.(sira)}
                onSil={() => onYuvaBosaltildi?.(sira)}
                onTasindi={(x, y) => onYuvaTasindi?.(sira, x, y)}
                onOlceklendi={(o) => onYuvaOlceklendi?.(sira, o)}
              />
            ) : duzenlenebilir ? (
              <button
                type="button"
                onClick={() => onYuvaSecildi?.(sira)}
                className={
                  "flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed transition-colors " +
                  (secili
                    ? "border-current opacity-70"
                    : "opacity-35 hover:opacity-60")
                }
                style={{ borderColor: renk("murekkep"), color: renk("murekkep") }}
              >
                <Plus className="size-5" strokeWidth={1.5} aria-hidden />
                <span className="text-[0.625rem]">Görsel ekleyin</span>
              </button>
            ) : null}
          </div>
        );
      })}

      {/* Metinler en ustte: hicbir kosulda gorselin altinda kalmiyorlar. */}
      {sablon.metinler.map((oge) => {
        const deger = metinler[oge.alan];
        if (!deger) return null;

        return (
          <div
            key={oge.alan}
            style={{
              ...kutuStili(oge.kutu),
              color: renk(oge.renk),
              fontSize: `${oge.puntoOrani * 100}cqw`,
              letterSpacing: oge.aralik ? `${oge.aralik}em` : "-0.015em",
              fontWeight: oge.alan === "baslik" ? 600 : oge.alan === "ustEtiket" ? 600 : 400,
              textAlign: oge.hiza === "orta" ? "center" : "left",
              lineHeight: 1.1,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: oge.hiza === "orta" ? "center" : "flex-start",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {oge.buyukHarf ? deger.toLocaleUpperCase("tr-TR") : deger}
          </div>
        );
      })}
    </div>
  );
}

function YuvaGorseli({
  icerik,
  kutu,
  duzenlenebilir,
  secili,
  onSec,
  onSil,
  onTasindi,
  onOlceklendi,
}: {
  icerik: NonNullable<YuvaIcerigi>;
  kutu: Kutu;
  duzenlenebilir: boolean;
  secili: boolean;
  onSec: () => void;
  onSil: () => void;
  onTasindi: (x: number, y: number) => void;
  onOlceklendi: (olcek: number) => void;
}) {
  // Yerlesim, disa aktarmayla AYNI fonksiyondan geliyor.
  //
  // Kutu, SAYFA BIRIMINDE veriliyor (oranlar x cikti olculeri) — daha once
  // 1x1 birim kutu geciliyordu ve bu, yuvanin gercek en-boy oranini yok
  // ediyordu: dar/uzun bir yuvada gorsel yuvaya BIREBIR geriliyor, yani
  // eziliyordu (tarayicida olculerek yakalandi: 900x900 kare bir gorsel
  // 190x349'luk yuvada 190x349 olarak ciziliyordu).
  const kutuBirim = {
    g: kutu.g * CIKTI_GENISLIK,
    y2: kutu.y2 * CIKTI_YUKSEKLIK,
  };
  const yerBirim = yuvaYerlesimi(
    kutuBirim,
    { genislik: icerik.genislik, yukseklik: icerik.yukseklik },
    icerik.donusum,
  );
  // Sonuc yuvanin KENDI olcusune gore yuzdeye ceviriliyor.
  const yer = {
    x: yerBirim.x / kutuBirim.g,
    y: yerBirim.y / kutuBirim.y2,
    g: yerBirim.g / kutuBirim.g,
    y2: yerBirim.y2 / kutuBirim.y2,
  };

  const kapsayiciRef = useRef<HTMLDivElement | null>(null);
  // Surukleme durumu REF'te: `pointermove` icinde state okunsaydi kapanis eski
  // degeri gorur ve ilk hareket yutulurdu (Faz 2'de ayni tuzaga dusulmustu).
  const suruklemeRef = useRef<{
    baslangicX: number;
    baslangicY: number;
    ilkX: number;
    ilkY: number;
  } | null>(null);

  const basladi = useCallback(
    (olay: React.PointerEvent<HTMLDivElement>) => {
      if (!duzenlenebilir) return;
      onSec();
      suruklemeRef.current = {
        baslangicX: olay.clientX,
        baslangicY: olay.clientY,
        ilkX: icerik.donusum.x,
        ilkY: icerik.donusum.y,
      };
      try {
        olay.currentTarget.setPointerCapture(olay.pointerId);
      } catch {
        // Pointer capture bazi tarayici/girdi kombinasyonlarinda reddediliyor;
        // yakalama olmadan da surukleme calisiyor.
      }
    },
    [duzenlenebilir, icerik.donusum.x, icerik.donusum.y, onSec],
  );

  const hareket = useCallback(
    (olay: React.PointerEvent<HTMLDivElement>) => {
      const surukleme = suruklemeRef.current;
      const kapsayici = kapsayiciRef.current;
      if (!surukleme || !kapsayici) return;

      // Kaydirma degerleri yuva kutusunun ORANI cinsinden tutuluyor, piksel
      // degil: onizleme kucuk, cikti 1240 px genisliginde ve ikisi ayni sayiyi
      // paylasmali. Piksel kullanilsaydi ekran boyutuna gore kayardi.
      const kutu = kapsayici.getBoundingClientRect();
      onTasindi(
        surukleme.ilkX + (olay.clientX - surukleme.baslangicX) / kutu.width,
        surukleme.ilkY + (olay.clientY - surukleme.baslangicY) / kutu.height,
      );
    },
    [onTasindi],
  );

  const bitti = useCallback(() => {
    suruklemeRef.current = null;
  }, []);

  return (
    <div
      ref={kapsayiciRef}
      className={
        "relative h-full w-full " +
        (duzenlenebilir ? "cursor-grab touch-none active:cursor-grabbing" : "")
      }
      onPointerDown={basladi}
      onPointerMove={hareket}
      onPointerUp={bitti}
      onPointerCancel={bitti}
      onWheel={(olay) => {
        if (!duzenlenebilir) return;
        // Tekerlekle olcek: yerlestirmenin en dogal ikinci hareketi.
        // `deltaY` yukari negatif; buyutme yonu bu yuzden ters cevriliyor.
        const adim = olay.deltaY > 0 ? 0.94 : 1.06;
        onOlceklendi(icerik.donusum.olcek * adim);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={icerik.url}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          left: `${yer.x * 100}%`,
          top: `${yer.y * 100}%`,
          width: `${yer.g * 100}%`,
          height: `${yer.y2 * 100}%`,
          objectFit: "fill",
          transform: `rotate(${icerik.donusum.aci}deg)`,
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

      {duzenlenebilir ? (
        <>
          {/* Secim cercevesi; tiklamayi yutmuyor ki surukleme kesintisiz
              calissin (`pointer-events-none`). */}
          <span
            aria-hidden
            className={
              "pointer-events-none absolute inset-0 rounded-md " +
              (secili ? "ring-gold ring-2 ring-inset" : "")
            }
          />
          <button
            type="button"
            onPointerDown={(olay) => olay.stopPropagation()}
            onClick={(olay) => {
              olay.stopPropagation();
              onSil();
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
