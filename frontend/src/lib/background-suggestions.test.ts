import { describe, expect, it } from "vitest";

import {
  type Rgb,
  averageColor,
  gradientColor,
  rankSuggestions,
  rgbToHsl,
} from "@/lib/background-suggestions";

const GOLD: Rgb = [201, 161, 92];
const SILVER: Rgb = [200, 200, 205];

describe("rankSuggestions", () => {
  const colors = new Map<string, Rgb>([
    ["altin-zemin", [196, 158, 88]],
    ["kadife-siyah", [18, 17, 16]],
    ["duz-beyaz", [250, 250, 250]],
    ["acik-gri", [205, 205, 208]],
  ]);

  it("altın ürüne koyu ve nötr zemini, altın zeminden önce önerir", () => {
    const ranked = rankSuggestions(rgbToHsl(GOLD), colors, 4);
    expect(ranked[0]).toBe("kadife-siyah");
    expect(ranked.indexOf("altin-zemin")).toBeGreaterThan(ranked.indexOf("duz-beyaz"));
    expect(ranked.at(-1)).toBe("altin-zemin");
  });

  it("gümüş ürüne kendisiyle aynı açıklıktaki griyi en sona koyar", () => {
    const ranked = rankSuggestions(rgbToHsl(SILVER), colors, 4);
    expect(ranked[0]).toBe("kadife-siyah");
    expect(ranked.at(-1)).toBe("acik-gri");
  });

  it("neredeyse aynı renkteki zeminleri öne almaz, sona iter", () => {
    const whites = new Map<string, Rgb>([
      ["saf-beyaz", [255, 255, 255]],
      ["duz-beyaz", [250, 250, 250]],
      ["sis-beyazi", [244, 244, 246]],
      ["kadife-siyah", [18, 17, 16]],
      ["koyu-petrol", [10, 70, 70]],
    ]);
    const ranked = rankSuggestions(rgbToHsl(GOLD), whites, 5);
    // Ilk uc icinde yalnizca TEK beyaz var; digerleri listenin sonunda.
    expect(ranked.slice(0, 3).filter((id) => id.includes("beyaz"))).toHaveLength(1);
    expect(ranked).toHaveLength(5);
  });

  it("istenen sayıda sonuç döndürür", () => {
    expect(rankSuggestions(rgbToHsl(GOLD), colors, 2)).toHaveLength(2);
  });
});

describe("averageColor", () => {
  it("saydam pikselleri saymaz", () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0]);
    expect(averageColor(data, 200)).toEqual([255, 0, 0]);
  });

  it("hiç opak piksel yoksa null", () => {
    expect(averageColor(new Uint8ClampedArray([1, 2, 3, 0]), 200)).toBeNull();
  });
});

describe("gradientColor", () => {
  it("gradyan duraklarının ortalaması", () => {
    expect(gradientColor([0, "#000000", 1, "#ffffff"])).toEqual([128, 128, 128]);
    expect(gradientColor([0, "rgba(0,0,0,1)"])).toBeNull();
  });
});
