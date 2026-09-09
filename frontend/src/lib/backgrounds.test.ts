import { describe, expect, it, vi } from "vitest";

import {
  EN_KISA_YENILEME_MS,
  YENILEME_ORANI,
  YER_TUTUCU_ZEMINLER,
  type SunucuZemini,
  yenilemeGecikmesiHesapla,
  zeminListesiOlustur,
  zeminleriGetir,
} from "@/lib/backgrounds";

function sunucuZemini(
  ozellikler: Partial<SunucuZemini> = {},
): SunucuZemini {
  return {
    tur: "sunucu",
    id: "z1",
    ad: "Zemin 1",
    url: "https://imzali.example/z1",
    gecerlilikSaniye: 3600,
    alinmaZamani: 1_000_000,
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
    expect(yenilemeGecikmesiHesapla(YER_TUTUCU_ZEMINLER)).toBeNull();
  });

  it("omrun %75'inde yeniler", () => {
    const zemin = sunucuZemini({ gecerlilikSaniye: 3600, alinmaZamani: 0 });

    // Saat 0'da alindi, omur 1 saat -> 45. dakikada yenilenmeli.
    expect(yenilemeGecikmesiHesapla([zemin], 0)).toBe(
      3600 * 1000 * YENILEME_ORANI,
    );
  });

  it("gecen sureyi dusuyor", () => {
    const zemin = sunucuZemini({ gecerlilikSaniye: 3600, alinmaZamani: 0 });
    const onDakika = 10 * 60 * 1000;

    expect(yenilemeGecikmesiHesapla([zemin], onDakika)).toBe(
      3600 * 1000 * YENILEME_ORANI - onDakika,
    );
  });

  it("en erken olen URL'e gore planlar", () => {
    // Liste tek seferde yenilendigi icin en kisa omurlu kayit hepsini birden
    // tetiklemeli; aksi halde kisa omurlu zemin, uzun omurlunun yenilenmesini
    // beklerken oluyordu.
    const uzun = sunucuZemini({ id: "uzun", gecerlilikSaniye: 3600, alinmaZamani: 0 });
    const kisa = sunucuZemini({ id: "kisa", gecerlilikSaniye: 600, alinmaZamani: 0 });

    expect(yenilemeGecikmesiHesapla([uzun, kisa], 0)).toBe(
      600 * 1000 * YENILEME_ORANI,
    );
  });

  it("sure zaten dolmussa alt sinira duser, negatif dondurmez", () => {
    // Sekme uzun sure arka planda kalip zamanlayici gec calistiginda olusan
    // durum. Negatif bir gecikme `setTimeout`'ta hemen tetiklenir ve arka arkaya
    // yenileme dongusu riski dogurur.
    const zemin = sunucuZemini({ gecerlilikSaniye: 60, alinmaZamani: 0 });
    const birSaatSonra = 3600 * 1000;

    expect(yenilemeGecikmesiHesapla([zemin], birSaatSonra)).toBe(
      EN_KISA_YENILEME_MS,
    );
  });
});

describe("zeminListesiOlustur", () => {
  it("yer tutucular sunucu zeminleri gelse de listede kalir", () => {
    const liste = zeminListesiOlustur([sunucuZemini()]);

    expect(liste).toHaveLength(1 + YER_TUTUCU_ZEMINLER.length);
    expect(liste[0].tur).toBe("sunucu");
  });

  it("sunucu zemini yokken bile liste bos degil", () => {
    // Yol haritasi: "backend bos liste donerse editor yer tutucu zeminlere
    // sessizce dusmeli, hic kirilmamali."
    expect(zeminListesiOlustur([]).length).toBeGreaterThan(0);
  });
});

describe("zeminleriGetir", () => {
  it("backend kayitlarini cozumler", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        yanitOlustur([{ id: "a", url: "https://x/a", expiresIn: 900 }]),
      );

    const zeminler = await zeminleriGetir(fetchMock as unknown as typeof fetch);

    expect(zeminler).toHaveLength(1);
    expect(zeminler[0].id).toBe("a");
    expect(zeminler[0].gecerlilikSaniye).toBe(900);
  });

  it("expires_in yoksa varsayilan sureye duser", async () => {
    // Backend'in `expires_in` alani PR #7 ile geldi; o alani dondurmeyen bir
    // backend surumune karsi da calismali.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(yanitOlustur([{ id: "a", url: "https://x/a" }]));

    const zeminler = await zeminleriGetir(fetchMock as unknown as typeof fetch);

    expect(zeminler[0].gecerlilikSaniye).toBeGreaterThan(0);
  });

  it("ag hatasinda firlatmaz, bos liste doner", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ag yok"));

    await expect(
      zeminleriGetir(fetchMock as unknown as typeof fetch),
    ).resolves.toEqual([]);
  });

  it("dizi disi govdede bos liste doner", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(yanitOlustur({ hata: "beklenmedik" }));

    await expect(
      zeminleriGetir(fetchMock as unknown as typeof fetch),
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

    const zeminler = await zeminleriGetir(fetchMock as unknown as typeof fetch);

    expect(zeminler).toHaveLength(1);
    expect(zeminler[0].id).toBe("iyi");
  });
});
