// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearStoredLogo,
  loadStoredLogo,
  loadStoredLogoSettings,
  storeLogo,
  storeLogoSettings,
} from "@/lib/logo-storage";
import { DEFAULT_LOGO } from "@/lib/overlays";

describe("logo storage", () => {
  beforeEach(() => localStorage.clear());

  it("gorseli ve kose, boyut, saydamlik ayarlarini birlikte hatirlar", () => {
    const settings = { corner: "top-left" as const, size: 0.27, opacity: 0.45, position: { x: 0.3, y: 0.7 } };

    expect(storeLogo("data:image/png;base64,AAAA", settings)).toBe(true);

    expect(loadStoredLogo()).toBe("data:image/png;base64,AAAA");
    expect(loadStoredLogoSettings()).toEqual(settings);
  });

  it("bozuk veya sinir disi ayarlari varsayilana dondurur", () => {
    localStorage.setItem(
      "vitrin-ai:logo-settings",
      JSON.stringify({ corner: "orta", size: 99, opacity: -1 }),
    );

    expect(loadStoredLogoSettings()).toEqual(DEFAULT_LOGO);
  });

  it("ayar degisikligini kaydeder ve logo kaldirilinca ikisini de temizler", () => {
    storeLogo("data:image/png;base64,AAAA", DEFAULT_LOGO);
    storeLogoSettings({ ...DEFAULT_LOGO, opacity: 0.5 });

    expect(loadStoredLogoSettings().opacity).toBe(0.5);
    clearStoredLogo();
    expect(loadStoredLogo()).toBeNull();
    expect(loadStoredLogoSettings()).toEqual(DEFAULT_LOGO);
  });
});
