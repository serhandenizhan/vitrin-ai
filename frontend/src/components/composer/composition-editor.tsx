"use client";

/**
 * Kompozisyon editoru (Faz 3): kesilmis urunu bir zemin uzerine yerlestir,
 * surukle/olcekle/dondur ve 2000x2000 olarak disa aktar.
 *
 * Konva sahnesi `next/dynamic` ile ve `ssr: false` ile yukleniyor: Konva
 * kurulurken `window` ve `canvas`'a dokunuyor, sunucuda calistirilirsa
 * derleme aninda patlar. Bu, kutuphanenin bilinen bir kisiti; gecici bir
 * cozum degil.
 *
 * Donusum durumu (konum/olcek/aci) BURADA tutuluyor, sahnede degil — yandaki
 * kontroller ile tuvalin ayni veriyi paylasmasi icin (bkz. editor-stage.tsx).
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Contrast,
  Crosshair,
  Download,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  MessageCircle,
  Move,
  Printer,
  Ratio,
  RotateCw,
  SlidersHorizontal,
  Stamp,
  Trash2,
} from "lucide-react";
import type Konva from "konva";

import { useBackgrounds } from "@/components/composer/use-backgrounds";
import { Dock, DockStrip } from "@/components/composer/dock";
import { ToolBar } from "@/components/composer/tool-bar";
import { finishBackgroundFade } from "@/components/composer/background-fade";
import {
  BackgroundPalette,
  CategoryTabs,
} from "@/components/composer/background-palette";
import {
  APPEARANCE_PRESETS,
  applyPreset,
  matchingPreset,
} from "@/components/composer/appearance-presets";
import {
  OUTPUT_FORMATS,
  type OutputFormatName,
  type Transform,
  type Appearance,
  DEFAULT_APPEARANCE,
  DEFAULT_FORMAT_NAME,
  normalizeAngle,
  isDefaultAppearance,
  logicalSize,
  fitToStage,
  MARKETPLACE_BACKGROUND_ID,
} from "@/lib/composition";
import { PRINT_WARNING_MESSAGE, needsPrintWarning } from "@/lib/background-categories";
import { downloadCmyk } from "@/lib/print-download";
import {
  CORNERS,
  DEFAULT_LABEL,
  KARAT_OPTIONS,
  LOGO_OPACITY_RANGE,
  MAX_CODE_LENGTH,
  type Corner,
  type ProductLabel,
  gramProblem,
} from "@/lib/overlays";
import { useLogo } from "@/lib/use-logo";
import { useStageSize } from "@/components/composer/use-stage-size";
import { useBackgroundSelection } from "@/components/composer/use-background-selection";
import type { EditorDraft } from "@/lib/project-record";

const EditorStage = dynamic(
  () => import("@/components/composer/editor-stage").then((m) => m.EditorStage),
  {
    ssr: false,
    loading: () => (
      <div className="flex aspect-square w-full items-center justify-center bg-[#f5f5f7]">
        <Loader2 className="size-5 animate-spin opacity-40" />
      </div>
    ),
  },
);

export type CompositionEditorProps = {
  /** Arka plani kaldirilmis urunun object URL'i. */
  cutoutUrl: string;
  /** Indirilen dosyanin adinda kullanilir. */
  fileName: string;
  /** Indirme sonrasi "Ana menüye dön" (studyo saglar). */
  onReturnToStart?: () => void;
  /**
   * Katalog boyutunda indirilen gorseli katalog sablonuna gonderir; `false`
   * donerse gorsel tasinamadi (tarayici depolamasi kapali/dolu).
   */
  onSendToCatalog?: (jpegDataUrl: string) => boolean;
  /** Navbar'daki kısa çalışma özetini aktif adım ve araçla günceller. */
  onStatusChange?: (status: EditorStatus) => void;
  initialDraft?: EditorDraft | null;
  onSave?: (draft: EditorDraft) => Promise<boolean>;
  onDownloaded?: () => Promise<boolean>;
};

export type EditorStatus = {
  step: number;
  totalSteps: number;
  stepLabel: string;
  toolLabel: string;
};

/**
 * Indirme bittikten sonra acilan soru (Kaan, 17.09.2026). Katalog boyutunda
 * once "sablona ekle" soruluyor; "Hayır" denirse ana menu sorusu geliyor.
 */
type AfterDownload = "catalog" | "home" | null;

/**
 * Duzenleme uc adimda (Kaan, 17.09.2026: "cok daginik, asamalara bol").
 * Bicim ilk adimda: zemin listesi bicimin yonune gore suzuluyor, once bicim
 * secilmeli.
 */
const EDITOR_STEPS = [
  { id: 1, label: "Sahne" },
  { id: 2, label: "Düzenle" },
  { id: 3, label: "Tamamla" },
] as const;

/**
 * Her adimin ARACLARI; alttaki arac cubugunda adim sirasiyla gruplanmis
 * duruyor (18.09.2026, Kaan: iPhone Fotograflar duzeni). Adim artik ayri bir
 * durum degil, secili aractan turetiliyor.
 */
const STEP_TOOLS = {
  1: [
    { id: "boyut", label: "Boyut", icon: Ratio },
    { id: "zemin", label: "Zemin", icon: ImageIcon },
  ],
  2: [
    { id: "yerlesim", label: "Yerleşim", icon: Move },
    { id: "gorunum", label: "Görünüm", icon: SlidersHorizontal },
  ],
  3: [
    { id: "marka", label: "Marka", icon: Stamp },
    { id: "indir", label: "İndir", icon: Download },
  ],
} as const;

const TOOL_GROUPS = EDITOR_STEPS.map((item) => ({
  step: item.id,
  label: item.label,
  tools: STEP_TOOLS[item.id],
}));

/** Butun araclar bar sirasiyla — geri tusunun "siradaki onceki arac"i icin. */
const ALL_TOOLS: readonly { id: string; label: string }[] = EDITOR_STEPS.flatMap(
  (item) => [...STEP_TOOLS[item.id]],
);

function toolLabel(id: string | null): string {
  return ALL_TOOLS.find((tool) => tool.id === id)?.label ?? "";
}

/**
 * Acilista secili gelen arac: bilincli olarak ILK arac degil "Zemin" — bicim
 * zaten makul bir varsayilanla (A4) aciliyor, kullanicinin ilk gercek karari zemin.
 */
const DEFAULT_TOOL = "zemin";

type EditorStep = (typeof EDITOR_STEPS)[number]["id"];

function stepOfTool(tool: string): EditorStep {
  for (const item of EDITOR_STEPS) {
    if (STEP_TOOLS[item.id].some((candidate) => candidate.id === tool)) return item.id;
  }
  return 1;
}

/** Gorunum aracinda tek kaydirac: once ayar secilir, sonra kaydirilir (iPhone gibi). */
const ADJUSTMENTS = [
  { id: "brightness", label: "Parlaklık" },
  { id: "contrast", label: "Kontrast" },
  { id: "saturation", label: "Doygunluk" },
] as const;

type AdjustmentId = (typeof ADJUSTMENTS)[number]["id"];

/** Boyut kaydiracinin sinirlari — sigdirma olceginin katlari olarak. */
const MIN_SCALE_RATIO = 0.25;
const MAX_SCALE_RATIO = 2.5;

/**
 * Cizim basarisiz oldugunda gosterilen mesaj. Teknik sebep (genellikle bir
 * zeminin CORS izni) kullaniciya degil konsola yaziliyor; kullanicinin
 * yapabilecegi tek sey yenileyip tekrar denemek.
 */
const EXPORT_ERROR_MESSAGE =
  "Görsel dışa aktarılamadı. Sayfayı yenileyip tekrar deneyin.";

type PrintStatus = "idle" | "preparing" | "done" | { error: string };

/**
 * Veri URL'ini SENKRON olarak dosyaya cevirir.
 *
 * `await fetch(dataUrl)` kullanilmiyor: `navigator.share` ve `window.open`
 * kullanicinin tiklamasina bagli "gecici etkinlik" istiyor; araya bir await
 * girince tarayici (ozellikle Safari) paylasim menusunu reddedebiliyor.
 */
function dataUrlToFile(dataUrl: string, name: string): File {
  const [header, base64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], name, { type: mime });
}

function triggerDownload(href: string, name: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.click();
}

export function CompositionEditor({
  cutoutUrl,
  fileName,
  onReturnToStart,
  onSendToCatalog,
  onStatusChange,
  initialDraft,
  onSave,
  onDownloaded,
}: CompositionEditorProps) {
  const { backgrounds, hasServerBackground, isUnavailable, isLoading, retry: retryBackgrounds } =
    useBackgrounds();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isPrintInfoOpen, setIsPrintInfoOpen] = useState(false);
  const [formatName, setFormatName] = useState<OutputFormatName>(initialDraft?.formatName ?? DEFAULT_FORMAT_NAME);
  const [printStatus, setPrintStatus] = useState<PrintStatus>("idle");
  const [afterDownload, setAfterDownload] = useState<AfterDownload>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  /** Baskiya onerilmeyen zeminde CMYK indirmeden once acilan onay. */
  const [pendingPrintFormat, setPendingPrintFormat] = useState<"jpeg" | "tiff" | null>(null);
  const [transform, setTransform] = useState<Transform | null>(initialDraft?.transform ?? null);
  const [appearance, setAppearance] = useState<Appearance>(initialDraft?.appearance ?? DEFAULT_APPEARANCE);
  // Studyo yalnizca istemcide acildigi icin (kullanici etkilesimiyle) tembel
  // baslangic degeri localStorage'i guvenle okuyabiliyor; sunucu cizimi yok.
  // Logo akisi studyo ve katalogda AYNI (bkz. lib/use-logo.ts).
  const {
    logoUrl,
    settings: logo,
    message: logoMessage,
    handleFile: handleLogoFile,
    invert: invertCurrentLogo,
    update: updateLogo,
    remove: removeLogo,
  } = useLogo();
  const [label, setLabel] = useState<ProductLabel>(initialDraft?.label ?? DEFAULT_LABEL);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  /** Arac cubugunda secili arac; panel bunun paletini gosteriyor. */
  const [activeTool, setActiveTool] = useState<string>(initialDraft?.activeTool ?? DEFAULT_TOOL);
  const step = stepOfTool(activeTool);
  /**
   * Bar kucultulmus mu (Kaan, 18.09.2026). Kucultulunce menu karti kalkar,
   * bar tek bir kucuk hapa iner ve tuval o yeri alarak BUYUR — ikisi ayni
   * egriyle birlikte hareket eder (bkz. `.stage-fit-collapsed`).
   */
  const [isCollapsed, setIsCollapsed] = useState(false);
  /** Gorunum menusunde acik kaydirac; `null` = gorunum menusunun kendisi. */
  const [adjustment, setAdjustment] = useState<AdjustmentId | null>(null);
  /**
   * Gezinme gecmisi: geri tusu bir onceki ARACA doner (Boyut -> Zemin ->
   * Boyut...). Kartı kapatmak geri tusunun isi DEGIL — o "küçült" dugmesinde
   * (Kaan: "geri tuşu barı kapatıyor").
   */
  const [toolHistory, setToolHistory] = useState<string[]>([]);

  const openTool = useCallback(
    (id: string) => {
      if (id !== activeTool) setToolHistory((history) => [...history, activeTool].slice(-20));
      setActiveTool(id);
      setAdjustment(null);
      setIsCollapsed(false);
    },
    [activeTool],
  );

  /**
   * Geri: once menunun icindeki alt katman (kaydirac -> Gorunum), sonra bir
   * onceki arac. Gecmis bossa sirada bir onceki arac (Zemin -> Boyut).
   */
  /** Tek satirlik menuler ince kartla acilir, tuval o kadar buyur. */
  const isCompactMenu = activeTool === "zemin" || activeTool === "boyut";
  const toolIndex = ALL_TOOLS.findIndex((tool) => tool.id === activeTool);
  const previousTool =
    toolHistory.at(-1) ?? (toolIndex > 0 ? ALL_TOOLS[toolIndex - 1].id : null);
  const goBack = useCallback(() => {
    if (adjustment) {
      setAdjustment(null);
      return;
    }
    if (!previousTool) return;
    setToolHistory((history) => history.slice(0, -1));
    setActiveTool(previousTool);
  }, [adjustment, previousTool]);

  /**
   * Geri alma yigini.
   *
   * Yalnizca "kullanicinin bir sey degistirdigi" anlar kaydediliyor; surukleme
   * SIRASINDA degil, birakildiginda. Aksi halde tek bir surukleme yuzlerce adim
   * uretir ve Ctrl+Z pratikte ise yaramazdi.
   *
   * State degil REF: yigin arayuzu etkilemiyor, yalnizca Ctrl+Z aninda
   * okunuyor. State olsaydi her adimda gereksiz bir render olurdu.
   */
  const historyRef = useRef<{ transform: Transform | null; appearance: Appearance }[]>(
    [],
  );

  const pushHistory = useCallback(() => {
    historyRef.current.push({ transform, appearance });
    // Yigin sinirli: 50 adim, bir oturumda geri alinmak istenecek her seyi
    // fazlasiyla kapsiyor ve bellegi buyutmuyor.
    if (historyRef.current.length > 50) historyRef.current.shift();
  }, [transform, appearance]);

  const undo = useCallback(() => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    setTransform(previous.transform);
    setAppearance(previous.appearance);
  }, []);
  const [cutoutSize, setCutoutSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const stageRef = useRef<Konva.Stage | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const format = OUTPUT_FORMATS[formatName];
  const stageSize = useMemo(() => logicalSize(format), [format]);

  const displaySize = useStageSize(containerRef);

  /**
   * Klavye kisayollari.
   *
   * Ok tuslari urunu kaydiriyor (Shift ile 10 kat), Ctrl/Cmd+Z geri aliyor.
   * Fareyle bir pikseli tutturmak zor; ok tuslari kesin ayar icin tek yol.
   *
   * Bir metin alanina yaziliyorsa hicbir sey yapilmiyor — aksi halde baslik
   * yazarken urun kayardi.
   */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
        return;
      }

      const directions: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const direction = directions[event.key];
      if (!direction) return;

      event.preventDefault();
      const step = (event.shiftKey ? 10 : 1) * (stageSize.width / 500);
      pushHistory();
      setTransform((previous) => ({
        x: (previous?.x ?? stageSize.width / 2) + direction[0] * step,
        y: (previous?.y ?? stageSize.height / 2) + direction[1] * step,
        scale: previous?.scale ?? 1,
        rotation: previous?.rotation ?? 0,
      }));
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [undo, pushHistory, stageSize]);

  // Zemin secimi, bicime gore filtreleme ve kategori sekmeleri tek yerde
  // (bkz. use-background-selection.ts).
  const {
    selected: selectedBackground,
    shownGroup,
    groups: backgroundGroups,
    fitting: fittingBackgrounds,
    select: selectBackground,
    showCategory,
  } = useBackgroundSelection(backgrounds, format, initialDraft?.backgroundId ?? null);

  const handleStageReady = useCallback((stage: Konva.Stage | null) => {
    stageRef.current = stage;
  }, []);

  /** Kesimin sahneye tam oturdugu olcek — kaydiracin referans noktasi. */
  const fitScale = useMemo(
    () =>
      cutoutSize
        ? fitToStage(
            stageSize.width,
            stageSize.height,
            cutoutSize.width,
            cutoutSize.height,
          ).scale
        : null,
    [cutoutSize, stageSize],
  );

  const centerAndFit = useCallback(() => {
    if (!cutoutSize) return;
    pushHistory();
    setTransform(
      fitToStage(stageSize.width, stageSize.height, cutoutSize.width, cutoutSize.height),
    );
  }, [cutoutSize, stageSize, pushHistory]);

  /**
   * Bicim degistirir ve yerlesimi sifirlar.
   *
   * Sifirlama bir EFEKTTE degil burada: bicim degisimi bir OLAY. Efekte
   * konsaydi hem fazladan bir render turu olusurdu hem de React Compiler
   * bunu hakli olarak reddediyor (`react-hooks/set-state-in-effect`).
   *
   * Neden sifirlaniyor: donusum koordinatlari eski sahnenin olculerine gore
   * tutuluyor; yeni sahnede anlamsiz bir yerde kalirlardi. `null`, sahneye
   * "kendi baslangic yerlesimini hesapla" demek.
   */
  const changeFormat = useCallback((name: OutputFormatName) => {
    setFormatName(name);
    setTransform(null);
    // Pazaryeri "tek tikla": bicimle birlikte duz beyaz zemin seciliyor.
    // Kullanici sonra baska zemin secebilir; o zaman uyari gosteriliyor.
    if (name === "marketplace") {
      selectBackground(MARKETPLACE_BACKGROUND_ID);
    }
  }, [selectBackground]);

  const setScaleRatio = useCallback(
    (ratio: number) => {
      if (!fitScale) return;
      setTransform((previous) => ({
        x: previous?.x ?? stageSize.width / 2,
        y: previous?.y ?? stageSize.height / 2,
        rotation: previous?.rotation ?? 0,
        scale: fitScale * ratio,
      }));
    },
    [fitScale, stageSize],
  );

  const rotateBy = useCallback(
    (degrees: number) => {
      setTransform((previous) => ({
        x: previous?.x ?? stageSize.width / 2,
        y: previous?.y ?? stageSize.height / 2,
        scale: previous?.scale ?? 1,
        rotation: normalizeAngle((previous?.rotation ?? 0) + degrees),
      }));
    },
    [stageSize],
  );

  const currentRatio = transform && fitScale ? transform.scale / fitScale : 1;

  /**
   * Sahneyi cizip veri URL'i dondurur; indirmeyi cagirana birakiyor.
   *
   * `toDataURL` hata atabilir — en olasi sebep, CORS kurali eksik bir R2
   * zemininin tuvali "tainted" yapmasi (SecurityError). Hata cagirana
   * iletiliyor ama sahne ONCE geri yukleniyor: `finally` olmasaydi editor
   * mantiksal olcude (1000 px) ve secim tutamaklari gizli halde kalirdi.
   */
  const renderStage = useCallback(
    (type: "png" | "jpeg"): string | null => {
      const stage = stageRef.current;
      if (!stage) return null;

      setIsExporting(true);
      // Transformer tutamaklari sahnenin bir parcasi; gizlenmezse secim
      // cercevesi ve koseleri CIKTIYA da girer. Disa aktarmadan once
      // gecici olarak gizleniyor, `finally` icinde geri aliniyor.
      const transformers = stage.find("Transformer");
      const previousWidth = stage.width();
      const previousHeight = stage.height();
      const previousScale = { x: stage.scaleX(), y: stage.scaleY() };

      try {
        transformers.forEach((node) => node.hide());
        // Suren bir zemin gecisi dosyaya iki zeminin karisimini sokmasin.
        finishBackgroundFade(stage);
        stage.draw();

        // Sahne, disa aktarma suresince EKRAN olcusunden MANTIKSAL olcusune
        // aliniyor (olcek 1). Sebebi bir off-by-one hatasi:
        //
        // Once dogrudan `pixelRatio: OUTPUT_SIZE / displaySize` kullaniliyordu.
        // Ekran olcusu kapsayiciya gore degisken ve genellikle yuvarlak degil;
        // 434 px genisliginde olculdugunde oran 4.6082... cikiyor ve Konva'nin
        // ic hesabi 2000 yerine 1999 px'lik bir tuval uretiyordu. Yol haritasi
        // cikti olcusunu 2000x2000 olarak SAYIYLA belirtiyor; 1999 sessizce
        // yanlis bir cikti demek.
        //
        // Mantiksal olcuye alindiginda oran OUTPUT_SIZE / STAGE_SIZE = 2,
        // yani tam sayi; sonuc her ekran genisliginde birebir 2000x2000.
        stage.width(stageSize.width);
        stage.height(stageSize.height);
        stage.scale({ x: 1, y: 1 });

        const dataUrl = stage.toDataURL({
          mimeType: type === "png" ? "image/png" : "image/jpeg",
          quality: 0.92,
          // Mantiksal olcu her zaman ciktinin yarisi oldugu icin oran tam 2.
          pixelRatio: format.outputWidth / stageSize.width,
        });
        // Konva "tainted" tuvalde SecurityError'i FIRLATMIYOR: kendisi yakalayip
        // konsola yaziyor ve bos string donduruyor (konva/lib/Canvas.js,
        // tarayicida da olculdu). Burada hataya cevrilmezse PNG dugmesi hicbir
        // sey yapmiyor gibi gorunur ve kullanici sebebini hic ogrenemez.
        if (!dataUrl) {
          throw new Error("Konva bos veri URL'i dondurdu (tuval tainted olabilir).");
        }
        return dataUrl;
      } finally {
        stage.width(previousWidth);
        stage.height(previousHeight);
        stage.scale(previousScale);
        transformers.forEach((node) => node.show());
        stage.draw();
        setIsExporting(false);
      }
    },
    [stageSize, format],
  );

  const openAfterDownload = useCallback(() => {
    setCatalogError(null);
    setAfterDownload(formatName === "catalog" && onSendToCatalog ? "catalog" : "home");
  }, [formatName, onSendToCatalog]);

  /** Sahneyi indirilebilir bir dosyaya cevirir. */
  const download = useCallback(
    (type: "png" | "jpeg") => {
      let dataUrl: string | null;
      try {
        dataUrl = renderStage(type);
      } catch (error) {
        console.error("[composer] disa aktarma basarisiz:", error);
        setExportError(EXPORT_ERROR_MESSAGE);
        return;
      }
      setExportError(null);
      if (!dataUrl) return;
      triggerDownload(
        dataUrl,
        `${fileName.replace(/\.[^.]+$/, "")}-${format.fileSlug}.${type === "jpeg" ? "jpg" : "png"}`,
      );
      void onDownloaded?.();
      openAfterDownload();
    },
    [renderStage, fileName, format, openAfterDownload, onDownloaded],
  );

  const saveDraft = useCallback(async () => {
    if (!onSave) return;
    setSaveStatus("saving");
    setSaveStatus((await onSave({ formatName, backgroundId: selectedBackground.id, transform, appearance, label, step, activeTool })) ? "saved" : "error");
  }, [onSave, formatName, selectedBackground.id, transform, appearance, label, step, activeTool]);

  /**
   * WhatsApp'ta paylas (one alinan is, 13.09.2026).
   *
   * Telefonda: isletim sisteminin paylasim menusu GORSELIN KENDISIYLE aciliyor,
   * kullanici WhatsApp'i ve sohbeti seciyor. Masaustunde WhatsApp Web'e bir
   * baglantiyla dosya eklenemiyor (WhatsApp buna izin vermiyor); orada gorsel
   * indiriliyor, WhatsApp Web aciliyor ve kullaniciya ne yapacagi soyleniyor.
   * Sessizce "paylasildi" gibi davranmak yanlis olurdu.
   *
   * JPEG: WhatsApp gorseli zaten yeniden sikistiriyor; PNG gondermek yalnizca
   * yuklemeyi yavaslatir.
   */
  const shareToWhatsApp = useCallback(() => {
    let dataUrl: string | null;
    try {
      dataUrl = renderStage("jpeg");
    } catch (error) {
      console.error("[composer] paylasim icin cizim basarisiz:", error);
      setExportError(EXPORT_ERROR_MESSAGE);
      return;
    }
    setExportError(null);
    if (!dataUrl) return;

    const name = `${fileName.replace(/\.[^.]+$/, "")}-${format.fileSlug}.jpg`;
    const file = dataUrlToFile(dataUrl, name);

    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      setShareMessage(null);
      navigator.share({ files: [file] }).catch((error: unknown) => {
        // Kullanici menuyu kapattiysa hata degil.
        if ((error as { name?: string })?.name === "AbortError") return;
        setShareMessage("Paylaşım menüsü açılamadı. Görseli JPEG olarak indirip WhatsApp'tan gönderebilirsiniz.");
      });
      return;
    }

    triggerDownload(dataUrl, name);
    window.open("https://web.whatsapp.com/", "_blank", "noopener,noreferrer");
    setShareMessage(
      "Görsel indirildi. Açılan WhatsApp'ta sohbeti seçin ve indirilen görseli pencereye sürükleyin.",
    );
  }, [renderStage, fileName, format]);


  /**
   * Baskiya uygun (CMYK) indirme.
   *
   * Sahne once PNG olarak ciziliyor, sonra sunucuya gonderilip hedef baski
   * kosulunun ICC profiliyle CMYK'ya cevriliyor (bkz. app/api/cmyk/route.ts).
   * Tarayicida yapilamaz: canvas yalnizca RGB uretir, PNG CMYK'yi desteklemez.
   */
  const downloadForPrint = useCallback(
    async (printFormat: "jpeg" | "tiff") => {
      // Cizim ayri yakalaniyor: asagidaki `catch` ag hatalari icin ve
      // "Sunucuya ulaşılamadı" diyor; tarayicidaki bir cizim hatasini oyle
      // raporlamak kullaniciyi yanlis yere yonlendirirdi.
      let dataUrl: string | null;
      try {
        dataUrl = renderStage("png");
      } catch (error) {
        console.error("[composer] CMYK icin cizim basarisiz:", error);
        setPrintStatus({ error: EXPORT_ERROR_MESSAGE });
        return;
      }
      if (!dataUrl) return;

      setPrintStatus("preparing");
      // Istek ve indirme katalogla ortak (lib/print-download.ts).
      const result = await downloadCmyk(dataUrl, printFormat, fileName.replace(/\.[^.]+$/, ""));
      setPrintStatus(result.ok ? "done" : { error: result.error });
      if (result.ok) {
        void onDownloaded?.();
        openAfterDownload();
      }
    },
    [renderStage, fileName, openAfterDownload, onDownloaded],
  );

  /** Katalog sorusuna "Evet": gorsel RGB JPEG olarak cizilip kataloga gidiyor. */
  const sendToCatalog = useCallback(() => {
    if (!onSendToCatalog) return;
    let dataUrl: string | null;
    try {
      dataUrl = renderStage("jpeg");
    } catch (error) {
      console.error("[composer] katalog icin cizim basarisiz:", error);
      setCatalogError(EXPORT_ERROR_MESSAGE);
      return;
    }
    if (!dataUrl) return;
    if (!onSendToCatalog(dataUrl)) {
      setCatalogError("Görsel kataloğa taşınamadı. İndirdiğiniz dosyayı Katalog sayfasında ekleyebilirsiniz.");
    }
  }, [onSendToCatalog, renderStage]);

  /**
   * CMYK dugmelerinin girisi. Cozunurlugu baski icin dusuk zeminlerde
   * (katalogda `printWarning`) once onay isteniyor — Kaan'in karari
   * (17.09.2026): baski yasaklanmiyor, kullaniciya soruluyor.
   *
   * Sinir: kontrol arayuzde. `/api/cmyk` yalnizca cizilmis sahneyi aliyor,
   * hangi zeminin kullanildigini bilmiyor.
   */
  const requestPrint = useCallback(
    (printFormat: "jpeg" | "tiff") => {
      if (needsPrintWarning(selectedBackground.id)) {
        setPendingPrintFormat(printFormat);
        return;
      }
      void downloadForPrint(printFormat);
    },
    [selectedBackground.id, downloadForPrint],
  );

  useEffect(() => {
    if (!pendingPrintFormat) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setPendingPrintFormat(null);
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [pendingPrintFormat]);

  useEffect(() => {
    if (!afterDownload) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAfterDownload(null);
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [afterDownload]);

  const tools = STEP_TOOLS[step];

  useEffect(() => {
    const stepLabel = EDITOR_STEPS.find((item) => item.id === step)?.label ?? "";
    const toolLabel = tools.find((item) => item.id === activeTool)?.label ?? stepLabel;
    onStatusChange?.({
      step,
      totalSteps: EDITOR_STEPS.length,
      stepLabel,
      toolLabel,
    });
  }, [activeTool, onStatusChange, step, tools]);

  /**
   * Dock'un basligi, sag ustteki baglam denetimi ve paleti.
   *
   * Tek yerde toplaniyor: "o an secili arac neyse dock onu gosterir" kurali
   * bir switch olarak okunabilir kalsin, JSX'in icine dagilmasin.
   */
  const dock = (() => {
    if (activeTool === "boyut") {
      return {
        title: "Çıktı boyutu",
        action: <span className="on-dark-muted fine-print">{format.outputWidth}×{format.outputHeight}</span>,
        body: (
          <DockStrip label="Çıktı boyutları">
            {(
              Object.entries(OUTPUT_FORMATS) as [
                OutputFormatName,
                (typeof OUTPUT_FORMATS)[OutputFormatName],
              ][]
            ).map(([name, option]) => (
              <button
                key={name}
                type="button"
                onClick={() => changeFormat(name)}
                aria-pressed={formatName === name}
                className={
                  "press w-28 shrink-0 snap-start rounded-xl px-2.5 py-2 text-left transition-colors " +
                  (formatName === name
                    ? "ring-gold bg-white/10 ring-2"
                    : "ring-1 ring-white/12 hover:bg-white/6")
                }
              >
                {/* Gercek en-boy onizlemesi: bicimi okumadan da ayirt edilsin. */}
                <span
                  className="mb-1.5 block w-7 rounded-[0.25rem] bg-white/25"
                  style={{ aspectRatio: `${option.outputWidth} / ${option.outputHeight}` }}
                  aria-hidden
                />
                <span className="block text-[0.75rem] font-medium">{option.label}</span>
                <span className="on-dark-muted block text-[0.6875rem] leading-tight">
                  {option.summary}
                </span>
              </button>
            ))}
          </DockStrip>
        ),
      };
    }

    if (activeTool === "zemin") {
      return {
        title: "Zemin",
        // Kategori sekmeleri kartin BASLIK satirinda: ayri bir satir kart
        // yuksekligini buyutuyor, tuvali kucultuyordu (18.09.2026).
        action: (
          <CategoryTabs
            groups={backgroundGroups}
            shownGroup={shownGroup}
            onSelect={showCategory}
          />
        ),
        body: (
          <>
            <BackgroundPalette
              key={shownGroup?.id ?? "all"}
              items={shownGroup?.items ?? fittingBackgrounds}
              selectedId={selectedBackground.id}
              onSelect={selectBackground}
              gradientCss={gradientCss}
            />

            {/*
              Yer tutucu zeminler kullaniciya ACIKCA soyleniyor: gercek zemin
              kutuphanesi yokken "iste zeminleriniz" demek yanlis olurdu.
              "Hazirlaniyor" ile "yuklenemedi" AYRI sebepler (PR #18).
            */}
            {!isLoading && !hasServerBackground ? (
              isUnavailable ? (
                <p role="status" className="fine-print mt-2 px-1 text-amber-300">
                  Zemin kütüphanesi şu an yüklenemedi; şimdilik sade zeminler.{" "}
                  <button
                    type="button"
                    onClick={retryBackgrounds}
                    className="press font-medium underline underline-offset-2"
                  >
                    Tekrar dene
                  </button>
                </p>
              ) : (
                <p className="fine-print on-dark-muted mt-2 px-1">
                  Zemin kütüphanesi hazırlanıyor. Şimdilik sade zeminler.
                </p>
              )
            ) : null}

            {formatName === "marketplace" &&
            selectedBackground.id !== MARKETPLACE_BACKGROUND_ID ? (
              <p role="status" className="fine-print mt-2 px-1 text-amber-300">
                Pazaryerleri genellikle düz beyaz zemin ister.{" "}
                <button
                  type="button"
                  onClick={() => selectBackground(MARKETPLACE_BACKGROUND_ID)}
                  className="font-medium underline underline-offset-2"
                >
                  Beyaza dön
                </button>
              </p>
            ) : null}
          </>
        ),
      };
    }

    if (activeTool === "yerlesim") {
      return {
        title: "Yerleşim",
        body: (
          <DockStrip label="Yerleşim eylemleri" centered>
            <DockAction onClick={centerAndFit} disabled={!cutoutSize} icon={<Crosshair className="size-3.5" strokeWidth={1.75} aria-hidden />}>
              Ortala ve sığdır
            </DockAction>
            <DockAction onClick={() => rotateBy(-15)} disabled={!cutoutSize}>−15°</DockAction>
            <DockAction onClick={() => rotateBy(15)} disabled={!cutoutSize} icon={<RotateCw className="size-3.5" strokeWidth={1.75} aria-hidden />}>
              15°
            </DockAction>
            <DockAction onClick={() => rotateBy(90)} disabled={!cutoutSize}>90°</DockAction>
          </DockStrip>
        ),
      };
    }

    if (activeTool === "gorunum") {
      const preset = matchingPreset(appearance);
      // Ikinci katman: secilen ayarin TEK kaydiraci (iPhone gibi). Geri tusu
      // gorunum menusune doner.
      if (adjustment) {
        const range = {
          brightness: { min: -0.3, max: 0.3, step: 0.01, format: (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}` },
          contrast: { min: -40, max: 40, step: 1, format: (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}` },
          saturation: { min: -1, max: 1, step: 0.02, format: (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}` },
        }[adjustment];
        const adjustmentLabel = ADJUSTMENTS.find((item) => item.id === adjustment)!.label;
        return {
          title: "Görünüm",
          action: <span className="on-dark-muted fine-print">{adjustmentLabel}</span>,
          body: (
            <div className="px-3 pt-4">
              <Slider
                label={adjustmentLabel}
                value={appearance[adjustment]}
                min={range.min}
                max={range.max}
                step={range.step}
                format={range.format}
                onStart={pushHistory}
                onChange={(v) => setAppearance((a) => ({ ...a, [adjustment]: v }))}
              />
            </div>
          ),
        };
      }
      return {
        title: "Görünüm",
        action: !isDefaultAppearance(appearance) ? (
          <button
            type="button"
            onClick={() => setAppearance(DEFAULT_APPEARANCE)}
            className="press on-dark-muted text-[0.75rem] underline underline-offset-2 hover:text-[#f3f0eb]"
          >
            sıfırla
          </button>
        ) : undefined,
        body: (
          <>
            <DockStrip label="Hazır görünüm ayarları" centered>
              {APPEARANCE_PRESETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    pushHistory();
                    setAppearance((current) => applyPreset(current, item));
                  }}
                  aria-pressed={preset?.id === item.id}
                  className={
                    "press min-h-9 shrink-0 snap-start rounded-full px-3.5 text-[0.8125rem] whitespace-nowrap transition-colors " +
                    (preset?.id === item.id
                      ? "ring-gold text-gold bg-white/10 ring-2"
                      : "on-dark-muted ring-1 ring-white/12 hover:bg-white/6 hover:text-[#f3f0eb]")
                  }
                >
                  {item.label}
                </button>
              ))}
            </DockStrip>
            <div className="flex flex-wrap justify-center gap-2 px-1">
              {ADJUSTMENTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAdjustment(item.id)}
                  className="press liquid-glass-pill min-h-9 rounded-full px-3.5 text-[0.8125rem]"
                >
                  {item.label}
                </button>
              ))}
              <Toggle
                label="Gölge"
                isOn={appearance.shadow}
                onChange={(on) => setAppearance((a) => ({ ...a, shadow: on }))}
              />
              <Toggle
                label="Yansıma"
                isOn={appearance.reflection}
                onChange={(on) => setAppearance((a) => ({ ...a, reflection: on }))}
              />
            </div>
          </>
        ),
      };
    }

    if (activeTool === "marka") {
      return {
        title: "Marka",
        action: (
          <span className="on-dark-muted fine-print">
            Logo ve ürün bilgisi
          </span>
        ),
        body: (
          <>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label="Logo dosyası seç"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void handleLogoFile(file);
              }}
            />
            <DockStrip label="Marka öğeleri" centered>
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt="Yüklenen logo"
                    className="checkerboard size-9 shrink-0 self-center rounded-lg object-contain ring-1 ring-white/15"
                  />
              ) : null}
              <DockAction
                onClick={() => logoInputRef.current?.click()}
                icon={<ImagePlus className="size-3.5" strokeWidth={1.75} aria-hidden />}
              >
                {logoUrl ? "Logoyu değiştir" : "Logo yükle"}
              </DockAction>
              {logoUrl ? (
                <>
                  <DockAction onClick={() => void invertCurrentLogo()} icon={<Contrast className="size-3.5" strokeWidth={1.75} aria-hidden />}>
                    Renkleri çevir
                  </DockAction>
                  <DockAction onClick={removeLogo} icon={<Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden />}>
                    Kaldır
                  </DockAction>
                </>
              ) : null}
              <Toggle
                label="Ürün etiketi"
                isOn={label.enabled}
                onChange={(enabled) => setLabel((current) => ({ ...current, enabled }))}
              />
            </DockStrip>

            {(logoUrl || label.enabled) ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {logoUrl ? (
                  <CornerRow
                    label="Logo konumu"
                    value={logo.position ? null : logo.corner}
                    onChange={(corner) => updateLogo({ corner, position: null })}
                  />
                ) : <span />}
                {label.enabled ? (
                  <CornerRow
                    label="Etiket konumu"
                    value={label.corner}
                    onChange={(corner) => setLabel((current) => ({ ...current, corner }))}
                  />
                ) : null}
              </div>
            ) : null}
            {label.enabled ? (
              <div className="mt-2 flex gap-2 sm:ml-auto sm:w-1/2 sm:pl-1">
                <Toggle
                  label="Koyu etiket"
                  isOn={label.theme === "dark"}
                  onChange={() => setLabel((current) => ({ ...current, theme: "dark" }))}
                />
                <Toggle
                  label="Açık etiket"
                  isOn={label.theme === "light"}
                  onChange={() => setLabel((current) => ({ ...current, theme: "light" }))}
                />
              </div>
            ) : null}
          </>
        ),
      };
    }

    return {
      title: "İndir",
      action: (
        <span className="on-dark-muted fine-print">
          {format.outputWidth}×{format.outputHeight}
        </span>
      ),
      body: (
        <>
        <DockStrip label="Çıktı türleri">
          <DockAction onClick={() => download("png")} disabled={isExporting} icon={<Download className="size-3.5" strokeWidth={1.75} aria-hidden />}>
            PNG
          </DockAction>
          <DockAction onClick={() => download("jpeg")} disabled={isExporting}>JPEG</DockAction>
          <DockAction
            onClick={() => requestPrint("tiff")}
            disabled={printStatus === "preparing"}
            icon={
              printStatus === "preparing" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Printer className="size-3.5" strokeWidth={1.75} aria-hidden />
              )
            }
          >
            CMYK TIFF
          </DockAction>
          <DockAction onClick={() => requestPrint("jpeg")} disabled={printStatus === "preparing"}>
            CMYK JPEG
          </DockAction>
          <DockAction onClick={shareToWhatsApp} disabled={isExporting} icon={<MessageCircle className="size-3.5" strokeWidth={1.75} aria-hidden />}>
            WhatsApp
          </DockAction>
          {onSave ? (
            <DockAction onClick={() => void saveDraft()} disabled={saveStatus === "saving"} icon={<CheckCircle2 className="size-3.5" strokeWidth={1.75} aria-hidden />}>
              {saveStatus === "saving" ? "Kaydediliyor" : saveStatus === "saved" ? "Kaydedildi" : "Kaydet"}
            </DockAction>
          ) : null}
        </DockStrip>
        {saveStatus === "error" ? <p className="fine-print mt-2 text-red-300">Çalışma kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.</p> : null}
        </>
      ),
    };
  })();

  /** Denetcideki ince ayarlar — secili araca gore. */
  const inspectorBody = (() => {
    if (activeTool === "yerlesim") {
      return (
        <div>
          <div className="fine-print on-dark-muted mb-1.5 flex items-center justify-between">
            <span>Boyut</span>
            <span className="tabular-nums">{Math.round(currentRatio * 100)}%</span>
          </div>
          <input
            type="range"
            min={MIN_SCALE_RATIO * 100}
            max={MAX_SCALE_RATIO * 100}
            step={1}
            value={Math.round(currentRatio * 100)}
            disabled={!fitScale}
            aria-label="Ürün boyutu"
            onChange={(event) => setScaleRatio(Number(event.target.value) / 100)}
            className="accent-gold h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15"
          />
          <p className="fine-print on-dark-muted mt-2 hidden lg:block">
            Sürükleyerek taşıyın, köşelerden boyutlandırın, üstteki tutamaçtan
            döndürün.
          </p>
        </div>
      );
    }

    if (activeTool === "marka") {
      return (
        <>
          <p className="text-[0.75rem] font-medium text-[#f3f0eb]">Logo</p>
          {logoUrl ? (
            <Slider
              label="Saydamlık"
              value={logo.opacity}
              min={LOGO_OPACITY_RANGE.min}
              max={LOGO_OPACITY_RANGE.max}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(opacity) => updateLogo({ opacity })}
            />
          ) : null}
          {logoMessage ? (
            <p role="alert" className="fine-print text-red-300">
              {logoMessage}
            </p>
          ) : (
            <p className="fine-print on-dark-muted">
              Saydam PNG en iyi sonucu verir. Logo yalnızca bu tarayıcıda hatırlanır.
            </p>
          )}
          <div className="border-t border-white/10 pt-3">
            <p className="mb-2 text-[0.75rem] font-medium text-[#f3f0eb]">Ürün etiketi</p>
            {label.enabled ? (
              <>
                <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="fine-print on-dark-muted block">Ayar</span>
              <select
                value={label.karat}
                onChange={(event) =>
                  setLabel((current) => ({ ...current, karat: event.target.value }))
                }
                className="mt-1 min-h-9 w-full rounded-lg bg-white/8 px-2 text-[0.8125rem] ring-1 ring-white/12"
              >
                <option value="">Yok</option>
                {KARAT_OPTIONS.map((karat) => (
                  <option key={karat} value={karat}>
                    {karat}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="fine-print on-dark-muted block">Gram</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="3,45"
                value={label.gram}
                onChange={(event) =>
                  setLabel((current) => ({ ...current, gram: event.target.value }))
                }
                aria-invalid={gramProblem(label.gram) ? true : undefined}
                className="mt-1 min-h-9 w-full rounded-lg bg-white/8 px-2 text-[0.8125rem] ring-1 ring-white/12 aria-invalid:ring-red-400"
              />
            </label>
                </div>
                <label className="mt-3 block">
                  <span className="fine-print on-dark-muted block">Ürün kodu</span>
                  <input
                    type="text"
                    placeholder="A-102"
                    maxLength={MAX_CODE_LENGTH}
                    value={label.code}
                    onChange={(event) =>
                      setLabel((current) => ({ ...current, code: event.target.value }))
                    }
                    className="mt-1 min-h-9 w-full rounded-lg bg-white/8 px-2 text-[0.8125rem] ring-1 ring-white/12"
                  />
                </label>
                {gramProblem(label.gram) ? (
                  <p role="alert" className="fine-print mt-2 text-red-300">
                    {gramProblem(label.gram)}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="fine-print on-dark-muted">
                Ayar, gram ve ürün kodunu görselin köşesine eklemek için dock’tan etkinleştirin.
              </p>
            )}
          </div>
        </>
      );
    }

    if (activeTool === "indir") {
      return (
        <>
          <button
            type="button"
            onClick={() => setIsPrintInfoOpen((open) => !open)}
            aria-expanded={isPrintInfoOpen}
            className="fine-print on-dark-muted underline underline-offset-2 hover:text-[#f3f0eb]"
          >
            CMYK ne demek?
          </button>
          {isPrintInfoOpen ? (
            <p className="fine-print on-dark-muted leading-relaxed">
              Matbaa, ekran için üretilen RGB dosyayı doğrudan basamaz. Bu seçenek
              görseli, hedef baskı koşulunun ICC profiliyle CMYK renk uzayına
              çevirip profili dosyaya gömer. Saydam alanlar beyaza düzleştirilir,
              çünkü CMYK&apos;de saydamlık yoktur. TIFF matbaanın tercih ettiği
              biçim; JPEG daha küçük.
            </p>
          ) : null}
          {printStatus === "done" ? (
            <p role="status" className="fine-print on-dark-muted">
              İndirildi.
            </p>
          ) : typeof printStatus === "object" ? (
            <p role="alert" className="fine-print text-red-300">
              {printStatus.error}
            </p>
          ) : null}
          {shareMessage ? (
            <p role="status" className="fine-print on-dark-muted">
              {shareMessage}
            </p>
          ) : null}
          {exportError ? (
            <p role="alert" className="fine-print text-red-300">
              {exportError}
            </p>
          ) : null}
          <p className="fine-print on-dark-muted">
            PNG çıktısı zaten kayıpsızdır; JPEG sıkıştırma uygular.
          </p>
        </>
      );
    }

    return null;
  })();

  return (
    <div className="relative flex w-full flex-col lg:min-h-[calc(100dvh-4.25rem)]">
      {/* Tuval üstte, bütün kontroller altında tek panelde (iPhone Fotoğraflar düzeni, 18.09.2026). */}
      <div className="order-1 relative z-0 flex min-w-0 items-center justify-center bg-white px-3 py-5 lg:static lg:flex-1 lg:px-6">
        <div
          ref={containerRef}
          className={
            "stage-fit w-full min-w-0" +
            (isCollapsed ? " stage-fit-collapsed" : isCompactMenu ? " stage-fit-compact" : "")
          }
          // Tuval ekran YUKSEKLIGINE de sigmali: A4 gibi dikey bicimlerde
          // yalnizca genislige gore buyutmek tuvali ekranin altina tasiyordu.
          // Dock ayrı satırda; dikey pay fotoğrafın tamamını görünür tutar.
          style={{
            maxWidth: `min(46rem, calc((100dvh - var(--studio-reserved)) * ${format.outputWidth / format.outputHeight}))`,
          }}
        >
          <div
            className="overflow-hidden rounded-[1.25rem] shadow-[0_32px_64px_-32px_rgba(0,0,0,0.9)] ring-1 ring-white/12"
            style={{ aspectRatio: `${format.outputWidth} / ${format.outputHeight}` }}
          >
            <EditorStage
              cutoutUrl={cutoutUrl}
              background={selectedBackground}
              displayWidth={displaySize}
              stageWidth={stageSize.width}
              stageHeight={stageSize.height}
              transform={transform}
              appearance={appearance}
              logoUrl={logoUrl}
              logo={logo}
              label={label}
              onLogoChange={updateLogo}
              onTransformChange={(next) => {
                pushHistory();
                setTransform(next);
              }}
              onCutoutSize={setCutoutSize}
              onStageReady={handleStageReady}
            />
          </div>
          <p className="fine-print text-muted-foreground mt-2 text-center lg:hidden">
            Sürükleyerek taşıyın · köşelerden boyutlandırın · üstteki tutamaçtan
            döndürün
          </p>
        </div>
      </div>

      <div className="relative z-10 order-2 mt-2 flex shrink-0 justify-center px-3 pb-4 lg:px-6">
        <Dock
          title={dock.title}
          action={dock.action}
          settings={inspectorBody}
          tools={
            <ToolBar
              groups={TOOL_GROUPS}
              activeTool={activeTool}
              onToolChange={openTool}
            />
          }
          activeToolLabel={toolLabel(activeTool)}
          isCollapsed={isCollapsed}
          onCollapsedChange={setIsCollapsed}
          compact={isCompactMenu}
          layerKey={`${activeTool}:${adjustment ?? ""}`}
          onBack={goBack}
          canGoBack={Boolean(adjustment || previousTool)}
          backLabel={
            adjustment
              ? "Görünüm menüsüne dön"
              : previousTool
                ? `Önceki araç: ${toolLabel(previousTool)}`
                : "Önceki araç"
          }
        >
          {dock.body}
        </Dock>
      </div>
      {afterDownload ? (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-5">
          <button
            type="button"
            aria-label="Kapat"
            onClick={() => setAfterDownload(null)}
            className="soft-fade fixed inset-0 bg-black/55 backdrop-blur-[2px]"
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="indirme-bitti-baslik"
            className="soft-enter relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="size-5" strokeWidth={1.75} aria-hidden />
            </span>
            <p className="text-muted-foreground mt-4 text-[0.875rem]">
              İndirme işlemi başarıyla tamamlandı.
            </p>
            <h2
              id="indirme-bitti-baslik"
              className="mt-1 text-[1.0625rem] font-semibold tracking-[-0.01em]"
            >
              {afterDownload === "catalog"
                ? "Katalog görselinizi şablona eklemek ister misiniz?"
                : "Ana menüye dönmek ister misiniz?"}
            </h2>
            {catalogError ? (
              <p role="alert" className="fine-print mt-2 text-red-700">
                {catalogError}
              </p>
            ) : null}
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                autoFocus
                onClick={() =>
                  setAfterDownload(
                    afterDownload === "catalog" && onReturnToStart ? "home" : null,
                  )
                }
                className="min-h-11 flex-1 rounded-full text-[0.9375rem] ring-1 ring-black/15 transition-colors hover:bg-black/5"
              >
                Hayır
              </button>
              <button
                type="button"
                onClick={() => {
                  if (afterDownload === "catalog") {
                    sendToCatalog();
                    return;
                  }
                  setAfterDownload(null);
                  onReturnToStart?.();
                }}
                className="press bg-foreground text-background min-h-11 flex-1 rounded-full text-[0.9375rem] font-medium"
              >
                Evet
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingPrintFormat ? (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-5">
          <button
            type="button"
            aria-label="Vazgeç"
            onClick={() => setPendingPrintFormat(null)}
            className="soft-fade fixed inset-0 bg-black/55 backdrop-blur-[2px]"
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="baski-uyari-baslik"
            aria-describedby="baski-uyari-aciklama"
            className="soft-enter relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-amber-100 text-amber-800">
              <Printer className="size-5" strokeWidth={1.75} aria-hidden />
            </span>
            <h2
              id="baski-uyari-baslik"
              className="mt-4 text-[1.0625rem] font-semibold tracking-[-0.01em]"
            >
              {PRINT_WARNING_MESSAGE}
            </h2>
            <p
              id="baski-uyari-aciklama"
              className="text-muted-foreground mt-2 text-[0.875rem] leading-relaxed"
            >
              Seçtiğiniz zeminin çözünürlüğü baskı için düşük; basılı çıktıda zemin
              bulanık görünebilir. Ekranda ve sosyal medyada kullanım için sorun yok.
            </p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setPendingPrintFormat(null)}
                className="min-h-11 flex-1 rounded-full text-[0.9375rem] ring-1 ring-black/15 transition-colors hover:bg-black/5"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  const printFormat = pendingPrintFormat;
                  setPendingPrintFormat(null);
                  void downloadForPrint(printFormat);
                }}
                className="press bg-foreground text-background min-h-11 flex-1 rounded-full text-[0.9375rem] font-medium"
              >
                Evet, indir
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  onStart,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  /** Kaydiraca BASILDIGINDA cagriliyor — geri alma adimi burada kaydediliyor,
      her deger degisiminde degil; aksi halde tek surukleme yuzlerce adim
      uretirdi. */
  onStart?: () => void;
}) {
  return (
    <div>
      <div className="fine-print on-dark-muted mb-1.5 flex items-center justify-between">
        <span>{label}</span>
        <span className="tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onPointerDown={onStart}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-gold h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15"
      />
    </div>
  );
}

function Toggle({
  label,
  isOn,
  onChange,
}: {
  label: string;
  isOn: boolean;
  onChange: (isOn: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      onClick={() => onChange(!isOn)}
      className={
        "press min-h-9 flex-1 rounded-full px-3 text-[0.8125rem] transition-colors " +
        (isOn
          ? "bg-gold font-medium text-[#1a1917]"
          : "on-dark-muted ring-1 ring-white/15 hover:bg-white/8 hover:text-[#f3f0eb]")
      }
    >
      {label}
    </button>
  );
}

/**
 * Dort kose secimi — dock'ta YATAY tek sirada (17.09.2026).
 *
 * Eski 2x2 izgara sag paneldeyken dogruydu; dock'ta yuksekligi iki katina
 * cikariyordu. Secili kose yine altin halkali ve `aria-pressed` tasiyor.
 */
function CornerRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Corner | null;
  onChange: (corner: Corner) => void;
}) {
  return (
    <div role="group" aria-label={label}>
      <span className="fine-print on-dark-muted mb-1.5 block px-1">{label}</span>
      <div className="flex gap-2">
        {CORNERS.map((corner) => (
          <button
            key={corner.id}
            type="button"
            onClick={() => onChange(corner.id)}
            aria-pressed={value === corner.id}
            className={
              "press min-h-9 flex-1 rounded-lg text-[0.75rem] transition-shadow " +
              (value === corner.id
                ? "ring-gold text-gold bg-white/10 ring-2"
                : "on-dark-muted ring-1 ring-white/12 hover:bg-white/6 hover:text-[#f3f0eb]")
            }
          >
            {corner.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Dock'taki hizli eylem dugmesi.
 *
 * Hepsi ayni olcude ve ayni yerde: dock bir PALET, yani icindeki ogeler
 * birbirine benzemeli. Metin `whitespace-nowrap` — Turkce etiketler kisa
 * ekranda iki satira dusup dock'u buyutuyordu.
 */
function DockAction({
  children,
  onClick,
  disabled,
  icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="press on-dark-muted flex min-h-9 shrink-0 snap-start items-center gap-1.5 rounded-full px-3.5 text-[0.8125rem] whitespace-nowrap ring-1 ring-white/12 transition-colors hover:bg-white/8 hover:text-[#f3f0eb] disabled:opacity-40"
    >
      {icon}
      {children}
    </button>
  );
}

/** Konva'nin `[oran, renk, ...]` dizisini CSS gradyanina cevirir (onizleme). */
function gradientCss(stops: (number | string)[]): string {
  const parts: string[] = [];
  for (let i = 0; i < stops.length; i += 2) {
    parts.push(`${stops[i + 1]} ${Number(stops[i]) * 100}%`);
  }
  return `linear-gradient(135deg, ${parts.join(", ")})`;
}
