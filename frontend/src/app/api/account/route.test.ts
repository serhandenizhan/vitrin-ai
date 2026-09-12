import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ token: "gecerli-token" as string | null }));
vi.mock("@/lib/supabase/access-token", () => ({
  getAccessToken: async () => auth.token,
}));

afterEach(() => {
  auth.token = "gecerli-token";
  vi.restoreAllMocks();
});

describe("DELETE /api/account", () => {
  it("oturum yoksa backend'e gitmeden 401 doner", async () => {
    auth.token = null;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { DELETE } = await import("./route");

    const response = await DELETE();

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("basarida 204 doner", async () => {
    let method = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      method = init?.method ?? "";
      return new Response(null, { status: 204 });
    });
    const { DELETE } = await import("./route");

    const response = await DELETE();

    expect(response.status).toBe(204);
    expect(method).toBe("DELETE");
  });

  it("backend'in Turkce hata mesajini aktarir (ornegin anahtar eksik)", async () => {
    const detail = "Hesap silme yapılandırılmamış; sunucuda SUPABASE_SECRET_KEY ayarlanmalı.";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ detail }, { status: 503 }),
    );
    const { DELETE } = await import("./route");

    const response = await DELETE();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: detail });
  });
});
