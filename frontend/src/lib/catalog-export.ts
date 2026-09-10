/**
 * Katalog sayfasini PNG olarak cizer.
 *
 * Onizleme ile AYNI kutulari kullaniyor (`catalog-templates.ts`) — burada
 * oranlar piksele, orada yuzdeye ceviriliyor. Ayni sekilde yuva icindeki
 * gorsel yerlesimi de ayni fonksiyondan (`slotPlacement`) geliyor. Tek kaynak
 * oldugu icin ekranda gorulen ile inen dosya ayrisamaz.
 *
 * A4 orani, 150 nokta/inc karsiligi. 300 dpi (2480x3508) tarayicida
 * uretilebiliyor ama tek sayfa icin ~25 MB PNG cikariyor ve dusuk bellekli
 * cihazlarda sekme cokebiliyor; 150 dpi dijital katalog ve matbaa provasi icin
 * yeterli. Gercek matbaa baskisi ayri bir is: CMYK donusumu tarayicida
 * yapilamiyor (canvas yalnizca RGB uretir, PNG CMYK'yi hic desteklemez).
 */

import {
  type CatalogTexts,
  type SlotTransform,
  type Template,
  slotPlacement,
  templateColor,
} from "@/lib/catalog-templates";

export const CATALOG_WIDTH = 1240;
export const CATALOG_HEIGHT = 1754;

export type RenderSlot = {
  url: string;
  width: number;
  height: number;
  transform: SlotTransform;
} | null;

export type CatalogContent = {
  template: Template;
  slots: RenderSlot[];
  texts: CatalogTexts;
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Görsel yüklenemedi"));
    img.src = url;
  });
}

export async function renderCatalog(content: CatalogContent): Promise<string> {
  const { template, slots, texts } = content;

  const canvas = document.createElement("canvas");
  canvas.width = CATALOG_WIDTH;
  canvas.height = CATALOG_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas bağlamı alınamadı");

  ctx.fillStyle = template.paper;
  ctx.fillRect(0, 0, CATALOG_WIDTH, CATALOG_HEIGHT);

  // Cizgiler
  for (const rule of template.rules) {
    ctx.save();
    ctx.globalAlpha = rule.opacity;
    ctx.fillStyle = templateColor(template, rule.color);
    ctx.fillRect(
      rule.box.x * CATALOG_WIDTH,
      rule.box.y * CATALOG_HEIGHT,
      rule.box.width * CATALOG_WIDTH,
      Math.max(1, rule.box.height * CATALOG_HEIGHT),
    );
    ctx.restore();
  }

  // Gorseller — her biri kendi kutusunda KIRPILIYOR. Onizlemedeki
  // `overflow-hidden` ile ayni davranis; kullanici gorseli buyuttugunde
  // metin bandina tasmasi mumkun degil.
  for (const [index, box] of template.slots.entries()) {
    const slot = slots[index];
    if (!slot) continue;

    const img = await loadImage(slot.url);
    const boxPx = {
      x: box.x * CATALOG_WIDTH,
      y: box.y * CATALOG_HEIGHT,
      width: box.width * CATALOG_WIDTH,
      height: box.height * CATALOG_HEIGHT,
    };

    const placement = slotPlacement(
      boxPx,
      { width: slot.width, height: slot.height },
      slot.transform,
    );

    ctx.save();
    ctx.beginPath();
    ctx.rect(boxPx.x, boxPx.y, boxPx.width, boxPx.height);
    ctx.clip();

    // Dondurme, gorselin KENDI merkezi etrafinda — onizlemedeki
    // `transform: rotate(...)` ile ayni davranis (CSS'in varsayilan
    // `transform-origin` degeri de merkezdir). Baska bir nokta secilseydi
    // ekran ile cikti ayrisirdi.
    const centerX = boxPx.x + placement.x + placement.width / 2;
    const centerY = boxPx.y + placement.y + placement.height / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate((slot.transform.rotation * Math.PI) / 180);
    ctx.drawImage(
      img,
      -placement.width / 2,
      -placement.height / 2,
      placement.width,
      placement.height,
    );
    ctx.restore();
  }

  // Metinler EN SON: hicbir kosulda gorselin altinda kalmiyorlar.
  for (const element of template.texts) {
    const raw = texts[element.field];
    if (!raw) continue;

    const value = element.uppercase ? raw.toLocaleUpperCase("tr-TR") : raw;
    const fontSize = element.fontSizeRatio * CATALOG_WIDTH;
    const fontWeight = element.field === "footer" ? 400 : 600;

    ctx.fillStyle = templateColor(template, element.color);
    ctx.font = `${fontWeight} ${Math.round(fontSize)}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.textAlign = element.align === "center" ? "center" : "left";

    const x =
      element.align === "center"
        ? (element.box.x + element.box.width / 2) * CATALOG_WIDTH
        : element.box.x * CATALOG_WIDTH;
    const y = element.box.y * CATALOG_HEIGHT;

    // `letterSpacing` canvas'ta yeni ve her tarayicida yok; desteklenmediginde
    // yalnizca harf araligi kaybolur, metin yine dogru yerde cizilir.
    if ("letterSpacing" in ctx && element.letterSpacing) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        `${element.letterSpacing * fontSize}px`;
    }

    ctx.fillText(value, x, y);

    if ("letterSpacing" in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        "0px";
    }
  }

  ctx.textAlign = "left";
  return canvas.toDataURL("image/png");
}
