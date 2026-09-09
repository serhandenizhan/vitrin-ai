/**
 * Yukleme kisitlari — backend ile ELLE senkron tutulur.
 *
 * Kaynak: backend/app/core/config.py (`Settings.max_file_size_mb`,
 * `Settings.allowed_content_types`). Biri degisirse digeri de guncellenmeli;
 * kok CLAUDE.md bunu acik bir kural olarak listeliyor.
 *
 * Neden istemcide de dogruluyoruz: kullaniciya 20 MB'lik bir dosyayi bosuna
 * yukletmemek icin. Backend yine de son sozu soyleyen taraftir — buradaki
 * kontroller yalnizca kullanici deneyimi icin, guvenlik siniri degil.
 */

export const MAX_FILE_SIZE_MB = 20;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/**
 * Uzantidan MIME turune esleme.
 *
 * Windows'ta tarayici .heic dosyalari icin cogu zaman bos bir content-type ya
 * da "application/octet-stream" bildiriyor — isletim sisteminde kayitli bir
 * tur olmadigi icin. Backend ise beyan edilen content-type'in izin verilen
 * kumede olmasini sart kosuyor (bkz. backend/app/validation/upload.py), yani
 * tarayicinin bos biraktigi turu vekil katmaninda duzeltmemiz gerekiyor.
 */
export const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

/** Dosya secme diyalogunda gosterilecek turler ve uzantilar. */
export const ACCEPT_ATTRIBUTE = [
  ...ALLOWED_CONTENT_TYPES,
  ...Object.keys(EXTENSION_CONTENT_TYPES).map((extension) => `.${extension}`),
].join(",");

/** Dosya adindan uzantiyi kucuk harfle dondurur. */
export function getExtension(fileName: string): string {
  const match = /\.([^.]+)$/.exec(fileName);
  return match ? match[1].toLowerCase() : "";
}

/**
 * Dosyanin gercek turunu belirler: once tarayicinin bildirdigi tur, o
 * taninmiyorsa uzanti. Tanimlanamazsa null.
 */
export function resolveContentType(file: {
  name: string;
  type: string;
}): string | null {
  if ((ALLOWED_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    return file.type;
  }
  return EXTENSION_CONTENT_TYPES[getExtension(file.name)] ?? null;
}

/**
 * Tarayicilarin cogu HEIC goruntuleyemiyor — onizleme yerine bilgilendirici
 * bir kart gosteriyoruz. Backend HEIC'i sorunsuz isliyor.
 */
export function isPreviewableInBrowser(file: {
  name: string;
  type: string;
}): boolean {
  const contentType = resolveContentType(file);
  return contentType !== "image/heic" && contentType !== "image/heif";
}

export type ValidationError = { message: string };

/** Dosyayi istemci tarafinda dogrula; sorun yoksa null doner. */
export function validateFile(file: File): ValidationError | null {
  if (!resolveContentType(file)) {
    return {
      message:
        "Desteklenmeyen dosya türü. JPEG, PNG, WebP veya HEIC bir fotoğraf seçin.",
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      message: `Dosya çok büyük (${formatBytes(file.size)}). En fazla ${MAX_FILE_SIZE_MB} MB olabilir.`,
    };
  }

  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
