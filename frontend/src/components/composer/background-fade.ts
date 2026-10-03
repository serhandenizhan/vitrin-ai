/**
 * Zeminler arası çapraz geçişin adları ve "geçişi anında bitir" yardımcısı.
 *
 * Ayrı modülde, çünkü `composition-editor.tsx` bunu dışa aktarmadan önce
 * çağırıyor ve o dosya `editor-stage.tsx`'i bilinçli olarak `next/dynamic`
 * ile (sunucuda Konva yüklenmesin diye) alıyor. Konva burada yalnızca TİP
 * olarak geçiyor; statik içe aktarma sunucu derlemesini bozmuyor.
 */

import type Konva from "konva";

export const BACKGROUND_FADE_GHOST = "background-fade-previous";
export const BACKGROUND_FADE_CURRENT = "background-current";

/**
 * Süren bir zemin geçişini ANINDA bitirir: eski zemin kalkar, yenisi tam
 * görünür olur. Dışa aktarmadan önce çağrılır ki dosyaya iki zeminin karışımı
 * girmesin — seçili olmayan bir zeminle dosya indirmek ders 23'teki "yanlış
 * çıktı" hatasının aynısı olurdu.
 */
export function finishBackgroundFade(stage: Konva.Stage) {
  stage.find("." + BACKGROUND_FADE_GHOST).forEach((node) => node.destroy());
  stage.find("." + BACKGROUND_FADE_CURRENT).forEach((node) => node.opacity(1));
}

/**
 * Zemin düğümünde saklanan TAM ÇÖZÜNÜRLÜKLÜ seçili zemin ve kırpması.
 *
 * Ekranda zeminin küçültülmüş kopyası çizilir (use-display-background.ts);
 * dosyaya ise her zaman bu tam görsel girmeli. Düğüm özniteliği olarak
 * duruyor çünkü dışa aktarma (`renderStage`) sahneye yalnız Konva üzerinden
 * erişiyor.
 */
export const EXPORT_IMAGE_ATTR = "exportImage";
export const EXPORT_CROP_ATTR = "exportCrop";

/**
 * Zemin düğümlerini dışa aktarma için tam çözünürlüklü seçili zemine geçirir;
 * dönen fonksiyon ekran kopyasına geri döndürür (`finally` içinde çağrılır).
 *
 * Seçili zeminin küçük kopyası henüz hazır değilken ekranda ÖNCEKİ zeminin
 * kopyası durabiliyor; buradaki geçiş bu durumda da dosyaya SEÇİLİ zemini
 * sokar (ders 23).
 */
export function swapToExportBackground(stage: Konva.Stage): () => void {
  const restores = stage.find("." + BACKGROUND_FADE_CURRENT).map((node) => {
    const full = node.getAttr(EXPORT_IMAGE_ATTR) as CanvasImageSource | undefined;
    const fullCrop = node.getAttr(EXPORT_CROP_ATTR) as { x: number; y: number; width: number; height: number } | undefined;
    if (!full || !fullCrop) return () => {};
    const image = node as Konva.Image;
    const shown = image.image();
    const shownCrop = image.crop();
    image.image(full);
    image.crop(fullCrop);
    return () => {
      image.image(shown);
      image.crop(shownCrop);
    };
  });
  return () => restores.forEach((restore) => restore());
}
