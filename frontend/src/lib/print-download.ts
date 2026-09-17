/**
 * Baskiya uygun (CMYK) indirme — studyo ve katalogun ORTAK akisi.
 *
 * Tarayici CMYK uretemiyor (canvas yalnizca RGB, PNG CMYK'yi desteklemiyor);
 * cizilmis gorsel sunucuya gidiyor ve hedef baski kosulunun ICC profiliyle
 * donusturuluyor (bkz. app/api/cmyk/route.ts). 17.09.2026'da katalog da CMYK
 * istedi; iki yerde ayri yazilsaydi hata mesajlari ve dosya adlari ayrisirdi.
 */

export type PrintFormat = "jpeg" | "tiff";

export type PrintResult = { ok: true } | { ok: false; error: string };

/** PNG veri URL'ini CMYK dosyasina cevirip indirir. Hicbir kosulda firlatmaz. */
export async function downloadCmyk(
  pngDataUrl: string,
  printFormat: PrintFormat,
  fileBaseName: string,
): Promise<PrintResult> {
  try {
    const body = new FormData();
    body.append("file", await (await fetch(pngDataUrl)).blob(), "sahne.png");
    body.append("format", printFormat);

    const response = await fetch("/api/cmyk", { method: "POST", body });
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: errorBody?.error ?? "Dönüşüm başarısız oldu." };
    }

    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileBaseName}-cmyk.${printFormat === "tiff" ? "tif" : "jpg"}`;
    link.click();
    // Iptal GECIKTIRILIYOR: `click()`'ten hemen sonra iptal etmek, tarayici
    // blob'u okumaya baslamadan URL'i gecersiz kilip indirmeyi sessizce
    // bozabiliyor.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { ok: true };
  } catch {
    return { ok: false, error: "Sunucuya ulaşılamadı." };
  }
}
