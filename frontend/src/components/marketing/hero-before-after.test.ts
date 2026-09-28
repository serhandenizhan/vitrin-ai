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

const PROPS = {
  before: "/hero/sahne1.webp",
  after: "/hero/sahne1-kesim.webp",
  beforeAlt: "Elde tutulan yüzüğün özgün fotoğrafı",
  afterAlt: "Aynı fotoğraftan arka planı kaldırılmış kesim",
  width: 1120,
  height: 1400,
};

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
  it("ortada basliyor ve sahnenin KENDI gorsel ciftini, kendi oraniyla kullaniyor", () => {
    const { container } = render(createElement(HeroBeforeAfter, PROPS));

    expect(clippedPercent()).toBeCloseTo(50);
    expect(screen.getByAltText(/özgün fotoğrafı/).getAttribute("src")).toBe("/hero/sahne1.webp");
    expect(cutout().getAttribute("src")).toBe("/hero/sahne1-kesim.webp");
    // Kare sabit degil: 4:5 bir fotografi kareye kirpmak urunu kesebilirdi.
    expect((container.firstElementChild?.firstElementChild as HTMLElement).style.aspectRatio).toBe("1120 / 1400");
  });

  it("klavye kaydiraciyla cizgi tasiniyor (surukleme olmadan erisilebilir)", () => {
    render(createElement(HeroBeforeAfter, PROPS));

    fireEvent.change(screen.getByRole("slider", { name: /çizgi/ }), { target: { value: "80" } });

    // Cizginin solundaki %80 kesim, sagdaki %20 ozgun.
    expect(clippedPercent()).toBeCloseTo(20);
  });
});
