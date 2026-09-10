import { describe, expect, it, vi } from "vitest";

import {
  REFRESH_RATIO,
  PLACEHOLDER_BACKGROUNDS,
  type ServerBackground,
  calculateRefreshDelay,
  createBackgroundList,
  fetchBackgrounds,
} from "@/lib/backgrounds";

function serverBackground(
  overrides: Partial<ServerBackground> = {},
): ServerBackground {
  return {
    type: "server",
    id: "z1",
    name: "Zemin 1",
    url: "https://signed.example/z1",
    expiresInSeconds: 3600,
    fetchedAt: 1_000_000,
    ...overrides,
  };
}

function createResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

describe("calculateRefreshDelay", () => {
  it("sunucu zemini yoksa yenileme planlamaz", () => {
    expect(calculateRefreshDelay(PLACEHOLDER_BACKGROUNDS)).toBeNull();
  });

  it("omrun %75'inde yeniler", () => {
    const background = serverBackground({ expiresInSeconds: 3600, fetchedAt: 0 });

    // Saat 0'da alindi, omur 1 saat -> 45. dakikada yenilenmeli.
    expect(calculateRefreshDelay([background], 0)).toBe(
      3600 * 1000 * REFRESH_RATIO,
    );
  });

  it("gecen sureyi dusuyor", () => {
    const background = serverBackground({ expiresInSeconds: 3600, fetchedAt: 0 });
    const tenMinutes = 10 * 60 * 1000;

    expect(calculateRefreshDelay([background], tenMinutes)).toBe(
      3600 * 1000 * REFRESH_RATIO - tenMinutes,
    );
  });

  it("en erken olen URL'e gore planlar", () => {
    // Liste tek seferde yenilendigi icin en kisa omurlu kayit hepsini birden
    // tetiklemeli; aksi halde kisa omurlu zemin, uzun omurlunun yenilenmesini
    // beklerken oluyordu.
    const long = serverBackground({ id: "long", expiresInSeconds: 3600, fetchedAt: 0 });
    const short = serverBackground({ id: "short", expiresInSeconds: 600, fetchedAt: 0 });

    expect(calculateRefreshDelay([long, short], 0)).toBe(
      600 * 1000 * REFRESH_RATIO,
    );
  });

  it("kisa omurlu URL'i suresi dolmadan yeniler", () => {
    const background = serverBackground({ expiresInSeconds: 10, fetchedAt: 0 });

    expect(calculateRefreshDelay([background], 0)).toBe(7_500);
  });

  it("sure zaten dolmussa hemen yeniler, negatif dondurmez", () => {
    // Sekme uzun sure arka planda kalip zamanlayici gec calistiginda olusan
    // durum. Negatif bir gecikme `setTimeout`'ta hemen tetiklenir ve arka arkaya
    // yenileme dongusu riski dogurur.
    const background = serverBackground({ expiresInSeconds: 60, fetchedAt: 0 });
    const oneHourLater = 3600 * 1000;

    expect(calculateRefreshDelay([background], oneHourLater)).toBe(0);
  });
});

describe("createBackgroundList", () => {
  it("yer tutucular sunucu zeminleri gelse de listede kalir", () => {
    const list = createBackgroundList([serverBackground()]);

    expect(list).toHaveLength(1 + PLACEHOLDER_BACKGROUNDS.length);
    expect(list[0].type).toBe("server");
  });

  it("sunucu zemini yokken bile liste bos degil", () => {
    // Yol haritasi: "backend bos liste donerse editor yer tutucu zeminlere
    // sessizce dusmeli, hic kirilmamali."
    expect(createBackgroundList([]).length).toBeGreaterThan(0);
  });
});

describe("fetchBackgrounds", () => {
  it("backend kayitlarini cozumler", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createResponse([{ id: "a", url: "https://x/a", expiresIn: 900 }]),
      );

    const backgrounds = await fetchBackgrounds(fetchMock as unknown as typeof fetch);

    expect(backgrounds).toHaveLength(1);
    expect(backgrounds[0].id).toBe("a");
    expect(backgrounds[0].expiresInSeconds).toBe(900);
  });

  it("expires_in yoksa varsayilan sureye duser", async () => {
    // Backend'in `expires_in` alani PR #7 ile geldi; o alani dondurmeyen bir
    // backend surumune karsi da calismali.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createResponse([{ id: "a", url: "https://x/a" }]));

    const backgrounds = await fetchBackgrounds(fetchMock as unknown as typeof fetch);

    expect(backgrounds[0].expiresInSeconds).toBeGreaterThan(0);
  });

  it("ag hatasinda firlatmaz, bos liste doner", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ag yok"));

    await expect(
      fetchBackgrounds(fetchMock as unknown as typeof fetch),
    ).resolves.toEqual([]);
  });

  it("dizi disi govdede bos liste doner", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createResponse({ error: "unexpected" }));

    await expect(
      fetchBackgrounds(fetchMock as unknown as typeof fetch),
    ).resolves.toEqual([]);
  });

  it("bozuk kayitlari eler, saglamlari korur", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse([
        { id: "good", url: "https://x/good", expiresIn: 300 },
        { id: "no-url" },
        null,
      ]),
    );

    const backgrounds = await fetchBackgrounds(fetchMock as unknown as typeof fetch);

    expect(backgrounds).toHaveLength(1);
    expect(backgrounds[0].id).toBe("good");
  });
});
