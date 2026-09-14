// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearWorks, deleteWork, listWorks, saveWork } from "@/lib/work-history";

const USER_ID = "8f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6d";

beforeEach(() => {
  vi.stubGlobal("createImageBitmap", async () => ({
    width: 2,
    height: 2,
    close: vi.fn(),
  }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    callback(new Blob([new Uint8Array([1])], { type: "image/png" }));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("hesaba bagli gecmis istekleri", () => {
  it("bekleyen kaydi islemi baslatan kullaniciya baglar", async () => {
    let headers = new Headers();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      headers = new Headers(init?.headers);
      return Response.json({ id: "project" }, { status: 201 });
    });

    await saveWork(
      {
        fileName: "yuzuk.png",
        isMocked: false,
        durationSeconds: 2,
        result: new Blob([new Uint8Array([1, 2])], { type: "image/png" }),
      },
      USER_ID,
    );

    expect(headers.get("X-Expected-User-Id")).toBe(USER_ID);
  });

  it("silme mutasyonlarini gorunen listenin kullanicisina baglar", async () => {
    const headers: Array<string | null> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      headers.push(new Headers(init?.headers).get("X-Expected-User-Id"));
      return new Response(null, { status: 204 });
    });

    await deleteWork("project", USER_ID);
    await clearWorks(USER_ID);

    expect(headers).toEqual([USER_ID, USER_ID]);
  });

  it("sonraki sayfa imlecini API'ye tasir", async () => {
    let url = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      url = String(input);
      return Response.json({ items: [], nextCursor: null });
    });

    await listWorks("ikinci/sayfa");

    expect(url).toBe("/api/projects?cursor=ikinci%2Fsayfa");
  });
});
