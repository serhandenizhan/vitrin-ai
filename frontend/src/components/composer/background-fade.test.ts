import { describe, expect, it, vi } from "vitest";
import type Konva from "konva";

import {
  BACKGROUND_FADE_CURRENT,
  BACKGROUND_FADE_GHOST,
  EXPORT_CROP_ATTR,
  EXPORT_IMAGE_ATTR,
  finishBackgroundFade,
  swapToExportBackground,
} from "@/components/composer/background-fade";

describe("finishBackgroundFade — dışa aktarmada iki zemin karışmasın (18.09.2026)", () => {
  it("eski zemini siliyor, yenisini tam görünür yapıyor", () => {
    const ghost = { destroy: vi.fn() };
    const current = { opacity: vi.fn() };
    const stage = {
      find: vi.fn((selector: string) =>
        selector === "." + BACKGROUND_FADE_GHOST
          ? [ghost]
          : selector === "." + BACKGROUND_FADE_CURRENT
            ? [current]
            : [],
      ),
    } as unknown as Konva.Stage;

    finishBackgroundFade(stage);

    expect(ghost.destroy).toHaveBeenCalledOnce();
    expect(current.opacity).toHaveBeenCalledWith(1);
  });
});

/** Konva.Image'in `image()`/`crop()` okuma-yazma biçimini taşıyan sahte düğüm. */
function fakeNode(attrs: Record<string, unknown>, image: unknown, crop: unknown) {
  let shownImage = image;
  let shownCrop = crop;
  return {
    getAttr: (name: string) => attrs[name],
    image: vi.fn((next?: unknown) => {
      if (next === undefined) return shownImage;
      shownImage = next;
    }),
    crop: vi.fn((next?: unknown) => {
      if (next === undefined) return shownCrop;
      shownCrop = next;
    }),
    get shown() {
      return { image: shownImage, crop: shownCrop };
    },
  };
}

function stageWith(nodes: unknown[]) {
  return {
    find: vi.fn((selector: string) => (selector === "." + BACKGROUND_FADE_CURRENT ? nodes : [])),
  } as unknown as Konva.Stage;
}

describe("swapToExportBackground — dosyaya tam çözünürlüklü SEÇİLİ zemin girer (K1, 03.10.2026)", () => {
  const smallCopy = { name: "ekran-kopyasi" };
  const smallCrop = { x: 0, y: 0, width: 1000, height: 707 };
  const full = { name: "tam-zemin" };
  const fullCrop = { x: 0, y: 2, width: 3508, height: 2476 };

  it("dışa aktarma süresince tam görsele ve kırpmasına geçer, sonra ekran kopyasına döner", () => {
    const node = fakeNode(
      { [EXPORT_IMAGE_ATTR]: full, [EXPORT_CROP_ATTR]: fullCrop },
      smallCopy,
      smallCrop,
    );

    const restore = swapToExportBackground(stageWith([node]));
    expect(node.shown).toEqual({ image: full, crop: fullCrop });

    restore();
    expect(node.shown).toEqual({ image: smallCopy, crop: smallCrop });
  });

  it("ekranda ÖNCEKİ zeminin kopyası dururken de dosyaya seçili zemin girer (ders 23)", () => {
    // Yeni zeminin kopyası hazırlanırken ekranda eski zeminin kopyası durabiliyor;
    // düğümdeki tam görsel ise her zaman seçili zemin.
    const previousCopy = { name: "onceki-zeminin-kopyasi" };
    const node = fakeNode(
      { [EXPORT_IMAGE_ATTR]: full, [EXPORT_CROP_ATTR]: fullCrop },
      previousCopy,
      smallCrop,
    );

    swapToExportBackground(stageWith([node]));

    expect(node.shown.image).toBe(full);
  });

  it("tam görseli saklanmamış düğüme dokunmaz", () => {
    const node = fakeNode({}, smallCopy, smallCrop);

    const restore = swapToExportBackground(stageWith([node]));
    restore();

    expect(node.image).not.toHaveBeenCalledWith(expect.anything());
    expect(node.shown).toEqual({ image: smallCopy, crop: smallCrop });
  });
});
