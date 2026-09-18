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
