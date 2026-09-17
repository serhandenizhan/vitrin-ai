/**
 * Hazir gorunum ayarlari (17.09.2026, Serhan).
 *
 * NEDEN: gorunum kaydiraclari (parlaklik/kontrast/doygunluk) denetcide kaliyor
 * ama kuyumcunun her fotografta ucunu birden cevirmesi gerekmiyor — sik
 * kullanilan birkac bilesim bir dokunusla uygulanabilmeli. Ince ayar yine
 * kaydiraclarda; bunlar onun yerine gecmiyor, baslangic noktasi veriyor.
 *
 * Degerler `Appearance` tipinin KENDI araliklarinda (Konva'nin bekledigi
 * araliklar, bkz. lib/composition.ts) ve arayuzdeki kaydiracin sinirlarinin
 * icinde: parlaklik ±0.3, kontrast ±40, doygunluk ±1. Sinirin disina cikan bir
 * on ayar, uygulandiktan sonra kaydiracta baska bir deger gosterirdi.
 */

import { DEFAULT_APPEARANCE, type Appearance } from "@/lib/composition";

/** Bir on ayarin dokundugu alanlar. Golge/yansima BILINCLI olarak disarida:
 *  ikisi de dock'ta ayri anahtar ve bir on ayarin onlari sessizce acmasi,
 *  kullanicinin kendi actigi/kapattigi seyi geri almak olurdu. */
export type AppearancePreset = {
  id: string;
  label: string;
  values: Pick<Appearance, "brightness" | "contrast" | "saturation">;
};

export const APPEARANCE_PRESETS: readonly AppearancePreset[] = [
  {
    id: "dogal",
    label: "Doğal",
    values: { brightness: 0, contrast: 0, saturation: 0 },
  },
  {
    id: "parlak",
    label: "Parlak",
    values: { brightness: 0.08, contrast: 8, saturation: 0 },
  },
  {
    id: "sicak",
    label: "Sıcak",
    values: { brightness: 0.04, contrast: 4, saturation: 0.18 },
  },
  {
    id: "net",
    label: "Net",
    values: { brightness: 0, contrast: 22, saturation: 0.06 },
  },
  {
    id: "yumusak",
    label: "Yumuşak",
    values: { brightness: 0.05, contrast: -14, saturation: -0.1 },
  },
] as const;

/**
 * Su anki gorunume TAM olarak uyan on ayar, yoksa null.
 *
 * Neden esitlik: kullanici kaydiraci elle oynattiginda secili on ayar isareti
 * KALKMALI. Aksi halde arayuz "Parlak" diyor ama degerler baska bir sey
 * oluyordu — ekranin soyledigi ile dosyanin icindekinin ayrismasi, bu depoda
 * tekrar eden hata sinifi (bkz. kok CLAUDE.md ders 23).
 */
export function matchingPreset(appearance: Appearance): AppearancePreset | null {
  return (
    APPEARANCE_PRESETS.find(
      (preset) =>
        preset.values.brightness === appearance.brightness &&
        preset.values.contrast === appearance.contrast &&
        preset.values.saturation === appearance.saturation,
    ) ?? null
  );
}

/** On ayari uygular; golge/yansima gibi kullanicinin kendi kararlari korunur. */
export function applyPreset(current: Appearance, preset: AppearancePreset): Appearance {
  return { ...current, ...preset.values };
}

/** On ayarlarin hicbiri secili degilken "Doğal"a donmek icin. */
export const NEUTRAL_APPEARANCE = DEFAULT_APPEARANCE;
