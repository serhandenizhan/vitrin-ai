/**
 * Yuklenen logoyu tarayicida saklanabilir hale getirir — studyo ve katalogun
 * ORTAK yolu (17.09.2026'da katalog da logo istedi).
 *
 * En fazla `LOGO_STORAGE_MAX_EDGE` px'e kucultup PNG veri URL'ine ceviriyor:
 * localStorage kotasi (~5 MB) birkac MB'lik bir logoyla dolmasin, saydamlik
 * korunsun. Veri URL'i ayni kaynak sayildigi icin tuvali kirletmiyor.
 */
import { LOGO_STORAGE_MAX_EDGE } from "@/lib/overlays";

export async function prepareLogo(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LOGO_STORAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Tuval kullanılamıyor.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/png");
}

/**
 * Logonun renklerini ters cevirir: beyaz siyah, siyah beyaz olur (Kaan,
 * 17.09.2026). Saydamlik (alfa) korunuyor; saydam PNG logonun zemini
 * saydam kaliyor. Islem kendi tersi: iki kez uygulamak asil logoyu verir.
 */
export function invertLogo(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Tuval kullanılamıyor."));
        return;
      }
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      invertPixels(pixels.data);
      context.putImageData(pixels, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("Logo okunamadı."));
    image.src = dataUrl;
  });
}

/** RGBA dizisinde renk kanallarini ters cevirir, alfaya dokunmaz. */
export function invertPixels(data: Uint8ClampedArray): void {
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 255 - data[index];
    data[index + 1] = 255 - data[index + 1];
    data[index + 2] = 255 - data[index + 2];
  }
}
