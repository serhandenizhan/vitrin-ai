import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/backgrounds/route";

function backendYaniti(govde: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => govde,
  } as unknown as Response;
}

let uyariCasusu: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Vekil, backend'e ulasamadiginda bilincli olarak uyari log'luyor; test
  // ciktisini kirletmesin diye susturuluyor ama cagrildigi dogrulanabiliyor.
  uyariCasusu = vi.spyOn(console, "warn").mockImplementation(() => {});
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
          backendYaniti([{ id: "a", url: "https://imzali/a", expires_in: 3600 }]),
        ),
    );

    const yanit = await GET();
    const govde = await yanit.json();

    expect(yanit.status).toBe(200);
    expect(yanit.headers.get("X-Backgrounds-Source")).toBe("backend");
    expect(yanit.headers.get("Cache-Control")).toBe("no-store");
    expect(govde).toEqual([
      { id: "a", url: "https://imzali/a", expiresIn: 3600 },
    ]);
  });

  it("backend'e ulasilamadiginda 5xx DEGIL, bos liste doner", async () => {
    // Yol haritasi editorun bos listede yer tutuculara sessizce dusmesini
    // istiyor. Backend'in kapali olmasi, editor acisindan bos listeyle ayni
    // durum — vekil iki yolu tek yola indiriyor ki editor iki ayri hata
    // dalini ele almak zorunda kalmasin.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const yanit = await GET();

    expect(yanit.status).toBe(200);
    expect(yanit.headers.get("X-Backgrounds-Source")).toBe("unavailable");
    expect(await yanit.json()).toEqual([]);
    // Sessizce yutulmuyor: sunucu log'unda iz birakiyor.
    expect(uyariCasusu).toHaveBeenCalled();
  });

  it("backend hata kodu dondurdugunde de bos listeye duser", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(backendYaniti({ detail: "patladi" }, 500)),
    );

    const yanit = await GET();

    expect(yanit.status).toBe(200);
    expect(yanit.headers.get("X-Backgrounds-Source")).toBe("unavailable");
    expect(await yanit.json()).toEqual([]);
  });

  it("dizi disi govdeyi reddeder", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(backendYaniti({ id: "tek-nesne" })),
    );

    const yanit = await GET();

    expect(yanit.headers.get("X-Backgrounds-Source")).toBe("unavailable");
    expect(await yanit.json()).toEqual([]);
  });

  it("expires_in yoksa varsayilan sure ile doldurur", async () => {
    // `expires_in` alani backend'e PR #7 ile eklendi; o alani dondurmeyen bir
    // backend surumune karsi vekil tum listeyi cope atmamali.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(backendYaniti([{ id: "a", url: "https://x/a" }])),
    );

    const govde = await (await GET()).json();

    expect(govde[0].expiresIn).toBeGreaterThan(0);
  });

  it("bozuk kayitlari eler, saglam olanlari gecirir", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        backendYaniti([
          { id: "iyi", url: "https://x/iyi", expires_in: 60 },
          { id: "urlsuz" },
          "metin",
        ]),
      ),
    );

    const govde = await (await GET()).json();

    expect(govde).toHaveLength(1);
    expect(govde[0].id).toBe("iyi");
  });
});
