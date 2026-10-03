"use client";

import { useEffect, useState } from "react";

import { coverCrop } from "@/lib/composition";

/**
 * Zeminin EKRANA ÖZEL küçültülmüş kopyası (Faz 7, K1 — Kaan, 03.10.2026).
 *
 * Sorun (ölçüm `ROADMAP.md` Faz 7 "Stüdyoda zemin değiştirirken takılma"):
 * kütüphane zeminleri tam çözünürlükte (3508×2480, 8,7 MP) ve tuval ~500 px.
 * Konva her karede bu büyük görseli küçülterek çiziyordu; 0,42 sn'lik çapraz
 * geçişte iki zemin birden çizildiği için her zemin seçimi 60–70 ms'lik, ilk
 * seçim (JPEG'in ana iş parçacığında çözülmesiyle) ~390 ms'lik bir kare
 * üretiyordu.
 *
 * Çözüm: zeminin TUVALDE GÖRÜNEN kısmı (`coverCrop`) bir kez, tuvalin ekran
 * pikseli (× dpr) ölçüsüne küçültülür; sahne bunu çizer. `createImageBitmap`
 * çözme ve küçültmeyi ana iş parçacığının dışında yapar.
 *
 * ÇIKTI GÜVENLİĞİ: küçük kopya YALNIZ ekran içindir. Dışa aktarma, düğümde
 * saklanan tam çözünürlüklü SEÇİLİ zemine geçip öyle çizer
 * (`swapToExportBackground`, background-fade.ts). Kopya henüz hazır değilken
 * önceki kopya gösterilse bile indirilen dosya her zaman seçili zemindir
 * (ders 23: yanlış zemini dosyaya sokmak, hiç göstermemekten kötü).
 */

export type DisplayBackground = {
  /** Kaynak (tam çözünürlüklü) zemin: çapraz geçiş "zemin değişti mi"yi buna bakarak anlar. */
  source: HTMLImageElement;
  image: CanvasImageSource;
  crop: { x: number; y: number; width: number; height: number };
};

/**
 * Küçük kopyanın piksel ölçüsü; küçültmenin kazancı yoksa `null`.
 *
 * Hedef, tuvalin ekrandaki piksel ölçüsü (genişlik × dpr). Kırpılan bölge
 * bundan büyük değilse (küçük zemin ya da çok büyük ekran) kopya üretmek
 * yalnız iş ve kalite kaybıdır: tam görsel olduğu gibi çizilir.
 */
export function displayCopySize(
  crop: { width: number; height: number },
  pixelWidth: number,
  pixelHeight: number,
): { width: number; height: number } | null {
  const width = Math.ceil(pixelWidth);
  const height = Math.ceil(pixelHeight);
  if (width <= 0 || height <= 0) return null;
  if (crop.width <= width || crop.height <= height) return null;
  return { width, height };
}

async function makeCopy(
  source: HTMLImageElement,
  crop: { x: number; y: number; width: number; height: number },
  size: { width: number; height: number },
): Promise<CanvasImageSource> {
  if (typeof window.createImageBitmap === "function") {
    const options: ImageBitmapOptions = {
      resizeWidth: size.width,
      resizeHeight: size.height,
      resizeQuality: "high",
      // `<img>` gibi EXIF yönünü uygula: kırpma `source.width/height`
      // (yönü uygulanmış ölçü) üzerinden hesaplanıyor.
      imageOrientation: "from-image",
    };
    try {
      // Görsel BLOB olarak verilir: `HTMLImageElement` verilince Chrome 8,7
      // MP'lik JPEG'i ana iş parçacığında çözüp küçültüyor ve seçim başına
      // ~37 ms'lik uzun kare üretiyordu (üretim derlemesinde Long Animation
      // Frame ile ölçüldü, 03.10.2026). Blob'dan çözme iş parçacığı dışında.
      // İstek tarayıcı önbelleğinden döner (aynı adres, aynı CORS kipi).
      const response = await fetch(source.currentSrc || source.src, {
        mode: "cors",
        credentials: "omit",
      });
      if (!response.ok) throw new Error(`Zemin alınamadı: ${response.status}`);
      const blob = await response.blob();
      return await window.createImageBitmap(blob, crop.x, crop.y, crop.width, crop.height, options);
    } catch {
      // Ağ/CORS hatası ya da blob desteklenmiyor: yüklü görselden dene.
    }
    try {
      return await window.createImageBitmap(source, crop.x, crop.y, crop.width, crop.height, options);
    } catch {
      // Küçültme seçeneklerini desteklemeyen tarayıcı: aşağıdaki tuval yolu.
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2B tuval açılamadı.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height);
  return canvas;
}

type Copy = {
  source: HTMLImageElement;
  stageWidth: number;
  stageHeight: number;
  /** `null`: kopya ÜRETİLEMEDİ — tam görsele düşülür (bkz. aşağıdaki not). */
  image: CanvasImageSource | null;
  width: number;
  height: number;
};

export function useDisplayBackground(
  source: HTMLImageElement | null,
  stageWidth: number,
  stageHeight: number,
  /** Tuvalin ekrandaki piksel ölçüsü (görüntü genişliği × dpr). */
  pixelWidth: number,
  pixelHeight: number,
  enabled: boolean,
): DisplayBackground | null {
  const [copy, setCopy] = useState<Copy | null>(null);

  const crop = source ? coverCrop(source.width, source.height, stageWidth, stageHeight) : null;
  const size = enabled && crop ? displayCopySize(crop, pixelWidth, pixelHeight) : null;
  const sizeWidth = size?.width ?? 0;
  const sizeHeight = size?.height ?? 0;

  useEffect(() => {
    if (!source || !sizeWidth || !sizeHeight) return;
    let cancelled = false;
    const region = coverCrop(source.width, source.height, stageWidth, stageHeight);
    const target = { width: sizeWidth, height: sizeHeight };
    makeCopy(source, region, target).then(
      (image) => {
        if (!cancelled) setCopy({ source, stageWidth, stageHeight, image, ...target });
      },
      () => {
        // Üretilemeyen kopya AYRICA işaretlenir: işaretlenmezse aşağıdaki
        // "önceki kopyayı göster" kuralı eski zemini SÜRESİZ gösterirdi
        // (ders 23'ün aynı sınıfı). Böylece tam görsele düşülür.
        if (!cancelled) setCopy({ source, stageWidth, stageHeight, image: null, ...target });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [source, stageWidth, stageHeight, sizeWidth, sizeHeight]);

  if (!source || !crop) return null;
  const full: DisplayBackground = { source, image: source, crop };
  if (!size) return full;

  // Aynı biçim oranında üretilmiş bir kopya varsa kullanılır. Ekran boyutu
  // değiştiyse yenisi gelene kadar eski ölçüdeki kopya kısa süre (hafif
  // bulanık) durur; biçim değiştiyse oran farklıdır, esnemesin diye kullanılmaz.
  const sameFormat =
    copy !== null && copy.stageWidth === stageWidth && copy.stageHeight === stageHeight;
  if (!sameFormat || !copy) return full;

  const fromCopy = (image: CanvasImageSource): DisplayBackground => ({
    source: copy.source,
    image,
    crop: { x: 0, y: 0, width: copy.width, height: copy.height },
  });

  if (copy.source === source) return copy.image ? fromCopy(copy.image) : full;
  // Yeni zeminin kopyası HAZIRLANIYOR: önceki zeminin kopyası kalır (geçiş
  // kararmasın, `useLoadedImage`'in `keepPrevious`'i ile aynı kural). Dosyaya
  // giren zemin bu değil, seçili olandır (yukarıdaki ÇIKTI GÜVENLİĞİ).
  return copy.image ? fromCopy(copy.image) : full;
}
