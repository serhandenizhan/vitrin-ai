/**
 * Katalog sayfasini PNG olarak cizer.
 *
 * Onizleme ile AYNI kutulari kullaniyor (`catalog-templates.ts`) — burada
 * oranlar piksele, orada yuzdeye ceviriliyor. Ayni sekilde yuva icindeki
 * gorsel yerlesimi de ayni fonksiyondan (`yuvaYerlesimi`) geliyor. Tek kaynak
 * oldugu icin ekranda gorulen ile inen dosya ayrisamaz.
 *
 * A4 orani, 150 nokta/inc karsiligi. 300 dpi (2480x3508) tarayicida
 * uretilebiliyor ama tek sayfa icin ~25 MB PNG cikariyor ve dusuk bellekli
 * cihazlarda sekme cokebiliyor; 150 dpi dijital katalog ve matbaa provasi icin
 * yeterli. Gercek matbaa baskisi ayri bir is: CMYK donusumu tarayicida
 * yapilamiyor (canvas yalnizca RGB uretir, PNG CMYK'yi hic desteklemez).
 */

import {
  type Sablon,
  type YuvaDonusumu,
  yuvaYerlesimi,
} from "@/lib/catalog-templates";

export const CIKTI_GENISLIK = 1240;
export const CIKTI_YUKSEKLIK = 1754;

export type CizilecekYuva = {
  url: string;
  genislik: number;
  yukseklik: number;
  donusum: YuvaDonusumu;
} | null;

export type CizimIcerigi = {
  sablon: Sablon;
  yuvalar: CizilecekYuva[];
  metinler: { ustEtiket: string; baslik: string; altBilgi: string };
};

function gorselYukle(url: string): Promise<HTMLImageElement> {
  return new Promise((coz, reddet) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => coz(img);
    img.onerror = () => reddet(new Error("Görsel yüklenemedi"));
    img.src = url;
  });
}

export async function katalogCiz(icerik: CizimIcerigi): Promise<string> {
  const { sablon, yuvalar, metinler } = icerik;

  const tuval = document.createElement("canvas");
  tuval.width = CIKTI_GENISLIK;
  tuval.height = CIKTI_YUKSEKLIK;
  const ctx = tuval.getContext("2d");
  if (!ctx) throw new Error("Canvas bağlamı alınamadı");

  ctx.fillStyle = sablon.kagit;
  ctx.fillRect(0, 0, CIKTI_GENISLIK, CIKTI_YUKSEKLIK);

  const renk = (ad: "vurgu" | "murekkep" | "solgun") =>
    ad === "vurgu"
      ? sablon.vurgu
      : ad === "solgun"
        ? sablon.solgun
        : sablon.murekkep;

  // Cizgiler
  for (const cizgi of sablon.cizgiler) {
    ctx.save();
    ctx.globalAlpha = cizgi.opaklik;
    ctx.fillStyle = renk(cizgi.renk);
    ctx.fillRect(
      cizgi.kutu.x * CIKTI_GENISLIK,
      cizgi.kutu.y * CIKTI_YUKSEKLIK,
      cizgi.kutu.g * CIKTI_GENISLIK,
      Math.max(1, cizgi.kutu.y2 * CIKTI_YUKSEKLIK),
    );
    ctx.restore();
  }

  // Gorseller — her biri kendi kutusunda KIRPILIYOR. Onizlemedeki
  // `overflow-hidden` ile ayni davranis; kullanici gorseli buyuttugunde
  // metin bandina tasmasi mumkun degil.
  for (const [sira, kutu] of sablon.yuvalar.entries()) {
    const yuva = yuvalar[sira];
    if (!yuva) continue;

    const img = await gorselYukle(yuva.url);
    const kutuPx = {
      x: kutu.x * CIKTI_GENISLIK,
      y: kutu.y * CIKTI_YUKSEKLIK,
      g: kutu.g * CIKTI_GENISLIK,
      y2: kutu.y2 * CIKTI_YUKSEKLIK,
    };

    const yer = yuvaYerlesimi(
      kutuPx,
      { genislik: yuva.genislik, yukseklik: yuva.yukseklik },
      yuva.donusum,
    );

    ctx.save();
    ctx.beginPath();
    ctx.rect(kutuPx.x, kutuPx.y, kutuPx.g, kutuPx.y2);
    ctx.clip();
    ctx.drawImage(img, kutuPx.x + yer.x, kutuPx.y + yer.y, yer.g, yer.y2);
    ctx.restore();
  }

  // Metinler EN SON: hicbir kosulda gorselin altinda kalmiyorlar.
  for (const oge of sablon.metinler) {
    const ham = metinler[oge.alan];
    if (!ham) continue;

    const deger = oge.buyukHarf ? ham.toLocaleUpperCase("tr-TR") : ham;
    const punto = oge.puntoOrani * CIKTI_GENISLIK;
    const agirlik = oge.alan === "altBilgi" ? 400 : 600;

    ctx.fillStyle = renk(oge.renk);
    ctx.font = `${agirlik} ${Math.round(punto)}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.textAlign = oge.hiza === "orta" ? "center" : "left";

    const x =
      oge.hiza === "orta"
        ? (oge.kutu.x + oge.kutu.g / 2) * CIKTI_GENISLIK
        : oge.kutu.x * CIKTI_GENISLIK;
    const y = oge.kutu.y * CIKTI_YUKSEKLIK;

    // `letterSpacing` canvas'ta yeni ve her tarayicida yok; desteklenmediginde
    // yalnizca harf araligi kaybolur, metin yine dogru yerde cizilir.
    if ("letterSpacing" in ctx && oge.aralik) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        `${oge.aralik * punto}px`;
    }

    ctx.fillText(deger, x, y);

    if ("letterSpacing" in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        "0px";
    }
  }

  ctx.textAlign = "left";
  return tuval.toDataURL("image/png");
}
