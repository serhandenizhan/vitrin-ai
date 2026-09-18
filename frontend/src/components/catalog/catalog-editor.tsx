"use client";

/**
 * Katalog editoru.
 *
 * AKIS: once sablon galerisi, sonra calisma alani. Kullanici hangi duzeni
 * istedigini once seciyor; galeri mini onizlemelerle gosteriyor, boylece
 * secim koru koru degil. Secim yapilinca ayni sayfada calisma alani aciliyor
 * ve "Şablonu değiştir" ile galeriye donuluyor — o donuste yerlestirilen
 * gorseller KORUNUYOR, sablon denemenin bedeli olmamali.
 *
 * KAPSAM: tamamen istemci tarafinda. Backend'e, veritabanina ya da yol
 * haritasindaki hicbir faza dokunmuyor; girdisini var olan calisma
 * gecmisinden (IndexedDB) ya da dosya seciminden aliyor.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Contrast,
  Download,
  ImagePlus,
  Loader2,
  Printer,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";

import {
  CatalogPageView,
  type SlotContent,
} from "@/components/catalog/catalog-page-view";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import {
  CATALOG_HEIGHT,
  CATALOG_WIDTH,
  renderCatalog,
} from "@/lib/catalog-export";
import {
  type CatalogTexts,
  DEFAULT_SLOT_TRANSFORM,
  PAPER_COLORS,
  type TextTone,
  applyTemplateColors,
  MAX_SLOT_SCALE,
  MIN_SLOT_SCALE,
  type SlotTransform,
  type Template,
  TEMPLATES,
  type TemplateName,
} from "@/lib/catalog-templates";
import { validateFile } from "@/lib/upload-constraints";
import { clearCatalogImport, peekCatalogImport } from "@/lib/catalog-handoff";
import { CORNERS, logoSettingsFromBox } from "@/lib/overlays";
import { useLogo, useLogoBox } from "@/lib/use-logo";
import { downloadCmyk, type PrintFormat } from "@/lib/print-download";

/**
 * "Ornek ile basla" icin hazir icerik.
 *
 * Gorseller sitenin kendi tanitim karelerinden — yani aracin gercek ciktisi
 * (bkz. scripts/prepare-showcase.mjs). Kullanici bos bir sayfayla degil,
 * calisan bir ornekle karsilasiyor; fikri anlatmanin en kisa yolu bu.
 */
const SAMPLE: { template: TemplateName; texts: CatalogTexts; images: string[] } = {
  template: "duo",
  texts: {
    eyebrow: "Sonbahar 2026",
    title: "Pırlanta Koleksiyonu",
    footer: "Vitrin AI ile hazırlandı",
  },
  images: ["/showcase/vitrin-kadife.webp", "/showcase/vitrin-altin.webp"],
};

/**
 * Sablon galerisindeki mini onizlemeler icin ornek gorseller.
 *
 * 11.09.2026'da eklendi (kullanici: "kullanıcı o koleksiyona görseller
 * koymadıysa base koleksiyon örnekleri olsun"). Onceden galeri bos yuvalarla
 * (`option.slots.map(() => null)`) ciziliyordu; bu, ozellikle koyu "Kapak"
 * sablonunda duz bir siyah dikdortgen gibi gorunuyordu ve sayfa bos/eksik
 * hissettiriyordu. Ayni ucrenin ustune yerlestirdigimiz gercek zemin
 * karelerini (`backgrounds-showcase.tsx` ile ayni kaynak) kullaniyoruz;
 * boylece galeri de aracin gercek ciktisini gosteriyor, uydurma bir gorsel
 * degil. Uclu izgara ucuncu yuvada ilk gorsele donuyor.
 *
 * Gercek olculeri (900x900, kare) betikte sabit; onizleme icin ayrica
 * `<img>` yuklemeye gerek yok.
 */
const GALLERY_PREVIEW_IMAGES = [
  "/showcase/vitrin-kadife.webp",
  "/showcase/vitrin-altin.webp",
  "/showcase/vitrin-sicak-gri.webp",
];

function galleryPreviewSlots(template: Template): SlotContent[] {
  return template.slots.map((_, index) => ({
    url: GALLERY_PREVIEW_IMAGES[index % GALLERY_PREVIEW_IMAGES.length],
    name: "örnek",
    width: 900,
    height: 900,
    transform: { ...DEFAULT_SLOT_TRANSFORM },
  }));
}

type CatalogTab = "renkler" | "metinler" | "gorseller" | "logo" | "indir";

const CATALOG_TABS: { id: CatalogTab; label: string }[] = [
  { id: "gorseller", label: "Görseller" },
  { id: "metinler", label: "Metinler" },
  { id: "renkler", label: "Renkler" },
  { id: "logo", label: "Logo" },
  { id: "indir", label: "İndir" },
];

const DEFAULT_TEXTS: CatalogTexts = {
  eyebrow: "Sonbahar 2026",
  title: "Yeni Koleksiyon",
  footer: "Vitrin AI ile hazırlandı",
};

export function CatalogEditor() {
  const { works, isHistoryLoaded } = useWorkspace();

  const [templateName, setTemplateName] = useState<TemplateName | null>(null);
  const [slots, setSlots] = useState<SlotContent[]>([]);
  const [texts, setTexts] = useState(DEFAULT_TEXTS);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [printMessage, setPrintMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Logo studyoyla AYNI yerde saklaniyor (lib/logo-storage.ts): studyoda
  // yuklenen logo katalogda da hazir geliyor. Akisin kendisi de paylasiliyor
  // (lib/use-logo.ts); burada kalan tek sey KATALOGA OZEL yerlesim hesabi.
  const {
    logoUrl,
    settings: logoSettings,
    message: logoMessage,
    handleFile: handleLogoFile,
    invert: invertCurrentLogo,
    update: updateLogo,
    remove: removeLogo,
  } = useLogo();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const logoPreview = useLogoBox(logoUrl, logoSettings, CATALOG_WIDTH, CATALOG_HEIGHT);


  // Olusturulan object URL'ler bilesen kaldirilirken serbest birakiliyor.
  const objectUrlRef = useRef<string[]>([]);
  useEffect(() => {
    const urls = objectUrlRef.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  // Sayfa ve metin rengi (Kaan, 17.09.2026). `null`/"auto": sablonun kendi
  // rengi ve ona gore siyah/beyaz metin. Sablon degisse de secim korunuyor.
  const [paperColor, setPaperColor] = useState<string | null>(null);
  const [textTone, setTextTone] = useState<TextTone>("auto");
  const [mobileTab, setMobileTab] = useState<CatalogTab>("gorseller");
  const template = useMemo(
    () =>
      templateName ? applyTemplateColors(TEMPLATES[templateName], paperColor, textTone) : null,
    [templateName, paperColor, textTone],
  );

  // Gorunen yuva listesi RENDER SIRASINDA turetiliyor. Boylece iki yuvali
  // sablondan tek yuvaliya gecip geri donuldugunde ikinci gorsel KAYBOLMUYOR.
  const visibleSlots = useMemo(
    () =>
      template
        ? Array.from({ length: template.slots.length }, (_, i) => slots[i] ?? null)
        : [],
    [template, slots],
  );

  const filledCount = visibleSlots.filter(Boolean).length;

  /** Bir URL'den yuva icerigi kurar; dogal olculeri okumak icin gorseli yukler. */
  const buildContent = useCallback(
    (url: string, name: string): Promise<NonNullable<SlotContent>> =>
      new Promise((resolve, reject) => {
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () =>
          resolve({
            url,
            name,
            width: img.width,
            height: img.height,
            transform: { ...DEFAULT_SLOT_TRANSFORM },
          });
        img.onerror = () => reject(new Error("Görsel yüklenemedi"));
        img.src = url;
      }),
    [],
  );

  const placeInSlot = useCallback(
    async (index: number, url: string, name: string) => {
      try {
        const content = await buildContent(url, name);
        setSlots((previous) => {
          const next = [...previous];
          next[index] = content;
          return next;
        });
        setError(null);
      } catch {
        setError("Görsel yüklenemedi.");
      }
    },
    [buildContent],
  );

  const startWithSample = useCallback(async () => {
    setTemplateName(SAMPLE.template);
    setTexts(SAMPLE.texts);
    const contents = await Promise.all(
      SAMPLE.images.map((url, i) => buildContent(url, `örnek-${i + 1}`)),
    );
    setSlots(contents);
    setSelectedSlot(null);
  }, [buildContent]);

  // Studyodan "sablona ekle" ile gelindiyse gorsel Tam sayfa sablonunda
  // sayfanin tamamina yerlesiyor (lib/catalog-handoff.ts). Metinler bos
  // basliyor: gorselin ustune ornek baslik binmesin, kullanici isterse yazar.
  useEffect(() => {
    const imported = peekCatalogImport();
    if (!imported) return;
    let cancelled = false;
    buildContent(imported, "stüdyo")
      .then((content) => {
        if (cancelled) return;
        clearCatalogImport();
        setTemplateName("full");
        setTexts({ eyebrow: "", title: "", footer: "" });
        setSlots([content]);
        setSelectedSlot(0);
      })
      .catch(() => {
        if (!cancelled) setError("Stüdyodan gelen görsel açılamadı.");
      });
    return () => {
      cancelled = true;
    };
  }, [buildContent]);

  const updateTransform = useCallback(
    (index: number, patch: Partial<SlotTransform>) => {
      setSlots((previous) => {
        const next = [...previous];
        const current = next[index];
        if (!current) return previous;
        next[index] = { ...current, transform: { ...current.transform, ...patch } };
        return next;
      });
    },
    [],
  );

  /**
   * Katalog JPEG ya da baskiya uygun CMYK olarak iniyor (Kaan, 17.09.2026:
   * "PNG degil, JPEG ve CMYK olsun, bastirilsin"). CMYK icin sayfa once
   * kayipsiz PNG cizilip sunucuda donusturuluyor (lib/print-download.ts).
   */
  const exportPage = useCallback(
    async (output: "jpeg" | PrintFormat) => {
      if (!template) return;
      setIsExporting(true);
      setPrintMessage(null);
      const content = {
        template,
        slots: visibleSlots,
        texts,
        logo: logoUrl ? { url: logoUrl, settings: logoSettings } : null,
      };
      try {
        if (output === "jpeg") {
          const link = document.createElement("a");
          link.href = await renderCatalog(content, "jpeg");
          link.download = `katalog-${template.fileSlug}.jpg`;
          link.click();
          return;
        }
        const result = await downloadCmyk(
          await renderCatalog(content, "png"),
          output,
          `katalog-${template.fileSlug}`,
        );
        setPrintMessage(result.ok ? { ok: true, text: "İndirildi." } : { ok: false, text: result.error });
      } catch {
        setError("Sayfa dışa aktarılamadı.");
      } finally {
        setIsExporting(false);
      }
    },
    [template, visibleSlots, texts, logoUrl, logoSettings],
  );

  /* --- Galeri ----------------------------------------------------------- */

  if (!template) {
    return (
      <div className="soft-enter">
        <div className="grid grid-cols-2 gap-5 sm:gap-8 lg:grid-cols-3">
          {Object.values(TEMPLATES).map((option) => (
            <button
              key={option.name}
              type="button"
              onClick={() => {
                setTemplateName(option.name);
                setSelectedSlot(null);
              }}
              className="press group rounded-[1.5rem] text-left outline-none focus-visible:ring-2 focus-visible:ring-[#b8893f] focus-visible:ring-offset-4"
            >
              <div className="relative overflow-hidden rounded-[1.5rem] shadow-[0_1px_2px_rgba(0,0,0,0.06),0_24px_50px_-22px_rgba(0,0,0,0.35)] ring-1 ring-black/10 transition-[transform,box-shadow] duration-300 group-hover:-translate-y-2 group-hover:shadow-[0_30px_65px_-24px_rgba(0,0,0,0.48)] group-hover:ring-[#b8893f]/60 group-focus-visible:-translate-y-2">
                <div
                  className="catalog-container"
                  style={{ aspectRatio: `${CATALOG_WIDTH} / ${CATALOG_HEIGHT}` }}
                >
                  {/* Mini onizleme, gercek sablonun kendisi — ayri bir
                      "kapak resmi" tutulsaydi sablon degistiginde sessizce
                      eskirdi. Yuvalar site zeminlerinden ornek gorsellerle
                      dolu: bos siyah/kirik-beyaz bir kutu yerine calisan bir
                      sayfa gibi duruyor. */}
                  <CatalogPageView
                    template={option}
                    slots={galleryPreviewSlots(option)}
                    // Tam sayfa onizlemesinde koyu ornek gorselin ustune koyu
                    // baslik binip okunmuyordu; orada yalnizca gorsel.
                    texts={option.name === "full" ? { eyebrow: "", title: "", footer: "" } : DEFAULT_TEXTS}
                  />
                </div>
                <span className="absolute top-3 right-3 translate-y-1 rounded-full bg-black/70 px-3 py-1.5 text-[0.6875rem] font-medium text-white opacity-0 shadow-lg backdrop-blur-md transition-[opacity,transform] duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                  Şablonu seç
                </span>
              </div>
              <h3 className="mt-4 text-[1.0625rem] font-semibold tracking-[-0.01em] transition-colors group-hover:text-[#9a6b24]">
                {option.title}
              </h3>
              <p className="on-light-muted fine-print mt-0.5">{option.summary}</p>
            </button>
          ))}
        </div>

        <div className="mt-9 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={startWithSample}
            className="press min-h-11 rounded-full bg-white"
          >
            <Sparkles className="size-4" strokeWidth={1.75} aria-hidden />
            Örnek ile başlayın
          </Button>
        </div>
      </div>
    );
  }

  /* --- Calisma alani ---------------------------------------------------- */

  const selected = selectedSlot !== null ? visibleSlots[selectedSlot] : null;

  return (
    <div className="soft-enter flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      {/* Sayfa genis ekranda YAPISKAN: paneldeki alt ayarlar (logo, disa
          aktarma) duzenlenirken sayfa gorunur kaliyor (Kaan, 17.09.2026).
          Genislik ekran yuksekligine gore sinirli ki A4 ekrana sigsin. */}
      <div
        // Telefonda da YAPISKAN (Kaan, 17.09.2026): orada sayfa ekran
        // yuksekliginin ~%42'siyle sinirli ki altindaki ayarlar da gorunsun.
        className="catalog-sticky-bar sticky top-16 z-20 w-full min-w-0 py-2 lg:top-20 lg:py-0"
        style={
          {
            "--catalog-ratio": CATALOG_WIDTH / CATALOG_HEIGHT,
          } as React.CSSProperties
        }
      >
        <div
          className="catalog-sticky catalog-container mx-auto overflow-hidden rounded-[1.25rem] shadow-[0_1px_2px_rgba(0,0,0,0.05),0_18px_44px_-18px_rgba(0,0,0,0.28)] ring-1 ring-black/10"
          style={{ aspectRatio: `${CATALOG_WIDTH} / ${CATALOG_HEIGHT}` }}
        >
          <CatalogPageView
            template={template}
            slots={visibleSlots}
            texts={texts}
            editable
            selectedSlot={selectedSlot}
            onSlotSelect={(slot) => {
              setSelectedSlot(slot);
              setMobileTab("gorseller");
            }}
            onSlotMove={(index, x, y) =>
              updateTransform(index, {
                // Sinir: gorsel tamamen kutunun disina surukleneemesin, aksi
                // halde kullanici gorseli "kaybediyor" ve geri getirmenin tek
                // yolu sifirlama oluyor.
                x: Math.max(-1, Math.min(1, x)),
                y: Math.max(-1, Math.min(1, y)),
              })
            }
            onSlotScale={(index, scale) =>
              updateTransform(index, {
                scale: Math.max(MIN_SLOT_SCALE, Math.min(MAX_SLOT_SCALE, scale)),
              })
            }
            onSlotClear={(index) => {
              setSlots((previous) => {
                const next = [...previous];
                next[index] = null;
                return next;
              });
              setSelectedSlot(null);
            }}
            logo={logoPreview}
            onLogoChange={(box) =>
              updateLogo(
                logoSettingsFromBox(
                  {
                    x: box.x * CATALOG_WIDTH,
                    y: box.y * CATALOG_HEIGHT,
                    width: box.width * CATALOG_WIDTH,
                    height: box.height * CATALOG_HEIGHT,
                  },
                  CATALOG_WIDTH,
                  CATALOG_HEIGHT,
                ),
              )
            }
          />
        </div>
        <p className="fine-print mt-3 hidden text-center opacity-55 lg:block">
          A4 oranında · {CATALOG_WIDTH}×{CATALOG_HEIGHT} piksel
        </p>
      </div>

      <div className="glass-panel-light divide-black/8 divide-y rounded-2xl">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <span className="text-[0.9375rem] font-medium">{template.title}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setTemplateName(null);
              setSelectedSlot(null);
            }}
            className="press -mr-2 rounded-full"
          >
            <ArrowLeft className="size-3.5" strokeWidth={1.75} aria-hidden />
            Şablonu değiştir
          </Button>
        </div>

        {/* Telefonda ayarlar SEKMELI (Kaan, 17.09.2026): hepsi alt alta
            dizildiginde panel cok uzuyor, sayfa ustte sabit durdugu icin
            asagi kaydirmak zorlasiyordu. Genis ekranda hepsi gorunur. */}
        <div role="tablist" aria-label="Katalog ayarları" className="mobile-tabs flex gap-1 overflow-x-auto px-3 py-2 lg:hidden">
          {CATALOG_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mobileTab === tab.id}
              onClick={() => setMobileTab(tab.id)}
              className={
                "press min-h-10 shrink-0 rounded-full px-3.5 text-[0.8125rem] transition-colors " +
                (mobileTab === tab.id ? "bg-black text-white" : "text-black/70")
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className={mobileTab === "renkler" ? "" : "max-lg:hidden"}>
        <SectionHeading>Renkler</SectionHeading>
        <div className="space-y-3 px-5 pb-5">
          <div role="group" aria-label="Sayfa rengi" className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={paperColor === null}
              onClick={() => setPaperColor(null)}
              className={
                "press min-h-8 rounded-full px-3 text-[0.75rem] " +
                (paperColor === null ? "ring-gold bg-white ring-2" : "bg-white/70 ring-1 ring-black/10")
              }
            >
              Şablonun
            </button>
            {PAPER_COLORS.map((option) => (
              <button
                key={option.id}
                type="button"
                title={option.label}
                aria-label={option.label}
                aria-pressed={paperColor === option.color}
                onClick={() => setPaperColor(option.color)}
                className={
                  "press size-8 rounded-full ring-offset-2 ring-offset-transparent " +
                  (paperColor === option.color ? "ring-gold ring-2" : "ring-1 ring-black/15")
                }
                style={{ backgroundColor: option.color }}
              />
            ))}
          </div>
          <div role="group" aria-label="Metin rengi" className="flex gap-2">
            {([
              ["dark", "Siyah metin"],
              ["light", "Beyaz metin"],
            ] as const).map(([tone, label]) => (
              <button
                key={tone}
                type="button"
                aria-pressed={textTone === tone}
                // Secili tona tekrar basmak otomatige donduruyor.
                onClick={() => setTextTone((current) => (current === tone ? "auto" : tone))}
                className={
                  "press min-h-8 flex-1 rounded-full text-[0.8125rem] transition-colors " +
                  (textTone === tone
                    ? "bg-black text-white"
                    : "bg-white text-black/70 ring-1 ring-black/10 hover:text-black")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        </div>
        <div className={mobileTab === "metinler" ? "" : "max-lg:hidden"}>
        <SectionHeading>Metinler</SectionHeading>
        <div className="space-y-3 px-5 pb-5">
          <TextField
            label="Üst etiket"
            value={texts.eyebrow}
            onChange={(v) => setTexts((t) => ({ ...t, eyebrow: v }))}
          />
          <TextField
            label="Başlık"
            value={texts.title}
            onChange={(v) => setTexts((t) => ({ ...t, title: v }))}
          />
          {template.texts.some((element) => element.field === "footer") ? (
            <TextField
              label="Alt bilgi"
              value={texts.footer}
              onChange={(v) => setTexts((t) => ({ ...t, footer: v }))}
            />
          ) : null}
        </div>

        </div>
        <div className={mobileTab === "gorseller" ? "" : "max-lg:hidden"}>
        <SectionHeading>
          Görseller
          <span className="ml-2 font-normal normal-case opacity-50">
            {filledCount}/{template.slots.length}
          </span>
        </SectionHeading>
        <div className="space-y-3 px-5 pb-5">
          {selectedSlot === null ? (
            <p className="fine-print opacity-60">
              Sayfadaki bir alana dokunun; görsel ekleyip yerleştirin.
            </p>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="press w-full justify-start rounded-full bg-white"
              >
                <ImagePlus className="size-4" strokeWidth={1.75} aria-hidden />
                {selected ? "Görseli değiştir" : "Görsel seçin"}
              </Button>

              {/* Boyut ve konum — kullanicinin acikca istedigi kontrol.
                  Degerler yuvanin KENDI kutusuna gore oran; sablon degisse de
                  ayni yerlesim korunuyor. */}
              {selected ? (
                <div className="space-y-2.5 pt-1">
                  <Slider
                    label="Boyut"
                    value={selected.transform.scale}
                    min={MIN_SLOT_SCALE}
                    max={MAX_SLOT_SCALE}
                    step={0.02}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => updateTransform(selectedSlot, { scale: v })}
                  />
                  <Slider
                    label="Döndür"
                    value={selected.transform.rotation}
                    min={-45}
                    max={45}
                    step={1}
                    format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)}°`}
                    onChange={(v) => updateTransform(selectedSlot, { rotation: v })}
                  />
                  <Slider
                    label="Yatay"
                    value={selected.transform.x}
                    min={-1}
                    max={1}
                    step={0.01}
                    format={(v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`}
                    onChange={(v) => updateTransform(selectedSlot, { x: v })}
                  />
                  <Slider
                    label="Dikey"
                    value={selected.transform.y}
                    min={-1}
                    max={1}
                    step={0.01}
                    format={(v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`}
                    onChange={(v) => updateTransform(selectedSlot, { y: v })}
                  />
                  <div className="flex gap-2 pt-0.5">
                    {/*
                      "Doldur" varsayilan: dar/uzun bir yuvaya kare bir gorsel
                      konuldugunda sigdirma modu gorseli kucultup cevresinde
                      bos bant birakiyordu — katalogda bu "daralmis" duruyor.
                      "Sigdir", urunun tamamini gormek isteyen icin duruyor.
                    */}
                    {([
                      ["Doldur", true],
                      ["Sığdır", false],
                    ] as const).map(([label, cover]) => (
                      <button
                        key={label}
                        type="button"
                        role="switch"
                        aria-checked={selected.transform.cover === cover}
                        onClick={() => updateTransform(selectedSlot, { cover })}
                        className={
                          "press min-h-8 flex-1 rounded-full text-[0.8125rem] transition-colors " +
                          (selected.transform.cover === cover
                            ? "bg-black text-white"
                            : "bg-white text-black/70 ring-1 ring-black/10 hover:text-black")
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      updateTransform(selectedSlot, { ...DEFAULT_SLOT_TRANSFORM })
                    }
                    className="fine-print flex items-center gap-1.5 pt-0.5 underline underline-offset-2 opacity-60 hover:opacity-100"
                  >
                    <RotateCcw className="size-3" strokeWidth={1.75} aria-hidden />
                    Yerleşimi sıfırla
                  </button>
                </div>
              ) : null}

              {/* Gecmisten secme: kullanicinin bu araci kullanarak hazirladigi
                  gorseller zaten burada; tekrar indirip yuklemesi anlamsiz. */}
              {isHistoryLoaded && works.length > 0 ? (
                <div className="max-h-44 space-y-1 overflow-y-auto pt-1">
                  <p className="fine-print px-1 opacity-55">Çalışmalarımdan</p>
                  {works.map((work) => (
                    <button
                      key={work.id}
                      type="button"
                      onClick={() => {
                        // Faz 4: sonuc sunucuda. `resultUrl` ayni kokenden
                        // vekil; object URL'e gerek yok ve disa aktarmada
                        // tuval kirlenmiyor (bkz. lib/project-record.ts).
                        void placeInSlot(selectedSlot, work.resultUrl, work.fileName);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-black/5"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={work.thumbnailUrl}
                        alt=""
                        aria-hidden
                        className="checkerboard size-9 shrink-0 rounded-md object-contain"
                      />
                      <span className="fine-print truncate">{work.fileName}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}

          {error ? <p className="fine-print text-red-700">{error}</p> : null}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file || selectedSlot === null) return;

              const validationError = validateFile(file);
              if (validationError) {
                setError(validationError.message);
                return;
              }
              const url = URL.createObjectURL(file);
              objectUrlRef.current.push(url);
              void placeInSlot(selectedSlot, url, file.name);
            }}
          />
        </div>

        </div>
        <div className={mobileTab === "logo" ? "" : "max-lg:hidden"}>
        <SectionHeading>Logo</SectionHeading>
        <div className="space-y-3 px-5 pb-5">
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label="Katalog logosu seç"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleLogoFile(file);
            }}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => logoInputRef.current?.click()}
              className="press flex-1 rounded-full bg-white"
            >
              <ImagePlus className="size-3.5" strokeWidth={1.75} aria-hidden />
              {logoUrl ? "Logoyu değiştir" : "Logo ekle"}
            </Button>
            {logoUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Logoyu kaldır"
                onClick={removeLogo}
                className="press rounded-full bg-white"
              >
                <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden />
              </Button>
            ) : null}
          </div>
          {logoUrl ? (
            <>
              <div role="group" aria-label="Logo konumu" className="grid grid-cols-2 gap-2">
                {CORNERS.map((corner) => {
                  const isActive = !logoSettings.position && logoSettings.corner === corner.id;
                  return (
                    <button
                      key={corner.id}
                      type="button"
                      aria-pressed={isActive}
                      // Kose secmek serbest konumu siliyor: logo o koseye yaslaniyor.
                      onClick={() => updateLogo({ corner: corner.id, position: null })}
                      className={
                        "press min-h-8 rounded-lg text-[0.75rem] transition-shadow " +
                        (isActive
                          ? "ring-gold bg-white ring-2"
                          : "bg-white/70 ring-1 ring-black/10 hover:ring-black/25")
                      }
                    >
                      {corner.label}
                    </button>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void invertCurrentLogo()}
                className="press w-full rounded-full bg-white"
              >
                <Contrast className="size-3.5" strokeWidth={1.75} aria-hidden />
                Renkleri çevir
              </Button>
              <p className="fine-print opacity-55">
                Logoyu sayfada sürükleyerek taşıyın, köşedeki karelerden boyutlandırın.
              </p>
            </>
          ) : null}
          {logoMessage ? (
            <p role="alert" className="fine-print text-red-700">
              {logoMessage}
            </p>
          ) : (
            <p className="fine-print opacity-55">
              Stüdyoda yüklediğiniz logo burada da hazır gelir.
            </p>
          )}
        </div>

        </div>
        <div className={mobileTab === "indir" ? "" : "max-lg:hidden"}>
        <SectionHeading>Dışa aktar</SectionHeading>
        <div className="px-5 pb-5">
          <Button
            type="button"
            onClick={() => void exportPage("jpeg")}
            disabled={isExporting || filledCount === 0}
            className="press min-h-10 w-full rounded-full"
          >
            {isExporting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Download className="size-4" strokeWidth={1.75} aria-hidden />
            )}
            JPEG indir
          </Button>

          <p className="fine-print mt-4 mb-2 font-medium opacity-70">
            Baskıya uygun <span className="font-normal opacity-70">CMYK</span>
          </p>
          <div className="flex gap-2">
            {(["tiff", "jpeg"] as const).map((printFormat) => (
              <Button
                key={printFormat}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void exportPage(printFormat)}
                disabled={isExporting || filledCount === 0}
                aria-label={`Baskıya uygun ${printFormat === "tiff" ? "TIFF" : "JPEG"}`}
                className="press min-h-10 flex-1 rounded-full bg-white"
              >
                <Printer className="size-3.5" strokeWidth={1.75} aria-hidden />
                {printFormat === "tiff" ? "TIFF" : "JPEG"}
              </Button>
            ))}
          </div>

          {printMessage ? (
            <p
              role={printMessage.ok ? "status" : "alert"}
              className={"fine-print mt-2 " + (printMessage.ok ? "opacity-60" : "text-red-700")}
            >
              {printMessage.text}
            </p>
          ) : null}
          {filledCount === 0 ? (
            <p className="fine-print mt-2 opacity-55">En az bir görsel ekleyin.</p>
          ) : null}
        </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-5 pt-5 pb-3 text-[0.6875rem] font-semibold tracking-[0.08em] uppercase opacity-50">
      {children}
    </h2>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="fine-print block opacity-60">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="focus:ring-gold mt-1 w-full rounded-lg bg-white px-3 py-2 text-[0.875rem] ring-1 ring-black/10 outline-none focus:ring-2"
      />
    </label>
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
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="fine-print mb-1 flex items-center justify-between opacity-60">
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
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-gold h-1 w-full cursor-pointer appearance-none rounded-full bg-black/15"
      />
    </div>
  );
}
