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
  Crosshair,
  Download,
  ImagePlus,
  Loader2,
  MessageCircle,
  Printer,
  RotateCw,
  Trash2,
} from "lucide-react";
import type Konva from "konva";

import { Button } from "@/components/ui/button";
import { useBackgrounds } from "@/components/composer/use-backgrounds";
import {
  OUTPUT_FORMATS,
  type OutputFormatName,
  type Transform,
  type Appearance,
  DEFAULT_APPEARANCE,
  normalizeAngle,
  isDefaultAppearance,
  logicalSize,
  fitToStage,
  MARKETPLACE_BACKGROUND_ID,
} from "@/lib/composition";
import type { Background } from "@/lib/backgrounds";
import {
  CORNERS,
  DEFAULT_LABEL,
  DEFAULT_LOGO,
  KARAT_OPTIONS,
  LOGO_OPACITY_RANGE,
  LOGO_SIZE_RANGE,
  LOGO_STORAGE_MAX_EDGE,
  MAX_CODE_LENGTH,
  type Corner,
  type LogoSettings,
  type ProductLabel,
  gramProblem,
  logoFileProblem,
} from "@/lib/overlays";

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
};

/** Sahnenin ekrandaki ust siniri — daha buyugu masaustunde sayfayi tasiyor. */
const MAX_DISPLAY_SIZE = 560;

/**
 * Baslangic olcusu bilincli olarak KUCUK.
 *
 * Ust sinirdan baslamak, ilk olcum yapilana kadar gecen tek karede sahnenin
 * kapsayicisindan tasmasina yol aciyor. Kucukten baslayip buyumek, ters
 * yondeki tasmadan gorsel olarak daha az rahatsiz edici.
 */
const INITIAL_DISPLAY_SIZE = 240;

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
 * Logo tarayicida hatirlaniyor (one alinan is, 13.09.2026). Hesaba kaydetmek
 * R2 + backend isterdi; onerinin kapsami "backend gerektirmeyenler". Veri
 * URL'i olarak saklandigi icin tuval "tainted" olmuyor (ayni kaynak).
 */
const LOGO_STORAGE_KEY = "vitrin-ai:logo";

function loadStoredLogo(): string | null {
  try {
    const value = window.localStorage.getItem(LOGO_STORAGE_KEY);
    return value?.startsWith("data:image/") ? value : null;
  } catch {
    return null;
  }
}

function storeLogo(dataUrl: string | null): boolean {
  try {
    if (dataUrl) window.localStorage.setItem(LOGO_STORAGE_KEY, dataUrl);
    else window.localStorage.removeItem(LOGO_STORAGE_KEY);
    return true;
  } catch {
    // Kota dolu ya da depolama kapali: logo bu oturumda yine calisir.
    return false;
  }
}

/**
 * Yuklenen logoyu en fazla `LOGO_STORAGE_MAX_EDGE` px'e kucultup PNG veri
 * URL'ine cevirir: localStorage kotasi (~5 MB) birkac MB'lik bir logoyla
 * dolmasin, saydamlik da korunsun.
 */
async function prepareLogo(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LOGO_STORAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Tuval kullanılamıyor.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/png");
}

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

export function CompositionEditor({ cutoutUrl, fileName }: CompositionEditorProps) {
  const { backgrounds, hasServerBackground, isLoading } = useBackgrounds();
  const [selectedBackgroundId, setSelectedBackgroundId] = useState<string | null>(null);
  const [displaySize, setDisplaySize] = useState(INITIAL_DISPLAY_SIZE);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isPrintInfoOpen, setIsPrintInfoOpen] = useState(false);
  const [formatName, setFormatName] = useState<OutputFormatName>("square");
  const [printStatus, setPrintStatus] = useState<PrintStatus>("idle");
  const [transform, setTransform] = useState<Transform | null>(null);
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
  // Studyo yalnizca istemcide acildigi icin (kullanici etkilesimiyle) tembel
  // baslangic degeri localStorage'i guvenle okuyabiliyor; sunucu cizimi yok.
  const [logoUrl, setLogoUrl] = useState<string | null>(() =>
    typeof window === "undefined" ? null : loadStoredLogo(),
  );
  const [logo, setLogo] = useState<LogoSettings>(DEFAULT_LOGO);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const [label, setLabel] = useState<ProductLabel>(DEFAULT_LABEL);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

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

  // Sahne kare ve kapsayicisina sigmali. `ResizeObserver`, `window.resize`
  // yerine kullaniliyor: kapsayici, pencere degismeden de (panel acilip
  // kapandiginda) genislik degistiriyor.
  //
  // AMA ilk olcum observer'a BIRAKILMIYOR, `getBoundingClientRect()` ile elle
  // yapiliyor. Sebep: `ResizeObserver` geri cagrilari, HTML spesifikasyonunda
  // "update the rendering" adiminin parcasi olarak teslim ediliyor — kare
  // uretmeyen bir baglamda (gizli sekme, gorunmez gomulu panel) HIC
  // calismayabiliyorlar. Bu dogrulama sirasinda birebir gozlendi: 434 px
  // genisliginde gercek bir ogeye takilan taze bir observer sifir olcum verdi.
  // Ilk olcum tek basina dogru boyutu belirledigi icin, observer artik yalnizca
  // SONRAKI degisiklikleri (panel acilip kapanmasi, pencere boyutu) izliyor.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function applyWidth(width: number) {
      if (width <= 0) return;
      setDisplaySize(
        Math.max(INITIAL_DISPLAY_SIZE, Math.min(width, MAX_DISPLAY_SIZE)),
      );
    }

    applyWidth(container.getBoundingClientRect().width);

    const observer = new ResizeObserver(([entry]) =>
      applyWidth(entry.contentRect.width),
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

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

  // Secili zemin id ile tutuluyor, nesneyle degil: liste yenilendiginde
  // (imzali URL'ler tazelendiginde) nesne kimligi degisiyor ama id ayni
  // kaliyor, dolayisiyla kullanicinin secimi yenilemeden SAG CIKIYOR.
  // Nesneyi saklasaydik her yenilemede secim ilk zemine donerdi.
  const selectedBackground: Background =
    backgrounds.find((background) => background.id === selectedBackgroundId) ??
    backgrounds[0];

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
    if (name === "marketplace") setSelectedBackgroundId(MARKETPLACE_BACKGROUND_ID);
  }, []);

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
    },
    [renderStage, fileName, format],
  );

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

  const handleLogoFile = useCallback(async (file: File) => {
    const problem = logoFileProblem(file);
    if (problem) {
      setLogoMessage(problem);
      return;
    }
    try {
      const dataUrl = await prepareLogo(file);
      setLogoUrl(dataUrl);
      setLogoMessage(
        storeLogo(dataUrl)
          ? null
          : "Logo bu oturumda kullanılabilir ama tarayıcıda saklanamadı.",
      );
    } catch {
      setLogoMessage("Logo okunamadı. Başka bir dosya deneyin.");
    }
  }, []);

  const removeLogo = useCallback(() => {
    setLogoUrl(null);
    storeLogo(null);
    setLogoMessage(null);
  }, []);

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
      try {
        const body = new FormData();
        body.append("file", await (await fetch(dataUrl)).blob(), "sahne.png");
        body.append("format", printFormat);

        const response = await fetch("/api/cmyk", { method: "POST", body });
        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          setPrintStatus({ error: errorBody?.error ?? "Dönüşüm başarısız oldu." });
          return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${fileName.replace(/\.[^.]+$/, "")}-cmyk.${printFormat === "tiff" ? "tif" : "jpg"}`;
        link.click();
        // Iptal GECIKTIRILIYOR. `click()`'ten hemen sonra iptal etmek, tarayici
        // blob'u okumaya baslamadan URL'i gecersiz kilabiliyor ve indirme
        // sessizce basarisiz oluyor. Bir dakika, en yavas cihazda bile fazlasiyla
        // yeterli; sonra bellek serbest kaliyor.
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setPrintStatus("done");
      } catch {
        setPrintStatus({ error: "Sunucuya ulaşılamadı." });
      }
    },
    [renderStage, fileName],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-8">
      {/*
        `min-w-0` sart: grid ogelerinin varsayilan `min-width: auto` degeri,
        ogenin ICERIGINDEN daha dar olmasini engelliyor. Konva sahnesi kendine
        acik bir piksel genisligi verdigi icin bu bir geri besleme dongusu
        yaratiyordu: sahne 560 px -> kapsayici 560 px'e itiliyor ->
        olcum 560 okuyor -> sahne 560'ta kaliyor. Sonuc, dar ekranlarda
        kapsayicisindan tasan bir tuval. `min-w-0`, kapsayicinin gercek
        kullanilabilir genisligi bildirmesini sagliyor.
      */}
      {/*
        Telefonda tuval YAPISKAN: kullanici asagidaki ayarlari degistirirken
        sonucu gorebilmeli. Onceden panel tuvalin altina duyuyor ve ayar
        yapilirken tuval ekran disinda kaliyordu.
        `top-14` ust cubugun yuksekligi kadar.
      */}
      <div
        ref={containerRef}
        className="mx-auto w-full max-w-[22rem] min-w-0 sm:max-w-[26rem] lg:sticky lg:top-20 lg:max-w-[35rem]"
      >
        <div
          className="ring-black/8 overflow-hidden rounded-[1.25rem] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.25)] ring-1"
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
            onTransformChange={(next) => {
              pushHistory();
              setTransform(next);
            }}
            onCutoutSize={setCutoutSize}
            onStageReady={handleStageReady}
          />
        </div>
        <p className="fine-print mt-3 text-center opacity-60">
          Sürükleyerek taşıyın · köşelerden boyutlandırın · üstteki tutamaçtan
          döndürün
        </p>
      </div>

      <div className="divide-black/8 rounded-2xl bg-[#f5f5f7] divide-y">
        <SectionHeading>Zemin</SectionHeading>
        <div className="px-5 pb-5">
          <div className="grid grid-cols-6 gap-2 lg:grid-cols-4">
            {backgrounds.map((background) => {
              const isActive = background.id === selectedBackground.id;
              return (
                <button
                  key={background.id}
                  type="button"
                  onClick={() => setSelectedBackgroundId(background.id)}
                  title={background.name}
                  aria-label={background.name}
                  aria-pressed={isActive}
                  // Secili halka `ring` yardimcilariyla veriliyor, keyfi bir
                  // `shadow-[...]` ile degil: keyfi coklu golge denendiginde
                  // Tailwind iki golge katmani uretti ama ikisi de SEFFAF
                  // kaldi, yani secili zemin hic belli olmuyordu (tarayicida
                  // olculerek yakalandi). `ring` bu isi tek bir ongorulebilir
                  // ozellikle yapiyor.
                  className={
                    "aspect-square rounded-full ring-offset-[#f5f5f7] transition-transform duration-200 " +
                    (isActive
                      ? "ring-gold scale-105 ring-2 ring-offset-2"
                      : "ring-1 ring-black/15 hover:scale-105")
                  }
                  style={
                    background.type === "placeholder"
                      ? { background: gradientCss(background.gradient) }
                      : {
                          backgroundImage: `url(${background.url})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                  }
                />
              );
            })}
          </div>

          {/*
            Yer tutucu zeminler kullaniciya ACIKCA soyleniyor. Yol haritasi
            "sessizce dusmeli" derken kirilma olmamasini kastediyor, kullanicinin
            yanlis bilgilendirilmesini degil: gercek zemin kutuphanesi henuz
            yokken "iste zeminleriniz" demek yanlis olurdu.
          */}
          {!isLoading && !hasServerBackground ? (
            <p className="fine-print mt-3 opacity-60">
              Zemin kütüphanesi hazırlanıyor. Şimdilik sade zeminler.
            </p>
          ) : null}

          {formatName === "marketplace" &&
          selectedBackground.id !== MARKETPLACE_BACKGROUND_ID ? (
            <p role="status" className="fine-print mt-3 text-amber-800">
              Pazaryerleri genellikle düz beyaz zemin ister.{" "}
              <button
                type="button"
                onClick={() => setSelectedBackgroundId(MARKETPLACE_BACKGROUND_ID)}
                className="font-medium underline underline-offset-2"
              >
                Beyaza dön
              </button>
            </p>
          ) : null}
        </div>

        <SectionHeading>Yerleşim</SectionHeading>
        <div className="space-y-4 px-5 pb-5">
          <div>
            <div className="fine-print mb-2 flex items-center justify-between opacity-60">
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
              className="accent-gold h-1 w-full cursor-pointer appearance-none rounded-full bg-black/15"
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => rotateBy(15)}
              disabled={!cutoutSize}
              className="press flex-1 rounded-full bg-white"
            >
              <RotateCw className="size-3.5" strokeWidth={1.75} aria-hidden />
              15°
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={centerAndFit}
              disabled={!cutoutSize}
              className="press flex-1 rounded-full bg-white"
            >
              <Crosshair className="size-3.5" strokeWidth={1.75} aria-hidden />
              Ortala
            </Button>
          </div>
        </div>

        <SectionHeading>
          Görünüm
          {!isDefaultAppearance(appearance) ? (
            <button
              type="button"
              onClick={() => setAppearance(DEFAULT_APPEARANCE)}
              className="ml-2 font-normal normal-case underline underline-offset-2 opacity-70 hover:opacity-100"
            >
              sıfırla
            </button>
          ) : null}
        </SectionHeading>
        <div className="space-y-3 px-5 pb-5">
          <Slider
            label="Parlaklık"
            value={appearance.brightness}
            min={-0.3}
            max={0.3}
            step={0.01}
            format={(v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`}
            onStart={pushHistory}
            onChange={(v) => setAppearance((a) => ({ ...a, brightness: v }))}
          />
          <Slider
            label="Kontrast"
            value={appearance.contrast}
            min={-40}
            max={40}
            step={1}
            format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)}`}
            onStart={pushHistory}
            onChange={(v) => setAppearance((a) => ({ ...a, contrast: v }))}
          />
          <Slider
            label="Doygunluk"
            value={appearance.saturation}
            min={-1}
            max={1}
            step={0.02}
            format={(v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`}
            onStart={pushHistory}
            onChange={(v) => setAppearance((a) => ({ ...a, saturation: v }))}
          />

          <div className="flex gap-2 pt-1">
            <Toggle
              label="Gölge"
              isOn={appearance.shadow}
              onChange={(on) => setAppearance((a) => ({ ...a, shadow: on }))}
            />
            <Toggle
              label="Işık havuzu"
              isOn={appearance.spotlight}
              onChange={(on) => setAppearance((a) => ({ ...a, spotlight: on }))}
            />
          </div>
        </div>

        {/* Logo (one alinan is, 13.09.2026) */}
        <SectionHeading>Logo</SectionHeading>
        <div className="space-y-3 px-5 pb-5">
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
          {logoUrl ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Yüklenen logo"
                className="checkerboard size-12 shrink-0 rounded-lg object-contain ring-1 ring-black/10"
              />
              <div className="flex flex-1 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => logoInputRef.current?.click()}
                  className="press flex-1 rounded-full bg-white"
                >
                  Değiştir
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={removeLogo}
                  aria-label="Logoyu kaldır"
                  className="press rounded-full bg-white"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden />
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => logoInputRef.current?.click()}
              className="press w-full rounded-full bg-white"
            >
              <ImagePlus className="size-3.5" strokeWidth={1.75} aria-hidden />
              Logo yükle
            </Button>
          )}

          {logoUrl ? (
            <>
              <CornerPicker
                label="Logo konumu"
                value={logo.corner}
                onChange={(corner) => setLogo((current) => ({ ...current, corner }))}
              />
              <Slider
                label="Logo boyutu"
                value={logo.size}
                min={LOGO_SIZE_RANGE.min}
                max={LOGO_SIZE_RANGE.max}
                step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => setLogo((current) => ({ ...current, size: v }))}
              />
              <Slider
                label="Saydamlık"
                value={logo.opacity}
                min={LOGO_OPACITY_RANGE.min}
                max={LOGO_OPACITY_RANGE.max}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => setLogo((current) => ({ ...current, opacity: v }))}
              />
            </>
          ) : null}

          {logoMessage ? (
            <p role="alert" className="fine-print text-red-700">
              {logoMessage}
            </p>
          ) : (
            <p className="fine-print opacity-55">
              Saydam PNG en iyi sonucu verir. Logo yalnızca bu tarayıcıda hatırlanır.
            </p>
          )}
        </div>

        {/* Urun etiketi (one alinan is, 13.09.2026) */}
        <SectionHeading>Ürün etiketi</SectionHeading>
        <div className="space-y-3 px-5 pb-5">
          <div className="flex gap-2">
            <Toggle
              label={label.enabled ? "Etiket açık" : "Etiket kapalı"}
              isOn={label.enabled}
              onChange={(enabled) => setLabel((current) => ({ ...current, enabled }))}
            />
          </div>

          {label.enabled ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="fine-print block opacity-60">Ayar</span>
                  <select
                    value={label.karat}
                    onChange={(event) =>
                      setLabel((current) => ({ ...current, karat: event.target.value }))
                    }
                    className="mt-1 min-h-9 w-full rounded-lg bg-white px-2 text-[0.8125rem] ring-1 ring-black/10"
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
                  <span className="fine-print block opacity-60">Gram</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="3,45"
                    value={label.gram}
                    onChange={(event) =>
                      setLabel((current) => ({ ...current, gram: event.target.value }))
                    }
                    aria-invalid={gramProblem(label.gram) ? true : undefined}
                    className="mt-1 min-h-9 w-full rounded-lg bg-white px-2 text-[0.8125rem] ring-1 ring-black/10 aria-invalid:ring-red-400"
                  />
                </label>
              </div>
              <label className="block">
                <span className="fine-print block opacity-60">Ürün kodu</span>
                <input
                  type="text"
                  placeholder="A-102"
                  maxLength={MAX_CODE_LENGTH}
                  value={label.code}
                  onChange={(event) =>
                    setLabel((current) => ({ ...current, code: event.target.value }))
                  }
                  className="mt-1 min-h-9 w-full rounded-lg bg-white px-2 text-[0.8125rem] ring-1 ring-black/10"
                />
              </label>
              {gramProblem(label.gram) ? (
                <p role="alert" className="fine-print text-red-700">
                  {gramProblem(label.gram)}
                </p>
              ) : null}

              <CornerPicker
                label="Etiket konumu"
                value={label.corner}
                onChange={(corner) => setLabel((current) => ({ ...current, corner }))}
              />
              <div className="flex gap-2">
                <Toggle
                  label="Koyu"
                  isOn={label.theme === "dark"}
                  onChange={() => setLabel((current) => ({ ...current, theme: "dark" }))}
                />
                <Toggle
                  label="Açık"
                  isOn={label.theme === "light"}
                  onChange={() => setLabel((current) => ({ ...current, theme: "light" }))}
                />
              </div>
            </>
          ) : (
            <p className="fine-print opacity-55">
              Ayar, gram ve ürün kodunu görselin köşesine ekler.
            </p>
          )}
        </div>

        {/*
          Cikti bicimleri. Mantiksal sahne olcusu her bicimde ciktinin YARISI
          oldugu icin disa aktarma orani tam 2 kaliyor — kesirli bir oran
          Konva'nin ic hesabinda bir piksel kaybina yol aciyor (2000 yerine
          1999 px uretildigi birebir olculdu).
        */}
        <SectionHeading>Çıktı boyutu</SectionHeading>
        <div className="grid grid-cols-2 gap-2 px-5 pb-5">
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
                "press rounded-xl px-3 py-2 text-left transition-shadow " +
                (formatName === name
                  ? "ring-gold bg-white ring-2"
                  : "bg-white/70 ring-1 ring-black/10 hover:ring-black/25")
              }
            >
              <span className="block text-[0.8125rem] font-medium">{option.label}</span>
              <span className="fine-print block opacity-55">{option.summary}</span>
            </button>
          ))}
        </div>

        <SectionHeading>
          Dışa aktar
          <span className="ml-2 font-normal normal-case opacity-50">
            {format.outputWidth}×{format.outputHeight}
          </span>
        </SectionHeading>
        <div className="flex gap-2 px-5 pb-5">
          <Button
            type="button"
            onClick={() => download("png")}
            disabled={isExporting}
            className="press min-h-10 flex-1 rounded-full"
          >
            <Download className="size-4" strokeWidth={1.75} aria-hidden />
            PNG
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => download("jpeg")}
            disabled={isExporting}
            className="press min-h-10 flex-1 rounded-full bg-white"
          >
            JPEG
          </Button>
        </div>
        <div className="-mt-2 px-5 pb-5">
          <Button
            type="button"
            variant="outline"
            onClick={shareToWhatsApp}
            disabled={isExporting}
            className="press min-h-10 w-full rounded-full bg-white"
          >
            <MessageCircle className="size-4" strokeWidth={1.75} aria-hidden />
            WhatsApp&apos;ta paylaş
          </Button>
          {shareMessage ? (
            <p role="status" className="fine-print mt-2 opacity-70">
              {shareMessage}
            </p>
          ) : null}
        </div>
        {exportError ? (
          <p role="alert" className="fine-print -mt-3 px-5 pb-5 text-red-700">
            {exportError}
          </p>
        ) : null}

        {/*
          BASKIYA UYGUN CIKTI — artik gercek.

          Donusum `sharp` (libvips + littleCMS) ile Next'in kendi sunucusunda
          yapiliyor (bkz. app/api/cmyk/route.ts); Python backend'ine ve yol
          haritasindaki hicbir faza dokunmuyor.

          Tarayicida yapilamaz: canvas yalnizca RGB uretir, PNG formati
          CMYK'yi hic desteklemez. Dort kanalli bir goruntu ve icine gomulu
          bir cikti profili yalnizca sunucuda mumkun.
        */}
        <SectionHeading>
          Baskıya uygun
          <span className="ml-2 font-normal normal-case opacity-50">CMYK</span>
        </SectionHeading>
        <div className="px-5 pb-5">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadForPrint("tiff")}
              disabled={printStatus === "preparing"}
              className="press min-h-10 flex-1 rounded-full bg-white"
            >
              {printStatus === "preparing" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Printer className="size-3.5" strokeWidth={1.75} aria-hidden />
              )}
              TIFF
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadForPrint("jpeg")}
              disabled={printStatus === "preparing"}
              className="press min-h-10 flex-1 rounded-full bg-white"
            >
              JPEG
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setIsPrintInfoOpen((open) => !open)}
            aria-expanded={isPrintInfoOpen}
            className="fine-print mt-2 underline underline-offset-2 opacity-60 hover:opacity-100"
          >
            Bu ne demek?
          </button>

          {isPrintInfoOpen ? (
            <p className="fine-print mt-1.5 leading-relaxed opacity-70">
              Matbaa, ekran için üretilen RGB dosyayı doğrudan basamaz. Bu
              seçenek görseli, hedef baskı koşulunun ICC profiliyle CMYK renk
              uzayına çevirip profili dosyaya gömer. Saydam alanlar beyaza
              düzleştirilir, çünkü CMYK&apos;de saydamlık yoktur. TIFF matbaanın
              tercih ettiği biçim; JPEG daha küçük.
            </p>
          ) : null}

          {printStatus === "done" ? (
            <p role="status" className="fine-print mt-2 opacity-60">
              İndirildi.
            </p>
          ) : typeof printStatus === "object" ? (
            <p role="alert" className="fine-print mt-2 text-red-700">
              {printStatus.error}
            </p>
          ) : null}

          <p className="fine-print mt-3 opacity-55">
            PNG çıktısı zaten kayıpsızdır; JPEG sıkıştırma uygular.
          </p>
        </div>
      </div>
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
      <div className="fine-print mb-1.5 flex items-center justify-between opacity-60">
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
        className="accent-gold h-1 w-full cursor-pointer appearance-none rounded-full bg-black/15"
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
          ? "bg-black text-white"
          : "bg-white text-black/70 ring-1 ring-black/10 hover:text-black")
      }
    >
      {label}
    </button>
  );
}

/** Dort kose secimi: 2x2 izgara, secili kose altin halkali. */
function CornerPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Corner;
  onChange: (corner: Corner) => void;
}) {
  return (
    <div role="group" aria-label={label}>
      <span className="fine-print mb-1.5 block opacity-60">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        {CORNERS.map((corner) => (
          <button
            key={corner.id}
            type="button"
            onClick={() => onChange(corner.id)}
            aria-pressed={value === corner.id}
            className={
              "press min-h-8 rounded-lg text-[0.75rem] transition-shadow " +
              (value === corner.id
                ? "ring-gold bg-white ring-2"
                : "bg-white/70 ring-1 ring-black/10 hover:ring-black/25")
            }
          >
            {corner.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-5 pt-5 pb-3 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase opacity-50">
      {children}
    </h3>
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
