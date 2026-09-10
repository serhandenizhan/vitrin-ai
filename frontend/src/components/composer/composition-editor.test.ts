// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    find: () => [transformer],
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
      }: {
        background: { id: string; url?: string };
        onStageReady: (stage: unknown) => void;
      }) {
        React.useEffect(() => {
          onStageReady(fakeStage);
          return () => onStageReady(null);
        }, [onStageReady]);
        return React.createElement(
          "output",
          { "data-testid": "stage-background" },
          `${background.id}|${background.url ?? ""}`,
        );
      },
  };
});

vi.mock("@/components/composer/use-backgrounds", () => ({
  useBackgrounds: () => backgroundState,
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
      isLoading: false,
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

      fireEvent.click(screen.getByRole("button", { name: "TIFF" }));

      expectStageRestored(stage);
      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
