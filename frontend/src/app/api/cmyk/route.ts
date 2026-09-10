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
const ICC_YOLU = process.env.CMYK_ICC_PATH;

/** Composed gorseller birkac MB; ustu bir hata ya da kotuye kullanim isaretidir. */
const EN_BUYUK_BAYT = 30 * 1024 * 1024;

const BICIMLER = {
  jpeg: { uzanti: "jpg", tur: "image/jpeg" },
  tiff: { uzanti: "tif", tur: "image/tiff" },
} as const;

type BicimAdi = keyof typeof BICIMLER;

function hata(mesaj: string, durum: number): Response {
  return Response.json({ error: mesaj }, { status: durum });
}

export async function POST(istek: Request): Promise<Response> {
  if (!ICC_YOLU) {
    return hata(
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
    await readFile(ICC_YOLU);
  } catch {
    return hata(
      "Baskı profili okunamadı. Sunucudaki CMYK_ICC_PATH geçerli bir ICC dosyasını göstermiyor.",
      503,
    );
  }

  const form = await istek.formData();
  const dosya = form.get("file");
  const istenenBicim = String(form.get("format") ?? "jpeg");

  if (!(dosya instanceof File)) {
    return hata("Dosya bulunamadı.", 400);
  }
  if (dosya.size > EN_BUYUK_BAYT) {
    return hata("Dosya çok büyük.", 413);
  }
  if (!(istenenBicim in BICIMLER)) {
    return hata("Desteklenmeyen biçim.", 400);
  }

  const bicim = BICIMLER[istenenBicim as BicimAdi];
  const girdi = Buffer.from(await dosya.arrayBuffer());

  try {
    const boru = sharp(girdi)
      // CMYK'nin alfasi yok; saydam bolgeler once beyaza duzlestiriliyor.
      .flatten({ background: "#ffffff" })
      .withIccProfile(ICC_YOLU)
      .toColourspace("cmyk");

    const cikti =
      istenenBicim === "tiff"
        ? // TIFF matbaanin tercih ettigi bicim; LZW kayipsiz sikistirma.
          await boru.tiff({ compression: "lzw" }).toBuffer()
        : // JPEG daha kucuk; kalite 95, baski icin gorunur kayip birakmiyor.
          await boru.jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer();

    return new Response(new Uint8Array(cikti), {
      headers: {
        "Content-Type": bicim.tur,
        "Content-Disposition": `attachment; filename="vitrin-cmyk.${bicim.uzanti}"`,
        // Kullaniciya ozel bir cikti; ara katmanlarda onbeleklenmemeli.
        "Cache-Control": "no-store",
      },
    });
  } catch (sorun) {
    console.error("[api/cmyk] dönüşüm başarısız:", sorun);
    return hata("Dönüşüm başarısız oldu.", 500);
  }
}
