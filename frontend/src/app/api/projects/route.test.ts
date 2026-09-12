import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gecmis calismalar vekilinin testleri. Oturum Supabase cerezinden okunuyor;
 * burada yalnizca "token var/yok" durumu kontrol ediliyor.
 */
const auth = vi.hoisted(() => ({ token: "gecerli-token" as string | null }));
vi.mock("@/lib/supabase/access-token", () => ({
  getAccessToken: async () => auth.token,
}));

const PROJECT = {
  id: "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b",
  file_name: "yuzuk.png",
  created_at: "2026-09-12T10:00:00+00:00",
  is_mocked: true,
  duration_seconds: 1.2,
  result_url: "https://r2.example/result.png?imza",
  thumbnail_url: "https://r2.example/thumb.png?imza",
  expires_in: 3600,
};

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

beforeEach(() => {
  auth.token = "gecerli-token";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/projects", () => {
  it("oturum yoksa 401 auth_required doner ve backend'e gitmez", async () => {
    auth.token = null;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { GET } = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "auth_required" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("token'i iletip yaniti arayuz kaydina ceviriyor", async () => {
    let header: string | null = null;
    let url = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      url = String(input);
      header = new Headers(init?.headers).get("Authorization");
      return Response.json([PROJECT]);
    });
    const { GET } = await loadRoute();

    const response = await GET();
    const body = (await response.json()) as Array<Record<string, unknown>>;

    expect(header).toBe("Bearer gecerli-token");
    expect(url).toContain("/api/projects?limit=100");
    expect(body[0]).toMatchObject({
      id: PROJECT.id,
      fileName: "yuzuk.png",
      resultUrl: `/api/projects/${PROJECT.id}/result`,
      thumbnailUrl: PROJECT.thumbnail_url,
    });
    // Backend'in alan adlari arayuze sizmiyor.
    expect(body[0]).not.toHaveProperty("result_url");
  });

  it("backend'e ulasilamazsa 502 doner", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    const { GET } = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(502);
  });

  it("backend'in Turkce hata mesajini aktariyor (ornegin yapilandirma eksik)", async () => {
    const detail = "Kimlik doğrulama yapılandırılmamış; sunucuda SUPABASE_URL ayarlanmalı.";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ detail }, { status: 503 }),
    );
    const { GET } = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: detail });
  });
});

describe("POST /api/projects", () => {
  function saveRequest(extra?: (form: FormData) => void): Request {
    const form = new FormData();
    form.append("result", new File([new Uint8Array(4)], "x.png", { type: "image/png" }));
    form.append("thumbnail", new File([new Uint8Array(2)], "t.png", { type: "image/png" }));
    form.append("fileName", "yuzuk.png");
    form.append("isMocked", "true");
    form.append("durationSeconds", "1.2");
    extra?.(form);
    return new Request("http://localhost/api/projects", { method: "POST", body: form });
  }

  it("yalnizca bilinen alanlari backend adlariyla iletiyor", async () => {
    let sent: FormData | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      sent = init?.body as FormData;
      return Response.json(PROJECT, { status: 201 });
    });
    const { POST } = await loadRoute();

    const response = await POST(saveRequest((form) => form.append("user_id", "baskasi")));

    expect(response.status).toBe(201);
    const form = sent as unknown as FormData;
    expect(form.get("file_name")).toBe("yuzuk.png");
    expect(form.get("is_mocked")).toBe("true");
    expect(form.get("duration_seconds")).toBe("1.2");
    expect(form.get("result")).toBeInstanceOf(File);
    // Istemcinin ekledigi alan backend'e ulasmiyor.
    expect(form.get("user_id")).toBeNull();
  });

  it("gorsel eksikse backend'e gitmeden 400 doner", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await loadRoute();
    const form = new FormData();
    form.append("fileName", "yuzuk.png");

    const response = await POST(
      new Request("http://localhost/api/projects", { method: "POST", body: form }),
    );

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/projects", () => {
  it("204 doner", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const { DELETE } = await loadRoute();

    const response = await DELETE();

    expect(response.status).toBe(204);
  });
});
