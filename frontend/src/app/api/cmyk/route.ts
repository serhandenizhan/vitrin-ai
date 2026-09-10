/**
 * Baskiya uygun (CMYK) donusum.
 *
 * NEDEN BURADA, PYTHON BACKEND'INDE DEGIL:
 * Donusum `sharp` (libvips + littleCMS) ile yapiliyor ve `sharp` zaten
 * Next.js'in sunucu calisma zamaninda var. Boylece bu ozellik Python
 * backend'ine, veritabanina ya da yol haritasindaki hicbir faza dokunmuyor —
 * yeni bir endpoint'i Serhan'in yazmasi gerekmiyor.
 *
 * NEDEN TARAYICIDA YAPILAMIYOR:
 * Canvas yalnizca RGB uretir ve PNG formati CMYK'yi hic desteklemez. Gercek
 * bir matbaa dosyasi icin dort kanalli (C/M/Y/K) bir goruntu ve icine GOMULU
 * bir cikti profili gerekiyor; ikisi de yalnizca sunucuda mumkun.
 *
 * RENK YONETIMI:
 * Ham bir RGB->CMYK cevrimi matbaada yanlis renk verir. Donusum, hedef baski
 * kosulunun ICC profiliyle yapiliyor (`CMYK_ICC_PATH`) ve profil dosyaya
 * GOMULUYOR ki matbaa hangi kosula gore ayrildigini bilsin.
 *
 * SAYDAMLIK:
 * CMYK'nin alfa kanali yoktur. Saydam bir PNG once beyaz zemine duzlestiriliyor
 * (`flatten`); aksi halde saydam bolgeler siyaha donerdi.
 */

import { readFile } from "node:fs/promises";

import sharp from "sharp";

import {
  MAX_FILE_BYTES,
  MAX_INPUT_PIXELS,
  exceedsInputPixelLimit,
} from "@/lib/cmyk-limits";

/** Bu route her istekte calismali; onbelleklenmis bir donusum anlamsiz. */
export const dynamic = "force-dynamic";

/**
 * Hedef baski kosulunun ICC profili.
 *
 * Varsayilan yok: profil dosyasi olmadan yapilan bir "CMYK" cevrimi matbaada
 * yanlis renk verir ve bunu sessizce yapmak, ozelligi hic sunmamaktan kotudur.
 * Profil bulunamazsa istek acik bir mesajla reddediliyor.
 *
 * Uretimde depoya serbest lisansli bir profil (ornegin ECI'nin
 * ISOcoated_v2_eci.icc) konmali ya da matbaanin kendi profili verilmeli;
 * gelistirmede isletim sisteminin profili kullanilabiliyor.
 */
const ICC_PATH = process.env.CMYK_ICC_PATH;

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

const FORMATS = {
  jpeg: { extension: "jpg", mimeType: "image/jpeg" },
  tiff: { extension: "tif", mimeType: "image/tiff" },
} as const;

type FormatName = keyof typeof FORMATS;

function createErrorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function hasSupportedImageSignature(data: Uint8Array): boolean {
  const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const png =
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a;
  return jpeg || png;
}

async function readBodyWithinLimit(request: Request): Promise<Uint8Array | null> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_BYTES) {
    return null;
  }

  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FILE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function parseFormData(body: Uint8Array, contentType: string | null): Promise<FormData> {
  return new Response(new Uint8Array(body).buffer, {
    headers: contentType ? { "content-type": contentType } : undefined,
  }).formData();
}

export async function POST(request: Request): Promise<Response> {
  const body = await readBodyWithinLimit(request);
  if (!body) {
    return createErrorResponse("Dosya çok büyük.", 413);
  }

  if (!ICC_PATH) {
    return createErrorResponse(
      "Baskı profili yapılandırılmamış. Sunucuda CMYK_ICC_PATH ayarlanmalı.",
      503,
    );
  }

  // Profil dosyasi ONCE okunuyor ama iceriginin kendisi kullanilmiyor: `sharp`
  // `withIccProfile`'a bir YOL DIZGESI bekliyor, Buffer verildiginde
  // "Expected string for icc" hatasi veriyor (birebir olculdu). Okuma yalnizca
  // "dosya gercekten var mi ve okunabiliyor mu" kontrolu; yoksa donusum
  // baslamadan acik bir mesajla reddediliyor.
  try {
    await readFile(ICC_PATH);
  } catch {
    return createErrorResponse(
      "Baskı profili okunamadı. Sunucudaki CMYK_ICC_PATH geçerli bir ICC dosyasını göstermiyor.",
      503,
    );
  }

  let form: FormData;
  try {
    form = await parseFormData(body, request.headers.get("content-type"));
  } catch {
    return createErrorResponse("Geçersiz form verisi.", 400);
  }
  const file = form.get("file");
  const requestedFormat = String(form.get("format") ?? "jpeg");

  if (!(file instanceof File)) {
    return createErrorResponse("Dosya bulunamadı.", 400);
  }
  if (file.size > MAX_FILE_BYTES) {
    return createErrorResponse("Dosya çok büyük.", 413);
  }
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    return createErrorResponse("Desteklenmeyen görsel türü.", 400);
  }
  if (!(requestedFormat in FORMATS)) {
    return createErrorResponse("Desteklenmeyen biçim.", 400);
  }

  const format = FORMATS[requestedFormat as FormatName];
  const input = Buffer.from(await file.arrayBuffer());
  if (!hasSupportedImageSignature(input)) {
    return createErrorResponse("Görsel içeriği dosya türüyle uyuşmuyor.", 400);
  }

  try {
    // Metadata okunurken piksel limiti kapali: once acik bir 413 mesaji
    // verebilmek icin boyutu kendimiz denetliyoruz. Gorsel kodu cozulmuyor.
    const metadata = await sharp(input, { limitInputPixels: false }).metadata();
    if (exceedsInputPixelLimit(metadata.width, metadata.height)) {
      return createErrorResponse("Görsel piksel sınırını aşıyor.", 413);
    }
  } catch {
    return createErrorResponse("Geçersiz görsel içeriği.", 400);
  }

  try {
    const pipeline = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      // CMYK'nin alfasi yok; saydam bolgeler once beyaza duzlestiriliyor.
      .flatten({ background: "#ffffff" })
      .withIccProfile(ICC_PATH)
      .toColourspace("cmyk");

    const output =
      requestedFormat === "tiff"
        ? // TIFF matbaanin tercih ettigi bicim; LZW kayipsiz sikistirma.
          await pipeline.tiff({ compression: "lzw" }).toBuffer()
        : // JPEG daha kucuk; kalite 95, baski icin gorunur kayip birakmiyor.
          await pipeline.jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer();

    return new Response(new Uint8Array(output), {
      headers: {
        "Content-Type": format.mimeType,
        "Content-Disposition": `attachment; filename="vitrin-cmyk.${format.extension}"`,
        // Kullaniciya ozel bir cikti; ara katmanlarda onbeleklenmemeli.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[api/cmyk] dönüşüm başarısız:", error);
    return createErrorResponse("Dönüşüm başarısız oldu.", 500);
  }
}
