/**
 * Tanitim gorsellerini uretir: `photo-source/urun-foto.jpg` -> uygulama turunda
 * kullanilan kesim ve kompozisyon kareleri.
 *
 * NEDEN BOYLE: turdaki "kesim" ve "vitrin" kareleri, stok fotograf ya da elle
 * hazirlanmis birer gorsel DEGIL — ARACIN KENDI CIKTISI. Kesim, calisan
 * backend'e kendi urun fotografimiz gonderilerek uretiliyor. Yani sayfada
 * gosterilen sonuc, kullanicinin alacagi sonucun ta kendisi; abartma ya da
 * "temsili gorsel" yok.
 *
 * Kaynak fotograf `photo-source/` altinda (public/ DEGIL — oradaki her dosya
 * internete acik, ham 3.6 MB'lik orijinali yayinlamiyoruz).
 *
 * Kullanim (backend :8000'de ayakta olmali):
 *   node scripts/prepare-showcase.mjs
 *
 * Uretilenler:
 *   public/showcase/kesim.webp      — saydam zeminli kesim
 *   public/showcase/vitrin.webp     — kesim, altin zemin uzerine yerlestirilmis
 */

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

// Yollar repo koku yerine BU DOSYAYA gore turetiliyor: betik hangi dizinden
// calistirilirsa calistirilsin ayni sonucu versin (bkz. kok CLAUDE.md ders 11).
const BURASI = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.join(BURASI, "..");

/*
 * Kaynak, ham `photo-source/urun-foto.jpg` DEGIL, ondan turetilmis vitrin
 * karesi (`prepare-photos.mjs` uretiyor).
 *
 * Sebep olculdu: ham fotografta urunun yaninda kuyumcu testeresi ve serbest
 * bir zincir de var. BiRefNet "salient object" segmentasyonu yaptigi icin
 * onlari da koruyor ve kesimde havada duran bir testere kaliyor — bu, kok
 * CLAUDE.md'de kayitli bilinen sinirlama ("karede urunden baska belirgin nesne
 * olmamali"). Tek konulu kare kullanildiginda sonuc temiz.
 */
const KAYNAK = path.join(FRONTEND, "public", "photos", "vitrin.webp");
const CIKTI_DIZINI = path.join(FRONTEND, "public", "showcase");

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

/** Kart olculeri; turdaki kartlar 3/4 oraninda. */
const GENISLIK = 900;
const YUKSEKLIK = 1200;
const KALITE = 80;

/** Ilk istek modeli bellege yukledigi icin uzun surebiliyor (bkz. CLAUDE.md). */
const ZAMAN_ASIMI_MS = 180_000;

async function kesimiAl() {
  const dosya = await readFile(KAYNAK);
  const govde = new FormData();
  govde.append("file", new Blob([dosya], { type: "image/webp" }), "urun.webp");

  const yanit = await fetch(`${BACKEND}/api/remove-background`, {
    method: "POST",
    body: govde,
    signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
  });

  if (!yanit.ok) {
    throw new Error(
      `Backend ${yanit.status} dondu. Backend :8000'de ayakta mi?`,
    );
  }
  return Buffer.from(await yanit.arrayBuffer());
}

/** Kesimi, kenarlarda pay birakacak sekilde kareye oturtur. */
async function kesimiYerlestir(kesim, { pay = 0.78 } = {}) {
  return sharp(kesim)
    .trim() // saydam kenarlari at: urun karenin ortasinda ve buyuk dursun
    .resize({
      width: Math.round(GENISLIK * pay),
      height: Math.round(YUKSEKLIK * pay),
      fit: "inside",
      withoutEnlargement: false,
    })
    .toBuffer();
}

async function main() {
  await mkdir(CIKTI_DIZINI, { recursive: true });

  console.log("Kesim aliniyor (BiRefNet, ilk istek uzun surebilir)...");
  const kesim = await kesimiAl();
  const yerlesmis = await kesimiYerlestir(kesim);

  // 1) Saydam zeminli kesim — turdaki "kesim" karesi dama deseni uzerinde
  //    gosteriyor, o yuzden alfa korunmali.
  await sharp({
    create: {
      width: GENISLIK,
      height: YUKSEKLIK,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: yerlesmis, gravity: "center" }])
    .webp({ quality: KALITE, alphaQuality: 100 })
    .toFile(path.join(CIKTI_DIZINI, "kesim.webp"));

  // 2) Kompozisyon — editordeki "Altin hale" zemininin ayni renk duraklari.
  //    Zemin SVG ile uretiliyor: gradyan icin ayri bir ikili dosya tutmak
  //    gerekmesin, degeri degistirmek isteyen tek satir duzeltsin.
  const zemin = Buffer.from(
    `<svg width="${GENISLIK}" height="${YUKSEKLIK}" xmlns="http://www.w3.org/2000/svg">
       <defs>
         <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0" stop-color="#3a2f1c"/>
           <stop offset="0.55" stop-color="#7a6231"/>
           <stop offset="1" stop-color="#241d12"/>
         </linearGradient>
         <radialGradient id="isik" cx="50%" cy="42%" r="62%">
           <stop offset="0" stop-color="#ffffff" stop-opacity="0.30"/>
           <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.06"/>
           <stop offset="1" stop-color="#000000" stop-opacity="0.34"/>
         </radialGradient>
       </defs>
       <rect width="100%" height="100%" fill="url(#g)"/>
       <rect width="100%" height="100%" fill="url(#isik)"/>
     </svg>`,
  );

  await sharp(zemin)
    .composite([{ input: yerlesmis, gravity: "center" }])
    .webp({ quality: KALITE })
    .toFile(path.join(CIKTI_DIZINI, "vitrin.webp"));

  console.log(`Hazir: ${path.relative(FRONTEND, CIKTI_DIZINI)}`);
}

main().catch((hata) => {
  console.error(hata.message);
  process.exit(1);
});
