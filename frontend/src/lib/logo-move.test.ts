// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { clearCatalogImport, peekCatalogImport, storeCatalogImport } from "@/lib/catalog-handoff";
import { invertPixels } from "@/lib/logo-image";
import { DEFAULT_LOGO, LOGO_SIZE_RANGE, logoBox, logoSettingsFromBox } from "@/lib/overlays";

describe("serbest logo (17.09.2026)", () => {
  it("konumu olan logo merkezine yerlesiyor ve kutudan ayara geri donuyor", () => {
    const settings = { ...DEFAULT_LOGO, size: 0.3, position: { x: 0.25, y: 0.6 } };
    const box = logoBox(400, 200, settings, 1240, 1754);
    expect(box.x + box.width / 2).toBeCloseTo(310);
    expect(box.y + box.height / 2).toBeCloseTo(1052.4);

    const back = logoSettingsFromBox(box, 1240, 1754);
    expect(back.size).toBeCloseTo(0.3);
    expect(back.position?.x).toBeCloseTo(0.25);
    expect(back.position?.y).toBeCloseTo(0.6);
  });

  it("boyut aralikla sinirlaniyor", () => {
    const huge = logoSettingsFromBox({ x: 0, y: 0, width: 5000, height: 5000 }, 1000, 1000);
    expect(huge.size).toBe(LOGO_SIZE_RANGE.max);
  });

  it("renk cevirme beyazi siyah yapiyor, saydamliga dokunmuyor, iki kez uygulaninca geri donuyor", () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 128, 10, 20, 30, 0]);
    invertPixels(data);
    expect(Array.from(data)).toEqual([0, 0, 0, 255, 255, 255, 255, 128, 245, 235, 225, 0]);
    invertPixels(data);
    expect(Array.from(data)).toEqual([255, 255, 255, 255, 0, 0, 0, 128, 10, 20, 30, 0]);
  });

  it("kataloga aktarilan gorsel yerlesene kadar korunuyor, sonra siliniyor", () => {
    expect(storeCatalogImport("data:image/jpeg;base64,AAAA")).toBe(true);
    expect(peekCatalogImport()).toBe("data:image/jpeg;base64,AAAA");
    expect(peekCatalogImport()).toBe("data:image/jpeg;base64,AAAA");
    clearCatalogImport();
    expect(peekCatalogImport()).toBeNull();
  });
});

import { TEMPLATES, applyTemplateColors, relativeLuminance } from "@/lib/catalog-templates";

describe("katalog renkleri (17.09.2026)", () => {
  it("koyu sayfada metin otomatik beyaz, acikta siyah; secim otomatigi eziyor", () => {
    const navy = applyTemplateColors(TEMPLATES.duo, "#1c2433", "auto");
    expect(navy.paper).toBe("#1c2433");
    expect(relativeLuminance(navy.ink)).toBeGreaterThan(0.5);
    expect(relativeLuminance(applyTemplateColors(TEMPLATES.cover, "#ffffff", "auto").ink)).toBeLessThan(0.5);
    expect(relativeLuminance(applyTemplateColors(TEMPLATES.duo, "#1c2433", "dark").ink)).toBeLessThan(0.5);
  });

  it("alti sablon var", () => {
    expect(Object.keys(TEMPLATES)).toHaveLength(6);
  });
});
