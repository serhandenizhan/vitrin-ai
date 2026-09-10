// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
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
    vi.unstubAllGlobals();
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
