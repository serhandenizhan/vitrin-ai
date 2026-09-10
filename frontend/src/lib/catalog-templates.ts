/**
 * Katalog sablonlari — TEK bir geometri modeli.
 *
 * Onceki surumde her sablonun iki ayri uygulamasi vardi: ekran icin bir JSX
 * yerlesimi, disa aktarma icin bir canvas fonksiyonu. Ikisi ayni sayilari
 * kullanmaya "calisiyordu" ama bunu hicbir sey garanti etmiyordu; yerlesim
 * degistiginde birini guncelleyip digerini unutmak an meselesiydi ve sonuc
 * "ekranda boyle gorunmuyordu" oluyordu.
 *
 * Artik her sablon yalnizca KUTULARDAN olusuyor: her kutu 0-1 arasi oranlarla
 * tanimli. Onizleme bu oranlari yuzdeye, disa aktarma ayni oranlari piksele
 * ceviriyor. Tek kaynak oldugu icin ikisi ayrisamaz.
 *
 * Renkler ve tipografi projenin tasarim dilinden: sicak notrler, altin vurgu,
 * negatif harf araligi, 600 agirlikli basliklar (bkz. kok CLAUDE.md).
 */

/** Sayfa uzerinde bir dikdortgen; degerler sayfa olcusune gore 0-1 orani. */
export type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TemplateColor = "accent" | "ink" | "muted";

/** Bir metin ogesi: kutusu, punto orani, hizasi ve rol. */
export type TextElement = {
  field: "eyebrow" | "title" | "footer";
  box: Box;
  /** Punto, sayfa GENISLIGININ orani olarak. */
  fontSizeRatio: number;
  align: "left" | "center";
  color: TemplateColor;
  /** Buyuk harfe cevrilsin mi. */
  uppercase?: boolean;
  /** Harf araligi, punto orani. */
  letterSpacing?: number;
};

export type Rule = {
  box: Box;
  color: "ink" | "muted";
  opacity: number;
};

export type TemplateName = "duo" | "cover" | "trio";

export type CatalogTexts = { eyebrow: string; title: string; footer: string };

export type Template = {
  name: TemplateName;
  /** Indirilen dosyanin adinda kullanilir; kullaniciya gorundugu icin Turkce. */
  fileSlug: string;
  title: string;
  summary: string;
  /** Sayfa zemini ve metin renkleri. */
  paper: string;
  ink: string;
  muted: string;
  accent: string;
  /** Gorsel yuvalari; sirasi arayuzdeki sirayla ayni. */
  slots: Box[];
  texts: TextElement[];
  rules: Rule[];
};

/** Bir sablonun renk roluna karsilik gelen gercek rengi. */
export function templateColor(template: Template, color: TemplateColor): string {
  return color === "accent"
    ? template.accent
    : color === "muted"
      ? template.muted
      : template.ink;
}

/* --------------------------------------------------------------------------
   Renkler

   Kagit bilincli olarak SAF BEYAZ DEGIL. Saf beyaz bir sayfa, ekranda
   cevresindeki arayuzden daha parlak duruyor ve goz once ona gidiyor; kirik
   beyaz hem daha sakin hem basili kagida daha yakin. Ayni gerekce sitenin
   genel paletinde de gecerli (bkz. kok CLAUDE.md, sicak notrler).
   -------------------------------------------------------------------------- */

const PAPER = "#f4f1ec";
const INK = "#1a1917";
const MUTED = "#6b6862";
const GOLD = "#a8834a";

const DARK_PAPER = "#1a1917";
const DARK_INK = "#f3f0eb";
const DARK_MUTED = "#a8a29a";

export const TEMPLATES: Record<TemplateName, Template> = {
  /* --- Ikili vitrin: iki urun yan yana, ustte baslik bandi ---------------- */
  duo: {
    name: "duo",
    fileSlug: "ikili",
    title: "İkili vitrin",
    summary: "İki ürün, üstte başlık",
    paper: PAPER,
    ink: INK,
    muted: MUTED,
    accent: GOLD,
    slots: [
      { x: 0.075, y: 0.26, width: 0.4, height: 0.52 },
      { x: 0.525, y: 0.26, width: 0.4, height: 0.52 },
    ],
    texts: [
      {
        field: "eyebrow",
        box: { x: 0.075, y: 0.085, width: 0.85, height: 0.035 },
        fontSizeRatio: 0.019,
        align: "left",
        color: "accent",
        uppercase: true,
        letterSpacing: 0.16,
      },
      {
        field: "title",
        box: { x: 0.075, y: 0.125, width: 0.85, height: 0.065 },
        fontSizeRatio: 0.052,
        align: "left",
        color: "ink",
      },
      {
        field: "footer",
        box: { x: 0.075, y: 0.915, width: 0.85, height: 0.03 },
        fontSizeRatio: 0.014,
        align: "center",
        color: "muted",
        uppercase: true,
        letterSpacing: 0.1,
      },
    ],
    rules: [
      { box: { x: 0.075, y: 0.215, width: 0.85, height: 0.0008 }, color: "ink", opacity: 0.14 },
    ],
  },

  /* --- Kapak: tek buyuk urun, altta marka blogu -------------------------- */
  cover: {
    name: "cover",
    fileSlug: "kapak",
    title: "Kapak",
    summary: "Tek ürün, altta marka",
    paper: DARK_PAPER,
    ink: DARK_INK,
    muted: DARK_MUTED,
    accent: GOLD,
    slots: [{ x: 0.075, y: 0.1, width: 0.85, height: 0.62 }],
    texts: [
      {
        field: "eyebrow",
        box: { x: 0.075, y: 0.805, width: 0.85, height: 0.035 },
        fontSizeRatio: 0.019,
        align: "left",
        color: "accent",
        uppercase: true,
        letterSpacing: 0.16,
      },
      {
        field: "title",
        box: { x: 0.075, y: 0.845, width: 0.85, height: 0.075 },
        fontSizeRatio: 0.06,
        align: "left",
        color: "ink",
      },
    ],
    rules: [
      { box: { x: 0.075, y: 0.775, width: 0.85, height: 0.0008 }, color: "ink", opacity: 0.2 },
    ],
  },

  /* --- Uclu izgara: bir buyuk, iki kucuk --------------------------------- */
  trio: {
    name: "trio",
    fileSlug: "uclu",
    title: "Üçlü ızgara",
    summary: "Bir büyük, iki küçük",
    paper: PAPER,
    ink: INK,
    muted: MUTED,
    accent: GOLD,
    slots: [
      { x: 0.075, y: 0.235, width: 0.85, height: 0.36 },
      { x: 0.075, y: 0.615, width: 0.412, height: 0.24 },
      { x: 0.513, y: 0.615, width: 0.412, height: 0.24 },
    ],
    texts: [
      {
        field: "eyebrow",
        box: { x: 0.075, y: 0.08, width: 0.85, height: 0.035 },
        fontSizeRatio: 0.019,
        align: "left",
        color: "accent",
        uppercase: true,
        letterSpacing: 0.16,
      },
      {
        field: "title",
        box: { x: 0.075, y: 0.118, width: 0.85, height: 0.06 },
        fontSizeRatio: 0.048,
        align: "left",
        color: "ink",
      },
      {
        field: "footer",
        box: { x: 0.075, y: 0.9, width: 0.85, height: 0.03 },
        fontSizeRatio: 0.014,
        align: "center",
        color: "muted",
        uppercase: true,
        letterSpacing: 0.1,
      },
    ],
    rules: [
      { box: { x: 0.075, y: 0.198, width: 0.85, height: 0.0008 }, color: "ink", opacity: 0.14 },
    ],
  },
};

/* --------------------------------------------------------------------------
   Yuva donusumu — kullanicinin gorseli buyutup kaydirmasi
   -------------------------------------------------------------------------- */

export type SlotTransform = {
  /** Taban yerlesimin carpani; 1 = tabanin kendisi. */
  scale: number;
  /** Kutu genisligi/yuksekliginin orani olarak kaydirma. */
  x: number;
  y: number;
  /** Derece cinsinden dondurme. */
  rotation: number;
  /**
   * Taban yerlesim: `true` ise kutuyu DOLDURUR (cover), `false` ise kutuya
   * SIGAR (contain).
   *
   * Varsayilan `true` ve bu bilincli bir degisiklik. Onceden contain'di ve
   * dar/uzun bir yuvaya kare bir gorsel konuldugunda gorsel kuculuyor,
   * cevresinde bos bant kaliyordu — katalog sayfasinda bu "daralmis" duruyor.
   * Doldurma, cerceveyi tam kaplar; disarda kalan kisim kirpilir ve kullanici
   * isterse olcegi kucultup tamamini gorebilir. Karar kullanicida kaliyor.
   */
  cover: boolean;
};

export const DEFAULT_SLOT_TRANSFORM: SlotTransform = {
  scale: 1,
  x: 0,
  y: 0,
  rotation: 0,
  cover: true,
};

export const MIN_SLOT_SCALE = 0.3;
export const MAX_SLOT_SCALE = 3;

/**
 * Bir gorselin kutu icindeki YERLESIMINI hesaplar.
 *
 * Taban yerlesim `cover` bayragina gore `cover` ya da `contain`; kullanicinin
 * olcegi bunun uzerine bir CARPAN. Gorselin EN-BOY ORANI her durumda korunuyor
 * — genislik ve yukseklik ayni katsayiyla carpiliyor, dolayisiyla gorsel
 * hicbir kosulda ezilmiyor/gerilmiyor. Kutu disinda kalan kisim cagiran taraf
 * tarafindan kirpiliyor.
 *
 * Hem onizleme hem disa aktarma bu fonksiyonu kullaniyor; ayrismalari mumkun
 * degil.
 */
export function slotPlacement(
  box: { width: number; height: number },
  image: { width: number; height: number },
  transform: SlotTransform,
): Box {
  const ratios = [box.width / image.width, box.height / image.height] as const;

  const base = transform.cover
    ? Math.max(ratios[0], ratios[1])
    : Math.min(ratios[0], ratios[1]);

  const scale = base * transform.scale;
  const width = image.width * scale;
  const height = image.height * scale;

  return {
    x: (box.width - width) / 2 + transform.x * box.width,
    y: (box.height - height) / 2 + transform.y * box.height,
    width,
    height,
  };
}
