"use client";

import { useEffect, useMemo, useState } from "react";

import {
  type Rgb,
  gradientColor,
  measureImage,
  rankSuggestions,
  readColorCache,
  rgbToHsl,
  writeColorCache,
} from "@/lib/background-suggestions";
import type { Background } from "@/lib/backgrounds";

/**
 * Kesimin rengine gore zemin kimlikleri, en uygundan baslayarak (bkz.
 * lib/background-suggestions.ts).
 * Olcum bitene kadar bos liste doner; "Önerilen" rafi o zaman hic olusmaz.
 */
export function useSuggestedBackgrounds(cutoutUrl: string, backgrounds: Background[]): string[] {
  const [product, setProduct] = useState<{ url: string; rgb: Rgb } | null>(null);
  const [colors, setColors] = useState<Record<string, Rgb>>(() =>
    typeof window === "undefined" ? {} : readColorCache(),
  );

  useEffect(() => {
    let cancelled = false;
    // Kenar pikselleri yari saydam; yalnizca neredeyse opak olanlar urunun rengi.
    void measureImage(cutoutUrl, 200).then((rgb) => {
      if (!cancelled && rgb) setProduct({ url: cutoutUrl, rgb });
    });
    return () => {
      cancelled = true;
    };
  }, [cutoutUrl]);

  // Yalnizca onbellekte olmayan sunucu zeminleri olculuyor; kimlik degismedikce
  // zeminin gorseli de degismiyor (yukleme betigi kimligi icerikten turetiyor).
  const missingKey = backgrounds
    .filter((background) => background.type === "server" && !(background.id in colors))
    .map((background) => background.id)
    .join(",");
  useEffect(() => {
    if (!missingKey) return;
    let cancelled = false;
    const targets = backgrounds.filter(
      (background) => background.type === "server" && missingKey.split(",").includes(background.id),
    );
    void Promise.all(
      targets.map(async (background) => {
        if (background.type !== "server") return null;
        const rgb = await measureImage(background.thumbnailUrl ?? background.url, 0);
        return rgb ? ([background.id, rgb] as const) : null;
      }),
    ).then((measured) => {
      if (cancelled) return;
      const found = measured.filter((entry): entry is readonly [string, Rgb] => entry !== null);
      if (found.length === 0) return;
      setColors((current) => {
        const next = { ...current, ...Object.fromEntries(found) };
        writeColorCache(next);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // `backgrounds` imzali URL yenilenince degisiyor; olculecek kume ayniysa
    // yeniden olcmeye gerek yok, bu yuzden yalnizca `missingKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey]);

  return useMemo(() => {
    if (!product || product.url !== cutoutUrl) return [];
    const available = new Map<string, Rgb>();
    for (const background of backgrounds) {
      const rgb = background.type === "server" ? colors[background.id] : gradientColor(background.gradient);
      if (rgb) available.set(background.id, rgb);
    }
    // TAM sira donuyor: raf, bicime uyanlari suzdukten sonra ilk altisini aliyor.
    return rankSuggestions(rgbToHsl(product.rgb), available, available.size);
  }, [product, cutoutUrl, backgrounds, colors]);
}
