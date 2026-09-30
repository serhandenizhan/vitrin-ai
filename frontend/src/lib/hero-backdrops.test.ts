import { describe, expect, it } from "vitest";

import { backdropRect, HERO_BACKDROPS, zoomFocus } from "@/lib/hero-backdrops";

const kadife = HERO_BACKDROPS.find((b) => b.id === "yesil-kadife")!;

describe("hero-backdrops", () => {
  it("genis ekranda yuzuk solda (sagda panel), telefonda ustte", () => {
    const wide = zoomFocus(1440, 860);
    expect(wide.x).toBeLessThan(720);
    const phone = zoomFocus(375, 812);
    expect(phone.x).toBe(187.5);
    expect(phone.y).toBeLessThan(406);
  });

  it("oturma noktasi yuzugun alt ucuna gelir", () => {
    const focus = zoomFocus(1440, 860);
    const rect = backdropRect(kadife, focus, 1440, 860);
    const anchorX = rect.left + kadife.anchor.x * rect.width;
    const anchorY = rect.top + kadife.anchor.y * rect.height;
    expect(anchorX).toBeCloseTo(focus.x, 0);
    expect(anchorY).toBeCloseTo(focus.y + focus.height / 2, 0);
  });

  it("gorsel kapsayiciyi her zaman tamamen kaplar", () => {
    for (const [w, h] of [
      [1440, 860],
      [375, 812],
      [1024, 1366],
      [2560, 900],
    ]) {
      for (const backdrop of HERO_BACKDROPS) {
        const rect = backdropRect(backdrop, zoomFocus(w, h), w, h);
        expect(rect.left).toBeLessThanOrEqual(0);
        expect(rect.top).toBeLessThanOrEqual(0);
        expect(rect.left + rect.width).toBeGreaterThanOrEqual(w - 0.5);
        expect(rect.top + rect.height).toBeGreaterThanOrEqual(h - 0.5);
      }
    }
  });
});
