// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStageSize } from "@/components/composer/use-stage-size";

/** Gozlenen dugumleri kaydeden sahte ResizeObserver. */
function stubResizeObserver() {
  const observed: Element[] = [];
  const disconnected: Element[] = [];
  class FakeObserver {
    private target: Element | null = null;
    observe(target: Element) {
      this.target = target;
      observed.push(target);
    }
    disconnect() {
      if (this.target) disconnected.push(this.target);
    }
    unobserve() {}
  }
  vi.stubGlobal("ResizeObserver", FakeObserver);
  return { observed, disconnected };
}

function box(width: number): HTMLElement {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => ({ width }) as DOMRect;
  return element;
}

afterEach(() => vi.unstubAllGlobals());

describe("useStageSize — kapsayıcı değişince (19.09.2026)", () => {
  it("YENİ kapsayıcıyı ölçüp gözlemciyi ona taşıyor, eskisini bırakıyor", () => {
    const { observed, disconnected } = stubResizeObserver();
    const first = box(300);
    const ref: { current: HTMLElement | null } = { current: first };
    const { result, rerender } = renderHook(() => useStageSize(ref));
    expect(result.current[0]).toBe(300);

    // Telefon duzeninden masaustune gecis: tuvalin kapsayicisi yeni bir dugum.
    const second = box(494);
    ref.current = second;
    rerender();

    expect(result.current[0]).toBe(494);
    expect(observed).toEqual([first, second]);
    expect(disconnected).toEqual([first]);
  });
});

describe("useStageSize — senkron ölçüm (20.09.2026)", () => {
  it("dönen ölçüm fonksiyonu boyutu HEMEN yazıyor (aşama geçişinde görüntü alınmadan önce)", () => {
    stubResizeObserver();
    const element = box(300);
    const ref: { current: HTMLElement | null } = { current: element };
    const { result } = renderHook(() => useStageSize(ref));
    expect(result.current[0]).toBe(300);

    // Kapsayici daraldi ama ResizeObserver daha haber vermedi.
    element.getBoundingClientRect = () => ({ width: 432 }) as DOMRect;
    act(() => result.current[1]());

    expect(result.current[0]).toBe(432);
  });
});
