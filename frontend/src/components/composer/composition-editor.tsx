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
  Check,
  CheckCircle2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Heart,
  Info,
  Layers,
  Contrast,
  Crosshair,
  Download,
  ImagePlus,
  Loader2,
  MessageCircle,
  Move,
  Printer,
  Ratio,
  RotateCcw,
  RotateCw,
  RotateCwSquare,
  SlidersHorizontal,
  Stamp,
  Trash2,
} from "lucide-react";
import type Konva from "konva";

import { useBackgrounds } from "@/components/composer/use-backgrounds";
import { Dock, DockStrip, PANEL_GROUP, PANEL_ROW, useDockVariant } from "@/components/composer/dock";
import { useIsDesktop } from "@/components/composer/use-is-desktop";
import { BackgroundLibrary, BackgroundRail } from "@/components/composer/stage-backgrounds";
import { StageCurtain } from "@/components/composer/stage-curtain";
import { STAGE_VIEW_NAMES, runStageTransition } from "@/components/composer/stage-transition";
import { STUDIO_STEPS } from "@/components/composer/studio-steps";
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
  normalizeAppearance,
  REFLECTION_GAP_RANGE,
  SHADOW_OPACITY_RANGE,
  SHADOW_SIZE_RANGE,
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
import {
  readFavoriteBackgrounds,
  toggleFavorite,
  writeFavoriteBackgrounds,
} from "@/lib/favorite-backgrounds";
import type { EditorDraft } from "@/lib/project-record";
import { useSuggestedBackgrounds } from "@/components/composer/use-suggested-backgrounds";
import { BrandMark } from "@/components/brand-mark";
import type {
  MultiExportJob,
  MultiExportResult,
} from "@/components/composer/multi-format-export";

// Konva istemcide calisiyor; coklu disa aktarma da yalnizca istendiginde yuklenir.
const MultiFormatExporter = dynamic(
  () => import("@/components/composer/multi-format-export").then((m) => m.MultiFormatExporter),
  { ssr: false },
);

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
  /**
   * Ustteki adim gostergesi / "Disa Aktar" icin: editor buraya bir gezinme
   * fonksiyonu yazar, studyo tiklamada onu cagirir.
   */
  navigateRef?: React.RefObject<((request: StudioNavigation) => void) | null>;
  initialDraft?: EditorDraft | null;
  onSave?: (draft: EditorDraft) => Promise<boolean>;
  onDownloaded?: () => Promise<boolean>;
};

/** Ust bardan editore: `tool` (telefon) ya da `stage` (masaustu, yalniz geri). */
export type StudioNavigation = { tool: string; stage?: number };

export type EditorStatus = {
  /**
   * "stages": masaustu asamali akis — ust bardaki adimlar yalnizca GERIYE
   * tiklanabilir. "tools": telefon — adim, arac cubugunu acar.
   */
  mode?: "stages" | "tools";
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
  // Zemin artik bir arac degil: tuvalin altinda SABIT duran seritte (Kaan,
  // 19.09.2026) — en sik degisen secim, bir menunun arkasinda durmamali.
  1: [{ id: "boyut", label: "Boyut", icon: Ratio }],
  2: [
    { id: "yerlesim", label: "Yerleşim", icon: Move },
    { id: "gorunum", label: "Görünüm", icon: SlidersHorizontal },
  ],
  3: [
    { id: "marka", label: "Marka", icon: Stamp },
    { id: "indir", label: "İndir", icon: Download },
  ],
} as const;

/**
 * Masaustu asamali akis (Kaan, 19.09.2026): Asama 1 "Sahne" = bicim + zemin,
 * Asama 2 "Duzenle" = Yerlesim · Gorunum · Marka, Asama 3 "Tamamla" = indirme.
 */
const STAGE_TWO_TOOLS = ["yerlesim", "gorunum", "marka"] as const;
const STAGE_TWO_GROUPS = [
  {
    step: 2,
    label: "Düzenle",
    tools: [...STEP_TOOLS[2], ...STEP_TOOLS[3].filter((tool) => tool.id === "marka")],
  },
];

type StudioStage = 1 | 2 | 3;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return Boolean(
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("reduce-motion"),
  );
}

function isDesktopNow(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(min-width: 64rem)").matches);
}

const TOOL_GROUPS = EDITOR_STEPS.map((item) => ({
  step: item.id,
  label: item.label,
  tools: STEP_TOOLS[item.id],
}));

/** Butun araclar bar sirasiyla — geri tusunun "siradaki onceki arac"i icin. */
const ALL_TOOLS: readonly { id: string; label: string }[] = EDITOR_STEPS.flatMap(
  (item) => [...STEP_TOOLS[item.id]],
);

/** Sag panel basligindaki simge, arac kimligine gore. */
const TOOL_ICONS: Record<string, (typeof STEP_TOOLS)[1][number]["icon"]> = Object.fromEntries(
  EDITOR_STEPS.flatMap((item) => STEP_TOOLS[item.id].map((tool) => [tool.id, tool.icon])),
);

function toolLabel(id: string | null): string {
  return ALL_TOOLS.find((tool) => tool.id === id)?.label ?? "";
}

/**
 * Acilista secili gelen arac. Zemin seridi her zaman gorunur oldugu icin
 * (19.09.2026) panel, zeminden sonraki ilk is olan yerlesimle aciliyor.
 */
const DEFAULT_TOOL = "yerlesim";

/** Eski taslaklarda kayitli "zemin" araci artik yok; varsayilana dusurulur. */
function initialTool(saved: string | undefined): string {
  return saved && ALL_TOOLS.some((tool) => tool.id === saved) ? saved : DEFAULT_TOOL;
}

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

/** Kaydiraclarin sinirlari — sag panelde ucu birden gosterildigi icin ortak. */
const ADJUSTMENT_RANGES: Record<AdjustmentId, { min: number; max: number; step: number; format: (v: number) => string }> = {
  brightness: { min: -0.3, max: 0.3, step: 0.01, format: (v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}` },
  contrast: { min: -40, max: 40, step: 1, format: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}` },
  saturation: { min: -1, max: 1, step: 0.02, format: (v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}` },
};

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
  navigateRef,
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
  const [appearance, setAppearance] = useState<Appearance>(() => normalizeAppearance(initialDraft?.appearance));
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
  const [activeTool, setActiveTool] = useState<string>(initialTool(initialDraft?.activeTool));
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
  const isCompactMenu = activeTool === "boyut";
  const isDesktop = useIsDesktop();
  /**
   * Masaustu asamasi ve acilis perdesi. Perde YALNIZCA studyo acilirken
   * (masaustunde) kapali baslar ve kalkar. Asamalar arasi gecislerdeki perde
   * kaldirildi (Serhan, 19.09.2026: "her ileri/geri adimda cok yorucu");
   * yerine daha basit/hizli bir gecis secilecek — secilene kadar asama anlik
   * degisiyor.
   */
  // Tuvalin kapsayicisi ve olcusu: asama gecisi (`goToStage`) olcumu senkron
  // tetikledigi icin ikisi de gecisten ONCE tanimli olmali.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [displaySize, measureStage] = useStageSize(containerRef);
  const [stage, setStage] = useState<StudioStage>(1);
  // Asamalar arasi GECIS ANIMASYONU YOK (Serhan, 19.09.2026): yonlu kayma +
  // kayan adim cizgisi denendi, begenilmedi; yeni bir gecis secilene kadar
  // asama aninda degisiyor. Yalniz acilis perdesi var.
  const [showOpeningCurtain, setShowOpeningCurtain] = useState(
    () => isDesktopNow() && !prefersReducedMotion(),
  );
  const applyStage = useCallback((next: StudioStage) => {
    setStage(next);
    setIsCollapsed(false);
    if (next === 2) {
      setActiveTool((current) =>
        (STAGE_TWO_TOOLS as readonly string[]).includes(current) ? current : "yerlesim",
      );
    }
  }, []);
  const goToStage = useCallback(
    (next: StudioStage) => {
      if (next === stage) return;
      if (prefersReducedMotion()) {
        applyStage(next);
        return;
      }
      runStageTransition(() => applyStage(next), measureStage, next > stage ? 1 : -1);
    },
    [stage, applyStage, measureStage],
  );

  // Ust bardan gelen istek. Efekt DEGIL, dogrudan cagrilan bir fonksiyon:
  // studyo tiklamada `navigateRef.current(...)` cagiriyor. Efekt yalnizca
  // guncel kapanisi ref'e yaziyor (efekt icinde state degismiyor).
  useEffect(() => {
    if (!navigateRef) return;
    navigateRef.current = (request) => {
      if (isDesktopNow() && request.stage) {
        // Asamali akista ust adimlar yalnizca GERIYE gider; ileri ancak ✓ ile.
        if (request.stage < stage) goToStage(request.stage as StudioStage);
        return;
      }
      openTool(request.tool);
    };
    return () => {
      navigateRef.current = null;
    };
  }, [navigateRef, openTool, stage, goToStage]);

  /** Onizle (goz) basili tutulurken tutamaclar gizli (Asama 2). */
  const [isCleanView, setIsCleanView] = useState(false);
  // Kisayol: Asama 2'de BOSLUK basili tutulunca temiz gorunum. Yazi alanlarinda
  // (etiket, gram, urun kodu) bosluk yazmaya devam etsin diye onlar haric.
  // Bir dugmeye odakliyken de calisir; varsayilan engellendigi icin o dugme
  // tiklanmis sayilmaz.
  const cleanViewShortcut = isDesktop && stage === 2;
  useEffect(() => {
    if (!cleanViewShortcut) return;
    function isTyping(target: EventTarget | null) {
      return (
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      );
    }
    function handleDown(event: KeyboardEvent) {
      if (event.code !== "Space" || isTyping(event.target)) return;
      event.preventDefault();
      setIsCleanView(true);
    }
    function handleUp(event: KeyboardEvent) {
      if (event.code !== "Space" || isTyping(event.target)) return;
      event.preventDefault();
      setIsCleanView(false);
    }
    function reset() {
      setIsCleanView(false);
    }
    window.addEventListener("keydown", handleDown);
    window.addEventListener("keyup", handleUp);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", handleDown);
      window.removeEventListener("keyup", handleUp);
      window.removeEventListener("blur", reset);
    };
  }, [cleanViewShortcut]);

  /** Zemin seridinde uzerine gelinen zeminin adi (macOS Dock gibi baslikta). */
  const [hoveredBackgroundName, setHoveredBackgroundName] = useState<string | null>(null);
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

  const format = OUTPUT_FORMATS[formatName];
  const stageSize = useMemo(() => logicalSize(format), [format]);


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
  /**
   * Begenilen zeminler (one alinan is, 19.09.2026): yalnizca bu tarayicida.
   * Stüdyo yalnizca istemcide acildigi icin ilk deger dogrudan okunabiliyor.
   */
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : readFavoriteBackgrounds(),
  );
  const toggleFavoriteBackground = useCallback((id: string) => {
    setFavoriteIds((current) => {
      const next = toggleFavorite(current, id);
      writeFavoriteBackgrounds(next);
      return next;
    });
  }, []);

  // Urunun rengine gore zemin sirasi ("Önerilen" rafi, 21.09.2026).
  const suggestedIds = useSuggestedBackgrounds(cutoutUrl, backgrounds);
  const {
    selected: selectedBackground,
    shownGroup,
    groups: backgroundGroups,
    fitting: fittingBackgrounds,
    select: selectBackground,
    showCategory,
  } = useBackgroundSelection(backgrounds, format, initialDraft?.backgroundId ?? null, favoriteIds, suggestedIds);

  /**
   * Uzerine gelince onizleme (Kaan, 21.09.2026): 90'dan fazla zeminde her
   * birine tek tek tiklamak yorucuydu. Fare bir zemin kartinin uzerindeyken
   * tuval o zemini GECICI olarak gosteriyor; tiklayinca secilir, fare
   * cikinca secili zemine donulur. Yalnizca fare ile (dokunmatikte hover yok)
   * ve Tamamla asamasinda HIC: disa aktarma canli sahneyi cizdigi icin
   * onizlenen zemin dosyaya girebilirdi.
   */
  // Hangi ASAMADA uzerine gelindigi de tutuluyor: asama degisince kart farenin
  // altindan kalkiyor ve `pointerleave` hic gelmiyor; onizleme takili kalirdi.
  const [hovered, setHovered] = useState<{ id: string; stage: StudioStage } | null>(null);
  const setHoveredBackgroundId = useCallback(
    (id: string | null) => setHovered(id ? { id, stage } : null),
    [stage],
  );
  const previewBackground =
    hovered && hovered.stage === stage && stage !== 3
      ? (fittingBackgrounds.find((background) => background.id === hovered.id) ?? null)
      : null;

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
        // Henuz bir donusum yoksa sahnedeki olcek `fitScale`'dir (urunun
        // sahneye sigdirilmis hali), 1 DEGIL. Varsayilan 1 birakilinca
        // studyoda ilk dondurmede urun bir anda dogal boyutuna atliyordu:
        // kesim buyuk oldugu icin %667'ye cikip tuvalden tasiyordu
        // (Serhan, 20.09.2026).
        scale: previous?.scale ?? fitScale ?? 1,
        rotation: normalizeAngle((previous?.rotation ?? 0) + degrees),
      }));
    },
    [stageSize, fitScale],
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
      // Geri alirken ONCEKI gorunurluge donuluyor, kosulsuz `show()` degil:
      // Tamamla asamasi temiz gorunumde (tutamaclar gizli) ve indirme sonrasi
      // hepsini gostermek secim cercevesini son gorselin ustune geri getiriyordu.
      const wasVisible = transformers.map((node) => node.visible());
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
        transformers.forEach((node, index) => node.visible(wasVisible[index]));
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

  /**
   * Birden fazla boyutta indirme (bkz. multi-format-export.tsx). Secim
   * varsayilan olarak su anki bicim + digerleri; dosyalar sirayla iniyor.
   */
  const [isMultiOpen, setIsMultiOpen] = useState(false);
  const [multiFormats, setMultiFormats] = useState<OutputFormatName[]>(
    () => Object.keys(OUTPUT_FORMATS) as OutputFormatName[],
  );
  const [multiType, setMultiType] = useState<"png" | "jpeg">("jpeg");
  const [multiJob, setMultiJob] = useState<MultiExportJob | null>(null);
  const [multiProgress, setMultiProgress] = useState<{ done: number; total: number } | null>(null);
  const startMultiExport = useCallback(() => {
    if (multiFormats.length === 0) return;
    setExportError(null);
    setMultiProgress({ done: 0, total: multiFormats.length });
    // Bicimler her zaman ayni sirada (OUTPUT_FORMATS), tiklama sirasinda degil.
    const ordered = (Object.keys(OUTPUT_FORMATS) as OutputFormatName[]).filter((name) =>
      multiFormats.includes(name),
    );
    setMultiJob({ formats: ordered, type: multiType });
  }, [multiFormats, multiType]);
  const handleMultiProgress = useCallback((done: number, total: number) => {
    setMultiProgress({ done, total });
  }, []);
  const handleMultiDone = useCallback(
    (results: MultiExportResult[]) => {
      setMultiJob(null);
      setMultiProgress(null);
      const base = fileName.replace(/\.[^.]+$/, "");
      const extension = multiType === "jpeg" ? "jpg" : "png";
      // Tarayici arka arkaya inen dosyalari tek tiklamada engelleyebiliyor;
      // aralarinda kisa bir bosluk birakiliyor. Chrome ilk seferde "birden
      // fazla dosya indirmeye izin ver" diye bir kez soruyor.
      results.forEach((result, position) => {
        window.setTimeout(
          () => triggerDownload(result.dataUrl, `${base}-${OUTPUT_FORMATS[result.format].fileSlug}.${extension}`),
          position * 350,
        );
      });
      void onDownloaded?.();
      // Her indirmeden sonra ayni tesekkur karti. Birden fazla boyutta
      // "sablona ekle" sorulmuyor: katalog yalnizca tek bir gorsel aliyor.
      setCatalogError(null);
      setAfterDownload("home");
    },
    [fileName, multiType, onDownloaded],
  );
  const handleMultiError = useCallback((error: unknown) => {
    console.error("[composer] coklu disa aktarma basarisiz:", error);
    setMultiJob(null);
    setMultiProgress(null);
    setExportError(EXPORT_ERROR_MESSAGE);
  }, []);

  /**
   * OTOMATIK KAYIT (Kaan, 21.09.2026: "elim carpti, calisma gitti"). Calisma
   * kesimden hemen sonra "Yarım kalan"a yaziliyordu ama editordeki AYARLAR
   * (zemin, yerlesim, gorunum, etiket) yalnizca "Kaydet"e basilinca
   * gidiyordu; kazayla cikan kullanici bos bir taslak buluyordu. Artik her
   * degisiklikten 1,5 sn sonra sessizce kaydediliyor; studyo kapanirken ve
   * sekme kapanirken (`pagehide`) bekleyen degisiklik hemen gonderiliyor.
   * Istek `keepalive` ile gittigi icin sayfa kapansa da tamamlaniyor
   * (lib/work-history.ts).
   */
  const onSaveRef = useRef(onSave);
  const canSave = Boolean(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);
  const pendingDraftRef = useRef<EditorDraft | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const currentDraftRef = useRef<string | null>(null);
  const flushDraft = useCallback(() => {
    const draft = pendingDraftRef.current;
    pendingDraftRef.current = null;
    if (!draft || !onSaveRef.current) return;
    const serialized = JSON.stringify(draft);
    setSaveStatus("saving");
    void onSaveRef.current(draft).then(
      (saved) => {
        if (saved) {
          lastSavedRef.current = serialized;
          if (currentDraftRef.current === serialized && !pendingDraftRef.current) setSaveStatus("saved");
        } else if (currentDraftRef.current === serialized) {
          // Başarısız isteği kaydedilmiş sayma. Daha yeni bir taslak varsa onu
          // koru; yoksa bu taslak elle Kaydet veya çıkışta tekrar gönderilsin.
          pendingDraftRef.current ??= draft;
          setSaveStatus("error");
        }
      },
      () => {
        if (currentDraftRef.current === serialized) {
          pendingDraftRef.current ??= draft;
          setSaveStatus("error");
        }
      },
    );
  }, []);
  const saveDraft = useCallback(async () => {
    if (!onSave) return;
    const draft: EditorDraft = { formatName, backgroundId: selectedBackground.id, transform, appearance, label, step, activeTool };
    const serialized = JSON.stringify(draft);
    setSaveStatus("saving");
    let saved = false;
    try {
      saved = await onSave(draft);
    } catch {
      // Kaydet düğmesi de otomatik kayıtla aynı hata durumunu gösterir.
    }
    if (saved) {
      lastSavedRef.current = serialized;
      if (pendingDraftRef.current && JSON.stringify(pendingDraftRef.current) === serialized) {
        pendingDraftRef.current = null;
      }
    } else if (currentDraftRef.current === serialized) {
      pendingDraftRef.current ??= draft;
    }
    if (currentDraftRef.current === serialized) setSaveStatus(saved ? "saved" : "error");
  }, [onSave, formatName, selectedBackground.id, transform, appearance, label, step, activeTool]);
  useEffect(() => {
    if (!canSave) return;
    const draft: EditorDraft = { formatName, backgroundId: selectedBackground.id, transform, appearance, label, step, activeTool };
    const serialized = JSON.stringify(draft);
    currentDraftRef.current = serialized;
    // Ilk acilista (ya da elle kaydedilmis haliyle ayniysa) yazacak bir sey yok.
    if (lastSavedRef.current === null) {
      lastSavedRef.current = serialized;
      return;
    }
    if (serialized === lastSavedRef.current) return;
    pendingDraftRef.current = draft;
    const timer = window.setTimeout(flushDraft, 1500);
    return () => window.clearTimeout(timer);
  }, [canSave, formatName, selectedBackground.id, transform, appearance, label, step, activeTool, flushDraft]);
  useEffect(() => {
    window.addEventListener("pagehide", flushDraft);
    return () => {
      window.removeEventListener("pagehide", flushDraft);
      // Studyo kapaniyor (Geri, Esc, Ana menu): bekleyen degisikligi kaybetme.
      flushDraft();
    };
  }, [flushDraft]);

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
    if (isDesktop) {
      const label = STUDIO_STEPS.find((item) => item.step === stage)?.label ?? "";
      onStatusChange?.({
        mode: "stages",
        step: stage,
        totalSteps: STUDIO_STEPS.length,
        stepLabel: label,
        toolLabel: stage === 2 ? toolLabel(activeTool) : label,
      });
      return;
    }
    const stepLabel = EDITOR_STEPS.find((item) => item.id === step)?.label ?? "";
    const currentToolLabel = tools.find((item) => item.id === activeTool)?.label ?? stepLabel;
    onStatusChange?.({
      mode: "tools",
      step,
      totalSteps: EDITOR_STEPS.length,
      stepLabel,
      toolLabel: currentToolLabel,
    });
  }, [activeTool, onStatusChange, step, tools, isDesktop, stage]);

  /** Zemin kutuphanesi durumu ve pazaryeri uyarisi (serit ve kutuphane ortak). */
  const backgroundNotice = (
    <>
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
  );

  /**
   * Zemin seridi — tuvalin altinda SABIT (Kaan, 19.09.2026): hangi arac acik
   * olursa olsun gorunur, ince ve kucuk. Kategori sekmeleri basliginda.
   */
  const backgroundStrip = (
    <div role="group" aria-label="Zemin" className="liquid-glass w-full rounded-[1.5rem] px-1 pt-1.5 pb-0.5">
      {/* Referans gorsel: solda secili zeminin kucuk gorseli + adi, ortada
          kategori sekmeleri (altin alt cizgi), altta yuvarlak ornekler. */}
      <div className="grid min-h-8 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-white/8 px-3 pb-1.5">
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="size-6 shrink-0 overflow-hidden rounded-full ring-1 ring-white/20"
            style={
              selectedBackground.type === "placeholder"
                ? { background: gradientCss(selectedBackground.gradient) }
                : { backgroundImage: `url("${selectedBackground.thumbnailUrl ?? selectedBackground.url}")`, backgroundSize: "cover", backgroundPosition: "center" }
            }
          />
          <span className="min-w-0 truncate text-[0.6875rem] leading-tight">
            <span className="font-semibold tracking-[-0.01em]">Zemin</span>
            <span className="on-dark-muted"> · {hoveredBackgroundName ?? selectedBackground.name}</span>
          </span>
          {/* Secili zemini begen / begeniyi kaldir. */}
          <button
            type="button"
            onClick={() => toggleFavoriteBackground(selectedBackground.id)}
            aria-pressed={favoriteIds.includes(selectedBackground.id)}
            aria-label={
              favoriteIds.includes(selectedBackground.id)
                ? `${selectedBackground.name} favorilerden çıkar`
                : `${selectedBackground.name} favorilere ekle`
            }
            title={favoriteIds.includes(selectedBackground.id) ? "Favorilerden çıkar" : "Favorilere ekle"}
            className="press flex size-7 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
          >
            <Heart
              className={
                "size-3.5 transition-colors duration-300 " +
                (favoriteIds.includes(selectedBackground.id) ? "text-gold fill-current" : "on-dark-muted")
              }
              strokeWidth={1.75}
              aria-hidden
            />
          </button>
        </span>
        <span className="min-w-0 justify-self-center">
          <CategoryTabs groups={backgroundGroups} shownGroup={shownGroup} onSelect={showCategory} />
        </span>
        <span aria-hidden />
      </div>

          <>
            <BackgroundPalette
              key={shownGroup?.id ?? "all"}
              items={shownGroup?.items ?? fittingBackgrounds}
              selectedId={selectedBackground.id}
              onSelect={selectBackground}
              onHoverName={setHoveredBackgroundName}
              favoriteIds={favoriteIds}
              gradientCss={gradientCss}
            />

            {backgroundNotice}
          </>
    </div>
  );

  /**
   * Dock'un basligi, sag ustteki baglam denetimi ve paleti.
   *
   * Tek yerde toplaniyor: "o an secili arac neyse dock onu gosterir" kurali
   * bir switch olarak okunabilir kalsin, JSX'in icine dagilmasin.
   */
  /** Golge ve yansima ince ayarlari (19.09.2026) — yalnizca ozellik acikken. */
  const shadowSliders = (
    <>
      <Slider
        label="Gölge boyutu"
        value={appearance.shadowSize}
        min={SHADOW_SIZE_RANGE.min}
        max={SHADOW_SIZE_RANGE.max}
        step={SHADOW_SIZE_RANGE.step}
        format={(v) => `${Math.round(v * 100)}%`}
        onStart={pushHistory}
        onChange={(v) => setAppearance((a) => ({ ...a, shadowSize: v }))}
      />
      <Slider
        label="Gölge yoğunluğu"
        value={appearance.shadowOpacity}
        min={SHADOW_OPACITY_RANGE.min}
        max={SHADOW_OPACITY_RANGE.max}
        step={SHADOW_OPACITY_RANGE.step}
        format={(v) => `${Math.round(v * 100)}%`}
        onStart={pushHistory}
        onChange={(v) => setAppearance((a) => ({ ...a, shadowOpacity: v }))}
      />
    </>
  );
  const reflectionSlider = (
    <Slider
      label="Yansıma mesafesi"
      value={appearance.reflectionGap}
      min={REFLECTION_GAP_RANGE.min}
      max={REFLECTION_GAP_RANGE.max}
      step={REFLECTION_GAP_RANGE.step}
      format={(v) => (v === 0 ? "bitişik" : `${Math.round(v * 2)} px`)}
      onStart={pushHistory}
      onChange={(v) => setAppearance((a) => ({ ...a, reflectionGap: v }))}
    />
  );

  const dockFor = (tool: string) => {
    if (tool === "boyut") {
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
                  isDesktop
                    ? PANEL_ROW + " press py-2 " + (formatName === name ? "bg-white/[0.05]" : "hover:bg-white/[0.04]")
                    : "press w-28 shrink-0 snap-start rounded-xl px-2.5 py-2 text-left transition-colors " +
                      (formatName === name
                        ? "ring-gold bg-white/10 ring-2"
                        : "ring-1 ring-white/12 hover:bg-white/6")
                }
              >
                {/* Gercek en-boy onizlemesi: bicimi okumadan da ayirt edilsin. */}
                <span
                  className={isDesktop ? "flex size-8 shrink-0 items-center justify-center" : "contents"}
                  aria-hidden
                >
                  <span
                    className={isDesktop ? "block h-6 max-w-6 rounded-[0.2rem] ring-1 ring-white/35" : "mb-1.5 block w-7 rounded-[0.25rem] bg-white/25"}
                    style={{ aspectRatio: `${option.outputWidth} / ${option.outputHeight}` }}
                  />
                </span>
                <span className={isDesktop ? "min-w-0 flex-1" : "contents"}>
                  <span className="block text-[0.75rem] font-medium">{option.label}</span>
                  <span className="on-dark-muted block text-[0.6875rem] leading-tight">
                    {option.summary}
                  </span>
                </span>
                {isDesktop ? (
                  // Referanstaki yuvarlak secim isareti.
                  <span
                    aria-hidden
                    className={
                      "flex size-[1.125rem] shrink-0 items-center justify-center rounded-full " +
                      (formatName === name ? "bg-gold text-[#1a1917]" : "ring-1 ring-white/20")
                    }
                  >
                    {formatName === name ? <Check className="size-3" strokeWidth={3} /> : null}
                  </span>
                ) : null}
              </button>
            ))}
          </DockStrip>
        ),
      };
    }

    if (tool === "yerlesim") {
      return {
        title: "Yerleşim",
        body: (
          <DockStrip label="Yerleşim eylemleri" centered>
            <DockAction onClick={centerAndFit} disabled={!cutoutSize} icon={<Crosshair className="size-3.5" strokeWidth={1.75} aria-hidden />}>
              Ortala ve sığdır
            </DockAction>
            <DockAction onClick={() => rotateBy(-15)} disabled={!cutoutSize} icon={<RotateCcw className="size-3.5" strokeWidth={1.75} aria-hidden />}>
              −15°
            </DockAction>
            <DockAction onClick={() => rotateBy(15)} disabled={!cutoutSize} icon={<RotateCw className="size-3.5" strokeWidth={1.75} aria-hidden />}>
              15°
            </DockAction>
            <DockAction onClick={() => rotateBy(90)} disabled={!cutoutSize} icon={<RotateCwSquare className="size-3.5" strokeWidth={1.75} aria-hidden />}>
              90°
            </DockAction>
          </DockStrip>
        ),
      };
    }

    if (tool === "gorunum") {
      const preset = matchingPreset(appearance);
      // Ikinci katman: secilen ayarin TEK kaydiraci (iPhone gibi). Geri tusu
      // gorunum menusune doner.
      if (isDesktop) {
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
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-0.5 rounded-xl bg-black/20 p-0.5">
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
                      "press min-h-8 truncate rounded-[0.6rem] px-2 text-[0.75rem] transition-colors " +
                      (preset?.id === item.id
                        ? "text-gold bg-white/12 font-medium"
                        : "on-dark-muted hover:text-[#f3f0eb]")
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className={PANEL_GROUP}>
                {ADJUSTMENTS.map((item) => {
                  const range = ADJUSTMENT_RANGES[item.id];
                  return (
                    <Slider
                      key={item.id}
                      label={item.label}
                      value={appearance[item.id]}
                      min={range.min}
                      max={range.max}
                      step={range.step}
                      format={range.format}
                      onStart={pushHistory}
                      onChange={(v) => setAppearance((a) => ({ ...a, [item.id]: v }))}
                    />
                  );
                })}
              </div>
              <div className={PANEL_GROUP}>
                <Toggle
                  label="Gölge"
                  isOn={appearance.shadow}
                  onChange={(on) => setAppearance((a) => ({ ...a, shadow: on }))}
                />
                {appearance.shadow ? shadowSliders : null}
                <Toggle
                  label="Yansıma"
                  isOn={appearance.reflection}
                  onChange={(on) => setAppearance((a) => ({ ...a, reflection: on }))}
                />
                {appearance.reflection ? reflectionSlider : null}
              </div>
            </div>
          ),
        };
      }
      if (adjustment) {
        const range = ADJUSTMENT_RANGES[adjustment];
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
            {appearance.shadow || appearance.reflection ? (
              <div className="mt-2 space-y-3 px-3">
                {appearance.shadow ? shadowSliders : null}
                {appearance.reflection ? reflectionSlider : null}
              </div>
            ) : null}
          </>
        ),
      };
    }

    if (tool === "marka") {
      return {
        title: "Marka",
        action: isDesktop ? undefined : (
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
              {isDesktop && logoUrl ? (
                // Masaustu: logo ve uc eylemi TEK satirda. Dort ayri satir,
                // etiket acilinca paneli tasirip alanlari kaydirmaya itiyordu.
                <div className={PANEL_ROW + " gap-2 py-2"}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoUrl}
                    alt="Yüklenen logo"
                    className="checkerboard size-8 shrink-0 rounded-lg object-contain ring-1 ring-white/15"
                  />
                  <span className="ml-auto flex gap-1">
                    <CompactAction label="Logoyu değiştir" onClick={() => logoInputRef.current?.click()}>
                      <ImagePlus className="size-3.5" strokeWidth={1.75} aria-hidden />
                      Değiştir
                    </CompactAction>
                    <CompactAction label="Renkleri çevir" onClick={() => void invertCurrentLogo()}>
                      <Contrast className="size-3.5" strokeWidth={1.75} aria-hidden />
                      Çevir
                    </CompactAction>
                    <CompactAction label="Logoyu kaldır" onClick={removeLogo}>
                      <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden />
                      Kaldır
                    </CompactAction>
                  </span>
                </div>
              ) : null}
              {logoUrl && !isDesktop ? (
                <span className={isDesktop ? PANEL_ROW + " py-2" : "contents"}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoUrl}
                    alt="Yüklenen logo"
                    className="checkerboard size-9 shrink-0 self-center rounded-lg object-contain ring-1 ring-white/15"
                  />
                  {isDesktop ? <span className="on-dark-muted text-[0.75rem]">Logo yüklendi</span> : null}
                </span>
              ) : null}
              {isDesktop && logoUrl ? null : (
                <DockAction
                  onClick={() => logoInputRef.current?.click()}
                  icon={<ImagePlus className="size-3.5" strokeWidth={1.75} aria-hidden />}
                >
                  {logoUrl ? "Logoyu değiştir" : "Logo yükle"}
                </DockAction>
              )}
              {logoUrl && !isDesktop ? (
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
              <div className={isDesktop ? "mt-3 space-y-3" : "mt-2 grid gap-2 sm:grid-cols-2"}>
                {logoUrl ? (
                  <CornerRow
                    label="Logo konumu"
                    value={logo.position ? null : logo.corner}
                    onChange={(corner) => updateLogo({ corner, position: null })}
                  />
                ) : isDesktop ? null : <span />}
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
              <div className={isDesktop ? "mt-3" : "mt-2 sm:ml-auto sm:w-1/2 sm:pl-1"}>
                {/* Etiketin kutusu yok, secenek yazinin rengi
                    (`theme: "dark"` koyu zemine uygun acik yazi demek). */}
                <SegmentRow
                  label="Yazı rengi"
                  options={LABEL_THEMES}
                  value={label.theme}
                  onChange={(theme) => setLabel((current) => ({ ...current, theme }))}
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
        <DockStrip label="Çıktı türleri" wrap={isDesktop}>
          <DockAction goldHover={isDesktop} onClick={() => download("png")} disabled={isExporting} icon={<Download className="size-3.5" strokeWidth={1.75} aria-hidden />}>
            PNG
          </DockAction>
          <DockAction goldHover={isDesktop} onClick={() => download("jpeg")} disabled={isExporting}>JPEG</DockAction>
          <DockAction goldHover={isDesktop}
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
          <DockAction goldHover={isDesktop} onClick={() => requestPrint("jpeg")} disabled={printStatus === "preparing"}>
            CMYK JPEG
          </DockAction>
          <DockAction goldHover={isDesktop} onClick={shareToWhatsApp} disabled={isExporting} icon={<MessageCircle className="size-3.5" strokeWidth={1.75} aria-hidden />}>
            WhatsApp
          </DockAction>
          {onSave ? (
            <DockAction goldHover={isDesktop} onClick={() => void saveDraft()} disabled={saveStatus === "saving"} icon={<CheckCircle2 className="size-3.5" strokeWidth={1.75} aria-hidden />}>
              {saveStatus === "saving" ? "Kaydediliyor" : saveStatus === "saved" ? "Kaydedildi" : "Kaydet"}
            </DockAction>
          ) : null}
          <DockAction
            goldHover={isDesktop}
            onClick={() => setIsMultiOpen((open) => !open)}
            icon={<Layers className="size-3.5" strokeWidth={1.75} aria-hidden />}
          >
            Birden fazla boyut
          </DockAction>
        </DockStrip>
        {isMultiOpen ? (
          <div role="group" aria-label="Birden fazla boyutta indir" className="soft-enter mt-3 rounded-2xl bg-white/[0.04] p-3 text-left">
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(OUTPUT_FORMATS) as [OutputFormatName, (typeof OUTPUT_FORMATS)[OutputFormatName]][]).map(
                ([name, item]) => {
                  const isOn = multiFormats.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={isOn}
                      onClick={() =>
                        setMultiFormats((current) =>
                          isOn ? current.filter((entry) => entry !== name) : [...current, name],
                        )
                      }
                      className={
                        "press rounded-full px-3 py-1.5 text-[0.75rem] transition-colors " +
                        (isOn ? "text-gold bg-white/12 ring-gold ring-1" : "on-dark-muted ring-1 ring-white/12 hover:text-[#f3f0eb]")
                      }
                    >
                      {item.label}
                    </button>
                  );
                },
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex rounded-full bg-black/20 p-0.5" role="group" aria-label="Dosya türü">
                {(["jpeg", "png"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={multiType === type}
                    onClick={() => setMultiType(type)}
                    className={
                      "press rounded-full px-3 py-1 text-[0.75rem] " +
                      (multiType === type ? "text-gold bg-white/12 font-medium" : "on-dark-muted hover:text-[#f3f0eb]")
                    }
                  >
                    {type === "jpeg" ? "JPEG" : "PNG"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={startMultiExport}
                disabled={multiFormats.length === 0 || multiJob !== null}
                className="press bg-gold hover:bg-gold/90 ml-auto flex h-8 items-center gap-1.5 rounded-full px-4 text-[0.75rem] font-medium text-[#1a1917] disabled:opacity-40"
              >
                {multiProgress ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    Hazırlanıyor {multiProgress.done}/{multiProgress.total}
                  </>
                ) : (
                  <>
                    <Download className="size-3.5" strokeWidth={2} aria-hidden />
                    {multiFormats.length} boyutu indir
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}
        </>
      ),
    };
  };
  const dock = dockFor(activeTool);

  const printInfoToggle = (
    <button
      type="button"
      onClick={() => setIsPrintInfoOpen((open) => !open)}
      aria-expanded={isPrintInfoOpen}
      className={
        isDesktop
          ? "press on-dark-muted flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[0.8125rem] hover:bg-white/10 hover:text-[#f3f0eb]"
          : "fine-print on-dark-muted underline underline-offset-2 hover:text-[#f3f0eb]"
      }
    >
      {isDesktop ? <Info className="size-3.5" strokeWidth={1.75} aria-hidden /> : null}
      CMYK ne demek?
    </button>
  );

  /** Denetcideki ince ayarlar — secili araca gore. */
  const inspectorFor = (tool: string) => {
    if (tool === "yerlesim") {
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

        </div>
      );
    }

    if (tool === "marka") {
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
          ) : isDesktop ? null : (
            <p className="fine-print on-dark-muted">
              Saydam PNG en iyi sonucu verir. Logo yalnızca bu tarayıcıda hatırlanır.
            </p>
          )}
          <div className="border-t border-white/10 pt-3">
            <p className="mb-2 text-[0.75rem] font-medium text-[#f3f0eb]">Ürün etiketi</p>
            {label.enabled ? (
              <>
                {/* Uc alan TEK satirda: ikinci satir Marka panelini tasiriyordu. */}
                <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1.3fr)] gap-2">
            <label className="block">
              <span className="fine-print on-dark-muted block">Ayar</span>
              <select
                value={label.karat}
                onChange={(event) =>
                  setLabel((current) => ({ ...current, karat: event.target.value }))
                }
                // Acilan liste isletim sisteminin kendi penceresi: koyu tema
                // bildirilmezse Windows'ta BEYAZ zemin uzerine miras kalan
                // beyaz yaziyla ciziliyor ve secenekler okunmuyordu.
                className="mt-1 min-h-9 w-full rounded-lg bg-white/8 px-2 text-[0.8125rem] ring-1 ring-white/12 [color-scheme:dark]"
              >
                <option value="" className="bg-[#1a1917] text-[#f3f0eb]">Yok</option>
                {KARAT_OPTIONS.map((karat) => (
                  <option key={karat} value={karat} className="bg-[#1a1917] text-[#f3f0eb]">
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
                <label className="block">
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
                </div>
                {gramProblem(label.gram) ? (
                  <p role="alert" className="fine-print mt-2 text-red-300">
                    {gramProblem(label.gram)}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="fine-print on-dark-muted">
                Ayar, gram ve ürün kodunu görselin köşesine eklemek için yukarıdaki “Ürün etiketi” anahtarını açın.
              </p>
            )}
          </div>
        </>
      );
    }

    if (tool === "indir") {
      return (
        <>
          {/* Masaustunde bu dugme Tamamla dock'unun alt satirinda, SAGDA
              (`printInfoToggle`); telefonda burada kaliyor. */}
          {isDesktop ? null : printInfoToggle}
          {isPrintInfoOpen ? (
            <p className={"fine-print on-dark-muted leading-relaxed " + (isDesktop ? "rounded-xl bg-white/[0.04] px-3 py-2.5" : "")}>
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
          {isDesktop ? null : (
            <p className="fine-print on-dark-muted">
              PNG çıktısı zaten kayıpsızdır; JPEG sıkıştırma uygular.
            </p>
          )}
        </>
      );
    }

    return null;
  };
  const inspectorBody = inspectorFor(activeTool);

  const dockElement = (
    <Dock
      title={dock.title}
      action={dock.action}
      settings={inspectorBody}
      tools={
        <ToolBar
          groups={isDesktop ? STAGE_TWO_GROUPS : TOOL_GROUPS}
          activeTool={activeTool}
          onToolChange={openTool}
        />
      }
      footer={
        isDesktop ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToStage(1)}
              className="press on-dark-muted flex h-10 items-center gap-1 rounded-full pr-4 pl-2.5 text-[0.8125rem] hover:bg-white/10 hover:text-[#f3f0eb]"
            >
              <ChevronLeft className="size-4" strokeWidth={2} aria-hidden />
              Sahne
            </button>
            <button
              type="button"
              onClick={() => goToStage(3)}
              aria-label="Düzenlemeyi bitir, Tamamla aşamasına geç"
              className="press bg-gold hover:bg-gold/90 ml-auto flex h-10 items-center gap-1 rounded-full pr-3 pl-5 text-[0.8125rem] font-medium text-[#1a1917] shadow-[0_6px_16px_-8px_rgb(209_162_91/0.8)]"
            >
              Tamamla
              <ChevronRight className="size-4" strokeWidth={2.25} aria-hidden />
            </button>
          </div>
        ) : undefined
      }
      activeToolLabel={toolLabel(activeTool)}
      isCollapsed={isCollapsed}
      onCollapsedChange={setIsCollapsed}
      compact={isCompactMenu}
      variant={isDesktop ? "side" : "bottom"}
      icon={TOOL_ICONS[activeTool]}
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
  );

  const canvasBlock = (
          <div
            ref={containerRef}
            className={
              "stage-fit relative w-full min-w-0" +
              (isCollapsed ? " stage-fit-collapsed" : isCompactMenu ? " stage-fit-compact" : "")
            }
            // Tuval ekran YUKSEKLIGINE de sigmali: A4 gibi dikey bicimlerde
            // yalnizca genislige gore buyutmek tuvali ekranin altina tasiyordu.
            style={{
              maxWidth: `min(var(--stage-cap), calc((100dvh - var(--studio-reserved)) * ${format.outputWidth / format.outputHeight}))`,
              // Tuval, asama degisince kendi yerinden yeni yerine/boyutuna
              // tarayicinin sahne gecisiyle tasiniyor (stage-transition.ts).
              viewTransitionName: STAGE_VIEW_NAMES.canvas,
            }}
          >
            <div
              className="overflow-hidden rounded-[1rem] shadow-[0_24px_60px_-30px_rgba(40,30,15,0.45)]"
              style={{ aspectRatio: `${format.outputWidth} / ${format.outputHeight}` }}
            >
              <EditorStage
                cutoutUrl={cutoutUrl}
                // Uzerine gelinen zemin gecici olarak gosteriliyor (Sahne);
                // secim, kayit ve indirme her zaman `selectedBackground`.
                background={previewBackground ?? selectedBackground}
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
                // Masaustu Asama 3 (Tamamla) her zaman temiz gorunum: orada
                // duzenleme yok, kullanici son hali tutamaclarsiz gormeli.
                cleanView={isCleanView || (isDesktop && stage === 3)}
              />
            </div>
            {multiJob ? (
              <MultiFormatExporter
                job={multiJob}
                cutoutUrl={cutoutUrl}
                cutoutSize={cutoutSize}
                // Onizleme DEGIL secili zemin: dosyaya kullanicinin sectigi girer.
                backgroundFor={(name) =>
                  name === "marketplace"
                    ? (backgrounds.find((background) => background.id === MARKETPLACE_BACKGROUND_ID) ?? selectedBackground)
                    : selectedBackground
                }
                transform={transform}
                fromSize={stageSize}
                appearance={appearance}
                logoUrl={logoUrl}
                logo={logo}
                label={label}
                onProgress={handleMultiProgress}
                onDone={handleMultiDone}
                onError={handleMultiError}
              />
            ) : null}

            <p className="fine-print text-muted-foreground mt-2 text-center lg:hidden">
              Sürükleyerek taşıyın · köşelerden boyutlandırın · üstteki tutamaçtan
              döndürün
            </p>
            {/* Masaustu kunye: galeri etiketi gibi, tuvalin altinda sessiz. */}
            <div className="mt-3 hidden items-center justify-center gap-3 lg:flex">
              <p className="flex items-center gap-2 text-[0.6875rem] tracking-[0.04em] text-[#1a1917]/45">
                <span className="font-medium text-[#1a1917]/60">{format.label}</span>
                <span aria-hidden className="size-0.5 rounded-full bg-current" />
                <span className="tabular-nums">
                  {format.outputWidth} × {format.outputHeight} px
                </span>
              </p>
              {isDesktop && stage === 2 ? (
                // Onizle: BASILI TUTUNCA tutamaclar gizlenir (Kaan, 19.09.2026).
                // Kisayol: bosluk tusu (basili tut). Tuvalin USTUNDE degil,
                // kunyenin yaninda — gorselin hicbir kosesini ortmuyor.
                <button
                  type="button"
                  aria-label="Temiz görünüm (basılı tutun)"
                  aria-pressed={isCleanView}
                  title="Basılı tutun · kısayol: Boşluk"
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    setIsCleanView(true);
                  }}
                  onPointerUp={() => setIsCleanView(false)}
                  onPointerCancel={() => setIsCleanView(false)}
                  onLostPointerCapture={() => setIsCleanView(false)}
                  onBlur={() => setIsCleanView(false)}
                  className={
                    "press liquid-glass flex h-8 items-center gap-1.5 rounded-full pr-2 pl-3 text-[0.75rem] transition-colors duration-300 " +
                    (isCleanView ? "text-gold" : "text-[#f3f0eb]")
                  }
                >
                  <Eye className="size-3.5" strokeWidth={1.75} aria-hidden />
                  Önizle
                  <kbd className="on-dark-muted ml-0.5 rounded-md bg-white/10 px-1.5 py-0.5 text-[0.625rem] font-normal">
                    Boşluk
                  </kbd>
                </button>
              ) : null}
            </div>
          </div>
  );

  /** Zemin secicilerinin ortak ozellikleri (Asama 1 kutuphane, Asama 2 dik bar). */
  const shelfProps = {
    groups: backgroundGroups,
    shownGroup,
    items: shownGroup?.items ?? fittingBackgrounds,
    selectedId: selectedBackground.id,
    favoriteIds,
    onSelect: (id: string) => {
      selectBackground(id);
      setHoveredBackgroundId(null);
    },
    onPreview: setHoveredBackgroundId,
    onShowCategory: showCategory,
    onToggleFavorite: toggleFavoriteBackground,
    gradientCss,
  };

  /**
   * Gecis adlari (bkz. stage-transition.ts): tuval, panel ve dik zemin bari
   * tarayicinin sahne gecisinde ayri gruplar. Her ada AYNI ANDA yalnizca BIR
   * oge sahip olabilir; Asama 2'de hem zemin bari hem sag panel ekranda oldugu
   * icin adlari AYRI (ayni ad verildiginde gecis "snapshot capture failed" ile
   * iptal oluyor — 20.09.2026'da olculdu).
   */
  const panelViewName = { viewTransitionName: STAGE_VIEW_NAMES.panel } as React.CSSProperties;
  const railViewName = { viewTransitionName: STAGE_VIEW_NAMES.rail } as React.CSSProperties;

  const desktopLayout = (
    // Asamali masaustu (Kaan, 19.09.2026). Tuval sutunu HER asamada ayni
    // konumda (ikinci cocuk) — Konva sahnesi asama degisince yeniden kurulmuyor.
    <div
      className="relative flex h-[calc(100dvh-5.25rem)] w-full items-stretch justify-center gap-6 px-6 pt-7 pb-3"
      // Tuval payi: ust barin altinda ~1,5rem nefes (Serhan, 19.09.2026 —
      // "Duzenle'de gorsel ust dock'a yapisik"; kunye + Onizle dugmesi payin
      // icinde sayilmiyordu, tuval ortalaninca yukari tasiyordu). Asama 3'te
      // iki satirlik cikti dock'u da payin icinde.
      // Tamamla'da "Birden fazla boyut" acilinca panel ~7rem uzuyor; pay
      // buyumezse tuval yukari kayip ust barin altina giriyordu (olculdu).
      style={{ "--studio-reserved-lg": stage === 3 ? (isMultiOpen ? "25rem" : "18rem") : "12.5rem" } as React.CSSProperties}
    >
      {/* Sol yuva Asama 2'de SAG PANELLE AYNI GENISLIKTE: tuval boylece ust
          barla ayni eksende, ekranin tam ortasinda (Kaan, 19.09.2026). Dik
          zemin bari yuvanin ORTASINDA: tuvale yapisik da durmuyor, en sola da
          kacmiyor (Kaan, 19.09.2026 ucuncu tur). */}
      <div
        className={
          stage === 2
            ? "flex min-h-0 justify-center " +
              (isCollapsed ? "w-[4.75rem] shrink-0" : "min-w-[17rem] max-w-[26rem] flex-1")
            : "hidden"
        }
      >
        {stage === 2 ? (
          // Dik zemin bari (Kaan, 19.09.2026: "onceki gibi dik konum"). Yuva
          // sag panelle esit genislikte kaliyor ki tuval ortada dursun; bar
          // yuvanin tuvale bakan kenarinda.
          <div style={railViewName} className={"flex min-h-0 " + (isCollapsed ? "w-[4.75rem]" : "w-[7.25rem]")}>
            <BackgroundRail {...shelfProps} selected={selectedBackground} compact={isCollapsed} />
          </div>
        ) : null}
      </div>

      <div
        className="stage-column flex h-full min-h-0 min-w-0 flex-col"
        style={
          {
            "--stage-ratio": format.outputWidth / format.outputHeight,
            // Tuvalin yaninda kalan bolmelerin toplam genisligi.
            "--panel-w":
              stage === 1 ? "26rem" : stage === 2 ? (isCollapsed ? "11rem" : "36rem") : "0rem",
          } as React.CSSProperties
        }
      >
        <div className="relative z-0 flex min-h-0 min-w-0 flex-1 items-center justify-center py-1">
          {canvasBlock}
        </div>
        {stage === 3 ? (
          // Asama 3: yalnizca cikti — hazirlanan gorselin HEMEN ALTINDA.
          // Iki satir (Serhan, 19.09.2026): ustte TUM cikti dugmeleri kaydirmasiz,
          // altta diger panellerle ayni kural — geri donus SOLDA, ek bilgi SAGDA.
          // Dock tuval sutunundan GENIS olabilir (dikey A4'te sutun ~27rem,
          // dugmeler sigmayip kayiyordu): ortalanip iki yana tasiyor.
          <div
            role="group"
            aria-label="Çıktı"
            // Genislik ICERIKTEN: ust satirdaki cikti dugmeleri belirliyor, alt
            // satir (Duzenle / CMYK) onlarin kenarlarina hizali (Serhan, 19.09.2026).
            // `w-max`: `w-fit` tuval sutununa (kare bicimde ~34rem) sikisip Kaydet'i
            // alt satira atiyordu; genislik artik yalniz DUGMELERDEN geliyor.
            className={"liquid-glass mt-3 w-max max-w-[calc(100vw-3rem)] shrink-0 self-center rounded-[1.5rem] p-2"}
            style={panelViewName}>
            {dockFor("indir").body}
            {/* `w-0 min-w-full`: acilan CMYK aciklamasi dock'u GENISLETMIYOR,
                dugmelerin genisligine sariliyor. */}
            <div className="w-0 min-w-full space-y-1.5 px-3 pt-1 pb-1 text-center empty:hidden">{inspectorFor("indir")}</div>
            <div className="mx-2 flex items-center gap-2 border-t border-white/10 pt-2">
              <button
                type="button"
                onClick={() => goToStage(2)}
                className="press on-dark-muted flex h-10 shrink-0 items-center gap-1 rounded-full pr-4 pl-2.5 text-[0.8125rem] hover:bg-white/10 hover:text-[#f3f0eb]"
              >
                <ChevronLeft className="size-4" strokeWidth={2} aria-hidden />
                Düzenle
              </button>
              <span className="ml-auto" />
              {printInfoToggle}
            </div>
          </div>
        ) : null}
      </div>

      {stage === 1 ? (
        // `key`: iki aşamanın paneli de aynı yerde duran bir `<aside>`; key
        // olmadan React AYNI düğümü kullanıyor ve panele verilen bir giriş
        // animasyonu hiç yeniden başlamıyordu (kök CLAUDE.md ders 29). Geçiş
        // şu an yok, ama yenisi eklenince bu gerekecek.
        <aside key="stage-1" aria-label="Sahne" style={panelViewName} className="relative z-10 flex h-full min-h-0 w-[26rem] shrink-0 flex-col py-1">
          <BackgroundLibrary
            {...shelfProps}
            header={
              <div className="shrink-0">
                <div className="flex items-baseline justify-between px-1">
                  <span className="text-[0.9375rem] font-medium tracking-[-0.01em]">Sahne</span>
                  <span className="on-dark-muted text-[0.6875rem] tabular-nums">
                    {format.outputWidth} × {format.outputHeight}
                  </span>
                </div>
                <div role="group" aria-label="Çıktı boyutları" className="mt-2.5 grid grid-cols-2 gap-1.5">
                  {(Object.entries(OUTPUT_FORMATS) as [OutputFormatName, (typeof OUTPUT_FORMATS)[OutputFormatName]][]).map(
                    ([name, option]) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => changeFormat(name)}
                        aria-pressed={formatName === name}
                        className={
                          "press flex min-h-10 items-center gap-2.5 rounded-xl px-2.5 text-left text-[0.75rem] transition-colors " +
                          (formatName === name
                            ? "bg-white/10 font-medium text-[#f3f0eb] ring-1 ring-[#d1a25b]/60"
                            : "on-dark-muted bg-white/[0.035] ring-1 ring-white/8 hover:text-[#f3f0eb]")
                        }
                      >
                        <span
                          aria-hidden
                          className={"block h-5 max-w-5 shrink-0 rounded-[0.2rem] ring-1 " + (formatName === name ? "ring-[#d1a25b]" : "ring-white/30")}
                          style={{ aspectRatio: `${option.outputWidth} / ${option.outputHeight}` }}
                        />
                        <span className="min-w-0 truncate">{option.label}</span>
                      </button>
                    ),
                  )}
                </div>
              </div>
            }
            notice={<div className="shrink-0 empty:hidden">{backgroundNotice}</div>}
            footer={
              <div className="mt-2 flex shrink-0 items-center gap-3 border-t border-white/10 px-1 pt-3">
                <span className="min-w-0 flex-1 truncate text-[0.75rem]">
                  <span className="on-dark-muted">Seçili: </span>
                  {selectedBackground.name}
                </span>
                <button
                  type="button"
                  onClick={() => goToStage(2)}
                  aria-label="Sahneyi onayla, Düzenle aşamasına geç"
                  // Dugme GIDILECEK adimin adini soyluyor (Serhan, 19.09.2026):
                  // Sahne'de saga "Duzenle", Duzenle'de solda "Sahne" / sagda "Tamamla".
                  className="press bg-gold hover:bg-gold/90 flex h-11 shrink-0 items-center gap-1 rounded-full pr-3.5 pl-5 text-[0.875rem] font-medium text-[#1a1917] shadow-[0_8px_20px_-8px_rgb(209_162_91/0.9)]"
                >
                  Düzenle
                  <ChevronRight className="size-4" strokeWidth={2.25} aria-hidden />
                </button>
              </div>
            }
          />
        </aside>
      ) : stage === 2 ? (
        <aside
          key="stage-2"
          aria-label="Araç paneli"
          style={panelViewName}
          className={
            "relative z-10 flex min-h-0 flex-col justify-center " +
            (isCollapsed ? "w-[4.75rem] shrink-0 items-start" : "min-w-[17rem] max-w-[26rem] flex-1")
          }
        >
          {dockElement}
        </aside>
      ) : null}

      {showOpeningCurtain ? <StageCurtain stage={1} onDone={() => setShowOpeningCurtain(false)} /> : null}
    </div>
  );

  const mobileLayout = (
    // Telefon: tuval, zemin seridi ve alt bar alt alta (asamali akis
    // simdilik yalniz masaustunde — Kaan, 19.09.2026).
    <div className="relative flex w-full flex-col">
      <div className="flex min-w-0 flex-col">
        <div className="relative z-0 flex min-w-0 items-center justify-center px-3 py-5">
          {canvasBlock}
        </div>

        <div className="relative z-10 flex shrink-0 justify-center px-3">
          <div className="w-full max-w-[40rem]">{backgroundStrip}</div>
        </div>
      </div>

      <div className="relative z-10 mt-2 flex shrink-0 justify-center px-3 pb-4">{dockElement}</div>
    </div>
  );

  /** Indirme sonrasi soru ve baski onayi — iki duzende de ortak. */
  const dialogs = (
    <>
      {afterDownload ? (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-5">
          <button
            type="button"
            aria-label="Kapat"
            onClick={() => setAfterDownload(null)}
            className="soft-fade fixed inset-0 bg-black/55 backdrop-blur-[2px]"
          />
          {/* Tesekkur karti (Kaan, 21.09.2026): her indirmeden sonra (PNG,
              JPEG, CMYK, coklu boyut) markali bir kart. Studyonun koyu yuzeyi
              ve altin vurgu — arac yuzeyi kurali (CLAUDE.md). */}
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="indirme-bitti-baslik"
            aria-describedby="indirme-bitti-aciklama"
            className="soft-enter relative w-full max-w-sm overflow-hidden rounded-[1.75rem] bg-[#1a1917] p-7 text-center text-[#f3f0eb] shadow-2xl ring-1 ring-white/10"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -top-24 left-1/2 size-56 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(209_162_91/0.28),transparent_65%)]"
            />
            <span className="relative mx-auto flex size-16 items-center justify-center rounded-2xl bg-black/30 ring-1 ring-white/10">
              <BrandMark className="text-gold h-7 w-auto" />
            </span>
            <p className="relative mt-5 text-[0.6875rem] font-medium tracking-[0.14em] text-[#d1a25b]">VİTRİN AI</p>
            <p className="relative mt-1.5 text-[1.375rem] font-semibold tracking-[-0.02em]">Teşekkürler</p>
            <p id="indirme-bitti-aciklama" className="relative mt-2 text-[0.875rem] leading-relaxed text-[#a8a29a]">
              İndirme işlemi başarıyla tamamlandı. Vitrin AI&apos;ı tercih ettiğiniz için teşekkür ederiz.
            </p>
            <div className="relative mx-auto my-5 h-px w-10 bg-white/15" aria-hidden />
            <h2
              id="indirme-bitti-baslik"
              className="relative text-[1rem] font-medium tracking-[-0.01em]"
            >
              {afterDownload === "catalog"
                ? "Katalog görselinizi şablona eklemek ister misiniz?"
                : "Ana menüye dönmek ister misiniz?"}
            </h2>
            {catalogError ? (
              <p role="alert" className="fine-print relative mt-2 text-red-300">
                {catalogError}
              </p>
            ) : null}
            <div className="relative mt-6 flex gap-2">
              <button
                type="button"
                autoFocus
                onClick={() =>
                  setAfterDownload(
                    afterDownload === "catalog" && onReturnToStart ? "home" : null,
                  )
                }
                className="min-h-11 flex-1 rounded-full text-[0.9375rem] ring-1 ring-white/15 transition-colors hover:bg-white/8"
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
                className="press bg-gold hover:bg-gold/90 min-h-11 flex-1 rounded-full text-[0.9375rem] font-medium text-[#1a1917]"
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
    </>
  );

  return (
    <>
      {isDesktop ? desktopLayout : mobileLayout}
      {saveStatus === "error" ? (
        <div role="alert" className="fixed top-20 left-1/2 z-[70] flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-xl bg-[#321e1e] px-4 py-3 text-sm text-red-100 shadow-xl ring-1 ring-red-300/30">
          <span className="min-w-0 flex-1">Çalışma kaydedilemedi. Bağlantınızı kontrol edin.</span>
          <button type="button" onClick={() => void saveDraft()} className="press shrink-0 rounded-full px-3 py-1.5 font-medium ring-1 ring-red-200/50 hover:bg-white/10">
            Yeniden dene
          </button>
        </div>
      ) : null}
      {dialogs}
    </>
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
  const variant = useDockVariant();
  if (variant === "side") {
    return (
      <div className="px-3.5 pt-2.5 pb-3">
        <div className="mb-2 flex items-center justify-between text-[0.8125rem]">
          <span>{label}</span>
          <span className="on-dark-muted tabular-nums text-[0.75rem]">{format(value)}</span>
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
  const variant = useDockVariant();
  if (variant === "side") {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={isOn}
        onClick={() => onChange(!isOn)}
        className={PANEL_ROW + " press hover:bg-white/[0.04]"}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span
          aria-hidden
          className={
            "relative h-[1.375rem] w-9 shrink-0 rounded-full transition-colors duration-300 " +
            (isOn ? "bg-gold" : "bg-white/15")
          }
        >
          <span
            className={
              "absolute top-0.5 left-0.5 size-[1.125rem] rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] " +
              (isOn ? "translate-x-[0.875rem]" : "")
            }
          />
        </span>
      </button>
    );
  }
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
  return <SegmentRow label={label} options={CORNERS} value={value} onChange={onChange} />;
}

/**
 * Tek secimli segment satiri (konum, yazi rengi). Tek bir secim iki ayri
 * anahtarla gosterilince iki bagimsiz ayar gibi okunuyordu.
 */
function SegmentRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  const variant = useDockVariant();
  return (
    <div role="group" aria-label={label}>
      <span className="fine-print on-dark-muted mb-1.5 block px-1">{label}</span>
      <div
        className={variant === "side" ? "grid gap-0.5 rounded-xl bg-black/20 p-0.5" : "flex gap-2"}
        style={variant === "side" ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
      >
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={value === option.id}
            className={
              variant === "side"
                ? "press min-h-8 truncate rounded-[0.6rem] text-[0.6875rem] transition-colors " +
                  (value === option.id ? "text-gold bg-white/12 font-medium" : "on-dark-muted hover:text-[#f3f0eb]")
                : "press min-h-9 flex-1 rounded-lg text-[0.75rem] transition-shadow " +
                  (value === option.id
                    ? "ring-gold text-gold bg-white/10 ring-2"
                    : "on-dark-muted ring-1 ring-white/12 hover:bg-white/6 hover:text-[#f3f0eb]")
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const LABEL_THEMES = [
  { id: "dark", label: "Açık yazı" },
  { id: "light", label: "Koyu yazı" },
] as const;

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
  goldHover = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  /** Uzerine gelince markanin altini (Tamamla'daki cikti dugmeleri — Serhan, 19.09.2026). */
  goldHover?: boolean;
}) {
  const variant = useDockVariant();
  if (variant === "side") {
    // Sag panelde satir: solda yuvarlak simge kutusu, ad (referans gorsel).
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={PANEL_ROW + " press hover:bg-white/[0.06] disabled:opacity-40"}
      >
        <span className="on-dark-muted flex w-4 shrink-0 justify-center">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{children}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "press on-dark-muted flex min-h-9 shrink-0 snap-start items-center gap-1.5 rounded-full px-3.5 text-[0.8125rem] whitespace-nowrap ring-1 ring-white/12 transition-colors duration-200 disabled:opacity-40 " +
        (goldHover
          ? "hover:bg-gold hover:text-[#1a1917] hover:ring-transparent disabled:hover:bg-transparent disabled:hover:text-inherit"
          : "hover:bg-white/8 hover:text-[#f3f0eb]")
      }
    >
      {icon}
      {children}
    </button>
  );
}

/** Masaustu Marka panelinde tek satira sigan kucuk eylem dugmesi. */
function CompactAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="press on-dark-muted flex h-8 items-center gap-1 rounded-full px-2.5 text-[0.75rem] ring-1 ring-white/12 transition-colors hover:bg-white/8 hover:text-[#f3f0eb]"
    >
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
