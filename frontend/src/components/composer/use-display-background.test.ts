// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  displayCopySize,
  useDisplayBackground,
} from "@/components/composer/use-display-background";

/**
 * jsdom'da `createImageBitmap` yok; sahtesi her çağrıyı bekleyen bir söz
 * olarak tutuyor ve kopyanın ne zaman hazır olacağını (ya da üretilemeyeceğini)
 * testin kendisi belirliyor.
 */
type Pending = {
  source: HTMLImageElement;
  resolve: (bitmap: unknown) => void;
  reject: (error: unknown) => void;
};
let pending: Pending[] = [];

function zemin(name: string, width = 3508, height = 2480) {
  return { name, width, height } as unknown as HTMLImageElement;
}

/**
 * Kopya isteği `fetch` reddinden SONRA (birkaç mikro görev turu) geliyor;
 * tek bir tura güvenilmez (ders 27), istek gelene kadar beklenir.
 */
function pendingFor(source: HTMLImageElement): Promise<Pending> {
  return vi.waitFor(() => {
    const found = pending.filter((p) => p.source === source).at(-1);
    if (!found) throw new Error("Bu zemin için kopya istenmedi.");
    return found;
  });
}

beforeEach(() => {
  pending = [];
  // Varsayılan: blob yolu kullanılamıyor (ağ/CORS), yüklü görselden kopya üretilir.
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("ag yok"))));
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(
      (source: HTMLImageElement) =>
        new Promise((resolve, reject) => pending.push({ source, resolve, reject })),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// A4 yatay mantıksal ölçü ve ~500 px'lik tuvalin dpr 2 piksel ölçüsü.
const STAGE = { width: 1000, height: 707 };
const PIXELS = { width: 1000, height: 707 };

function render(initial: HTMLImageElement | null, enabled = true) {
  return renderHook(
    ({ source, stage, on }: { source: HTMLImageElement | null; stage: typeof STAGE; on: boolean }) =>
      useDisplayBackground(source, stage.width, stage.height, PIXELS.width, PIXELS.height, on),
    { initialProps: { source: initial, stage: STAGE, on: enabled } },
  );
}

describe("displayCopySize", () => {
  it("kırpılan bölge tuvalin piksel ölçüsünden büyükse o ölçüde kopya ister", () => {
    expect(displayCopySize({ width: 3508, height: 2480 }, 999.4, 706.2)).toEqual({
      width: 1000,
      height: 707,
    });
  });

  it("küçültmenin kazancı yoksa kopya istemez (tam görsel çizilir)", () => {
    expect(displayCopySize({ width: 800, height: 600 }, 1000, 750)).toBeNull();
    expect(displayCopySize({ width: 3508, height: 2480 }, 0, 0)).toBeNull();
  });
});

describe("useDisplayBackground — ekranda küçük kopya, hatada tam görsel (K1)", () => {
  it("kopya hazır olana kadar tam görseli, sonra küçük kopyayı çizer", async () => {
    const first = zemin("ilk");
    const { result } = render(first);

    expect(result.current?.image).toBe(first);

    const bitmap = { name: "ilk-kopya" };
    await act(async () => (await pendingFor(first)).resolve(bitmap));

    expect(result.current?.image).toBe(bitmap);
    expect(result.current?.source).toBe(first);
    expect(result.current?.crop).toEqual({ x: 0, y: 0, width: 1000, height: 707 });
  });

  it("yeni zeminin kopyası hazırlanırken önceki kopya kalır, hazır olunca yenisine geçer", async () => {
    const first = zemin("ilk");
    const second = zemin("ikinci");
    const { result, rerender } = render(first);
    const firstCopy = { name: "ilk-kopya" };
    await act(async () => (await pendingFor(first)).resolve(firstCopy));

    rerender({ source: second, stage: STAGE, on: true });
    // Ekran kararmasın: önceki zemin kısa süre durur (dosyaya giren seçili zemin,
    // bkz. swapToExportBackground testleri).
    expect(result.current?.image).toBe(firstCopy);

    const secondCopy = { name: "ikinci-kopya" };
    await act(async () => (await pendingFor(second)).resolve(secondCopy));
    expect(result.current?.image).toBe(secondCopy);
    expect(result.current?.source).toBe(second);
  });

  it("yeni zeminin kopyası ÜRETİLEMEZSE önceki zemin süresiz kalmaz, tam görsele düşer (ders 23)", async () => {
    const first = zemin("ilk");
    const second = zemin("ikinci");
    const { result, rerender } = render(first);
    await act(async () => (await pendingFor(first)).resolve({ name: "ilk-kopya" }));

    // createImageBitmap reddedince tuval yoluna düşülür; jsdom'da 2B tuval yok,
    // o da başarısız olur — yani kopya hiç üretilemez.
    rerender({ source: second, stage: STAGE, on: true });
    await act(async () => (await pendingFor(second)).reject(new Error("desteklenmiyor")));

    expect(result.current?.image).toBe(second);
    expect(result.current?.source).toBe(second);
  });

  it("biçim değişince eski orandaki kopyayı esnetmez, yenisi gelene kadar tam görseli çizer", async () => {
    const first = zemin("ilk");
    const { result, rerender } = render(first);
    await act(async () => (await pendingFor(first)).resolve({ name: "yatay-kopya" }));

    rerender({ source: first, stage: { width: 707, height: 1000 }, on: true });

    expect(result.current?.image).toBe(first);
  });

  it("görseli BLOB olarak çözer (ana iş parçacığında değil); kırpma ve küçültme aynı", async () => {
    const blob = { name: "zemin-blob" };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(blob) })),
    );
    const bitmapCalls: unknown[][] = [];
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn((...args: unknown[]) => {
        bitmapCalls.push(args);
        return Promise.resolve({ name: "blob-kopya" });
      }),
    );
    const first = Object.assign(zemin("ilk"), { src: "https://r2.example/zemin.jpg" });
    const { result } = render(first);

    await act(async () => {});

    expect(fetch).toHaveBeenCalledWith("https://r2.example/zemin.jpg", { mode: "cors", credentials: "omit" });
    expect(bitmapCalls).toHaveLength(1);
    const [kaynak, , , , , secenek] = bitmapCalls[0];
    expect(kaynak).toBe(blob);
    expect(secenek).toMatchObject({ resizeWidth: 1000, resizeHeight: 707, resizeQuality: "high" });
    expect(result.current?.image).toEqual({ name: "blob-kopya" });
  });

  it("kapalıyken (çoklu boyut dışa aktarıcısı) hiç kopya üretmez", () => {
    const first = zemin("ilk");
    const { result } = render(first, false);

    expect(result.current?.image).toBe(first);
    expect(pending).toHaveLength(0);
  });

  it("zemin yokken (gradyan ya da yüklenemedi) hiçbir şey döndürmez", () => {
    const { result } = render(null);
    expect(result.current).toBeNull();
  });
});
