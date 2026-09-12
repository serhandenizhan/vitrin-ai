import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "@/lib/safe-redirect";

describe("safeRedirectPath", () => {
  it("site ici yollari oldugu gibi kabul ediyor", () => {
    expect(safeRedirectPath("/katalog")).toBe("/katalog");
    expect(safeRedirectPath("/paketler?plan=atolye#sss")).toBe(
      "/paketler?plan=atolye#sss",
    );
  });

  it("bos degerde varsayilana donuyor", () => {
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath("", "/katalog")).toBe("/katalog");
  });

  it.each([
    "https://sahte-site.com",
    "//sahte-site.com",
    "/\\sahte-site.com",
    "javascript:alert(1)",
    "katalog",
    "/\t/sahte-site.com",
    "/\n/sahte-site.com",
  ])("dis adrese yonlendirmeyi reddediyor: %j", (next) => {
    expect(safeRedirectPath(next)).toBe("/");
  });
});
