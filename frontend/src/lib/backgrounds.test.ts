import { describe, expect, it, vi } from "vitest";

import {
  REFRESH_RATIO,
  PLACEHOLDER_BACKGROUNDS,
  type ServerBackground,
  calculateRefreshDelay,
  createBackgroundList,
  fetchBackgrounds,
} from "@/lib/backgrounds";

function sunucuZemini(
  ozellikler: Partial<ServerBackground> = {},
): ServerBackground {
  return {
    type: "sunucu",
    id: "z1",
    name: "Zemin 1",
    url: "https://imzali.example/z1",
    expiresInSeconds: 3600,
    fetchedAt: 1_000_000,
    ...ozellikler,
  };
}

function yanitOlustur(govde: unknown, ok = true): Response {
  return {
    ok,
    json: async () => govde,
  } as unknown as Response;
}

describe("yenilemeGecikmesiHesapla", () => {
  it("sunucu zemini yoksa yenileme planlamaz", () => {
    expect(calculateRefreshDelay(PLACEHOLDER_BACKGROUNDS)).toBeNull();
  });

  it("omrun %75'inde yeniler", () => {
    const zemin = sunucuZemini({ expiresInSeconds: 3600, fetchedAt: 0 });

    // Saat 0'da alindi, omur 1 saat -> 45. dakikada yenilenmeli.
    expect(calculateRefreshDelay([zemin], 0)).toBe(
      3600 * 1000 * REFRESH_RATIO,
    );
  });

  it("gecen sureyi dusuyor", () => {
    const zemin = sunucuZemini({ expiresInSeconds: 3600, fetchedAt: 0 });
    const onDakika = 10 * 60 * 1000;

    expect(calculateRefreshDelay([zemin], onDakika)).toBe(
      3600 * 1000 * REFRESH_RATIO - onDakika,
    );
  });

  it("en erken olen URL'e gore planlar", () => {
    // Liste tek seferde yenilendigi icin en kisa omurlu kayit hepsini birden
    // tetiklemeli; aksi halde kisa omurlu zemin, uzun omurlunun yenilenmesini
    // beklerken oluyordu.
    const uzun = sunucuZemini({ id: "uzun", expiresInSeconds: 3600, fetchedAt: 0 });
    const kisa = sunucuZemini({ id: "kisa", expiresInSeconds: 600, fetchedAt: 0 });

    expect(calculateRefreshDelay([uzun, kisa], 0)).toBe(
      600 * 1000 * REFRESH_RATIO,
    );
  });

  it("kisa omurlu URL'i suresi dolmadan yeniler", () => {
    const zemin = sunucuZemini({ expiresInSeconds: 10, fetchedAt: 0 });

    expect(calculateRefreshDelay([zemin], 0)).toBe(7_500);
  });

  it("sure zaten dolmussa hemen yeniler, negatif dondurmez", () => {
    // Sekme uzun sure arka planda kalip zamanlayici gec calistiginda olusan
    // durum. Negatif bir gecikme `setTimeout`'ta hemen tetiklenir ve arka arkaya
    // yenileme dongusu riski dogurur.
    const zemin = sunucuZemini({ expiresInSeconds: 60, fetchedAt: 0 });
    const birSaatSonra = 3600 * 1000;

    expect(calculateRefreshDelay([zemin], birSaatSonra)).toBe(0);
  });
});

describe("zeminListesiOlustur", () => {
  it("yer tutucular sunucu zeminleri gelse de listede kalir", () => {
    const liste = createBackgroundList([sunucuZemini()]);

    expect(liste).toHaveLength(1 + PLACEHOLDER_BACKGROUNDS.length);
    expect(liste[0].type).toBe("sunucu");
  });

  it("sunucu zemini yokken bile liste bos degil", () => {
    // Yol haritasi: "backend bos liste donerse editor yer tutucu zeminlere
    // sessizce dusmeli, hic kirilmamali."
    expect(createBackgroundList([]).length).toBeGreaterThan(0);
  });
});

describe("zeminleriGetir", () => {
  it("backend kayitlarini cozumler", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        yanitOlustur([{ id: "a", url: "https://x/a", expiresIn: 900 }]),
      );

    const zeminler = await fetchBackgrounds(fetchMock as unknown as typeof fetch);

    expect(zeminler).toHaveLength(1);
    expect(zeminler[0].id).toBe("a");
    expect(zeminler[0].expiresInSeconds).toBe(900);
  });

  it("expires_in yoksa varsayilan sureye duser", async () => {
    // Backend'in `expires_in` alani PR #7 ile geldi; o alani dondurmeyen bir
    // backend surumune karsi da calismali.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(yanitOlustur([{ id: "a", url: "https://x/a" }]));

    const zeminler = await fetchBackgrounds(fetchMock as unknown as typeof fetch);

    expect(zeminler[0].expiresInSeconds).toBeGreaterThan(0);
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
      .mockResolvedValue(yanitOlustur({ hata: "beklenmedik" }));

    await expect(
      fetchBackgrounds(fetchMock as unknown as typeof fetch),
    ).resolves.toEqual([]);
  });

  it("bozuk kayitlari eler, saglamlari korur", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      yanitOlustur([
        { id: "iyi", url: "https://x/iyi", expiresIn: 300 },
        { id: "urlsuz" },
        null,
      ]),
    );

    const zeminler = await fetchBackgrounds(fetchMock as unknown as typeof fetch);

    expect(zeminler).toHaveLength(1);
    expect(zeminler[0].id).toBe("iyi");
  });
});
