import { describe, expect, it } from "vitest";

import {
  horizontalWheelSlides,
  isSettled,
  relativeOffset,
  releaseTarget,
  slideLook,
  stepSpring,
  wrapIndex,
} from "@/lib/hero-carousel";

describe("hero-carousel", () => {
  it("indeksi halka seklinde sarar", () => {
    expect(wrapIndex(7, 7)).toBe(0);
    expect(wrapIndex(-1, 7)).toBe(6);
    expect(wrapIndex(15, 7)).toBe(1);
  });

  it("uzakligi en kisa yoldan olcer (sondan basa bir adim)", () => {
    expect(relativeOffset(0, 6, 7)).toBe(1);
    expect(relativeOffset(6, 0, 7)).toBe(-1);
    expect(relativeOffset(3, 3, 7)).toBe(0);
    expect(relativeOffset(2, 1.5, 7)).toBeCloseTo(0.5);
  });

  it("dikey tekerlegi SAYFAYA birakir, yalniz yatay baskin hareketi alir", () => {
    expect(horizontalWheelSlides(0, 120)).toBeNull();
    expect(horizontalWheelSlides(30, 40)).toBeNull();
    expect(horizontalWheelSlides(0, 0)).toBeNull();
    expect(horizontalWheelSlides(160, 20)).toBeCloseTo(0.5);
    expect(horizontalWheelSlides(-320, 10)).toBeCloseTo(-1);
  });

  it("yay hedefe oturur ve oturdugunu soyler", () => {
    let state = { position: 0, velocity: 0 };
    for (let i = 0; i < 240; i += 1) state = stepSpring(state, 1, 1 / 60);
    expect(state.position).toBeCloseTo(1, 3);
    expect(isSettled(state, 1)).toBe(true);
  });

  it("buyuk bir kare araligi yayi patlatmaz", () => {
    const state = stepSpring({ position: 0, velocity: 0 }, 1, 5);
    expect(Math.abs(state.position)).toBeLessThan(1.5);
  });

  it("birakinca tek surukleme en fazla bir sahne atlar", () => {
    expect(releaseTarget(0.3, 0, 0)).toBe(0);
    expect(releaseTarget(0.3, 0, 4)).toBe(1);
    expect(releaseTarget(2.9, 0, 40)).toBe(1);
    expect(releaseTarget(-0.2, 0, -6)).toBe(-1);
  });

  it("ortadaki tam boyda; komsular telefonda gizli", () => {
    expect(slideLook(0, true)).toMatchObject({ x: 0, scale: 1, opacity: 1 });
    expect(slideLook(1, true).opacity).toBeCloseTo(0.34);
    expect(slideLook(1, false).opacity).toBe(0);
    expect(slideLook(-2, true).opacity).toBe(0);
    expect(slideLook(1, true).x).toBeGreaterThan(0);
    expect(slideLook(-1, true).x).toBeLessThan(0);
  });
});
