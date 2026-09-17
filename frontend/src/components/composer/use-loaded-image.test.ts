// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useLoadedImage } from "@/components/composer/use-loaded-image";

/**
 * jsdom gercekten gorsel yuklemiyor: `onload`/`onerror` kendiliginden hic
 * calismaz. Bu yuzden `window.Image` sahte bir sinifla degistiriliyor ve
 * yuklemenin basarili/basarisiz bitisini testin kendisi tetikliyor.
 */
class FakeImage {
  static instances: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin: string | null = null;
  width = 100;
  height = 100;
  #src = "";

  constructor() {
    FakeImage.instances.push(this);
  }

  set src(value: string) {
    this.#src = value;
  }

  get src(): string {
    return this.#src;
  }
}

function instanceFor(url: string): FakeImage {
  // SON olusan ornek aliniyor: ayni url'e geri donuldugunde hook yeni bir
  // `Image` yaratiyor ve ilk (basarisiz) ornege bakmak yaniltici olur.
  const matching = FakeImage.instances.filter((image) => image.src === url);
  const found = matching[matching.length - 1];
  if (!found) throw new Error(`Bu url icin gorsel olusturulmadi: ${url}`);
  return found;
}

describe("useLoadedImage", () => {
  beforeEach(() => {
    FakeImage.instances = [];
    vi.stubGlobal("Image", FakeImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("yuklenen gorseli dondurur", () => {
    const { result } = renderHook(() => useLoadedImage("https://r2.example/a"));

    expect(result.current).toBeNull();
    act(() => instanceFor("https://r2.example/a").onload?.());
    expect(result.current).toBe(instanceFor("https://r2.example/a"));
  });

  it("keepPrevious ile yeni zemin YUKLENIRKEN oncekini gosterir", () => {
    const { result, rerender } = renderHook(
      ({ url }: { url: string }) => useLoadedImage(url, { keepPrevious: true }),
      { initialProps: { url: "https://r2.example/a" } },
    );

    act(() => instanceFor("https://r2.example/a").onload?.());
    const first = result.current;
    expect(first).not.toBeNull();

    // Yeni url verildi ama henuz yuklenmedi: onceki zemin ekranda kalmali,
    // yoksa her zemin seciminde ekran bir an karariyor.
    rerender({ url: "https://r2.example/b" });
    expect(result.current).toBe(first);
  });

  it("keepPrevious acikken bile yeni zemin YUKLENEMEZSE onceki zemini dondurmez", () => {
    const { result, rerender } = renderHook(
      ({ url }: { url: string }) => useLoadedImage(url, { keepPrevious: true }),
      { initialProps: { url: "https://r2.example/a" } },
    );

    act(() => instanceFor("https://r2.example/a").onload?.());
    expect(result.current).not.toBeNull();

    rerender({ url: "https://r2.example/kirik" });
    act(() => instanceFor("https://r2.example/kirik").onerror?.());

    // Kesim burada onemli: eski gorseli dondurmek, kullaniciya SECMEDIGI
    // zemini gostermek ve o zeminle dosya indirtmek demekti.
    expect(result.current).toBeNull();
  });

  it("bir kez basarisiz olan url SONRADAN yuklenirse yeniden gosterilir", () => {
    // Gercek senaryo: A gecici bir hatayla (ag dalgalanmasi, imzali URL'in
    // bir anlik reddi) yuklenemiyor, kullanici B'ye geciyor, sonra A'ya
    // donuyor. A bu kez yukleniyor. Hata isareti temizlenmezse hook A'yi
    // SURESIZ reddeder ve zemin, imzali URL yenilenene kadar olu kalir —
    // cikti da gradyana duser. Yani "yanlis zemin" hatasinin yerine
    // "hic zemin yok" hatasi gecer.
    const { result, rerender } = renderHook(
      ({ url }: { url: string }) => useLoadedImage(url, { keepPrevious: true }),
      { initialProps: { url: "https://r2.example/a" } },
    );

    act(() => instanceFor("https://r2.example/a").onerror?.());
    expect(result.current).toBeNull();

    rerender({ url: "https://r2.example/b" });
    act(() => instanceFor("https://r2.example/b").onload?.());
    expect(result.current).toBe(instanceFor("https://r2.example/b"));

    // A'ya donus: yeni bir yukleme baslar ve bu kez basarili olur.
    rerender({ url: "https://r2.example/a" });
    act(() => instanceFor("https://r2.example/a").onload?.());

    expect(result.current).toBe(instanceFor("https://r2.example/a"));
  });

  it("basarisiz bir zeminden sonra yuklenebilen bir zemine gecilebilir", () => {
    const { result, rerender } = renderHook(
      ({ url }: { url: string }) => useLoadedImage(url, { keepPrevious: true }),
      { initialProps: { url: "https://r2.example/kirik" } },
    );

    act(() => instanceFor("https://r2.example/kirik").onerror?.());
    expect(result.current).toBeNull();

    rerender({ url: "https://r2.example/saglam" });
    act(() => instanceFor("https://r2.example/saglam").onload?.());
    expect(result.current).toBe(instanceFor("https://r2.example/saglam"));
  });
});
