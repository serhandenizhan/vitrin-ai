// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// next/image jsdom'da optimizasyon katmani olmadan duz <img> olarak yeterli.
vi.mock("next/image", async () => {
  const React = await import("react");
  return {
    default: (props: Record<string, unknown>) => {
      // `priority` bir <img> ozelligi degil; DOM'a gecerse React uyarir.
      const imgProps = { ...props };
      delete imgProps.priority;
      return React.createElement("img", imgProps);
    },
  };
});

import { HeroBeforeAfter } from "@/components/marketing/hero-before-after";

afterEach(() => {
  cleanup();
});

function cutout() {
  return screen.getByAltText(/arka planı kaldırılmış kesim/) as HTMLImageElement;
}

/** `inset(0 X% 0 0)` icindeki X. */
function clippedPercent(): number {
  const match = /inset\(0 ([\d.]+)% 0 0\)/.exec(cutout().style.clipPath);
  if (!match) throw new Error(`Beklenmeyen clip-path: ${cutout().style.clipPath}`);
  return Number(match[1]);
}

describe("HeroBeforeAfter", () => {
  it("ortada basliyor ve iki GERCEK, hizali gorseli kullaniyor", () => {
    render(createElement(HeroBeforeAfter));

    expect(clippedPercent()).toBeCloseTo(50);
    expect(screen.getByAltText(/özgün fotoğrafı/).getAttribute("src")).toBe("/showcase/once.webp");
    expect(cutout().getAttribute("src")).toBe("/showcase/sonra.webp");
  });

  it("klavye kaydiraciyla cizgi tasiniyor (surukleme olmadan erisilebilir)", () => {
    render(createElement(HeroBeforeAfter));

    fireEvent.change(screen.getByRole("slider", { name: /çizgi/ }), { target: { value: "80" } });

    // Cizginin solundaki %80 kesim, sagdaki %20 ozgun.
    expect(clippedPercent()).toBeCloseTo(20);
  });
});
