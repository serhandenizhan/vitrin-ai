import { describe, expect, it } from "vitest";

import {
  DEFAULT_FORMAT_NAME,
  OUTPUT_FORMATS,
  coverCrop,
  formatOrientation,
  reflectionPlacement,
} from "@/lib/composition";

describe("biçimler (17.09.2026)", () => {
  it("Kare 2000×2000 kaldırıldı, stüdyo A4 ile açılıyor", () => {
    expect(OUTPUT_FORMATS).not.toHaveProperty("square");
    expect(DEFAULT_FORMAT_NAME).toBe("catalog");
    expect(Object.keys(OUTPUT_FORMATS)[0]).toBe("catalog");
    // Pazaryeri (beyaz zeminli 2000×2000) duruyor.
    expect(OUTPUT_FORMATS.marketplace.outputWidth).toBe(2000);
  });

  it("dikey ve yatay/kare biçimleri ayırıyor", () => {
    expect(formatOrientation(OUTPUT_FORMATS.catalog)).toBe("portrait");
    expect(formatOrientation(OUTPUT_FORMATS.instagramStory)).toBe("portrait");
    expect(formatOrientation(OUTPUT_FORMATS.instagramPost)).toBe("landscape");
    expect(formatOrientation(OUTPUT_FORMATS.marketplace)).toBe("landscape");
  });
});

describe("coverCrop — zemin esnetilmeden kaplanıyor", () => {
  it("yatay zemini dikey hikâyeye ortadan kırpıyor, oranı koruyor", () => {
    const crop = coverCrop(3508, 2480, 540, 960);

    expect(crop.height).toBe(2480);
    expect(crop.width / crop.height).toBeCloseTo(540 / 960, 6);
    expect(crop.x).toBeCloseTo((3508 - crop.width) / 2, 6);
    expect(crop.y).toBe(0);
  });

  it("dikey zemini kare biçime yukarıdan-aşağıdan eşit kırpıyor", () => {
    const crop = coverCrop(2480, 3508, 1000, 1000);

    expect(crop).toEqual({ x: 0, y: (3508 - 2480) / 2, width: 2480, height: 2480 });
  });

  it("oranı zaten uyan zemine dokunmuyor", () => {
    expect(coverCrop(1240, 1754, 620, 877)).toEqual({ x: 0, y: 0, width: 1240, height: 1754 });
  });
});

describe("reflectionPlacement — yansıma ürünün alt kenarından aynalanıyor", () => {
  it("dönmemiş üründe eksen alt kenar, kopya eksenin altında ters", () => {
    const placement = reflectionPlacement({ x: 300, y: 400, scale: 0.5, rotation: 0 }, 400, 200);

    // Ürün yüksekliği 200 × 0.5 = 100 → alt kenar y=450.
    expect(placement.axisY).toBe(450);
    expect(placement.y).toBe(500);
    expect(placement.x).toBe(300);
    expect(placement.scaleX).toBe(0.5);
    expect(placement.scaleY).toBe(-0.5);
    // Görünür kısım ürün yüksekliğinin %60'ı.
    expect(placement.fadeHeight).toBeCloseTo(60, 6);
  });

  it("döndürülmüş üründe dönmüş kutunun alt kenarını kullanıyor ve açıyı ters çeviriyor", () => {
    const placement = reflectionPlacement({ x: 0, y: 0, scale: 1, rotation: 90 }, 400, 200);

    // 90°'de genişlik dikeye geçiyor: yarı yükseklik 200.
    expect(placement.axisY).toBeCloseTo(200, 6);
    expect(placement.rotation).toBe(-90);
  });
});

it("saydam boşluklu kesimde yansıma görünür ürünün altına bitişir", () => {
  const result = reflectionPlacement(
    { x: 300, y: 400, scale: 0.5, rotation: 0 }, 1200, 1600,
    { x: 300, y: 650, width: 600, height: 450 },
  );
  expect(result.axisY).toBe(550);
  expect(result.y - (1100 - 800) * 0.5).toBe(550);
  expect(result.fadeHeight).toBe(135);
});
