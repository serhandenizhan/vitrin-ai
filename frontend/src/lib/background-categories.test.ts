import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/background-catalog", () => ({
  BACKGROUND_CATALOG: {
    "zemin-luks": { category: "luks" },
    "zemin-uyari": { category: "dogal", printWarning: true },
    "zemin-bozuk": { category: "olmayan-kategori" },
    "zemin-dikey": { category: "luks", orientation: "portrait" },
    "zemin-yatay": { category: "dogal", orientation: "landscape" },
    "zemin-sade-yatay": { category: "sade", orientation: "landscape" },
  },
}));

import {
  BACKGROUND_CATEGORIES,
  backgroundCategory,
  fitsOrientation,
  needsPrintWarning,
} from "@/lib/background-categories";

describe("fitsOrientation — zemin biçimin yönüne uyuyor mu", () => {
  it("fotoğraf/desenli zemin yalnızca kendi yönündeki biçimde", () => {
    expect(fitsOrientation("zemin-dikey", "portrait")).toBe(true);
    expect(fitsOrientation("zemin-dikey", "landscape")).toBe(false);
    expect(fitsOrientation("zemin-yatay", "portrait")).toBe(false);
  });

  it("Sade (düz renk, degrade) her biçimde — Kaan'ın kararı", () => {
    expect(fitsOrientation("zemin-sade-yatay", "portrait")).toBe(true);
    expect(fitsOrientation("placeholder-white", "portrait")).toBe(true);
  });

  it("yönü bilinmeyen ya da katalogda olmayan zemin kaybolmuyor", () => {
    expect(fitsOrientation("zemin-luks", "portrait")).toBe(true);
    expect(fitsOrientation("sonradan-yuklenen", "landscape")).toBe(true);
  });
});

describe("zemin kategorileri", () => {
  it("dort kategori, Sade ilk sirada", () => {
    expect(BACKGROUND_CATEGORIES.map((category) => category.label)).toEqual([
      "Sade",
      "Desen",
      "Doğal",
      "Lüks",
    ]);
  });

  it("katalogdaki kategoriyi dondurur", () => {
    expect(backgroundCategory("zemin-luks")).toBe("luks");
  });

  it("katalogda olmayan zemin ve yer tutucular Sade sayilir, listeden kaybolmaz", () => {
    expect(backgroundCategory("placeholder-white")).toBe("sade");
    expect(backgroundCategory("sonradan-yuklenen")).toBe("sade");
  });

  it("gecersiz kategori yazilmissa Sade'ye duser", () => {
    expect(backgroundCategory("zemin-bozuk")).toBe("sade");
  });

  it("baski uyarisi yalnizca isaretli zeminde", () => {
    expect(needsPrintWarning("zemin-uyari")).toBe(true);
    expect(needsPrintWarning("zemin-luks")).toBe(false);
    expect(needsPrintWarning("placeholder-white")).toBe(false);
  });
});

describe("compareBackgroundOrder — düzden karmaşığa (19.09.2026)", () => {
  it("yer tutucular başta, sıra dosyasındakiler sırasıyla, bilinmeyen sonda", async () => {
    const { compareBackgroundOrder } = await import("@/lib/background-categories");
    const { BACKGROUND_ORDER } = await import("@/lib/background-order");
    const [first, second] = BACKGROUND_ORDER;
    const ids = ["yeni-yuklenen", second, "placeholder-white", first];
    expect([...ids].sort(compareBackgroundOrder)).toEqual(["placeholder-white", first, second, "yeni-yuklenen"]);
  });
});
