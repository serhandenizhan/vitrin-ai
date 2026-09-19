import { describe, expect, it } from "vitest";

import {
  DEFAULT_APPEARANCE,
  isDefaultAppearance,
  normalizeAppearance,
  reflectionPlacement,
} from "@/lib/composition";

describe("gölge ve yansıma ince ayarları (19.09.2026)", () => {
  it("eski taslak (yeni alanlar yok) varsayılanlarla tamamlanıyor", () => {
    const old = { brightness: 0.1, contrast: 0, saturation: 0, shadow: true, reflection: false };
    const normalized = normalizeAppearance(old as never);
    expect(normalized.brightness).toBe(0.1);
    expect(normalized.shadowSize).toBe(1);
    expect(normalized.shadowOpacity).toBe(0.55);
    expect(normalized.reflectionGap).toBe(0);
  });

  it("aralık dışı ya da bozuk değerler sınırlanıyor", () => {
    const normalized = normalizeAppearance({
      ...DEFAULT_APPEARANCE,
      shadowSize: 99,
      shadowOpacity: -1,
      reflectionGap: Number.NaN,
    });
    expect(normalized.shadowSize).toBe(2);
    expect(normalized.shadowOpacity).toBe(0.1);
    expect(normalized.reflectionGap).toBe(0);
  });

  it("yeni ayarlar değişince 'sıfırla' etkinleşiyor", () => {
    expect(isDefaultAppearance(DEFAULT_APPEARANCE)).toBe(true);
    expect(isDefaultAppearance({ ...DEFAULT_APPEARANCE, shadowOpacity: 0.3 })).toBe(false);
    expect(isDefaultAppearance({ ...DEFAULT_APPEARANCE, reflectionGap: 10 })).toBe(false);
  });

  it("yansıma mesafesi yansımayı ve silikleşmeyi aynı miktarda aşağı kaydırıyor", () => {
    const transform = { x: 100, y: 100, scale: 1, rotation: 0 };
    const touching = reflectionPlacement(transform, 50, 40);
    const apart = reflectionPlacement(transform, 50, 40, undefined, 12);
    expect(apart.y - touching.y).toBe(12);
    expect(apart.axisY - touching.axisY).toBe(12);
    expect(apart.fadeHeight).toBe(touching.fadeHeight);
    // Negatif mesafe yok sayılıyor (yansıma ürünün içine girmez).
    expect(reflectionPlacement(transform, 50, 40, undefined, -5).y).toBe(touching.y);
  });
});
