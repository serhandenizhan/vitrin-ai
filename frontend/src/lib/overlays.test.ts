import { describe, expect, it } from "vitest";

import {
  DEFAULT_LABEL,
  DEFAULT_LOGO,
  formatGram,
  gramProblem,
  labelText,
  logoBox,
  logoFileProblem,
  overlayMargin,
  placeInCorner,
  sanitizeCode,
  stackLabelBox,
} from "@/lib/overlays";

describe("formatGram", () => {
  it.each([
    ["3,45", "3,45 gr"],
    ["3.45", "3,45 gr"],
    [" 12 ", "12 gr"],
    ["0,5", "0,5 gr"],
    ["9999", "9999 gr"],
  ])("%j -> %j", (input, expected) => {
    expect(formatGram(input)).toBe(expected);
  });

  it.each(["", "0", "abc", "3,456", "-2", "10000", "1e3"])("reddediyor: %j", (input) => {
    expect(formatGram(input)).toBeNull();
  });

  it("bos gram hata sayilmiyor (etikette gram istege bagli)", () => {
    expect(gramProblem("")).toBeNull();
    expect(gramProblem("üç")).not.toBeNull();
  });
});

describe("sanitizeCode", () => {
  it("izin verilmeyen karakterleri atip 24 karakterde kesiyor", () => {
    expect(sanitizeCode("  A-102 <b> ")).toBe("A-102 b");
    expect(sanitizeCode("X".repeat(40))).toHaveLength(24);
  });
});

describe("labelText", () => {
  it("dolu parcalari tek satirda birlestiriyor", () => {
    expect(
      labelText({ ...DEFAULT_LABEL, enabled: true, karat: "22K", gram: "3,45", code: "A-102" }),
    ).toBe("22K · 3,45 gr · Kod A-102");
  });

  it("gecersiz parcalari atliyor, hic parca yoksa cizilmiyor", () => {
    expect(labelText({ ...DEFAULT_LABEL, enabled: true, karat: "99K", gram: "abc" })).toBeNull();
    expect(labelText({ ...DEFAULT_LABEL, enabled: true, gram: "2" })).toBe("2 gr");
  });

  it("kapaliyken hicbir sey cizilmiyor", () => {
    expect(labelText({ ...DEFAULT_LABEL, karat: "22K" })).toBeNull();
  });
});

describe("yerlesim", () => {
  it("kutuyu dort koseye kenar boslugu birakarak yasliyor", () => {
    const margin = overlayMargin(1000, 1000);
    expect(placeInCorner("top-left", 100, 50, 1000, 1000)).toEqual({ x: margin, y: margin, width: 100, height: 50 });
    expect(placeInCorner("bottom-right", 100, 50, 1000, 1000)).toEqual({
      x: 1000 - margin - 100,
      y: 1000 - margin - 50,
      width: 100,
      height: 50,
    });
  });

  it("logo uzun kenari kisa kenara gore olcekleniyor, oran korunuyor", () => {
    // Genis logo, dikey (540x675) sahnede: kisa kenar 540.
    const box = logoBox(400, 200, { ...DEFAULT_LOGO, size: 0.2 }, 540, 675);
    expect(box.width).toBeCloseTo(108);
    expect(box.height).toBeCloseTo(54);
  });

  it("ayni koseye konan etiket logonun ustune binmiyor", () => {
    const logo = placeInCorner("bottom-right", 120, 120, 1000, 1000);
    const label = placeInCorner("bottom-right", 200, 40, 1000, 1000);
    const stacked = stackLabelBox(label, "bottom-right", logo, "bottom-right");
    expect(stacked.y + stacked.height).toBeLessThanOrEqual(logo.y);

    const logoTop = placeInCorner("top-left", 120, 120, 1000, 1000);
    const labelTop = placeInCorner("top-left", 200, 40, 1000, 1000);
    expect(stackLabelBox(labelTop, "top-left", logoTop, "top-left").y).toBeGreaterThanOrEqual(
      logoTop.y + logoTop.height,
    );
  });

  it("farkli koselerde etikete dokunmuyor", () => {
    const label = placeInCorner("top-left", 200, 40, 1000, 1000);
    const logo = placeInCorner("bottom-right", 120, 120, 1000, 1000);
    expect(stackLabelBox(label, "top-left", logo, "bottom-right")).toEqual(label);
  });
});

describe("logoFileProblem", () => {
  it("SVG ve cok buyuk dosyayi reddediyor", () => {
    expect(logoFileProblem({ type: "image/svg+xml", size: 100 })).not.toBeNull();
    expect(logoFileProblem({ type: "image/png", size: 6 * 1024 * 1024 })).not.toBeNull();
    expect(logoFileProblem({ type: "image/png", size: 200_000 })).toBeNull();
  });
});
