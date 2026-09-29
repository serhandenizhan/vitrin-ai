import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Kesim isinin yoklama vekili (Faz 7). Uc sey sinanir: surerken yalniz
 * "suruyor" bilgisi gecer (sira numarasi yok), bitince PNG aktarilir, hata
 * `code` ve `retry_safe` ile tasinir — istemci yeni anahtara YALNIZ o bayrakla
 * gecer.
 */

const auth = vi.hoisted(() => ({ token: "gecerli-token" as string | null }));
vi.mock("@/lib/supabase/access-token", () => ({
  getAccessToken: async () => auth.token,
}));

const JOB_ID = "4f1d2c3b-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

async function get(id = JOB_ID) {
  vi.resetModules();
  const { GET } = await import("./route");
  return GET(new Request(`http://localhost/api/remove-background/jobs/${id}`), {
    params: Promise.resolve({ id }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  auth.token = "gecerli-token";
});

describe("yoklama vekili", () => {
  it("oturum yoksa backend'e gitmeden auth_required doner", async () => {
    auth.token = null;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await get();
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("auth_required");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("gecersiz kimligi backend'e hic gondermez", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await get("../../api/admin");
    expect(response.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surerken yalniz durumu gecirir", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ job_id: JOB_ID, status: "processing", queue_position: 7 }, { status: 202 }),
    );
    const response = await get();
    expect(response.status).toBe(202);
    // Backend bir gun sira bilgisi eklese bile vekil onu tarayiciya tasimaz.
    expect(await response.json()).toEqual({ status: "processing" });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toMatch(new RegExp(`/api/remove-background/jobs/${JOB_ID}$`));
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer gecerli-token");
  });

  it("bitince PNG'i no-store ile aktarir", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Mock-Response")).toBe("false");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  it("basarisiz isin kodunu, mesajini ve retry_safe'ini tasir", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        {
          detail: {
            code: "worker_lost",
            message: "İşlem yarıda kaldı; krediniz iade edildi. Yeniden deneyin.",
            retry_safe: true,
          },
        },
        { status: 503 },
      ),
    );
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "worker_lost",
      retry_safe: true,
      error: "İşlem yarıda kaldı; krediniz iade edildi. Yeniden deneyin.",
    });
  });
});
