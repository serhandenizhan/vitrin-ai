import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Vekil katmaninin testleri.
 *
 * Burasi arayuzun en cok "sessizce yanlis" davranabilecegi yeri: backend'in
 * yanitlarini kullaniciya ceviren yer. Bir hata eslemesi bozulursa kullanici
 * ne oldugunu anlamiyor — ozellikle 503, cunku o bir hata degil "birazdan
 * tekrar dene" demek.
 *
 * Modul, ortam degiskenlerini yuklenme aninda okudugu icin her testte
 * `vi.resetModules()` + dinamik import kullaniliyor; aksi halde ilk testin
 * gordugu USE_MOCK_BACKEND degeri digerlerine sizar.
 */

const ORIGINAL_ENV = { ...process.env };

// Oturum Supabase cerezinden okunuyor; testte yalnizca "token var/yok"
// durumu kontrol ediliyor. `vi.hoisted`: mock fabrikasi import'lardan once
// calistigi icin paylasilan durum da ondan once tanimli olmali.
const auth = vi.hoisted(() => ({ token: "gecerli-token" as string | null }));
vi.mock("@/lib/supabase/access-token", () => ({
  getAccessToken: async () => auth.token,
}));

function formRequest(file: File): Request {
  const form = new FormData();
  form.append("file", file);
  return new Request("http://localhost/api/remove-background", {
    method: "POST",
    body: form,
  });
}

/**
 * Testte dosya boyutu GERCEKTEN uretiliyor, `Object.defineProperty` ile
 * sahtelenmiyor.
 *
 * Ilk denemede boyut sahtelenmisti ve test kodu degil KENDISI yanlisti:
 * dosya `FormData` + `Request` uzerinden gecerken yeniden olusturuluyor ve
 * sahte `size` kayboluyor; rota gercek boyutu (8 bayt) goruyor, boyut
 * kontrolunden geciyor ve teste takilan sey vekilin davranisi degil
 * testin kurgusu oluyordu.
 */
function pngFile(name = "yuzuk.png", type = "image/png", size = 8): File {
  return new File([new Uint8Array(size)], name, { type });
}

/** Backend'in dondugu bicimde bir hata yaniti. */
function upstreamError(status: number, detail?: string): Response {
  return new Response(
    detail ? JSON.stringify({ detail }) : "bos",
    { status, headers: { "Content-Type": "application/json" } },
  );
}

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, USE_MOCK_BACKEND: "false" };
  auth.token = "gecerli-token";
});

describe("oturum zorunlulugu", () => {
  it("oturum yoksa 401 auth_required doner ve backend'e HIC gitmez", async () => {
    auth.token = null;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await loadRoute();

    const response = await POST(formRequest(pngFile()));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "auth_required",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("demo modunda da oturum istiyor", async () => {
    auth.token = null;
    process.env.USE_MOCK_BACKEND = "true";
    const { POST } = await loadRoute();

    const response = await POST(formRequest(pngFile()));

    expect(response.status).toBe(401);
  });

  it("token'i backend'e Authorization basligiyla iletiyor", async () => {
    let header: string | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      header = new Headers(init?.headers).get("Authorization");
      return new Response(new Uint8Array([1]), { status: 200 });
    });
    const { POST } = await loadRoute();

    const response = await POST(formRequest(pngFile()));

    expect(response.status).toBe(200);
    expect(header).toBe("Bearer gecerli-token");
  });

  it("backend token'i reddederse yine auth_required doner", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      upstreamError(401, "Oturum geçersiz ya da süresi dolmuş."),
    );
    const { POST } = await loadRoute();

    const response = await POST(formRequest(pngFile()));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "auth_required",
    });
  });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("dosya dogrulama", () => {
  it("dosya yoksa 400 doner", async () => {
    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://localhost/api/remove-background", {
        method: "POST",
        body: new FormData(),
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Fotoğraf bulunamadı"),
    });
  });

  it("sinirin uzerindeki dosyayi backend'e HIC gondermeden 413 doner", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await loadRoute();
    const response = await POST(
      formRequest(pngFile("buyuk.png", "image/png", 21 * 1024 * 1024)),
    );
    expect(response.status).toBe(413);
    // Asil kazanc bu: 21 MB bosuna aga cikmiyor.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("desteklenmeyen turu 400 ile reddeder", async () => {
    const { POST } = await loadRoute();
    const response = await POST(formRequest(pngFile("belge.pdf", "application/pdf")));
    expect(response.status).toBe(400);
  });
});

describe("content-type duzeltmesi", () => {
  it("bos content-type'li .heic dosyasini image/heic olarak gonderir", async () => {
    // Windows'ta gozlenen gercek durum. Backend beyan edilen turu sart
    // kostugu icin bu duzeltme olmadan her iPhone fotografi reddedilir.
    let gonderilenTur: string | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = init?.body as FormData;
      const file = body.get("file") as File;
      gonderilenTur = file.type;
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    });

    const { POST } = await loadRoute();
    const response = await POST(formRequest(pngFile("IMG_0001.heic", "")));

    expect(response.status).toBe(200);
    expect(gonderilenTur).toBe("image/heic");
  });
});

describe("backend hatalarinin cevrilmesi", () => {
  it("400'de backend'in kendi aciklamasini aynen aktarir", async () => {
    // Backend hatalari zaten Turkce (bkz. backend/app/validation/upload.py),
    // uzerine yazmak bilgi kaybi olurdu.
    const detay = "Dosya içeriği, beyan edilen content-type ile eşleşmiyor.";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(upstreamError(400, detay));

    const { POST } = await loadRoute();
    const response = await POST(formRequest(pngFile()));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: detay });
  });

  it("503'u 'sistem mesgul' mesajina cevirir", async () => {
    // 503 bir hata degil gecici bir durum: backend ayni anda tek inference'a
    // izin veriyor. Kullaniciya ne yapacagini soylemek gerekiyor.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      upstreamError(503, "Sunucu şu anda kapasitesinin üzerinde."),
    );

    const { POST } = await loadRoute();
    const response = await POST(formRequest(pngFile()));

    expect(response.status).toBe(503);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("meşgul");
    expect(payload.error).toContain("tekrar deneyin");
  });

  it("413'u dosya boyutu mesajina cevirir", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(upstreamError(413));
    const { POST } = await loadRoute();
    const response = await POST(formRequest(pngFile()));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("çok büyük"),
    });
  });

  it("detay bos gelirse genel bir mesaja duser", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 500 }),
    );
    const { POST } = await loadRoute();
    const response = await POST(formRequest(pngFile()));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("başarısız"),
    });
  });
});

describe("baglanti sorunlari", () => {
  it("backend'e ulasilamazsa 502 ve acik bir mesaj doner", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    const { POST } = await loadRoute();
    const response = await POST(formRequest(pngFile()));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("ulaşılamadı"),
    });
  });

  it("zaman asimini baglanti hatasindan AYIRIR", async () => {
    // Ikisi ayri sey: birinde beklemek, digerinde birini uyarmak gerekiyor.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new DOMException("The operation was aborted.", "TimeoutError"),
    );
    const { POST } = await loadRoute();
    const response = await POST(formRequest(pngFile()));
    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("zaman aşımına"),
    });
  });
});

describe("basarili yanit", () => {
  it("PNG'i X-Mock-Response: false ve no-store ile aktarir", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );

    const { POST } = await loadRoute();
    const response = await POST(formRequest(pngFile()));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    // Arayuz "Demo modu" yazisini bu basliga gore gosteriyor.
    expect(response.headers.get("X-Mock-Response")).toBe("false");
    // Kesim kullaniciya ozel; ara katmanlarda onbeleklenmemeli.
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("demo modu", () => {
  it("USE_MOCK_BACKEND=true iken backend HIC cagrilmaz", async () => {
    process.env.USE_MOCK_BACKEND = "true";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { POST } = await loadRoute();
    const response = await POST(formRequest(pngFile()));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    // Bu baslik olmadan arayuz sahte sonucu gercek sanip "Demo modu"
    // uyarisini gostermez — onceki iterasyonda tam olarak bu karisikliga
    // yol acmisti (bkz. kok CLAUDE.md ders 10).
    expect(response.headers.get("X-Mock-Response")).toBe("true");
  });
});
