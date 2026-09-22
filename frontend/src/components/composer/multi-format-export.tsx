"use client";

/**
 * Birden fazla boyutta ayni anda indirme (Kaan, 21.09.2026 — one alinan is).
 *
 * Neden gorunmez IKINCI bir sahne: cizim kurallari (zeminin kirpilmasi,
 * golge, yansima, filtreler, logo, etiket) tek bir yerde, `EditorStage`'de.
 * Her bicim icin onlari ikinci kez yazmak, biri degistiginde digerinin
 * unutulmasi demekti. Bunun yerine ekran disinda, bicimin MANTIKSAL
 * olcusunde bir `EditorStage` kuruluyor, gorseller yuklenince dosya aliniyor,
 * sonra siradaki bicime geciliyor. Kullanicinin gordugu sahneye hic
 * dokunulmuyor.
 *
 * Yerlesim `mapTransformToStage` ile tasiniyor: urun her bicimde ayni ORANSAL
 * yerde ve "sigdir" olcegine gore ayni buyuklukte. Zemin her bicimde yine
 * ortadan kirpilarak kapliyor; bicimin yonune uymayan bir zemin secildiyse
 * (ornegin dikey bir fotograf zemin + yatay bicim) o bicimde fazla kirpilir.
 * Pazaryeri istisna: pazaryerleri beyaz zemin istedigi icin orada her zaman
 * duz beyaz (tek boyutta Pazaryeri secilince de ayni oluyor).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type Konva from "konva";

import { EditorStage } from "@/components/composer/editor-stage";
import type { Background } from "@/lib/backgrounds";
import {
  type Appearance,
  OUTPUT_FORMATS,
  type OutputFormatName,
  type Transform,
  logicalSize,
  mapTransformToStage,
} from "@/lib/composition";
import type { LogoSettings, ProductLabel } from "@/lib/overlays";

/** Gorseller bu surede yuklenmezse is durur: zeminsiz dosya indirmektense hata. */
const READY_TIMEOUT_MS = 10_000;

export type MultiExportJob = {
  formats: OutputFormatName[];
  type: "png" | "jpeg";
};

export type MultiExportResult = { format: OutputFormatName; dataUrl: string };

export function MultiFormatExporter({
  job,
  cutoutUrl,
  cutoutSize,
  backgroundFor,
  transform,
  fromSize,
  appearance,
  logoUrl,
  logo,
  label,
  onProgress,
  onDone,
  onError,
}: {
  job: MultiExportJob;
  cutoutUrl: string;
  cutoutSize: { width: number; height: number } | null;
  /** Bicime gore zemin: Pazaryeri her zaman duz beyaz (tek boyuttaki kuralla ayni). */
  backgroundFor: (format: OutputFormatName) => Background;
  transform: Transform | null;
  /** Kullanicinin calistigi sahnenin mantiksal olcusu. */
  fromSize: { width: number; height: number };
  appearance: Appearance;
  logoUrl: string | null;
  logo: LogoSettings;
  label: ProductLabel;
  onProgress: (done: number, total: number) => void;
  onDone: (results: MultiExportResult[]) => void;
  onError: (error: unknown) => void;
}) {
  const [index, setIndex] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const stageRef = useRef<Konva.Stage | null>(null);
  const resultsRef = useRef<MultiExportResult[]>([]);

  const name = job.formats[index];
  const format = OUTPUT_FORMATS[name];
  const size = logicalSize(format);
  const mapped = cutoutSize ? mapTransformToStage(transform, fromSize, size, cutoutSize) : transform;

  const handleStageReady = useCallback((stage: Konva.Stage | null) => {
    stageRef.current = stage;
  }, []);

  // Hazir olunca iki kare bekleyip dosyayi al: filtre onbellegi ve cizim,
  // hazirlik haberiyle ayni turda kuruluyor.
  useEffect(() => {
    if (!isReady) return;
    let cancelled = false;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (cancelled) return;
        const stage = stageRef.current;
        try {
          if (!stage) throw new Error("Sahne kurulamadı.");
          stage.find("Transformer").forEach((node) => node.hide());
          const dataUrl = stage.toDataURL({
            mimeType: job.type === "png" ? "image/png" : "image/jpeg",
            quality: 0.92,
            pixelRatio: format.outputWidth / size.width,
          });
          // Konva tainted tuvalde firlatmiyor, bos donduruyor (bkz. editor).
          if (!dataUrl) throw new Error("Konva boş veri URL'i döndürdü.");
          resultsRef.current.push({ format: name, dataUrl });
        } catch (error) {
          onError(error);
          return;
        }
        onProgress(resultsRef.current.length, job.formats.length);
        if (index + 1 < job.formats.length) {
          setIsReady(false);
          setIndex(index + 1);
        } else {
          onDone(resultsRef.current);
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [isReady, index, job, format, size.width, name, onDone, onError, onProgress]);

  // Gorseller hic gelmezse (R2 CORS, olmus imzali URL) sessizce beklemek yerine dur.
  useEffect(() => {
    if (isReady) return;
    const timer = window.setTimeout(
      () => onError(new Error(`${format.label} için görseller yüklenemedi.`)),
      READY_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [isReady, index, format.label, onError]);

  return (
    // Ekran disinda ama DOM'da: Konva'nin tuvali cizebilmesi icin kapsayici
    // gercek olculerde olmali. Etkilesim ve ekran okuyucu disi.
    <div aria-hidden inert className="pointer-events-none fixed top-0 -left-[10000px]">
      <EditorStage
        // Bicim degisince sahne sifirdan kurulsun (onceki bicimin olcusu kalmasin).
        key={name}
        cutoutUrl={cutoutUrl}
        background={backgroundFor(name)}
        displayWidth={size.width}
        stageWidth={size.width}
        stageHeight={size.height}
        transform={mapped}
        appearance={appearance}
        logoUrl={logoUrl}
        logo={logo}
        label={label}
        onTransformChange={() => {}}
        onCutoutSize={() => {}}
        onStageReady={handleStageReady}
        cleanView
        onRenderReady={setIsReady}
      />
    </div>
  );
}
