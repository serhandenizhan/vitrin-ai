"use client";

/**
 * Ayarlar deposu — `useSyncExternalStore` icin harici kaynak.
 *
 * Neden state + useEffect degil: ayarlar localStorage'da, yani REACT DISI bir
 * kaynakta. Bunu `useState` + efekt icinde okumak iki sorun uretiyordu:
 *  1. `react-hooks/set-state-in-effect` kurali hakli olarak sikayet ediyor —
 *     efektin govdesinde setState cagirmak zincirleme render demek.
 *  2. Sunucu ciktisi varsayilanla, ilk istemci render'i gercek degerle
 *     olusuyor; ikisi arasindaki fark hidrasyon uyusmazligi riski.
 *
 * `useSyncExternalStore` ikisini de cozuyor: sunucu anlik goruntusu her zaman
 * varsayilan, istemci anlik goruntusu gercek deger, gecisi React yonetiyor.
 *
 * Anlik goruntu ONBELLEKLENIYOR (`cachedSnapshot`): her cagrida yeni bir nesne
 * dondurmek `useSyncExternalStore`'u sonsuz donguye sokar, cunku referans
 * karsilastirmasi hep "degisti" der.
 */

const STORAGE_KEY = "vitrin-ai:settings";

export type Settings = {
  /**
   * Yeni sonuclar hesaptaki gecmise kaydedilsin mi (Faz 4'ten beri sunucuda).
   * Tercihin kendisi bu cihazda tutuluyor; hesap ayari degil.
   */
  historyEnabled: boolean;
  /** Kaydirma animasyonlarini kapat. */
  reduceMotion: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  historyEnabled: true,
  reduceMotion: false,
};

const listeners = new Set<() => void>();
let cachedSnapshot: Settings | null = null;

function read(): Settings {
  if (typeof localStorage === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      historyEnabled:
        typeof parsed.historyEnabled === "boolean"
          ? parsed.historyEnabled
          : DEFAULT_SETTINGS.historyEnabled,
      reduceMotion:
        typeof parsed.reduceMotion === "boolean"
          ? parsed.reduceMotion
          : DEFAULT_SETTINGS.reduceMotion,
    };
  } catch {
    // Bozuk ya da erisilemeyen depolama varsayilana duser; ayarlar kritik
    // degil, uygulamanin acilmasini engellememeli.
    return DEFAULT_SETTINGS;
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): Settings {
  cachedSnapshot ??= read();
  return cachedSnapshot;
}

/** Sunucuda localStorage yok; her zaman varsayilan dondurulur. */
export function getServerSnapshot(): Settings {
  return DEFAULT_SETTINGS;
}

export function updateSettings(patch: Partial<Settings>): void {
  const next = { ...getSnapshot(), ...patch };
  cachedSnapshot = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* depolama kapaliysa ayar yalnizca bu oturumda gecerli olur */
  }
  for (const listener of listeners) listener();
}
