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
export type Kutu = {
  x: number;
  y: number;
  g: number;
  y2: number;
};

/** Bir metin ogesi: kutusu, punto orani, hizasi ve rol. */
export type MetinOgesi = {
  alan: "ustEtiket" | "baslik" | "altBilgi";
  kutu: Kutu;
  /** Punto, sayfa GENISLIGININ orani olarak. */
  puntoOrani: number;
  hiza: "sol" | "orta";
  renk: "vurgu" | "murekkep" | "solgun";
  /** Buyuk harfe cevrilsin mi. */
  buyukHarf?: boolean;
  /** Harf araligi, punto orani. */
  aralik?: number;
};

export type Cizgi = {
  kutu: Kutu;
  renk: "murekkep" | "solgun";
  opaklik: number;
};

export type SablonAdi = "ikili" | "kapak" | "uclu";

export type Sablon = {
  ad: SablonAdi;
  baslik: string;
  ozet: string;
  /** Sayfa zemini ve metin renkleri. */
  kagit: string;
  murekkep: string;
  solgun: string;
  vurgu: string;
  /** Gorsel yuvalari; sirasi arayuzdeki sirayla ayni. */
  yuvalar: Kutu[];
  metinler: MetinOgesi[];
  cizgiler: Cizgi[];
};

/* --------------------------------------------------------------------------
   Renkler

   Kagit bilincli olarak SAF BEYAZ DEGIL. Saf beyaz bir sayfa, ekranda
   cevresindeki arayuzden daha parlak duruyor ve goz once ona gidiyor; kirik
   beyaz hem daha sakin hem basili kagida daha yakin. Ayni gerekce sitenin
   genel paletinde de gecerli (bkz. kok CLAUDE.md, sicak notrler).
   -------------------------------------------------------------------------- */

const KAGIT = "#f4f1ec";
const MUREKKEP = "#1a1917";
const SOLGUN = "#6b6862";
const ALTIN = "#a8834a";

const KOYU_KAGIT = "#1a1917";
const KOYU_MUREKKEP = "#f3f0eb";
const KOYU_SOLGUN = "#a8a29a";

export const SABLONLAR: Record<SablonAdi, Sablon> = {
  /* --- Ikili vitrin: iki urun yan yana, ustte baslik bandi ---------------- */
  ikili: {
    ad: "ikili",
    baslik: "İkili vitrin",
    ozet: "İki ürün, üstte başlık",
    kagit: KAGIT,
    murekkep: MUREKKEP,
    solgun: SOLGUN,
    vurgu: ALTIN,
    yuvalar: [
      { x: 0.075, y: 0.26, g: 0.4, y2: 0.52 },
      { x: 0.525, y: 0.26, g: 0.4, y2: 0.52 },
    ],
    metinler: [
      {
        alan: "ustEtiket",
        kutu: { x: 0.075, y: 0.085, g: 0.85, y2: 0.035 },
        puntoOrani: 0.019,
        hiza: "sol",
        renk: "vurgu",
        buyukHarf: true,
        aralik: 0.16,
      },
      {
        alan: "baslik",
        kutu: { x: 0.075, y: 0.125, g: 0.85, y2: 0.065 },
        puntoOrani: 0.052,
        hiza: "sol",
        renk: "murekkep",
      },
      {
        alan: "altBilgi",
        kutu: { x: 0.075, y: 0.915, g: 0.85, y2: 0.03 },
        puntoOrani: 0.014,
        hiza: "orta",
        renk: "solgun",
        buyukHarf: true,
        aralik: 0.1,
      },
    ],
    cizgiler: [{ kutu: { x: 0.075, y: 0.215, g: 0.85, y2: 0.0008 }, renk: "murekkep", opaklik: 0.14 }],
  },

  /* --- Kapak: tek buyuk urun, altta marka blogu -------------------------- */
  kapak: {
    ad: "kapak",
    baslik: "Kapak",
    ozet: "Tek ürün, altta marka",
    kagit: KOYU_KAGIT,
    murekkep: KOYU_MUREKKEP,
    solgun: KOYU_SOLGUN,
    vurgu: ALTIN,
    yuvalar: [{ x: 0.075, y: 0.1, g: 0.85, y2: 0.62 }],
    metinler: [
      {
        alan: "ustEtiket",
        kutu: { x: 0.075, y: 0.805, g: 0.85, y2: 0.035 },
        puntoOrani: 0.019,
        hiza: "sol",
        renk: "vurgu",
        buyukHarf: true,
        aralik: 0.16,
      },
      {
        alan: "baslik",
        kutu: { x: 0.075, y: 0.845, g: 0.85, y2: 0.075 },
        puntoOrani: 0.06,
        hiza: "sol",
        renk: "murekkep",
      },
    ],
    cizgiler: [{ kutu: { x: 0.075, y: 0.775, g: 0.85, y2: 0.0008 }, renk: "murekkep", opaklik: 0.2 }],
  },

  /* --- Uclu izgara: bir buyuk, iki kucuk --------------------------------- */
  uclu: {
    ad: "uclu",
    baslik: "Üçlü ızgara",
    ozet: "Bir büyük, iki küçük",
    kagit: KAGIT,
    murekkep: MUREKKEP,
    solgun: SOLGUN,
    vurgu: ALTIN,
    yuvalar: [
      { x: 0.075, y: 0.235, g: 0.85, y2: 0.36 },
      { x: 0.075, y: 0.615, g: 0.412, y2: 0.24 },
      { x: 0.513, y: 0.615, g: 0.412, y2: 0.24 },
    ],
    metinler: [
      {
        alan: "ustEtiket",
        kutu: { x: 0.075, y: 0.08, g: 0.85, y2: 0.035 },
        puntoOrani: 0.019,
        hiza: "sol",
        renk: "vurgu",
        buyukHarf: true,
        aralik: 0.16,
      },
      {
        alan: "baslik",
        kutu: { x: 0.075, y: 0.118, g: 0.85, y2: 0.06 },
        puntoOrani: 0.048,
        hiza: "sol",
        renk: "murekkep",
      },
      {
        alan: "altBilgi",
        kutu: { x: 0.075, y: 0.9, g: 0.85, y2: 0.03 },
        puntoOrani: 0.014,
        hiza: "orta",
        renk: "solgun",
        buyukHarf: true,
        aralik: 0.1,
      },
    ],
    cizgiler: [{ kutu: { x: 0.075, y: 0.198, g: 0.85, y2: 0.0008 }, renk: "murekkep", opaklik: 0.14 }],
  },
};

/* --------------------------------------------------------------------------
   Yuva donusumu — kullanicinin gorseli buyutup kaydirmasi
   -------------------------------------------------------------------------- */

export type YuvaDonusumu = {
  /** 1 = kutuya tam sigar. */
  olcek: number;
  /** Kutu genisligi/yuksekliginin orani olarak kaydirma (-0.5 .. 0.5). */
  x: number;
  y: number;
};

export const VARSAYILAN_DONUSUM: YuvaDonusumu = { olcek: 1, x: 0, y: 0 };

export const EN_KUCUK_OLCEK = 0.4;
export const EN_BUYUK_OLCEK = 2.5;

/**
 * Bir gorselin kutu icindeki YERLESIMINI hesaplar.
 *
 * `contain` mantigi: gorsel kutuya sigdirilir, kirpilmaz — bir mucevher
 * fotografinin kenarindan kirpmak urunun bir parcasini kesmek demek.
 * Kullanicinin olcegi bunun uzerine bir CARPAN; 1'in ustune ciktiginda gorsel
 * kutudan tasar ve kutu sinirinda kirpilir (kullanicinin bilincli tercihi).
 *
 * Hem onizleme hem disa aktarma bu fonksiyonu kullaniyor.
 */
export function yuvaYerlesimi(
  kutu: { g: number; y2: number },
  gorsel: { genislik: number; yukseklik: number },
  donusum: YuvaDonusumu,
): { x: number; y: number; g: number; y2: number } {
  const sigdirma = Math.min(
    kutu.g / gorsel.genislik,
    kutu.y2 / gorsel.yukseklik,
  );
  const olcek = sigdirma * donusum.olcek;
  const g = gorsel.genislik * olcek;
  const y2 = gorsel.yukseklik * olcek;

  return {
    x: (kutu.g - g) / 2 + donusum.x * kutu.g,
    y: (kutu.y2 - y2) / 2 + donusum.y * kutu.y2,
    g,
    y2,
  };
}
