/**
 * Secilen fotograf icin tarayicida gosterilebilir bir onizleme adresi uretir.
 *
 * NEDEN: Chrome, Firefox ve Edge HEIC'i `<img>` ile gosteremiyor; yalnizca
 * Safari (17+) gosterebiliyor. Onceden bu durumda onizleme yerine "bu format
 * onizlenemiyor" karti cikiyordu ve iPhone kullanicisi -hedef kitlenin
 * cogunlugu- kendi fotografini ancak islendikten sonra gorebiliyordu.
 *
 * SIRA:
 *  1) HEIC degilse dogrudan `URL.createObjectURL`.
 *  2) HEIC ise once tarayicinin KENDI cozucusu deneniyor (Safari). Basarirsa
 *     ek bir sey indirilmiyor.
 *  3) Olmazsa `heic-to` (libheif'in WebAssembly derlemesi) YALNIZCA bu anda,
 *     dinamik `import()` ile yukleniyor. ~3 MB'lik bir parca; HEIC secmeyen
 *     ziyaretci onu hic indirmiyor.
 *  4) O da basarisiz olursa null: arayuz eski bilgilendirici karta donuyor.
 *     Arka plan kaldirma bundan etkilenmiyor, backend HEIC'i zaten isliyor.
 *
 * Onizleme yalnizca GOSTERIM icin. Backend'e her zaman kullanicinin ozgun
 * dosyasi gidiyor; tarayicida uretilen JPEG hicbir yere yuklenmiyor.
 *
 * LISANS: `heic-to` LGPL-3.0 (icindeki libheif'ten geliyor). Degistirilmeden,
 * ayri bir parca olarak dinamik yuklendigi icin LGPL'in "kutuphane olarak
 * kullanma" kosulu saglaniyor; ayrinti frontend/README.md'de.
 */

import { isPreviewableInBrowser } from "@/lib/upload-constraints";

export type PreviewDeps = {
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  /** Tarayicinin adresi gercekten cozebildigini dogrular. */
  canDecode: (url: string) => Promise<boolean>;
  /** HEIC'i JPEG'e cevirir. */
  convertHeic: (file: Blob) => Promise<Blob>;
};

/** Tarayicinin kendi cozucusuyle dene: `decode()` basarisizsa gosteremiyor. */
async function canDecodeNatively(url: string): Promise<boolean> {
  const image = new window.Image();
  image.src = url;
  try {
    await image.decode();
    return image.naturalWidth > 0;
  } catch {
    return false;
  }
}

async function convertWithHeicTo(file: Blob): Promise<Blob> {
  // `heic-to/next` Next.js'in sunucu derlemesinde `self`/`window`a
  // dokunmayan surumu; yine de yalnizca istemcide cagriliyor.
  const { heicTo } = await import("heic-to/next");
  return heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
}

const browserDeps: PreviewDeps = {
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  canDecode: canDecodeNatively,
  convertHeic: convertWithHeicTo,
};

export async function createPreviewUrl(
  file: File,
  deps: PreviewDeps = browserDeps,
): Promise<string | null> {
  if (isPreviewableInBrowser(file)) return deps.createObjectUrl(file);

  const nativeUrl = deps.createObjectUrl(file);
  if (await deps.canDecode(nativeUrl)) return nativeUrl;
  deps.revokeObjectUrl(nativeUrl);

  try {
    return deps.createObjectUrl(await deps.convertHeic(file));
  } catch {
    return null;
  }
}
