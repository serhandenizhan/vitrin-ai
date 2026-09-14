/** Logo gorseliyle birlikte yerlesim ayarlarini tarayicida saklar. */

import {
  CORNERS,
  DEFAULT_LOGO,
  LOGO_OPACITY_RANGE,
  LOGO_SIZE_RANGE,
  type Corner,
  type LogoSettings,
} from "@/lib/overlays";

const LOGO_STORAGE_KEY = "vitrin-ai:logo";
const LOGO_SETTINGS_STORAGE_KEY = "vitrin-ai:logo-settings";

function isCorner(value: unknown): value is Corner {
  return CORNERS.some((corner) => corner.id === value);
}

export function loadStoredLogo(): string | null {
  try {
    const value = window.localStorage.getItem(LOGO_STORAGE_KEY);
    return value?.startsWith("data:image/") ? value : null;
  } catch {
    return null;
  }
}

export function loadStoredLogoSettings(): LogoSettings {
  try {
    const raw = window.localStorage.getItem(LOGO_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_LOGO;
    const parsed = JSON.parse(raw) as Partial<LogoSettings>;
    if (
      !isCorner(parsed.corner) ||
      typeof parsed.size !== "number" ||
      !Number.isFinite(parsed.size) ||
      parsed.size < LOGO_SIZE_RANGE.min ||
      parsed.size > LOGO_SIZE_RANGE.max ||
      typeof parsed.opacity !== "number" ||
      !Number.isFinite(parsed.opacity) ||
      parsed.opacity < LOGO_OPACITY_RANGE.min ||
      parsed.opacity > LOGO_OPACITY_RANGE.max
    ) {
      return DEFAULT_LOGO;
    }
    return { corner: parsed.corner, size: parsed.size, opacity: parsed.opacity };
  } catch {
    return DEFAULT_LOGO;
  }
}

export function storeLogo(dataUrl: string, settings: LogoSettings): boolean {
  try {
    window.localStorage.setItem(LOGO_STORAGE_KEY, dataUrl);
    window.localStorage.setItem(LOGO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function storeLogoSettings(settings: LogoSettings): boolean {
  try {
    window.localStorage.setItem(LOGO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredLogo(): void {
  try {
    window.localStorage.removeItem(LOGO_STORAGE_KEY);
    window.localStorage.removeItem(LOGO_SETTINGS_STORAGE_KEY);
  } catch {
    // Depolama kapaliysa React durumu yine temizlenir.
  }
}
