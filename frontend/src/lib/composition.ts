/**
 * Kompozisyon sahnesinin saf geometrisi.
 *
 * Konva'dan ve React'ten BAGIMSIZ tutuluyor: `editor-stage.tsx` icine yazilsaydi
 * bu fonksiyonlari test etmek, Node ortaminda `konva` + `react-konva` yuklemeyi
 * (ve canvas bagimliligini) gerektirirdi. Saf sayilarla calisan bir modul olarak
 * ayrildiginda hem test ucuz hem de kurallar tek yerde okunabilir kaliyor.
 */

/** Sahnenin mantiksal olcusu. Disa aktarma bunun katlari olarak yapiliyor. */
export const STAGE_SIZE = 1000;

/** Yol haritasindaki cikti olcusu (ROADMAP.md Faz 3). */
export const OUTPUT_SIZE = 2000;

/** Urunun sahneye ilk yerlesirken kaplayacagi oran (kenarlarda pay kalsin). */
export const FIT_MARGIN = 0.72;

export type Transform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

/**
 * Bir gorseli sahneye ortalayip sigdiran donusumu hesaplar.
 *
 * `Math.min` ile olcekleniyor ki hem cok genis hem cok uzun gorseller sahneye
 * TAMAMEN sigsin — `Math.max` kullanilsaydi gorselin uzun kenari tasar ve
 * kullanici urunun kirpildigini sanirdi.
 */
export function fitTransform(cutoutWidth: number, cutoutHeight: number): Transform {
  const scale = Math.min(
    (STAGE_SIZE * FIT_MARGIN) / cutoutWidth,
    (STAGE_SIZE * FIT_MARGIN) / cutoutHeight,
  );
  return { x: STAGE_SIZE / 2, y: STAGE_SIZE / 2, scale, rotation: 0 };
}

/**
 * Aciyi 0-359 araligina normalize eder.
 *
 * Kullanici "15° dondur"e defalarca basinca aci 1080 gibi anlamsiz bir sayiya
 * cikardi; gosterilen deger de sahnedeki gorsel aci ile ayrisirdi. JavaScript'in
 * `%` operatoru negatif sayilarda negatif dondugu icin (`-15 % 360 === -15`)
 * ikinci bir toplama+mod gerekiyor.
 */
export function normalizeAngle(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/**
 * Disa aktarma icin kullanilacak piksel orani.
 *
 * Bilincli olarak EKRAN olcusune degil MANTIKSAL olcuye dayaniyor. Once
 * `OUTPUT_SIZE / ekranGenisligi` kullaniliyordu; ekran genisligi kapsayiciya
 * gore degisken ve genellikle yuvarlak degil (434 px olculdu), oran 4.6082...
 * cikiyor ve Konva 2000 yerine 1999 px'lik bir tuval uretiyordu. Yol haritasi
 * cikti olcusunu sayiyla belirtiyor; 1999 sessizce yanlis bir cikti demek.
 */
export const EXPORT_PIXEL_RATIO = OUTPUT_SIZE / STAGE_SIZE;

/**
 * Urun uzerindeki gorunum ayarlari.
 *
 * Bunlar Konva'nin kendi filtrelerine besleniyor; deger araliklari Konva'nin
 * bekledigi araliklar (kendi normalize etmiyoruz ki filtre degistiginde iki
 * yerde birden duzeltme gerekmesin).
 */
export type Appearance = {
  /** Konva `Brighten`: -1 (siyah) .. 1 (beyaz). */
  brightness: number;
  /** Konva `Contrast`: -100 .. 100. */
  contrast: number;
  /** Konva `HSL` doygunluk: -2 .. 4 araliginda anlamli, 0 = degisiklik yok. */
  saturation: number;
  /** Urunun altina dusen golge — kompozisyonu zemine "oturtuyor". */
  shadow: boolean;
  /**
   * Urunun altinda, asagi dogru silikleserek kaybolan ayna yansimasi.
   * 17.09.2026'da "isik havuzu"nun yerine geldi (Kaan: yansima istendi).
   */
  reflection: boolean;
  /**
   * Golgenin boyutu (19.09.2026, Kaan): `SHADOW` bulaniklik ve kaymasinin
   * carpani; 1 = 17.09'da olculup secilen deger.
   */
  shadowSize: number;
  /** Golgenin opakligi (alfa), 0..1. */
  shadowOpacity: number;
  /** Yansimanin urunun alt kenarindan uzakligi (sahne birimi; 0 = bitisik). */
  reflectionGap: number;
};

/** Golge/yansima kaydiraclarinin sinirlari. */
export const SHADOW_SIZE_RANGE = { min: 0.4, max: 2, step: 0.05 } as const;
export const SHADOW_OPACITY_RANGE = { min: 0.1, max: 0.9, step: 0.05 } as const;
export const REFLECTION_GAP_RANGE = { min: 0, max: 60, step: 1 } as const;

/**
 * Golge olculeri (sahne koordinatinda; urun olcegine bolunerek veriliyor).
 *
 * 17.09.2026'da GUCLENDIRILDI. Onceki deger (bulaniklik 38, kayma 26, opaklik
 * %32) Konva'da olculdu: acik zeminde urunun altini yalnizca ~27/255
 * koyulastiriyordu, koyu zeminde neredeyse sifir — kullanici "golge
 * olmuyor" dedi. Bu deger acik zeminde ~80/255 ve koyu zeminde de
 * seciliyor; daha genis/opak secenek gozle abartili durdu.
 * Olcum ve karsilastirma: kok CLAUDE.md, zemin kutuphanesi notu.
 */
export const SHADOW = { blur: 50, offsetY: 34, opacity: 0.55 } as const;

/** Yansimanin gorunur kalan boyu (urun yuksekliginin orani) ve opakligi. */
export const REFLECTION = { fadeRatio: 0.6, opacity: 0.35 } as const;

export const DEFAULT_APPEARANCE: Appearance = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  // Kapali basliyor (Kaan, 17.09.2026).
  shadow: false,
  reflection: false,
  shadowSize: 1,
  shadowOpacity: 0.55,
  reflectionGap: 0,
};

/**
 * Kayitli bir gorunumu bugunku alanlarla tamamlar: 19.09.2026'dan onceki
 * taslaklarda golge boyutu/opakligi ve yansima mesafesi yok.
 */
export function normalizeAppearance(saved: Partial<Appearance> | null | undefined): Appearance {
  const merged = { ...DEFAULT_APPEARANCE, ...(saved ?? {}) };
  const clamp = (value: unknown, range: { min: number; max: number }, fallback: number) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(range.max, Math.max(range.min, value))
      : fallback;
  return {
    ...merged,
    shadowSize: clamp(merged.shadowSize, SHADOW_SIZE_RANGE, DEFAULT_APPEARANCE.shadowSize),
    shadowOpacity: clamp(merged.shadowOpacity, SHADOW_OPACITY_RANGE, DEFAULT_APPEARANCE.shadowOpacity),
    reflectionGap: clamp(merged.reflectionGap, REFLECTION_GAP_RANGE, DEFAULT_APPEARANCE.reflectionGap),
  };
}

/** Kullanici hicbir ayara dokunmamis mi — "sifirla" dugmesini pasif tutmak icin. */
export function isDefaultAppearance(appearance: Appearance): boolean {
  return (
    appearance.brightness === DEFAULT_APPEARANCE.brightness &&
    appearance.contrast === DEFAULT_APPEARANCE.contrast &&
    appearance.saturation === DEFAULT_APPEARANCE.saturation &&
    appearance.shadow === DEFAULT_APPEARANCE.shadow &&
    appearance.reflection === DEFAULT_APPEARANCE.reflection &&
    appearance.shadowSize === DEFAULT_APPEARANCE.shadowSize &&
    appearance.shadowOpacity === DEFAULT_APPEARANCE.shadowOpacity &&
    appearance.reflectionGap === DEFAULT_APPEARANCE.reflectionGap
  );
}

/**
 * Surukleme sirasinda merkeze YAKALAMA.
 *
 * Kuyumcu kompozisyonlarinin buyuk cogunlugu ortalanmis; ama fareyle tam
 * ortayi tutturmak neredeyse imkansiz ve 1-2 piksellik kayma buyutulmus
 * ciktida goze batiyor. Merkeze `CENTER_SNAP_TOLERANCE` kadar yaklasildiginda
 * deger tam merkeze cekiliyor. Tolerans disinda serbest surukleme aynen
 * calisiyor.
 */
export const CENTER_SNAP_TOLERANCE = 12;

export function snapToCenter(value: number, center: number): number {
  return Math.abs(value - center) <= CENTER_SNAP_TOLERANCE ? center : value;
}

/**
 * Cikti bicimleri.
 *
 * MANTIKSAL olcu her zaman ciktinin YARISI. Bu bilincli: disa aktarma orani
 * boylece her bicimde tam olarak 2 kaliyor. Kesirli bir oran, Konva'nin ic
 * hesabinda bir piksel kaybina yol aciyor — 2000 yerine 1999 px'lik tuval
 * uretildigi birebir olculdu (bkz. EXPORT_PIXEL_RATIO gerekcesi).
 *
 * "Katalog" bicimi, `/katalog` sayfasindaki sablon yuvalarina birebir oturmasi
 * icin A4 orani (1:1.414). Instagram olculeri platformun kendi onerdikleri:
 * gonderi 1080x1080, hikaye 1080x1920.
 *
 * `fileSlug` indirilen dosyanin adina giriyor ve kullaniciya gorunuyor; bu
 * yuzden anahtarlar Ingilizceye tasinirken Turkce haliyle korundu.
 */
export type OutputFormat = {
  label: string;
  summary: string;
  outputWidth: number;
  outputHeight: number;
  fileSlug: string;
};

/*
 * "Kare 2000x2000" 17.09.2026'da KALDIRILDI (Kaan: gerek yok). Ayni olcu,
 * beyaz zeminli "Pazaryeri" bicimi olarak duruyor. Liste sirasi arayuzdeki
 * sira; ilk bicim (A4) studyonun acilis bicimi (`DEFAULT_FORMAT_NAME`).
 */
export const OUTPUT_FORMATS = {
  catalog: {
    label: "Katalog",
    summary: "A4 oranı",
    outputWidth: 1240,
    outputHeight: 1754,
    fileSlug: "katalog",
  },
  instagramPost: {
    label: "Instagram gönderi",
    summary: "1080×1080",
    outputWidth: 1080,
    outputHeight: 1080,
    fileSlug: "gonderi",
  },
  instagramStory: {
    label: "Instagram hikâye",
    summary: "1080×1920",
    outputWidth: 1080,
    outputHeight: 1920,
    fileSlug: "hikaye",
  },
  // Oneri 3 (one alinan is, 13.09.2026): Instagram'in akista en cok yer
  // kaplayan dikey gonderi olcusu 4:5.
  instagramPortrait: {
    label: "Instagram dikey",
    summary: "1080×1350",
    outputWidth: 1080,
    outputHeight: 1350,
    fileSlug: "dikey",
  },
  // Pazaryerleri urun gorselini duz BEYAZ zeminde ve kare istiyor. Bu bicim
  // secildiginde editor zemini beyaza aliyor (bkz. composition-editor.tsx
  // `changeFormat`); olcu kare ile ayni.
  marketplace: {
    label: "Pazaryeri",
    summary: "Beyaz zemin · 2000×2000",
    outputWidth: 2000,
    outputHeight: 2000,
    fileSlug: "pazaryeri",
  },
} as const satisfies Record<string, OutputFormat>;

/** Pazaryeri biciminin zorunlu tuttugu zeminin kimligi (bkz. backgrounds.ts). */
export const MARKETPLACE_BACKGROUND_ID = "placeholder-white";

export type OutputFormatName = keyof typeof OUTPUT_FORMATS;

/** Studyo A4 ile aciliyor (Kaan, 17.09.2026). */
export const DEFAULT_FORMAT_NAME: OutputFormatName = "catalog";

export type Orientation = "portrait" | "landscape";

/**
 * Bicimin yonu. Kare bicimler (Instagram gonderi, pazaryeri) "landscape"
 * sayiliyor: yatay bir zemin kareyi dikey bir zeminden cok daha az kirpiyor.
 */
export function formatOrientation(format: OutputFormat): Orientation {
  return format.outputHeight > format.outputWidth ? "portrait" : "landscape";
}

/**
 * Zemini sahneye ESNETMEDEN kaplatmak icin gorselden alinacak parca
 * (gorsel pikseli). CSS `object-fit: cover` karsiligi: oran korunuyor,
 * tasan kenarlar ortadan esit kirpiliyor.
 *
 * NEDEN: 17.09.2026'ya kadar zemin dogrudan sahne olcusune zorlaniyordu;
 * yatay bir zemin hikaye biciminde dikey olarak uzatiliyor ve "cekistirilmis"
 * gorunuyordu (Kaan'in bildirdigi hata).
 */
export function coverCrop(
  imageWidth: number,
  imageHeight: number,
  targetWidth: number,
  targetHeight: number,
): { x: number; y: number; width: number; height: number } {
  const imageRatio = imageWidth / imageHeight;
  const targetRatio = targetWidth / targetHeight;
  if (imageRatio > targetRatio) {
    const width = imageHeight * targetRatio;
    return { x: (imageWidth - width) / 2, y: 0, width, height: imageHeight };
  }
  const height = imageWidth / targetRatio;
  return { x: 0, y: (imageHeight - height) / 2, width: imageWidth, height };
}

/**
 * Yansimanin yerlesimi: urunun ekrandaki ALT kenarindan yatay eksende
 * aynalanmis kopya.
 *
 * Donduruler urunde eksen, donmus kutunun alt kenari. Yatay eksende
 * aynalamak aciyi tersine ceviriyor (`-rotation`) ve dikey olcegi eksi
 * yapiyor; merkez eksenin obur tarafina, ayni mesafeye geciyor.
 */
export function reflectionPlacement(
  transform: Transform,
  cutoutWidth: number,
  cutoutHeight: number,
  visibleBounds?: { x: number; y: number; width: number; height: number },
  /** Urunun alt kenari ile yansima arasindaki bosluk (sahne birimi). */
  gap = 0,
): { x: number; y: number; scaleX: number; scaleY: number; rotation: number; axisY: number; fadeHeight: number } {
  const radians = (transform.rotation * Math.PI) / 180;
  const bounds = visibleBounds ?? { x: 0, y: 0, width: cutoutWidth, height: cutoutHeight };
  const ys = [bounds.x, bounds.x + bounds.width].flatMap((x) =>
    [bounds.y, bounds.y + bounds.height].map((y) =>
      transform.y + ((x - cutoutWidth / 2) * Math.sin(radians) +
        (y - cutoutHeight / 2) * Math.cos(radians)) * transform.scale,
    ),
  );
  const axisY = Math.max(...ys);
  // Bosluk: yansima ve silikleşme ayni miktarda asagi kayar.
  const safeGap = Math.max(0, gap);
  return {
    x: transform.x,
    y: 2 * axisY - transform.y + safeGap,
    scaleX: transform.scale,
    scaleY: -transform.scale,
    rotation: -transform.rotation,
    axisY: axisY + safeGap,
    fadeHeight: (axisY - Math.min(...ys)) * REFLECTION.fadeRatio,
  };
}

/** Bir bicimin sahnedeki mantiksal olcusu — cikti olcusunun yarisi. */
export function logicalSize(format: OutputFormat): {
  width: number;
  height: number;
} {
  return {
    width: format.outputWidth / 2,
    height: format.outputHeight / 2,
  };
}

/**
 * Bir gorseli verilen mantiksal sahneye ortalayip sigdiran donusum.
 *
 * `fitTransform`un kare olmayan sahneler icin genellestirilmis hali;
 * kare sahnede ikisi ayni sonucu veriyor.
 */
export function fitToStage(
  stageWidth: number,
  stageHeight: number,
  cutoutWidth: number,
  cutoutHeight: number,
): Transform {
  const scale = Math.min(
    (stageWidth * FIT_MARGIN) / cutoutWidth,
    (stageHeight * FIT_MARGIN) / cutoutHeight,
  );
  return {
    x: stageWidth / 2,
    y: stageHeight / 2,
    scale,
    rotation: 0,
  };
}
