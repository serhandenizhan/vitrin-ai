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
  function request(email = "test@test.example") {
    return new Request("http://localhost/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  }

  it("oturum yoksa backend'e gitmeden 401 doner", async () => {
    auth.token = null;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { DELETE } = await import("./route");

    const response = await DELETE(request());

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("basarida 204 doner", async () => {
    let method = "";
    let body = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      method = init?.method ?? "";
      body = String(init?.body ?? "");
      return new Response(null, { status: 204 });
    });
    const { DELETE } = await import("./route");

    const response = await DELETE(request());

    expect(response.status).toBe(204);
    expect(method).toBe("DELETE");
    expect(JSON.parse(body)).toEqual({ email: "test@test.example" });
  });

  it("backend'in Turkce hata mesajini aktarir (ornegin anahtar eksik)", async () => {
    const detail = "Hesap silme yapılandırılmamış; sunucuda SUPABASE_SECRET_KEY ayarlanmalı.";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ detail }, { status: 503 }),
    );
    const { DELETE } = await import("./route");

    const response = await DELETE(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: detail });
  });

  it("e-posta onayi yoksa backend'e gitmeden 400 doner", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { DELETE } = await import("./route");
    const malformed = new Request("http://localhost/api/account", {
      method: "DELETE",
      body: "{}",
    });

    const response = await DELETE(malformed);

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
