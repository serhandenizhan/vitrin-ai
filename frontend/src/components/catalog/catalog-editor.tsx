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
  Download,
  ImagePlus,
  Loader2,
  RotateCcw,
  Sparkles,
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
  MAX_SLOT_SCALE,
  MIN_SLOT_SCALE,
  type SlotTransform,
  type Template,
  TEMPLATES,
  type TemplateName,
} from "@/lib/catalog-templates";
import { validateFile } from "@/lib/upload-constraints";

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

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Olusturulan object URL'ler bilesen kaldirilirken serbest birakiliyor.
  const objectUrlRef = useRef<string[]>([]);
  useEffect(() => {
    const urls = objectUrlRef.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const template = templateName ? TEMPLATES[templateName] : null;

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

  const exportPage = useCallback(async () => {
    if (!template) return;
    setIsExporting(true);
    try {
      const dataUrl = await renderCatalog({
        template,
        slots: visibleSlots,
        texts,
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `katalog-${template.fileSlug}.png`;
      link.click();
    } catch {
      setError("Sayfa dışa aktarılamadı.");
    } finally {
      setIsExporting(false);
    }
  }, [template, visibleSlots, texts]);

  /* --- Galeri ----------------------------------------------------------- */

  if (!template) {
    return (
      <div className="soft-enter">
        <div className="grid gap-6 sm:grid-cols-3">
          {Object.values(TEMPLATES).map((option) => (
            <button
              key={option.name}
              type="button"
              onClick={() => {
                setTemplateName(option.name);
                setSelectedSlot(null);
              }}
              className="press group text-left"
            >
              <div className="overflow-hidden rounded-[1.5rem] shadow-[0_1px_2px_rgba(0,0,0,0.06),0_24px_50px_-22px_rgba(0,0,0,0.35)] ring-1 ring-black/10 transition-shadow group-hover:ring-black/25">
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
                    texts={DEFAULT_TEXTS}
                  />
                </div>
              </div>
              <h3 className="mt-4 text-[1.0625rem] font-semibold tracking-[-0.01em]">
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
    <div className="soft-enter grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="mx-auto w-full max-w-[32rem] min-w-0">
        <div
          className="catalog-container overflow-hidden rounded-[1.25rem] shadow-[0_1px_2px_rgba(0,0,0,0.05),0_18px_44px_-18px_rgba(0,0,0,0.28)] ring-1 ring-black/10"
          style={{ aspectRatio: `${CATALOG_WIDTH} / ${CATALOG_HEIGHT}` }}
        >
          <CatalogPageView
            template={template}
            slots={visibleSlots}
            texts={texts}
            editable
            selectedSlot={selectedSlot}
            onSlotSelect={setSelectedSlot}
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
          />
        </div>
        <p className="fine-print mt-3 text-center opacity-55">
          A4 oranında · {CATALOG_WIDTH}×{CATALOG_HEIGHT} piksel
        </p>
      </div>

      <div className="divide-black/8 divide-y rounded-2xl bg-[#efece6]">
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
                {selected ? "Görseli değiştir" : "Bilgisayardan seçin"}
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

        <SectionHeading>Dışa aktar</SectionHeading>
        <div className="px-5 pb-5">
          <Button
            type="button"
            onClick={exportPage}
            disabled={isExporting || filledCount === 0}
            className="press min-h-10 w-full rounded-full"
          >
            {isExporting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Download className="size-4" strokeWidth={1.75} aria-hidden />
            )}
            PNG indir
          </Button>
          {filledCount === 0 ? (
            <p className="fine-print mt-2 opacity-55">En az bir görsel ekleyin.</p>
          ) : null}
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
