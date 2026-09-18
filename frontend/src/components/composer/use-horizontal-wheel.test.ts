// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { createElement, useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useHorizontalWheel } from "@/components/composer/use-horizontal-wheel";

function Strip() {
  const ref = useRef<HTMLDivElement | null>(null);
  useHorizontalWheel(ref);
  // Ref yalnizca BAGLANIYOR, `.current` render sirasinda okunmuyor; kural
  // `createElement` props nesnesini okuma saniyor (JSX .test.ts'te yok).
  // eslint-disable-next-line react-hooks/refs
  return createElement("div", { ref, "data-testid": "strip" });
}

/** jsdom yerlesim hesaplamiyor; kaydirilabilir genislik elle veriliyor. */
function renderStrip(scrollWidth = 1000, clientWidth = 300) {
  const view = render(createElement(Strip));
  const strip = view.getByTestId("strip");
  Object.defineProperty(strip, "scrollWidth", { configurable: true, value: scrollWidth });
  Object.defineProperty(strip, "clientWidth", { configurable: true, value: clientWidth });
  return strip;
}

function wheel(target: Element, deltaY: number, deltaX = 0) {
  const event = new WheelEvent("wheel", { deltaY, deltaX, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("useHorizontalWheel (18.09.2026)", () => {
  afterEach(() => cleanup());

  it("dikey tekerleği şeritte sağa kaydırmaya çeviriyor ve sayfayı kaydırmıyor", () => {
    const strip = renderStrip();
    const event = wheel(strip, 120);
    expect(strip.scrollLeft).toBe(120);
    expect(event.defaultPrevented).toBe(true);
  });

  it("şerit ucundayken olayı serbest bırakıyor (sayfa kilitlenmesin)", () => {
    const strip = renderStrip();
    const event = wheel(strip, -120);
    expect(strip.scrollLeft).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it("zaten yatay gelen hareketi (dokunmatik yüzey) ellemiyor", () => {
    const strip = renderStrip();
    const event = wheel(strip, 10, 80);
    expect(event.defaultPrevented).toBe(false);
  });

  it("kaydırılacak içerik yoksa hiçbir şey yapmıyor", () => {
    const strip = renderStrip(300, 300);
    const event = wheel(strip, 120);
    expect(event.defaultPrevented).toBe(false);
  });
});
