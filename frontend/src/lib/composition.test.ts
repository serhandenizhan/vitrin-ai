import { describe, expect, it } from "vitest";

import {
  CENTER_SNAP_TOLERANCE,
  DEFAULT_APPEARANCE,
  EXPORT_PIXEL_RATIO,
  FIT_MARGIN,
  OUTPUT_SIZE,
  STAGE_SIZE,
  fitToStage,
  fitTransform,
  isDefaultAppearance,
  mapTransformToStage,
  normalizeAngle,
  snapToCenter,
} from "@/lib/composition";

describe("fitTransform", () => {
  it("ürünü sahnenin merkezine koyar", () => {
    const t = fitTransform(800, 600);

    expect(t.x).toBe(STAGE_SIZE / 2);
    expect(t.y).toBe(STAGE_SIZE / 2);
    expect(t.rotation).toBe(0);
  });

  it("geniş görselde GENİŞLİĞE göre ölçekler", () => {
    const t = fitTransform(2000, 1000);

    expect(t.scale).toBeCloseTo((STAGE_SIZE * FIT_MARGIN) / 2000);
  });

  it("uzun görselde YÜKSEKLİĞE göre ölçekler", () => {
    const t = fitTransform(1000, 2000);

    expect(t.scale).toBeCloseTo((STAGE_SIZE * FIT_MARGIN) / 2000);
  });

  it("her iki kenar da sahneye TAMAMEN sığar", () => {
    // `Math.max` kullanılsaydı uzun kenar taşardı ve kullanıcı ürünün
    // kırpıldığını sanırdı. Her iki boyut da sahnenin içinde kalmalı.
    for (const [width, height] of [
      [2400, 800],
      [800, 2400],
      [1000, 1000],
      [37, 1900],
    ]) {
      const t = fitTransform(width, height);

      expect(width * t.scale).toBeLessThanOrEqual(STAGE_SIZE);
      expect(height * t.scale).toBeLessThanOrEqual(STAGE_SIZE);
    }
  });

  it("kenarlarda pay bırakır — ürün kenara yapışmaz", () => {
    const t = fitTransform(1000, 1000);

    expect(1000 * t.scale).toBeCloseTo(STAGE_SIZE * FIT_MARGIN);
    expect(1000 * t.scale).toBeLessThan(STAGE_SIZE);
  });
});

describe("normalizeAngle", () => {
  it("0-359 aralığına indirger", () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(15)).toBe(15);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(375)).toBe(15);
    // "15° döndür"e 72 kez basmak: 1080 derece.
    expect(normalizeAngle(1080)).toBe(0);
  });

  it("negatif açıyı da pozitife çevirir", () => {
    // JavaScript'in `%` operatörü negatif sayıda negatif döner
    // (`-15 % 360 === -15`); tek bir mod yeterli olmuyor.
    expect(normalizeAngle(-15)).toBe(345);
    expect(normalizeAngle(-360)).toBe(0);
    expect(normalizeAngle(-370)).toBe(350);
  });
});

describe("EXPORT_PIXEL_RATIO", () => {
  it("tam sayı — kesirli oran çıktıyı 1999 px yapıyordu", () => {
    // Bu sabitin varlık sebebi bir off-by-one hatası: oran ekran genişliğine
    // (434 px gibi yuvarlak olmayan bir sayıya) dayandığında Konva 2000 yerine
    // 1999 px'lik tuval üretiyordu.
    expect(Number.isInteger(EXPORT_PIXEL_RATIO)).toBe(true);
    expect(STAGE_SIZE * EXPORT_PIXEL_RATIO).toBe(OUTPUT_SIZE);
  });
});

describe("mapTransformToStage", () => {
  const cutout = { width: 800, height: 400 };
  const portrait = { width: 620, height: 877 };
  const square = { width: 540, height: 540 };

  it("konumu sahneye oranla, boyutu sigdir olcegine gore tasir", () => {
    const fitP = fitToStage(portrait.width, portrait.height, cutout.width, cutout.height).scale;
    const fitS = fitToStage(square.width, square.height, cutout.width, cutout.height).scale;
    const moved = mapTransformToStage(
      { x: portrait.width * 0.25, y: portrait.height * 0.75, scale: fitP * 1.2, rotation: 15 },
      portrait,
      square,
      cutout,
    );
    expect(moved?.x).toBeCloseTo(square.width * 0.25);
    expect(moved?.y).toBeCloseTo(square.height * 0.75);
    expect(moved?.scale).toBeCloseTo(fitS * 1.2);
    expect(moved?.rotation).toBe(15);
  });

  it("dokunulmamis yerlesim (null) sahneye birakilir", () => {
    expect(mapTransformToStage(null, portrait, square, cutout)).toBeNull();
  });
});

describe("snapToCenter", () => {
  it("tolerans içindeki değeri tam merkeze çeker", () => {
    // Fareyle tam ortayı tutturmak neredeyse imkânsız; 1-2 piksellik kayma
    // 2000 px'e büyütülmüş çıktıda göze batıyor.
    expect(snapToCenter(500 + CENTER_SNAP_TOLERANCE - 1, 500)).toBe(500);
    expect(snapToCenter(500 - CENTER_SNAP_TOLERANCE + 1, 500)).toBe(500);
    expect(snapToCenter(500, 500)).toBe(500);
  });

  it("tolerans dışında serbest bırakır", () => {
    const far = 500 + CENTER_SNAP_TOLERANCE + 1;

    expect(snapToCenter(far, 500)).toBe(far);
    expect(snapToCenter(120, 500)).toBe(120);
  });

  it("sınırın tam üstünde yakalar (kapalı aralık)", () => {
    expect(snapToCenter(500 + CENTER_SNAP_TOLERANCE, 500)).toBe(500);
  });
});

describe("isDefaultAppearance", () => {
  it("dokunulmamış görünümde true", () => {
    expect(isDefaultAppearance(DEFAULT_APPEARANCE)).toBe(true);
  });

  it("tek bir ayar değişse bile false", () => {
    // "Sıfırla" düğmesinin ne zaman görüneceğini bu belirliyor; bir alanı
    // kontrol etmeyi unutmak, kullanıcının geri alamadığı bir ayar bırakırdı.
    expect(isDefaultAppearance({ ...DEFAULT_APPEARANCE, brightness: 0.1 })).toBe(false);
    expect(isDefaultAppearance({ ...DEFAULT_APPEARANCE, contrast: 5 })).toBe(false);
    expect(isDefaultAppearance({ ...DEFAULT_APPEARANCE, saturation: -0.2 })).toBe(false);
    expect(isDefaultAppearance({ ...DEFAULT_APPEARANCE, shadow: true })).toBe(false);
    expect(isDefaultAppearance({ ...DEFAULT_APPEARANCE, reflection: true })).toBe(false);
  });
});
