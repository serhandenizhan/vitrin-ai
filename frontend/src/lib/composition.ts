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
  /** Zemine dusen isik havuzu — urunu one cikaran yumusak vinyet. */
  spotlight: boolean;
};

export const DEFAULT_APPEARANCE: Appearance = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  shadow: true,
  spotlight: false,
};

/** Kullanici hicbir ayara dokunmamis mi — "sifirla" dugmesini pasif tutmak icin. */
export function isDefaultAppearance(appearance: Appearance): boolean {
  return (
    appearance.brightness === DEFAULT_APPEARANCE.brightness &&
    appearance.contrast === DEFAULT_APPEARANCE.contrast &&
    appearance.saturation === DEFAULT_APPEARANCE.saturation &&
    appearance.shadow === DEFAULT_APPEARANCE.shadow &&
    appearance.spotlight === DEFAULT_APPEARANCE.spotlight
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

export const OUTPUT_FORMATS = {
  square: {
    label: "Kare",
    summary: "2000×2000",
    outputWidth: 2000,
    outputHeight: 2000,
    fileSlug: "kare",
  },
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
} as const satisfies Record<string, OutputFormat>;

export type OutputFormatName = keyof typeof OUTPUT_FORMATS;

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
