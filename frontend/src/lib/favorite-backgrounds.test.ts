// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FAVORITES_STORAGE_KEY,
  readFavoriteBackgrounds,
  toggleFavorite,
  writeFavoriteBackgrounds,
} from "@/lib/favorite-backgrounds";

describe("favori zeminler (19.09.2026)", () => {
  beforeEach(() => localStorage.clear());

  it("ekler (en başa) ve tekrar basınca çıkarır", () => {
    expect(toggleFavorite(["a"], "b")).toEqual(["b", "a"]);
    expect(toggleFavorite(["b", "a"], "b")).toEqual(["a"]);
  });

  it("yazılanı geri okur", () => {
    writeFavoriteBackgrounds(["x", "y"]);
    expect(readFavoriteBackgrounds()).toEqual(["x", "y"]);
  });

  it("bozuk kayıtta ve depolama hatasında boş liste döner, patlamaz", () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, "{bozuk");
    expect(readFavoriteBackgrounds()).toEqual([]);
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(["ok", 5, null]));
    expect(readFavoriteBackgrounds()).toEqual(["ok"]);

    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    expect(() => writeFavoriteBackgrounds(["z"])).not.toThrow();
    spy.mockRestore();
  });
});
