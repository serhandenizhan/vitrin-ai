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

describe("DELETE /api/account — kaynak kontrolü", () => {
  it("başka bir sitenin tetiklediği silmeyi backend'e göndermez", async () => {
    // Oturum çerezde: tarayıcı, başka bir sitenin gönderdiği isteğe de çerezi
    // ekler. Ödeme mutasyonlarında olan kontrol, geri döndürülemez hesap
    // silmede yoktu (ayrı ayrı yazıldığı için gözden kaçmıştı).
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { DELETE } = await import("./route");

    const response = await DELETE(
      new Request("http://localhost/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Origin: "https://kotu.test" },
        body: JSON.stringify({ email: "test@test.example" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("aynı origin'den gelen silmeyi geçirir", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ status: "pending" }, { status: 202 })),
    );
    const { DELETE } = await import("./route");

    const response = await DELETE(
      new Request("http://localhost/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Origin: "http://localhost" },
        body: JSON.stringify({ email: "test@test.example" }),
      }),
    );

    expect(response.status).toBe(202);
  });
});
