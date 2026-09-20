// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BackgroundState } from "@/components/composer/use-backgrounds";

let backgroundState: BackgroundState;
let fakeStage: FakeStage | null = null;

/**
 * Konva sahnesinin disa aktarma sirasinda dokunulan yuzeyi.
 *
 * Gercek Konva jsdom'da canvas olmadan calismiyor; editorun yalnizca bu
 * metodlari kullandigi icin sahte bir sahne hem yeterli hem de hata atan bir
 * `toDataURL`'i dogrudan kurmaya izin veriyor.
 */
type FakeStage = ReturnType<typeof createFakeStage>;

function createFakeStage(toDataURL: () => string) {
  let width = 434;
  let height = 434;
  let scale = { x: 0.434, y: 0.434 };
  const transformer = {
    visible: true,
    hide() {
      transformer.visible = false;
    },
    show() {
      transformer.visible = true;
    },
  };

  return {
    transformer,
    width: (next?: number) => (next === undefined ? width : void (width = next)),
    height: (next?: number) => (next === undefined ? height : void (height = next)),
    scaleX: () => scale.x,
    scaleY: () => scale.y,
    scale: (next: { x: number; y: number }) => {
      scale = next;
    },
    // Gercek Konva gibi secicuye gore: yalniz "Transformer" tutamak dondurur.
    // Onceden her seciciye tutamak donuyordu; zemin gecisini bitiren
    // `finishBackgroundFade` (".background-...") tutamagi zemin sanip patladi.
    find: (selector: string) => (selector === "Transformer" ? [transformer] : []),
    draw: () => {},
    toDataURL: vi.fn(toDataURL),
  };
}

vi.mock("next/dynamic", async () => {
  const React = await import("react");
  return {
    default: () =>
      function EditorStageMock({
        background,
        onStageReady,
        onCutoutSize,
        onInteractionChange,
      }: {
        background: { id: string; url?: string };
        onStageReady: (stage: unknown) => void;
        // Gercek sahne kesimin DOGAL olcusunu bildiriyor; yerlesim araclari
        // (ortala/sigdir, dondurme, boyut kaydiraci) buna bagli.
        onCutoutSize?: (size: { width: number; height: number }) => void;
        onInteractionChange?: (isInteracting: boolean) => void;
      }) {
        React.useEffect(() => {
          onStageReady(fakeStage);
          onCutoutSize?.({ width: 2000, height: 2000 });
          return () => onStageReady(null);
        }, [onStageReady, onCutoutSize]);
        return React.createElement(
          "div",
          null,
          React.createElement(
            "output",
            { "data-testid": "stage-background" },
            `${background.id}|${background.url ?? ""}`,
          ),
          // Gercek sahne bu geri cagriyi surukleme baslayip bitince veriyor;
          // dock'un geri cekilmesi yalnizca bu yolla sinanabilir.
          React.createElement("button", {
            type: "button",
            "data-testid": "stage-drag-start",
            onClick: () => onInteractionChange?.(true),
          }),
          React.createElement("button", {
            type: "button",
            "data-testid": "stage-drag-end",
            onClick: () => onInteractionChange?.(false),
          }),
        );
      },
  };
});

vi.mock("@/components/composer/use-backgrounds", () => ({
  useBackgrounds: () => backgroundState,
}));

// Gercek katalog yukleme betiginin urettigi kimliklere bagli; testler sabit
// kimliklerle calissin diye taklit ediliyor. `r2-a` / `r2-b` katalogda yok,
// yani "Sade".
vi.mock("@/lib/background-catalog", () => ({
  BACKGROUND_CATALOG: {
    "r2-lux": { category: "luks" },
    "r2-warn": { category: "dogal", printWarning: true },
    "r2-portrait": { category: "luks", orientation: "portrait" },
    "r2-landscape": { category: "luks", orientation: "landscape" },
  },
}));

import { CompositionEditor } from "@/components/composer/composition-editor";

const initialBackgrounds = [
  {
    type: "server" as const,
    id: "r2-a",
    name: "R2 A",
    url: "https://r2.example/a-initial",
    expiresInSeconds: 3600,
    fetchedAt: 1,
  },
  {
    type: "server" as const,
    id: "r2-b",
    name: "R2 B",
    url: "https://r2.example/b-initial",
    expiresInSeconds: 3600,
    fetchedAt: 1,
  },
];

/** Marka araci; "Tamamla" grubunun ilk araci. */
function goToFinish() {
  openTool("Marka");
}

/**
 * Alttaki arac cubugundan bir araca gecer; panel o aracin paletini gosterir
 * (18.09.2026, iPhone Fotograflar duzeni — sagdaki denetci kalkti).
 */
function openTool(name: string) {
  // Ince bar hep gorunur; arac tek dokunusla acilir.
  fireEvent.click(screen.getByRole("tab", { name }));
}

/** Zemin kategorisi artik sekme degil, baslikta acilan bir menu. */
function chooseCategory(pattern: RegExp) {
  // Kategoriler sekme (18.09.2026); adlari "Sade · 2" gibi sayili.
  fireEvent.click(screen.getByRole("tab", { name: pattern }));
}

function renderEditor() {
  return render(
    createElement(CompositionEditor, {
      cutoutUrl: "blob:cutout",
      fileName: "product.png",
    }),
  );
}

describe("CompositionEditor", () => {
  beforeEach(() => {
    backgroundState = {
      backgrounds: initialBackgrounds,
      hasServerBackground: true,
      isUnavailable: false,
      isLoading: false,
      retry: () => {},
    };
    fakeStage = null;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    // Vitest `globals` kapali oldugu icin Testing Library otomatik temizlemiyor;
    // temizlenmezse onceki testin editoru DOM'da kalip ayni adli dugmeler cogaliyor.
    cleanup();
    vi.unstubAllGlobals();
  });

  it("yenilenmiş URL listesinde kullanıcı seçimini id ile korur", () => {
    const view = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "R2 B" }));
    expect(screen.getByRole("button", { name: "R2 B" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    backgroundState = {
      ...backgroundState,
      backgrounds: [
        initialBackgrounds[0],
        {
          ...initialBackgrounds[1],
          url: "https://r2.example/b-refreshed",
          fetchedAt: 2,
        },
      ],
    };
    view.rerender(
      createElement(CompositionEditor, {
        cutoutUrl: "blob:cutout",
        fileName: "product.png",
      }),
    );

    expect(screen.getByRole("button", { name: "R2 B" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByTestId("stage-background").textContent).toBe(
      "r2-b|https://r2.example/b-refreshed",
    );
  });

  it("zemin kütüphanesi yüklenemediğinde bunu 'hazırlanıyor' diye göstermez", () => {
    // Iki ayri sebep, iki ayri mesaj olmali: kutuphane 93 zeminle doluyken
    // yasanan bir ariza (Redis/backend) eskiden "kutuphane hazirlaniyor"
    // yaziyordu ve kullanici bunu bir ariza olarak hic anlamiyordu
    // (PR #18 incelemesi).
    const retry = vi.fn();
    backgroundState = {
      ...backgroundState,
      backgrounds: [initialBackgrounds[0]],
      hasServerBackground: false,
      isUnavailable: true,
      retry,
    };

    renderEditor();

    expect(screen.getByText(/yüklenemedi/i)).toBeTruthy();
    expect(screen.queryByText(/hazırlanıyor/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("kütüphane henüz hazır değilse eski bilgilendirmeyi korur", () => {
    backgroundState = {
      ...backgroundState,
      backgrounds: [initialBackgrounds[0]],
      hasServerBackground: false,
      isUnavailable: false,
    };

    renderEditor();

    expect(screen.getByText(/hazırlanıyor/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tekrar dene" })).toBeNull();
  });

  describe("öne alınan özellikler (13.09.2026)", () => {
    it("Pazaryeri biçimi seçilince zemin düz beyaza geçiyor", () => {
      backgroundState = {
        ...backgroundState,
        backgrounds: [
          ...initialBackgrounds,
          { type: "placeholder" as const, id: "placeholder-white", name: "Düz beyaz", gradient: [0, "#ffffff", 1, "#ffffff"] },
        ],
      };
      renderEditor();
      // Varsayilan artik listenin ILK zemini (duz beyaz yer tutucu, 19.09.2026);
      // gecisin sinanabilmesi icin once baska bir zemin seciliyor.
      fireEvent.click(screen.getByRole("button", { name: "R2 A" }));
      expect(screen.getByTestId("stage-background").textContent).toBe(
        "r2-a|https://r2.example/a-initial",
      );

      openTool("Boyut");
      fireEvent.click(screen.getByRole("button", { name: /Pazaryeri/ }));

      expect(screen.getByTestId("stage-background").textContent).toBe("placeholder-white|");
    });

    it("paylaşım menüsü olmayan cihazda JPEG indirir, WhatsApp Web'i açar ve ne yapılacağını söyler", () => {
      fakeStage = createFakeStage(() => "data:image/jpeg;base64,AAAA");
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const openSpy = vi.fn();
      vi.stubGlobal("open", openSpy);
      // Masaustu: navigator.canShare yok.
      vi.stubGlobal("navigator", { ...navigator, canShare: undefined, share: undefined });
      renderEditor();

      goToFinish();
      openTool("İndir");
      fireEvent.click(screen.getByRole("button", { name: /WhatsApp/ }));

      expect(fakeStage.toDataURL).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: "image/jpeg" }),
      );
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(openSpy).toHaveBeenCalledWith(
        "https://web.whatsapp.com/",
        "_blank",
        "noopener,noreferrer",
      );
      // Editorde birden fazla `role="status"` olabiliyor; mesaj metniyle aranıyor.
      expect(screen.getByText(/Görsel indirildi/)).toBeTruthy();
      clickSpy.mockRestore();
    });

    it("paylaşım menüsü olan cihazda görselin KENDİSİNİ paylaşıyor, indirme yapmıyor", async () => {
      fakeStage = createFakeStage(() => "data:image/jpeg;base64,AAAA");
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const share = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { ...navigator, canShare: () => true, share });
      renderEditor();

      goToFinish();
      openTool("İndir");
      fireEvent.click(screen.getByRole("button", { name: /WhatsApp/ }));

      expect(share).toHaveBeenCalledTimes(1);
      const [{ files }] = share.mock.calls[0] as [{ files: File[] }];
      expect(files[0].type).toBe("image/jpeg");
      expect(files[0].name).toMatch(/\.jpg$/);
      expect(clickSpy).not.toHaveBeenCalled();
      clickSpy.mockRestore();
    });

    it("SVG logo reddediliyor ve sebebi gösteriliyor", () => {
      renderEditor();

      goToFinish();
      fireEvent.change(screen.getByLabelText("Logo dosyası seç"), {
        target: { files: [new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" })] },
      });

      expect(screen.getByRole("alert").textContent).toMatch(/PNG, JPEG ya da WebP/);
    });

    it("etiket açılınca alanlar geliyor, geçersiz gram uyarısı çıkıyor", () => {
      renderEditor();

      goToFinish();
      fireEvent.click(screen.getByRole("switch", { name: "Ürün etiketi" }));
      fireEvent.change(screen.getByPlaceholderText("3,45"), { target: { value: "üç" } });

      expect(screen.getByRole("alert").textContent).toMatch(/Gramı sayı olarak/);
    });
  });

  describe("zemin kategorileri ve baskı uyarısı (17.09.2026)", () => {
    const luxury = {
      type: "server" as const,
      id: "r2-lux",
      name: "R2 Lüks",
      url: "https://r2.example/lux",
      thumbnailUrl: "https://r2.example/thumbs/lux",
      expiresInSeconds: 3600,
      fetchedAt: 1,
    };
    const lowResolution = {
      type: "server" as const,
      id: "r2-warn",
      name: "R2 Düşük",
      url: "https://r2.example/warn",
      expiresInSeconds: 3600,
      fetchedAt: 1,
    };

    function stubPrintFetch() {
      const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
        async () => new Response(new Blob(["x"])),
      );
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    function cmykCalls(fetchMock: ReturnType<typeof stubPrintFetch>) {
      return fetchMock.mock.calls.filter(([input]) => input === "/api/cmyk");
    }

    it("zeminler kategori sekmelerine ayrılıyor ve seçici önizlemeyi kullanıyor", () => {
      backgroundState = { ...backgroundState, backgrounds: [...initialBackgrounds, luxury] };
      renderEditor();

      // Kategori artik surekli bir chip satiri degil, dock basligindan acilan
      // bir menu (17.09.2026): chip satiri dock yuksekliginin ucte birini
      // yiyordu.
      expect(screen.getByRole("tab", { name: /^Sade\s*·\s*\d+$/ })).toBeTruthy();
      expect(screen.getByRole("button", { name: "R2 A" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "R2 Lüks" })).toBeNull();

      chooseCategory(/Lüks/);

      expect(screen.queryByRole("button", { name: "R2 A" })).toBeNull();
      const swatch = screen.getByRole("button", { name: "R2 Lüks" });
      expect(swatch.querySelector("img")?.getAttribute("src")).toBe("https://r2.example/thumbs/lux");
    });

    it("tek kategori doluysa kategori menüsü hiç gösterilmiyor", () => {
      renderEditor();

      // Menu bir secim sunmuyorsa dugmesi de yok — bos bir menu acmak
      // kullaniciya yapacak bir sey vermiyordu.
      expect(screen.queryByRole("tab", { name: /·\s*\d+$/ })).toBeNull();
    });

    it("stüdyo A4 ile açılıyor ve Kare 2000×2000 biçimi yok", () => {
      renderEditor();

      openTool("Boyut");
      expect(screen.getByRole("button", { name: /Katalog/ }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.queryByRole("button", { name: /^Kare/ })).toBeNull();
    });

    it("bütün araçlar tek çubukta, adım sırasıyla; her biri tek dokunuşla açılıyor", () => {
      renderEditor();

      // Dock'un basligi `role="group"` ve erisilebilir adi; "o an hangi
      // paletin acik oldugu" DOM'dan okunabilen tek iz (Konva tuvaline
      // cizilenler okunamiyor, bkz. kok CLAUDE.md ders 26).
      // Acilista Yerlesim menusu acik; zemin seridi her zaman gorunur (19.09.2026).
      expect(screen.getByRole("group", { name: "Yerleşim" })).toBeTruthy();
      expect(screen.getByRole("group", { name: "Zemin" })).toBeTruthy();
      expect(screen.queryByRole("switch", { name: "Yansıma" })).toBeNull();
      // Arac cubugu adim sirasini koruyor: Sahne · Düzenle · Tamamla.
      const tabs = within(screen.getByRole("tablist", { name: "Araçlar" })).getAllByRole("tab");
      expect(tabs.map((tab) => tab.textContent)).toEqual([
        "Boyut", "Yerleşim", "Görünüm", "Marka", "İndir",
      ]);
      // Sagdaki denetci ve "Devam" dugmesi yok (18.09.2026).
      expect(screen.queryByRole("tablist", { name: "Düzenleme adımları" })).toBeNull();
      expect(screen.queryByRole("button", { name: /Devam/ })).toBeNull();

      // Adim atlamadan dogrudan son araca, sonra geri.
      openTool("İndir");
      expect(screen.getByRole("button", { name: "PNG" })).toBeTruthy();
      openTool("Görünüm");
      expect(screen.getByRole("switch", { name: "Gölge" })).toBeTruthy();
      expect(screen.getByRole("switch", { name: "Yansıma" })).toBeTruthy();
      expect(screen.queryByRole("switch", { name: /Işık havuzu/ })).toBeNull();
      // Zemin seridi arac degisince kaybolmuyor.
      expect(screen.getByRole("group", { name: "Zemin" })).toBeTruthy();
    });

    it("zeminler biçimin yönüne göre süzülüyor; Sade her biçimde", () => {
      const portrait = { ...luxury, id: "r2-portrait", name: "R2 Dikey" };
      const landscape = { ...luxury, id: "r2-landscape", name: "R2 Yatay" };
      backgroundState = {
        ...backgroundState,
        backgrounds: [...initialBackgrounds, portrait, landscape],
      };
      renderEditor();

      // A4 (dikey): dikey zemin var, yatay yok; katalogda olmayan R2 A (Sade) var.
      chooseCategory(/Lüks/);
      expect(screen.getByRole("button", { name: "R2 Dikey" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "R2 Yatay" })).toBeNull();

      openTool("Boyut");
      fireEvent.click(screen.getByRole("button", { name: /Instagram gönderi/ }));
      chooseCategory(/Lüks/);
      expect(screen.getByRole("button", { name: "R2 Yatay" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "R2 Dikey" })).toBeNull();
      chooseCategory(/Sade/);
      expect(screen.getByRole("button", { name: "R2 A" })).toBeTruthy();
    });

    it("baskıya önerilmeyen zeminde CMYK önce onay istiyor; Vazgeç hiçbir şey indirmiyor", () => {
      backgroundState = { ...backgroundState, backgrounds: [lowResolution] };
      fakeStage = createFakeStage(() => "data:image/png;base64,AAAA");
      const fetchMock = stubPrintFetch();
      renderEditor();

      goToFinish();
      openTool("İndir");
      fireEvent.click(screen.getByRole("button", { name: "CMYK TIFF" }));

      const dialog = screen.getByRole("alertdialog");
      expect(dialog.textContent).toContain(
        "Bu görsel baskıya önerilmiyor. Yine de onaylıyor musunuz?",
      );
      expect(fakeStage.toDataURL).not.toHaveBeenCalled();

      fireEvent.click(within(dialog).getByRole("button", { name: "Vazgeç" }));

      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("onaylanınca baskı dosyası isteniyor", async () => {
      backgroundState = { ...backgroundState, backgrounds: [lowResolution] };
      fakeStage = createFakeStage(() => "data:image/png;base64,AAAA");
      const fetchMock = stubPrintFetch();
      renderEditor();

      goToFinish();
      openTool("İndir");
      fireEvent.click(screen.getByRole("button", { name: "CMYK JPEG" }));
      fireEvent.click(screen.getByRole("button", { name: "Evet, indir" }));

      await waitFor(() => expect(cmykCalls(fetchMock)).toHaveLength(1));
      // Uyari kapandi; yerine indirme sonrasi soru geliyor.
      expect(screen.queryByRole("button", { name: "Evet, indir" })).toBeNull();
    });

    it("normal zeminde onay sormadan baskı dosyası isteniyor", async () => {
      fakeStage = createFakeStage(() => "data:image/png;base64,AAAA");
      const fetchMock = stubPrintFetch();
      renderEditor();

      goToFinish();
      openTool("İndir");
      fireEvent.click(screen.getByRole("button", { name: "CMYK TIFF" }));

      expect(screen.queryByRole("alertdialog")).toBeNull();
      await waitFor(() => expect(cmykCalls(fetchMock)).toHaveLength(1));
    });
  });

  describe("yüzen denetçi ve alt dock (17.09.2026)", () => {
    it("denetçiden araç seçmek dock'un paletini değiştiriyor", () => {
      renderEditor();

      // Dock'un `role="group"` adi, o an hangi paletin acik oldugunun
      // DOM'dan okunabilen tek izi.
      expect(screen.getByRole("group", { name: "Yerleşim" })).toBeTruthy();
      expect(screen.queryByRole("group", { name: "Çıktı boyutu" })).toBeNull();

      openTool("Boyut");

      expect(screen.getByRole("group", { name: "Çıktı boyutu" })).toBeTruthy();
      expect(screen.queryByRole("group", { name: "Yerleşim" })).toBeNull();
      expect(screen.getByRole("button", { name: /Katalog/ })).toBeTruthy();
    });

    it("ilk döndürmede ürün boyutu DEĞİŞMİYOR (%100 kalıyor)", () => {
      // Stüdyoya girip hiçbir şey taşımadan −15° / 15° / 90°'ye basmak, ürünü
      // bir anda doğal boyutuna atlatıp tuvalden taşırıyordu: dönüşüm henüz
      // yokken ölçek 1 varsayılıyordu, oysa sahnedeki ölçek "sığdırılmış"
      // ölçek (Serhan, 20.09.2026). Kaydıraçtaki yüzde bunun aynası.
      renderEditor();
      openTool("Yerleşim");
      expect(screen.getByLabelText("Ürün boyutu").getAttribute("value")).toBe("100");

      for (const button of ["90°", "−15°", "15°"]) {
        fireEvent.click(screen.getByRole("button", { name: button }));
        expect(screen.getByLabelText("Ürün boyutu").getAttribute("value")).toBe("100");
      }
    });

    it("dock sadece zemin göstermiyor: her adımın kendi paleti var", () => {
      renderEditor();

      openTool("Yerleşim");
      expect(screen.getByRole("group", { name: "Yerleşim" })).toBeTruthy();
      openTool("Görünüm");
      expect(screen.getByRole("group", { name: "Görünüm" })).toBeTruthy();

      openTool("Marka");
      expect(screen.getByRole("group", { name: "Marka" })).toBeTruthy();
      expect(screen.getByRole("switch", { name: "Ürün etiketi" })).toBeTruthy();
      openTool("İndir");
      expect(screen.getByRole("group", { name: "İndir" })).toBeTruthy();
    });

    it("seçili zemin yalnızca renkle değil ADIYLA da belli oluyor", () => {
      backgroundState = { ...backgroundState, backgrounds: initialBackgrounds };
      renderEditor();

      const first = screen.getByRole("button", { name: "R2 A" });
      const second = screen.getByRole("button", { name: "R2 B" });
      // Ad her zaman gorunur metin olarak var (sadece `aria-label` degil):
      // renk korlugunde ya da birbirine yakin iki zeminde secim okunabilsin.
      expect(first.textContent).toContain("R2 A");
      expect(first.getAttribute("aria-pressed")).toBe("true");
      expect(second.getAttribute("aria-pressed")).toBe("false");

      fireEvent.click(second);

      expect(screen.getByRole("button", { name: "R2 B" }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("button", { name: "R2 A" }).getAttribute("aria-pressed")).toBe("false");
    });

    it("kategori menüsü seçimi uyguluyor ve başlıktaki sayı güncelleniyor", () => {
      const luxury = {
        type: "server" as const,
        id: "r2-lux",
        name: "R2 Lüks",
        url: "https://r2.example/lux",
        expiresInSeconds: 3600,
        fetchedAt: 1,
      };
      backgroundState = {
        ...backgroundState,
        backgrounds: [...initialBackgrounds, luxury],
      };
      renderEditor();

      // Sade: iki zemin (r2-a, r2-b). Luks: bir zemin.
      expect(screen.getByRole("tab", { name: "Sade · 2" })).toBeTruthy();

      chooseCategory(/Lüks/);

      expect(screen.getByRole("tab", { name: "Lüks · 1" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "R2 Lüks" })).toBeTruthy();
    });

    it("hazır görünüm ayarı uygulanıyor; kaydıraç elle oynatılınca işaret kalkıyor", () => {
      renderEditor();
      openTool("Görünüm");

      const parlak = screen.getByRole("button", { name: "Parlak" });
      expect(parlak.getAttribute("aria-pressed")).toBe("false");

      fireEvent.click(parlak);
      expect(screen.getByRole("button", { name: "Parlak" }).getAttribute("aria-pressed")).toBe("true");

      // Elle degistirince on ayar ISARETI kalkmali: arayuz "Parlak" derken
      // degerlerin baska bir sey olmasi, ekranin soyledigi ile dosyanin
      // icindekinin ayrismasi demekti.
      // Tek kaydirac: once ayar secilir (iPhone Fotograflar gibi), geri
      // tusu gorunum menusune doner.
      fireEvent.click(screen.getByRole("button", { name: "Kontrast" }));
      fireEvent.change(screen.getByLabelText("Kontrast"), { target: { value: "30" } });
      fireEvent.click(screen.getByRole("button", { name: "Görünüm menüsüne dön" }));

      expect(screen.getByRole("button", { name: "Parlak" }).getAttribute("aria-pressed")).toBe("false");
    });

    it("ürün sürüklenirken ayrı satırdaki dock görünür kalıyor", () => {
      renderEditor();
      const dock = screen.getByRole("group", { name: "Zemin" });
      expect(dock.className).not.toContain("dock-quiet");

      fireEvent.click(screen.getByTestId("stage-drag-start"));
      expect(screen.getByRole("group", { name: "Zemin" }).className).not.toContain("dock-quiet");

      fireEvent.click(screen.getByTestId("stage-drag-end"));
      expect(screen.getByRole("group", { name: "Zemin" }).className).not.toContain("dock-quiet");
    });

    it("geri tuşu önce menü içindeki katmana, sonra bir önceki araca döner", () => {
      renderEditor();
      // Acilista Yerlesim; sirada onceki arac Boyut.
      fireEvent.click(screen.getByRole("button", { name: "Önceki araç: Boyut" }));
      expect(screen.getByRole("group", { name: "Çıktı boyutu" })).toBeTruthy();
      // Boyut'tan geri: gecmiste Yerlesim var — ikisi arasinda gidip gelinir.
      openTool("Yerleşim");
      fireEvent.click(screen.getByRole("button", { name: "Önceki araç: Boyut" }));
      expect(screen.getByRole("group", { name: "Çıktı boyutu" })).toBeTruthy();

      openTool("Görünüm");
      fireEvent.click(screen.getByRole("button", { name: "Doygunluk" }));
      expect(screen.getByLabelText("Doygunluk")).toBeTruthy();

      // Kaydiraçtan geri: once Gorunum menusu, sonra onceki arac (Boyut).
      fireEvent.click(screen.getByRole("button", { name: "Görünüm menüsüne dön" }));
      expect(screen.getByRole("switch", { name: "Gölge" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Önceki araç: Boyut" }));
      expect(screen.getByRole("group", { name: "Çıktı boyutu" })).toBeTruthy();
      // Geri tusu karti KAPATMIYOR (Kaan: "geri tuşu barı kapatıyor").
      expect(screen.getByRole("tablist", { name: "Araçlar" })).toBeTruthy();
    });

    it("tek satırlık menüde (Boyut) kart incelir ve tuval büyür", () => {
      const { container } = renderEditor();
      const stage = container.querySelector(".stage-fit")!;
      // Acilista Yerlesim: normal kart.
      expect(stage.classList.contains("stage-fit-compact")).toBe(false);

      openTool("Görünüm");
      expect(stage.classList.contains("stage-fit-compact")).toBe(false);

      openTool("Boyut");
      expect(stage.classList.contains("stage-fit-compact")).toBe(true);

      // Kucultulmus hal ince karttan once gelir.
      fireEvent.click(screen.getByRole("button", { name: "Barı küçült" }));
      expect(stage.classList.contains("stage-fit-compact")).toBe(false);
      expect(stage.classList.contains("stage-fit-collapsed")).toBe(true);
    });

    it("küçült düğmesi kartı ve barı küçültür, tuvale büyüme sınıfını verir", () => {
      const { container } = renderEditor();
      const stage = container.querySelector(".stage-fit")!;
      expect(stage.classList.contains("stage-fit-collapsed")).toBe(false);

      fireEvent.click(screen.getByRole("button", { name: "Barı küçült" }));
      expect(screen.queryByRole("group", { name: "Yerleşim" })).toBeNull();
      // Zemin seridi kucultmeden etkilenmez.
      expect(screen.getByRole("group", { name: "Zemin" })).toBeTruthy();
      expect(screen.queryByRole("tablist", { name: "Araçlar" })).toBeNull();
      expect(stage.classList.contains("stage-fit-collapsed")).toBe(true);

      fireEvent.click(screen.getByRole("button", { name: "Barı büyüt" }));
      expect(screen.getByRole("group", { name: "Yerleşim" })).toBeTruthy();
      expect(screen.getByRole("tablist", { name: "Araçlar" })).toBeTruthy();
      expect(stage.classList.contains("stage-fit-collapsed")).toBe(false);
    });
  });

  describe("indirme sonrası soru (17.09.2026)", () => {
    function renderWithCallbacks() {
      const onReturnToStart = vi.fn<() => void>();
      const onSendToCatalog = vi.fn<(dataUrl: string) => boolean>(() => true);
      render(
        createElement(CompositionEditor, {
          cutoutUrl: "blob:cutout",
          fileName: "product.png",
          onReturnToStart,
          onSendToCatalog,
        }),
      );
      return { onReturnToStart, onSendToCatalog };
    }

    it("katalog boyutunda önce şablona eklemeyi soruyor, Evet görseli kataloğa gönderiyor", () => {
      fakeStage = createFakeStage(() => "data:image/jpeg;base64,AAAA");
      const { onSendToCatalog } = renderWithCallbacks();
      goToFinish();
      openTool("İndir");
      fireEvent.click(screen.getByRole("button", { name: "JPEG" }));

      const dialog = screen.getByRole("alertdialog");
      expect(within(dialog).getByText("İndirme işlemi başarıyla tamamlandı.")).toBeTruthy();
      expect(within(dialog).getByText("Katalog görselinizi şablona eklemek ister misiniz?")).toBeTruthy();
      fireEvent.click(within(dialog).getByRole("button", { name: "Evet" }));
      expect(onSendToCatalog).toHaveBeenCalledWith("data:image/jpeg;base64,AAAA");
    });

    it("şablona Hayır denince ana menü soruluyor, Evet ana menüye dönüyor", () => {
      fakeStage = createFakeStage(() => "data:image/png;base64,AAAA");
      const { onReturnToStart, onSendToCatalog } = renderWithCallbacks();
      goToFinish();
      openTool("İndir");
      fireEvent.click(screen.getByRole("button", { name: "PNG" }));
      fireEvent.click(screen.getByRole("button", { name: "Hayır" }));

      expect(screen.getByText("Ana menüye dönmek ister misiniz?")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Evet" }));
      expect(onReturnToStart).toHaveBeenCalledTimes(1);
      expect(onSendToCatalog).not.toHaveBeenCalled();
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    it("katalog dışı biçimde doğrudan ana menüyü soruyor", () => {
      fakeStage = createFakeStage(() => "data:image/png;base64,AAAA");
      renderWithCallbacks();
      openTool("Boyut");
      fireEvent.click(screen.getByRole("button", { name: /Instagram gönderi/ }));
      goToFinish();
      openTool("İndir");
      fireEvent.click(screen.getByRole("button", { name: "PNG" }));
      expect(screen.getByText("Ana menüye dönmek ister misiniz?")).toBeTruthy();
      expect(screen.queryByText(/şablona eklemek/)).toBeNull();
    });
  });

  describe("toDataURL hata attığında", () => {
    // Gercek dunyadaki karsiligi: R2 CORS kurali eksik ya da yanlis oldugunda
    // tuval "tainted" olur ve `toDataURL` SecurityError firlatir. Sahne o an
    // mantiksal olcude ve tutamaklar gizli; geri yuklenmezse editor kucuk
    // bir ekranda 1000 px'lik bir tuvalle ve secim cercevesi olmadan kalir.
    function throwingStage() {
      return createFakeStage(() => {
        throw new DOMException("Tainted canvases may not be exported.", "SecurityError");
      });
    }

    function expectStageRestored(stage: FakeStage) {
      expect(stage.toDataURL).toHaveBeenCalledTimes(1);
      expect(stage.width()).toBe(434);
      expect(stage.height()).toBe(434);
      expect({ x: stage.scaleX(), y: stage.scaleY() }).toEqual({ x: 0.434, y: 0.434 });
      expect(stage.transformer.visible).toBe(true);
    }

    it("PNG indirmede sahneyi ve tutamakları geri yükler, hatayı gösterir", () => {
      const stage = throwingStage();
      fakeStage = stage;
      renderEditor();

      goToFinish();
      openTool("İndir");
      fireEvent.click(screen.getByRole("button", { name: "PNG" }));

      expectStageRestored(stage);
      expect(screen.getByRole("alert").textContent).toMatch(/dışa aktarılamadı/);
      expect(screen.getByRole("button", { name: "PNG" }).hasAttribute("disabled")).toBe(
        false,
      );
    });

    it("Konva boş veri URL'i döndürdüğünde sessiz kalmaz, hatayı gösterir", () => {
      // Gercek "tainted" tuvalde Konva SecurityError'i KENDISI yakalayip bos
      // string donduruyor (konva/lib/Canvas.js `toDataURL`) — tarayicida
      // olculdu. Bu testten once PNG dugmesi o durumda hicbir sey yapmiyordu.
      const stage = createFakeStage(() => "");
      fakeStage = stage;
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click");
      renderEditor();

      goToFinish();
      openTool("İndir");
      fireEvent.click(screen.getByRole("button", { name: "PNG" }));

      expectStageRestored(stage);
      expect(screen.getByRole("alert").textContent).toMatch(/dışa aktarılamadı/);
      expect(clickSpy).not.toHaveBeenCalled();
      clickSpy.mockRestore();
    });

    it("CMYK indirmede sahneyi geri yükler ve sunucuya istek atmaz", async () => {
      const stage = throwingStage();
      fakeStage = stage;
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      renderEditor();

      goToFinish();
      openTool("İndir");
      fireEvent.click(screen.getByRole("button", { name: "CMYK TIFF" }));

      expectStageRestored(stage);
      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("masaüstü düzeni ve favoriler (19.09.2026)", () => {
    /** jsdom'da `matchMedia` yok; masaustu (>= 64rem) oldugunu soyleyen taklit. */
    function stubDesktop({ reduceMotion = false }: { reduceMotion?: boolean } = {}) {
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches:
          query.includes("min-width: 64rem") ||
          (reduceMotion && query.includes("prefers-reduced-motion")),
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }));
    }

    beforeEach(() => localStorage.clear());

    it("aşama 1 Sahne: sağda geniş zemin kütüphanesi ve biçimler, düzenleme paneli yok", () => {
      stubDesktop({ reduceMotion: true });
      renderEditor();

      expect(screen.getByRole("complementary", { name: "Sahne" })).toBeTruthy();
      expect(screen.getByRole("group", { name: "Çıktı boyutları" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "R2 B" })).toBeTruthy();
      expect(screen.queryByRole("complementary", { name: "Araç paneli" })).toBeNull();
      expect(screen.queryByRole("group", { name: "Çıktı" })).toBeNull();
    });

    it("✓ ile Düzenle'ye, oradan Tamamla'ya geçiliyor; her aşamada geri dönülebiliyor", () => {
      stubDesktop({ reduceMotion: true });
      const { container } = renderEditor();
      const column = container.querySelector<HTMLElement>(".stage-column")!;
      expect(column.style.getPropertyValue("--panel-w")).toBe("26rem");

      fireEvent.click(screen.getByRole("button", { name: "Sahneyi onayla, Düzenle aşamasına geç" }));
      // Asama 2: solda dik zemin bari, sagda duzenleme paneli (yalniz asama 2 araclari).
      expect(screen.getByRole("complementary", { name: "Araç paneli" })).toBeTruthy();
      expect(screen.getByRole("group", { name: "Zemin" })).toBeTruthy();
      const tabs = within(screen.getByRole("tablist", { name: "Araçlar" })).getAllByRole("tab");
      expect(tabs.map((tab) => tab.textContent)).toEqual(["Yerleşim", "Görünüm", "Marka"]);
      expect(column.style.getPropertyValue("--panel-w")).toBe("36rem");

      // Panel kapaninca tuval o yeri alir.
      fireEvent.click(screen.getByRole("button", { name: "Barı küçült" }));
      expect(column.style.getPropertyValue("--panel-w")).toBe("11rem");
      fireEvent.click(screen.getByRole("button", { name: "Barı büyüt" }));

      fireEvent.click(screen.getByRole("button", { name: "Düzenlemeyi bitir, Tamamla aşamasına geç" }));
      // Asama 3: yalnizca cikti, gorselin altinda.
      const output = screen.getByRole("group", { name: "Çıktı" });
      expect(within(output).getByRole("button", { name: "PNG" })).toBeTruthy();
      expect(screen.queryByRole("complementary", { name: "Araç paneli" })).toBeNull();
      expect(column.style.getPropertyValue("--panel-w")).toBe("0rem");

      fireEvent.click(within(output).getByRole("button", { name: "Düzenle" }));
      expect(screen.getByRole("complementary", { name: "Araç paneli" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Sahne" }));
      expect(screen.getByRole("complementary", { name: "Sahne" })).toBeTruthy();
    });

    it("Düzenle'de Önizle basılı tutulunca ya da Boşluk tuşuyla temiz görünüm, bırakınca geri", () => {
      stubDesktop({ reduceMotion: true });
      renderEditor();
      expect(screen.queryByRole("button", { name: /Temiz görünüm/ })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Sahneyi onayla, Düzenle aşamasına geç" }));

      const eye = screen.getByRole("button", { name: "Temiz görünüm (basılı tutun)" });
      expect(eye.getAttribute("aria-pressed")).toBe("false");
      fireEvent.pointerDown(eye, { pointerId: 1 });
      expect(eye.getAttribute("aria-pressed")).toBe("true");
      fireEvent.pointerUp(eye, { pointerId: 1 });
      expect(eye.getAttribute("aria-pressed")).toBe("false");
      // Kisayol: BOSLUK basili iken acik, birakinca kapali.
      fireEvent.keyDown(window, { key: " ", code: "Space" });
      expect(eye.getAttribute("aria-pressed")).toBe("true");
      fireEvent.keyUp(window, { key: " ", code: "Space" });
      expect(eye.getAttribute("aria-pressed")).toBe("false");

      // Yazi alaninda bosluk yazmaya devam eder, onizleme acilmaz.
      openTool("Marka");
      fireEvent.click(screen.getByRole("switch", { name: "Ürün etiketi" }));
      const code = screen.getByPlaceholderText("A-102");
      fireEvent.keyDown(code, { key: " ", code: "Space" });
      expect(eye.getAttribute("aria-pressed")).toBe("false");
    });

    it("Düzenle'de Görünüm'ün üç kaydıracı birlikte açık", () => {
      stubDesktop({ reduceMotion: true });
      renderEditor();
      fireEvent.click(screen.getByRole("button", { name: "Sahneyi onayla, Düzenle aşamasına geç" }));
      openTool("Görünüm");
      expect(screen.getByLabelText("Parlaklık")).toBeTruthy();
      expect(screen.getByLabelText("Kontrast")).toBeTruthy();
      expect(screen.getByLabelText("Doygunluk")).toBeTruthy();
      expect(screen.getByRole("switch", { name: "Gölge" })).toBeTruthy();
    });

    it("geçiş perdesi YALNIZCA açılışta; ✓ ile aşama perdesiz ve anında değişir", () => {
      vi.useFakeTimers();
      try {
        stubDesktop();
        renderEditor();
        // Acilis perdesi (Asama 1).
        expect(screen.getByRole("status", { name: "1. aşama: Sahne" })).toBeTruthy();
        act(() => {
          vi.advanceTimersByTime(2200);
        });
        expect(screen.queryByRole("status", { name: /aşama:/ })).toBeNull();

        // Asamalar arasi perde kaldirildi (Serhan, 19.09.2026: "her adimda
        // yorucu"): yeni duzen AYNI tiklamada geliyor, zamanlayici beklemeden.
        const sceneAside = screen.getByRole("complementary", { name: "Sahne" });
        fireEvent.click(screen.getByRole("button", { name: "Sahneyi onayla, Düzenle aşamasına geç" }));
        // YENI bir dugum olmali: React ayni `<aside>`i yeniden kullanirsa CSS
        // animasyonu yeniden baslamiyor ve gecis hic gorunmuyordu (ayni gun,
        // tarayicida olculdu).
        expect(screen.getByRole("complementary", { name: "Araç paneli" })).not.toBe(sceneAside);
        expect(screen.queryByRole("status", { name: /aşama:/ })).toBeNull();
        expect(screen.getByRole("complementary", { name: "Araç paneli" })).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Düzenlemeyi bitir, Tamamla aşamasına geç" }));
        expect(screen.queryByRole("status", { name: /aşama:/ })).toBeNull();
        expect(screen.getByRole("group", { name: "Çıktı" })).toBeTruthy();
      } finally {
        vi.useRealTimers();
      }
    });

    it("seçili zemin beğenilince Favoriler rafı çıkıyor, tarayıcıda hatırlanıyor, geri alınabiliyor", () => {
      renderEditor();
      expect(screen.queryByRole("tab", { name: /Favoriler/ })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "R2 A favorilere ekle" }));
      expect(screen.getByRole("tab", { name: "Favoriler · 1" })).toBeTruthy();
      expect(JSON.parse(localStorage.getItem("vitrin-ai:favorite-backgrounds")!)).toEqual(["r2-a"]);

      // Favoriler rafindan secim, kullaniciyi kendi kategorisine atlatmaz.
      chooseCategory(/Favoriler/);
      fireEvent.click(screen.getByRole("button", { name: "R2 A" }));
      expect(screen.getByRole("tab", { name: "Favoriler · 1" }).getAttribute("aria-selected")).toBe("true");

      fireEvent.click(screen.getByRole("button", { name: "R2 A favorilerden çıkar" }));
      expect(screen.queryByRole("tab", { name: /Favoriler/ })).toBeNull();
      expect(JSON.parse(localStorage.getItem("vitrin-ai:favorite-backgrounds")!)).toEqual([]);
    });

    it("favoriler yeniden açılışta tarayıcıdan okunuyor", () => {
      localStorage.setItem("vitrin-ai:favorite-backgrounds", JSON.stringify(["r2-b"]));
      renderEditor();
      expect(screen.getByRole("tab", { name: "Favoriler · 1" })).toBeTruthy();
    });
  });

  it("gölge açılınca boyut ve yoğunluk, yansıma açılınca mesafe kaydıracı çıkıyor", () => {
    renderEditor();
    openTool("Görünüm");
    expect(screen.queryByLabelText("Gölge boyutu")).toBeNull();
    expect(screen.queryByLabelText("Yansıma mesafesi")).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: "Gölge" }));
    expect(screen.getByLabelText("Gölge boyutu")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Gölge yoğunluğu"), { target: { value: "0.3" } });
    expect((screen.getByLabelText("Gölge yoğunluğu") as HTMLInputElement).value).toBe("0.3");

    fireEvent.click(screen.getByRole("switch", { name: "Yansıma" }));
    fireEvent.change(screen.getByLabelText("Yansıma mesafesi"), { target: { value: "20" } });
    expect(screen.getByText("40 px")).toBeTruthy();

    fireEvent.click(screen.getByRole("switch", { name: "Gölge" }));
    expect(screen.queryByLabelText("Gölge boyutu")).toBeNull();
  });
});
