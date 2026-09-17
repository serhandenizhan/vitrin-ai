"use client";

/**
 * Logo durumu: yukleme, renk cevirme, ayar guncelleme, kaldirma.
 *
 * Studyo (`composer/composition-editor.tsx`) ve katalog
 * (`catalog/catalog-editor.tsx`) ayni logoyu ayni yerde saklıyor
 * (`lib/logo-storage.ts`): studyoda yuklenen logo katalogda da hazir geliyor.
 * Bu akisin tamami iki bilesende ayri ayri yaziliydı ve ayni hata mesajlari,
 * ayni saklama cagrilari iki kez duruyordu — biri degistiginde diğerinin
 * sessizce ayrisma riski de buna dahil (PR #18 incelemesi). Hook yalnizca
 * DURUMU tasiyor; yerlesim geometrisi cagiranda kaliyor, cunku studyo sahne
 * koordinati (1000x1000), katalog ise sayfa oranlari kullaniyor.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { invertLogo, prepareLogo } from "@/lib/logo-image";
import {
  clearStoredLogo,
  loadStoredLogo,
  loadStoredLogoSettings,
  storeLogo,
  storeLogoSettings,
} from "@/lib/logo-storage";
import {
  DEFAULT_LOGO,
  type LogoSettings,
  logoBox,
  logoFileProblem,
} from "@/lib/overlays";

const NOT_PERSISTED = "Logo bu oturumda kullanılabilir ama tarayıcıda saklanamadı.";

export type LogoState = {
  logoUrl: string | null;
  settings: LogoSettings;
  /** Kullaniciya gosterilecek son uyari; sorun yoksa `null`. */
  message: string | null;
  handleFile: (file: File) => Promise<void>;
  invert: () => Promise<void>;
  update: (patch: Partial<LogoSettings>) => void;
  remove: () => void;
};

export function useLogo(): LogoState {
  // Sunucuda `window` yok; ilk deger istemcide ilk render'da okunuyor.
  const [logoUrl, setLogoUrl] = useState<string | null>(() =>
    typeof window === "undefined" ? null : loadStoredLogo(),
  );
  const [settings, setSettings] = useState<LogoSettings>(() =>
    typeof window === "undefined" ? DEFAULT_LOGO : loadStoredLogoSettings(),
  );
  const [message, setMessage] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      const problem = logoFileProblem(file);
      if (problem) {
        setMessage(problem);
        return;
      }
      try {
        const dataUrl = await prepareLogo(file);
        setLogoUrl(dataUrl);
        setMessage(storeLogo(dataUrl, settings) ? null : NOT_PERSISTED);
      } catch {
        setMessage("Logo okunamadı. Başka bir dosya deneyin.");
      }
    },
    [settings],
  );

  /** Beyaz logo siyah, siyah logo beyaz olur; tekrar basmak geri alir. */
  const invert = useCallback(async () => {
    if (!logoUrl) return;
    try {
      const inverted = await invertLogo(logoUrl);
      setLogoUrl(inverted);
      setMessage(storeLogo(inverted, settings) ? null : NOT_PERSISTED);
    } catch {
      setMessage("Logonun renkleri çevrilemedi.");
    }
  }, [logoUrl, settings]);

  const update = useCallback((patch: Partial<LogoSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      storeLogoSettings(next);
      return next;
    });
  }, []);

  const remove = useCallback(() => {
    setLogoUrl(null);
    setSettings(DEFAULT_LOGO);
    clearStoredLogo();
    setMessage(null);
  }, []);

  return { logoUrl, settings, message, handleFile, invert, update, remove };
}

export type LogoPreview = {
  url: string;
  opacity: number;
  /** Sayfa oranlarina (0-1) normalize edilmis kutu. */
  box: { x: number; y: number; width: number; height: number };
};

/**
 * Logonun sayfa uzerindeki ORANSAL kutusu.
 *
 * Logonun dogal olculeri gerekiyor ve olcu, geldigi URL'le birlikte tutuluyor
 * ki logo degisince eskisinin olcusu kullanilmasin. Oranlar (0-1) donuyor:
 * katalog sayfasi ekranda farkli boyutlarda ciziliyor ve mutlak piksel
 * dondurmek her cagirani yeniden olceklemeye zorlardi.
 *
 * Studyo bu hook'u kullanmiyor: orada kutu, sahnenin kendi sabit koordinat
 * sisteminde (1000x1000) Konva tarafinda hesaplaniyor.
 */
export function useLogoBox(
  logoUrl: string | null,
  settings: LogoSettings,
  pageWidth: number,
  pageHeight: number,
): LogoPreview | null {
  const [size, setSize] = useState<{ url: string; width: number; height: number } | null>(
    null,
  );

  useEffect(() => {
    if (!logoUrl) return;
    const image = new window.Image();
    image.onload = () =>
      setSize({ url: logoUrl, width: image.width, height: image.height });
    image.src = logoUrl;
  }, [logoUrl]);

  return useMemo(() => {
    if (!logoUrl || size?.url !== logoUrl) return null;
    const box = logoBox(size.width, size.height, settings, pageWidth, pageHeight);
    return {
      url: logoUrl,
      opacity: settings.opacity,
      box: {
        x: box.x / pageWidth,
        y: box.y / pageHeight,
        width: box.width / pageWidth,
        height: box.height / pageHeight,
      },
    };
  }, [logoUrl, size, settings, pageWidth, pageHeight]);
}
