import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Oturumlu zemin listesi: token gecersizlestiyse liste BOSALMAMALI.
vi.mock("@/lib/supabase/access-token", () => ({
  getAccessToken: async () => "gecerli-token",
}));

import { GET } from "@/app/api/backgrounds/route";

function backendResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/backgrounds — oturum gecersizken", () => {
  it("401 alinca temel zeminleri oturumsuz ister, bos liste donmez", async () => {
    // Temel zeminler oturum istemiyor. Token bu arada gecersizlestiyse
    // (suresi doldu, kullanici silindi) editorun gradyan yer tutucuya
    // dusmesi icin bir sebep yok.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(backendResponse({ detail: "yetkisiz" }, 401))
      .mockResolvedValueOnce(
        backendResponse([{ id: "basic", url: "https://signed/basic", expires_in: 60 }]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();
    const body = await response.json();

    expect(response.headers.get("X-Backgrounds-Source")).toBe("backend");
    expect(body).toEqual([
      { id: "basic", url: "https://signed/basic", expiresIn: 60 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Ikinci istek oturumsuz gidiyor.
    expect(fetchMock.mock.calls[0][1].headers).toHaveProperty("Authorization");
    expect(fetchMock.mock.calls[1][1].headers).toEqual({});
  });

  it("oturumsuz deneme de basarisizsa yer tutucuya duser", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(backendResponse({ detail: "yetkisiz" }, 401)),
    );

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Backgrounds-Source")).toBe("unavailable");
    expect(await response.json()).toEqual([]);
  });
});
