import { describe, expect, it } from "vitest";

import { TURKEY_CITIES, TURKEY_CITIES_SORTED } from "@/lib/turkey-cities";

describe("TURKEY_CITIES", () => {
  it("tam 81 il ve tekrar yok", () => {
    expect(TURKEY_CITIES).toHaveLength(81);
    expect(new Set(TURKEY_CITIES).size).toBe(81);
  });

  it("ilk surumdeki hatalar geri gelmiyor", () => {
    // "Ilgaz" Cankiri'nin ilcesi; "Iğdır" il.
    expect(TURKEY_CITIES).not.toContain("Ilgaz");
    expect(TURKEY_CITIES).toContain("Iğdır");
  });

  it("Turkce alfabe sirasinda gosteriliyor (Ç, C'den sonra)", () => {
    const index = (name: string) => TURKEY_CITIES_SORTED.indexOf(name as never);
    expect(index("Bursa")).toBeLessThan(index("Çanakkale"));
    expect(index("Çorum")).toBeLessThan(index("Denizli"));
  });
});
