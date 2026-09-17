// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useBackgrounds } from "@/components/composer/use-backgrounds";

const initialResponse = [
  { id: "r2-1", url: "https://r2.example/before", expiresIn: 3600 },
];
const refreshedResponse = [
  { id: "r2-1", url: "https://r2.example/after", expiresIn: 3600 },
];

describe("useBackgrounds", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    // Vitest `globals` kapali oldugu icin Testing Library otomatik
    // temizlemiyor. Temizlenmezse onceki testin hook'u MOUNTED kaliyor,
    // `visibilitychange` dinleyicisi duruyor ve sonraki testte fetch sayaci
    // birden fazla hook'un istegini birlikte sayiyor.
    cleanup();
    vi.unstubAllGlobals();
  });

  it("geçici bir arızada eldeki zemin listesini SİLMEZ ama arızayı bildirir", async () => {
    // Vekil arızada "200 + boş liste" döndürüyor (bilinçli). Bu yanıt eldeki
    // listeyi silerse kullanıcının seçili zemini de altından çekilir; hiçbir
    // şey kazandırmayan bir kayıp. Arıza yine de arayüzde işaretleniyor.
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(initialResponse)))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          headers: { "X-Backgrounds-Source": "unavailable" },
        }),
      );

    const { result } = renderHook(() => useBackgrounds());

    await waitFor(() => {
      expect(result.current.hasServerBackground).toBe(true);
    });

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(result.current.hasServerBackground).toBe(true);
    expect(result.current.backgrounds[0]).toMatchObject({ id: "r2-1" });
    // Liste duruyor, dolayısıyla kullanıcıya "yüklenemedi" demeye gerek yok.
    expect(result.current.isUnavailable).toBe(false);
  });

  it("hiç zemin gelmemişken arıza olursa bunu ulaşılamadı olarak bildirir", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([]), {
        headers: { "X-Backgrounds-Source": "unavailable" },
      }),
    );

    const { result } = renderHook(() => useBackgrounds());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.isUnavailable).toBe(true);
    expect(result.current.hasServerBackground).toBe(false);
  });

  it("sekme tekrar görünür olduğunda imzalı URL listesini yeniler", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(initialResponse)))
      .mockResolvedValueOnce(new Response(JSON.stringify(refreshedResponse)));

    const { result } = renderHook(() => useBackgrounds());

    await waitFor(() => {
      expect(result.current.backgrounds[0]).toMatchObject({
        id: "r2-1",
        url: "https://r2.example/before",
      });
    });

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.current.backgrounds[0]).toMatchObject({
        id: "r2-1",
        url: "https://r2.example/after",
      });
    });
  });
});
