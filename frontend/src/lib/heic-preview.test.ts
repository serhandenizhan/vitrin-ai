import { describe, expect, it, vi } from "vitest";

import { createPreviewUrl, type PreviewDeps } from "@/lib/heic-preview";

function makeDeps(overrides: Partial<PreviewDeps> = {}) {
  let counter = 0;
  const deps: PreviewDeps = {
    createObjectUrl: vi.fn(() => `blob:${++counter}`),
    revokeObjectUrl: vi.fn(),
    canDecode: vi.fn(async () => false),
    convertHeic: vi.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" })),
    ...overrides,
  };
  return deps;
}

const heic = new File(["x"], "yuzuk.HEIC", { type: "" });

describe("createPreviewUrl", () => {
  it("JPEG icin cozucuye hic dokunmuyor", async () => {
    const deps = makeDeps();
    const url = await createPreviewUrl(
      new File(["x"], "a.jpg", { type: "image/jpeg" }),
      deps,
    );
    expect(url).toBe("blob:1");
    expect(deps.canDecode).not.toHaveBeenCalled();
    expect(deps.convertHeic).not.toHaveBeenCalled();
  });

  it("tarayici HEIC'i kendisi gosterebiliyorsa (Safari) donusturmuyor", async () => {
    const deps = makeDeps({ canDecode: vi.fn(async () => true) });
    expect(await createPreviewUrl(heic, deps)).toBe("blob:1");
    expect(deps.convertHeic).not.toHaveBeenCalled();
  });

  it("gosteremiyorsa HEIC'i JPEG'e cevirip eski adresi serbest birakiyor", async () => {
    const deps = makeDeps();
    expect(await createPreviewUrl(heic, deps)).toBe("blob:2");
    expect(deps.revokeObjectUrl).toHaveBeenCalledWith("blob:1");
    expect(deps.convertHeic).toHaveBeenCalledWith(heic);
  });

  it("donusturme de basarisizsa null donuyor (bilgi karti gosterilir)", async () => {
    const deps = makeDeps({
      convertHeic: vi.fn(async () => {
        throw new Error("bozuk dosya");
      }),
    });
    expect(await createPreviewUrl(heic, deps)).toBeNull();
  });
});
