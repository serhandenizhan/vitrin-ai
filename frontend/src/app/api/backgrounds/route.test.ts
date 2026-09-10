import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/backgrounds/route";

function backendResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Vekil, backend'e ulasamadiginda bilincli olarak uyari log'luyor; test
  // ciktisini kirletmesin diye susturuluyor ama cagrildigi dogrulanabiliyor.
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/backgrounds", () => {
  it("backend listesini gecirir ve kaynagi isaretler", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          backendResponse([{ id: "a", url: "https://signed/a", expires_in: 3600 }]),
        ),
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Backgrounds-Source")).toBe("backend");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toEqual([
      { id: "a", url: "https://signed/a", expiresIn: 3600 },
    ]);
  });

  it("backend'e ulasilamadiginda 5xx DEGIL, bos liste doner", async () => {
    // Yol haritasi editorun bos listede yer tutuculara sessizce dusmesini
    // istiyor. Backend'in kapali olmasi, editor acisindan bos listeyle ayni
    // durum — vekil iki yolu tek yola indiriyor ki editor iki ayri hata
    // dalini ele almak zorunda kalmasin.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Backgrounds-Source")).toBe("unavailable");
    expect(await response.json()).toEqual([]);
    // Sessizce yutulmuyor: sunucu log'unda iz birakiyor.
    expect(warnSpy).toHaveBeenCalled();
  });

  it("backend hata kodu dondurdugunde de bos listeye duser", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(backendResponse({ detail: "patladi" }, 500)),
    );

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Backgrounds-Source")).toBe("unavailable");
    expect(await response.json()).toEqual([]);
  });

  it("dizi disi govdeyi reddeder", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(backendResponse({ id: "single-object" })),
    );

    const response = await GET();

    expect(response.headers.get("X-Backgrounds-Source")).toBe("unavailable");
    expect(await response.json()).toEqual([]);
  });

  it("expires_in yoksa varsayilan sure ile doldurur", async () => {
    // `expires_in` alani backend'e PR #7 ile eklendi; o alani dondurmeyen bir
    // backend surumune karsi vekil tum listeyi cope atmamali.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(backendResponse([{ id: "a", url: "https://x/a" }])),
    );

    const body = await (await GET()).json();

    expect(body[0].expiresIn).toBeGreaterThan(0);
  });

  it("bozuk kayitlari eler, saglam olanlari gecirir", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        backendResponse([
          { id: "good", url: "https://x/good", expires_in: 60 },
          { id: "no-url" },
          "text",
        ]),
      ),
    );

    const body = await (await GET()).json();

    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("good");
  });
});
