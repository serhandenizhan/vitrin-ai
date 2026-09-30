import { describe, expect, it } from "vitest";

import { travelSpin, ZOOM_END, zoomFrame } from "@/lib/hero-zoom-timeline";

describe("hero-zoom-timeline", () => {
  it("baslangicta hicbir sey olmamis, sonda her sey tamam", () => {
    expect(zoomFrame(0)).toEqual({ drop: 0, travel: 0, panel: false });
    expect(zoomFrame(ZOOM_END)).toEqual({ drop: 1, travel: 1, panel: true });
  });

  it("ilk karede el henuz yerinde ve yuzuk fotograftaki yerinde", () => {
    const first = zoomFrame(0.016);
    expect(first.drop).toBeLessThan(0.01);
    expect(first.travel).toBe(0);
  });

  it("el, yuzuk odaga varmadan once kaybolur", () => {
    const handGone = zoomFrame(0.85);
    expect(handGone.drop).toBe(1);
    expect(handGone.travel).toBeLessThan(1);
  });

  it("donus fotograftaki pozdan baslayip ayni poza (bir tam tur) varir", () => {
    expect(travelSpin(0)).toBe(0);
    expect(Math.cos(travelSpin(1))).toBeCloseTo(1);
    expect(travelSpin(0.5)).toBeCloseTo(Math.PI);
  });
});
