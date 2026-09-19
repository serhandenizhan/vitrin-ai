// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScrollArrows } from "@/components/composer/scroll-arrows";

// Ref yalnizca BAGLANIYOR, `.current` render sirasinda okunmuyor; kural
// `createElement` props nesnesini okuma saniyor (bkz. use-horizontal-wheel.test.ts).
/* eslint-disable react-hooks/refs */
function Strip() {
  const ref = useRef<HTMLDivElement | null>(null);
  return createElement(
    ScrollArrows,
    { targetRef: ref, label: "zeminler" },
    createElement("div", { ref, "data-testid": "strip" }),
  );
}
/* eslint-enable react-hooks/refs */

function renderStrip(scrollLeft: number, scrollWidth = 1000, clientWidth = 300) {
  render(createElement(Strip));
  const strip = screen.getByTestId("strip");
  Object.defineProperty(strip, "scrollWidth", { configurable: true, value: scrollWidth });
  Object.defineProperty(strip, "clientWidth", { configurable: true, value: clientWidth });
  strip.scrollLeft = scrollLeft;
  strip.scrollBy = vi.fn();
  act(() => {
    fireEvent.scroll(strip);
  });
  return strip;
}

/**
 * Gizli ok `aria-hidden` oldugu icin erisilebilir adi BOS hesaplaniyor ve
 * `getByRole({ name })` onu hic bulamiyor — gizli oku da bulmak icin ozniteligin
 * kendisiyle aranir.
 */
function arrow(name: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[aria-label="${name}"]`);
  if (!element) throw new Error(`ok bulunamadi: ${name}`);
  return element;
}

describe("ScrollArrows (18.09.2026)", () => {
  afterEach(() => cleanup());

  it("başta yalnız sağ ok görünür; basınca bir sayfa sağa kaydırır", () => {
    const strip = renderStrip(0);
    expect(arrow("Önceki zeminler").getAttribute("aria-hidden")).toBe("true");
    expect(arrow("Sonraki zeminler").getAttribute("aria-hidden")).toBeNull();

    fireEvent.click(arrow("Sonraki zeminler"));
    expect(strip.scrollBy).toHaveBeenCalledWith({ left: 240, behavior: "smooth" });
  });

  it("ortada iki ok da görünür, sonda yalnız sol ok", () => {
    renderStrip(300);
    expect(arrow("Önceki zeminler").getAttribute("aria-hidden")).toBeNull();
    expect(arrow("Sonraki zeminler").getAttribute("aria-hidden")).toBeNull();
    cleanup();

    renderStrip(700);
    expect(arrow("Önceki zeminler").getAttribute("aria-hidden")).toBeNull();
    expect(arrow("Sonraki zeminler").getAttribute("aria-hidden")).toBe("true");
  });

  it("kaydırılacak içerik yoksa iki ok da gizli", () => {
    renderStrip(0, 300, 300);
    expect(arrow("Önceki zeminler").getAttribute("aria-hidden")).toBe("true");
    expect(arrow("Sonraki zeminler").getAttribute("aria-hidden")).toBe("true");
  });
});
