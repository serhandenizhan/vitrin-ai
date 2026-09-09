/**
 * Kaynak urun fotografini web icin hazirlar.
 *
 * Girdi: photo-source/urun-foto.jpg
 *   Kullanicinin sagladigi tek kare; solda atolye tezgahinda kolye, sagda
 *   ayni kolye vitrin standinda. 2816x1536, ~3.6 MB.
 *
 * Cikti: iki yariya bolunmus, kucultulmus ve WebP'ye cevrilmis dosyalar.
 *
 * Neden bu betik var:
 *  - 3.6 MB'lik bir JPEG'i sayfaya koymak kabul edilemez. `next/image` sunum
 *    tarafinda optimize ediyor ama KAYNAK dosya yine de depoda duruyor ve
 *    her klonda iniyor.
 *  - Iki yariyi CSS ile kirpmak yerine gercekten bolmek, tarayicinin
 *    yalnizca ihtiyaci olan pikselleri indirmesini sagliyor.
 *  - Islem betikle yapiliyor ki kaynak degistiginde tek komutla yeniden
 *    uretilebilsin (bkz. CLAUDE.md ders 11: yol yok, komut var).
 *
 * KAYNAK DOSYA "public" DIZININ DISINDA (photo-source/). Ilk denemede
 * public/photos/_kaynak/ altindaydi ve bu, 3.6 MB'lik ham JPEG'in oldugu gibi
 * YAYINLANMASI demekti: Next.js "public" altindaki her seyi sunuyor ve
 * dagitima dahil ediyor. Kimse o adresi bilmese de dosya sunucuda duruyor ve
 * her dagitima biniyor.
 *
 * `sharp` Next.js ile birlikte zaten kurulu; ek bagimlilik eklenmedi.
 *
 * Calistirmak icin:
 *     node scripts/prepare-photos.mjs
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, stat } from "node:fs/promises";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE = path.join(ROOT, "photo-source", "urun-foto.jpg");
const OUT_DIR = path.join(ROOT, "public", "photos");

/**
 * Ciktilarin hedef genisligi.
 *
 * Olculdu: acilistaki iki panel masaustunde her biri ~384 CSS px kapliyor.
 * 2x retina icin 768 px yetiyor, 900 pay birakiyor. Ilk denemede 1400 px
 * secilmisti ve atolye karesi 532 KB'a cikmisti — ahsap damari ve talas
 * dokusu cok detayli oldugu icin sikismiyor. Ekranda hic kullanilmayan
 * cozunurluk icin odenen bayt bu.
 */
const TARGET_WIDTH = 900;

/** WebP kalitesi. 78, mucevher detayinda gozle ayirt edilemeyen bir kayipla
 *  dosyayi belirgin sekilde kucultuyor. */
const QUALITY = 78;

async function main() {
  const image = sharp(SOURCE);
  const { width, height } = await image.metadata();
  if (!width || !height) throw new Error("Kaynak görselin ölçüleri okunamadı.");

  const half = Math.floor(width / 2);
  await mkdir(OUT_DIR, { recursive: true });

  const parcalar = [
    // Sol yari: atolye tezgahi — dagınık, gercek bir cekim ortami.
    { ad: "atolye", left: 0 },
    // Sag yari: vitrin standi — temiz, satisa hazir sunum.
    { ad: "vitrin", left: half },
  ];

  for (const { ad, left } of parcalar) {
    const hedef = path.join(OUT_DIR, `${ad}.webp`);
    await sharp(SOURCE)
      .extract({ left, top: 0, width: half, height })
      .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(hedef);

    const { size } = await stat(hedef);
    console.log(
      `yazildi: public/photos/${ad}.webp (${Math.round(
        (TARGET_WIDTH / half) * 100,
      )}% olcek, ${(size / 1024).toFixed(0)} KB)`,
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
