/**
 * Yönetim paneli vekilleri (Faz 6, Kaan).
 *
 * Yetki backend'de; burada sınanan, vekilin KENDİ sorumlulukları:
 * - geri dönüşü olmayan işlemlerde yabancı Origin'i reddetmesi — ve aynı
 *   Origin'i GEÇİRMESİ (ders 15: red ve kabul yolu ayrı ayrı);
 * - adrese giden kimliğin bir UUID olması (yol enjeksiyonu backend'e ulaşmasın);
 * - gövdeyi bilinen alanlarla YENİDEN kurması (istemcinin fazladan alanı
 *   backend'e gitmesin) ve idempotency anahtarını olduğu gibi iletmesi.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ token: "gecerli-token" as string | null }));
vi.mock("@/lib/supabase/access-token", () => ({
  getAccessToken: async () => auth.token,
}));

const USER_ID = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";
const KEY = "8f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6d";

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function json(url: string, method: string, body: unknown, origin = "http://localhost") {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}

/** Backend'e giden son isteğin adresi ve gövdesi. */
function captureBackend(status = 200, body: unknown = {}) {
  const sent: { url: string; method: string; body: unknown }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    sent.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return Response.json(body, { status });
  });
  return sent;
}

afterEach(() => {
  auth.token = "gecerli-token";
  vi.restoreAllMocks();
});

describe("POST /api/admin/users/[id]/credits", () => {
  const url = `http://localhost/api/admin/users/${USER_ID}/credits`;
  const valid = { amount: 5, reason: "Kesinti telafisi", idempotencyKey: KEY };

  it("yabancı Origin'i backend'e gitmeden reddediyor", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("./users/[id]/credits/route");

    const response = await POST(json(url, "POST", valid, "https://kotu.test"), context(USER_ID));

    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("aynı Origin'i geçiriyor; gövdeyi bilinen alanlarla yeniden kurup anahtarı iletiyor", async () => {
    const sent = captureBackend(201, { id: "g1" });
    const { POST } = await import("./users/[id]/credits/route");

    const response = await POST(
      json(url, "POST", { ...valid, reason: "  Kesinti telafisi  ", user_id: "baskasi", granted_by: "x" }),
      context(USER_ID),
    );

    expect(response.status).toBe(201);
    expect(sent[0].url).toMatch(new RegExp(`/api/admin/users/${USER_ID}/credits$`));
    // Fazladan alanlar (user_id, granted_by) backend'e ULASMIYOR.
    expect(sent[0].body).toEqual({ amount: 5, reason: "Kesinti telafisi", idempotency_key: KEY });
  });

  it("son kullanma tarihini saat dilimli ISO olarak iletiyor (backend AwareDatetime ister)", async () => {
    const sent = captureBackend(201);
    const { POST } = await import("./users/[id]/credits/route");

    await POST(json(url, "POST", { ...valid, expiresAt: "2026-12-31T20:59:59.000Z" }), context(USER_ID));

    expect((sent[0].body as { expires_at: string }).expires_at).toBe("2026-12-31T20:59:59.000Z");
  });

  it.each([
    [{ ...valid, amount: 0 }, "sıfır kredi"],
    [{ ...valid, amount: 10_001 }, "üst sınır"],
    [{ ...valid, amount: 2.5 }, "kesirli kredi"],
    [{ ...valid, reason: "ab" }, "kısa gerekçe"],
    [{ ...valid, idempotencyKey: "anahtar-degil" }, "geçersiz anahtar"],
  ])("geçersiz girdiyi (%s) backend'e göndermiyor", async (body) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("./users/[id]/credits/route");

    const response = await POST(json(url, "POST", body), context(USER_ID));

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("UUID olmayan kimliği backend'e hiç göndermiyor", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("./users/[id]/credits/route");

    const response = await POST(json(url, "POST", valid), context("../me"));

    expect(response.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/users/[id]", () => {
  const url = `http://localhost/api/admin/users/${USER_ID}`;

  it("yabancı Origin'i reddediyor, aynı Origin'i geçiriyor", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { DELETE } = await import("./users/[id]/route");
    const denied = await DELETE(json(url, "DELETE", { email: "a@b.example" }, "https://kotu.test"), context(USER_ID));
    expect(denied.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    const sent = captureBackend(202, { action_id: "x", status: "pending" });
    const allowed = await DELETE(json(url, "DELETE", { email: " a@b.example " }), context(USER_ID));
    expect(allowed.status).toBe(202);
    expect(sent[0]).toMatchObject({ method: "DELETE", body: { email: "a@b.example" } });
  });

  it("e-posta yazılmadan backend'e gitmiyor", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { DELETE } = await import("./users/[id]/route");

    const response = await DELETE(json(url, "DELETE", {}), context(USER_ID));

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("POST/DELETE /api/admin/users/[id]/admin", () => {
  const url = `http://localhost/api/admin/users/${USER_ID}/admin`;

  it("yabancı Origin'i reddediyor, aynı Origin'i geçiriyor (POST)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("./users/[id]/admin/route");
    const denied = await POST(json(url, "POST", { email: "a@b.example" }, "https://kotu.test"), context(USER_ID));
    expect(denied.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    const sent = captureBackend(201, { is_admin: true });
    const allowed = await POST(json(url, "POST", { email: " a@b.example " }), context(USER_ID));
    expect(allowed.status).toBe(201);
    expect(sent[0]).toMatchObject({ method: "POST", body: { email: "a@b.example" } });
  });

  it("yabancı Origin'i reddediyor, aynı Origin'i geçiriyor (DELETE)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { DELETE } = await import("./users/[id]/admin/route");
    const denied = await DELETE(json(url, "DELETE", { email: "a@b.example" }, "https://kotu.test"), context(USER_ID));
    expect(denied.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    const sent = captureBackend(200, { is_admin: false });
    const allowed = await DELETE(json(url, "DELETE", { email: " a@b.example " }), context(USER_ID));
    expect(allowed.status).toBe(200);
    expect(sent[0]).toMatchObject({ method: "DELETE", body: { email: "a@b.example" } });
  });

  it("e-posta yazılmadan backend'e gitmiyor", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST, DELETE } = await import("./users/[id]/admin/route");

    expect((await POST(json(url, "POST", {}), context(USER_ID))).status).toBe(400);
    expect((await DELETE(json(url, "DELETE", {}), context(USER_ID))).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/credits/[id]/revoke", () => {
  const url = `http://localhost/api/admin/credits/${KEY}/revoke`;

  it("yabancı Origin'i reddediyor, aynı Origin'i geçiriyor", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("./credits/[id]/revoke/route");
    const denied = await POST(json(url, "POST", {}, "https://kotu.test"), context(KEY));
    expect(denied.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    const sent = captureBackend(200, { id: KEY });
    const allowed = await POST(json(url, "POST", {}), context(KEY));
    expect(allowed.status).toBe(200);
    expect(sent[0].url).toMatch(new RegExp(`/api/admin/credits/${KEY}/revoke$`));
  });
});

describe("GET vekilleri", () => {
  it("kullanıcı aramasını kırpıp sayfayı sınırlıyor", async () => {
    const sent = captureBackend(200, { users: [], page: 1, per_page: 25 });
    const { GET } = await import("./users/route");

    await GET(new Request("http://localhost/api/admin/users?query=%20ali%40x.example%20&page=-3"));

    const params = new URL(sent[0].url).searchParams;
    expect(params.get("query")).toBe("ali@x.example");
    expect(params.get("page")).toBe("1");
    expect(params.get("per_page")).toBe("25");
  });

  it("istatistikte yalnız izin verilen gün aralıklarını geçiriyor", async () => {
    const sent = captureBackend(200, {});
    const { GET } = await import("./stats/route");

    await GET(new Request("http://localhost/api/admin/stats?days=100000"));

    expect(new URL(sent[0].url).searchParams.get("days")).toBe("30");
  });

  it("günlükte bilinen eylemi geçiriyor, bilinmeyeni backend'e hiç göndermiyor", async () => {
    const sent = captureBackend(200, { items: [], page: 1, per_page: 50, has_more: false });
    const { GET } = await import("./audit/route");

    await GET(new Request("http://localhost/api/admin/audit?action=credit_grant&page=2"));
    await GET(new Request("http://localhost/api/admin/audit?action=drop_table&page=abc"));

    const known = new URL(sent[0].url).searchParams;
    expect(known.get("action")).toBe("credit_grant");
    expect(known.get("page")).toBe("2");
    const unknown = new URL(sent[1].url).searchParams;
    expect(unknown.has("action")).toBe(false);
    expect(unknown.get("page")).toBe("1");
  });

  it("backend'in 403'ünü olduğu gibi iletiyor (yetki backend'de)", async () => {
    captureBackend(403, { detail: "Bu işlem için yönetici yetkisi gerekiyor." });
    const { GET } = await import("./stats/route");

    const response = await GET(new Request("http://localhost/api/admin/stats"));

    expect(response.status).toBe(403);
  });

  it("oturum yoksa 401, backend'e gitmeden", async () => {
    auth.token = null;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { GET } = await import("./me/route");

    const response = await GET();

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});


describe("/api/admin/backgrounds (zemin yönetimi)", () => {
  const url = "http://localhost/api/admin/backgrounds";

  /** Cok parcali (multipart) istek: govde JSON degil, ayri bir yakalayici gerekiyor. */
  function captureUpload(status = 201, body: unknown = { id: "yeni" }) {
    const sent: { url: string; method: string; form: FormData | null }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      sent.push({
        url: String(input),
        method: init?.method ?? "GET",
        form: init?.body instanceof FormData ? init.body : null,
      });
      return Response.json(body, { status });
    });
    return sent;
  }

  function upload(file: File, tier = "basic", origin = "http://localhost") {
    const form = new FormData();
    form.append("file", file);
    form.append("tier", tier);
    return new Request(url, { method: "POST", headers: { Origin: origin }, body: form });
  }

  const png = () => new File([new Uint8Array([1, 2, 3])], "zemin.png", { type: "image/png" });

  it("yabancı Origin'i backend'e gitmeden reddediyor", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("./backgrounds/route");

    const response = await POST(upload(png(), "basic", "https://kotu.test"));

    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("aynı Origin'i GEÇİRİYOR ve dosyayı backend'e iletiyor", async () => {
    const sent = captureUpload();
    const { POST } = await import("./backgrounds/route");

    const response = await POST(upload(png()));

    expect(response.status).toBe(201);
    expect(sent[0].url).toContain("/api/admin/backgrounds");
    expect(sent[0].method).toBe("POST");
    expect((sent[0].form?.get("file") as File).name).toBe("zemin.png");
  });

  it("gövdeyi yeniden kuruyor: fazladan alan backend'e gitmiyor", async () => {
    const sent = captureUpload();
    const form = new FormData();
    form.append("file", png());
    form.append("tier", "full");
    form.append("is_active", "false");
    const { POST } = await import("./backgrounds/route");

    await POST(new Request(url, { method: "POST", headers: { Origin: "http://localhost" }, body: form }));

    expect(sent[0].form?.get("tier")).toBe("full");
    expect(sent[0].form?.get("is_active")).toBeNull();
  });

  it("bilinmeyen paket seviyesini reddediyor", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("./backgrounds/route");

    const response = await POST(upload(png(), "premium"));

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("desteklenmeyen türü backend'e gitmeden reddediyor", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("./backgrounds/route");

    const response = await POST(upload(new File(["x"], "not.txt", { type: "text/plain" })));

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Windows'ta boş content-type gelen .heic'i uzantıdan düzeltiyor", async () => {
    const sent = captureUpload();
    const { POST } = await import("./backgrounds/route");

    await POST(upload(new File([new Uint8Array([1])], "foto.heic", { type: "" })));

    expect((sent[0].form?.get("file") as File).type).toBe("image/heic");
  });

  it("listede backend'in hatasını olduğu gibi iletiyor", async () => {
    captureBackend(403, { detail: "Bu işlem için yönetici yetkisi gerekiyor." });
    const { GET } = await import("./backgrounds/route");

    const response = await GET();

    expect(response.status).toBe(403);
  });
});

describe("/api/admin/backgrounds/[id] (paket, yayın durumu, silme)", () => {
  const BG = "1f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6c";
  const url = `http://localhost/api/admin/backgrounds/${BG}`;

  it("yabancı Origin'i backend'e gitmeden reddediyor (hem PATCH hem DELETE)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { PATCH, DELETE } = await import("./backgrounds/[id]/route");

    const patched = await PATCH(json(url, "PATCH", { tier: "full" }, "https://kotu.test"), context(BG));
    const deleted = await DELETE(
      new Request(url, { method: "DELETE", headers: { Origin: "https://kotu.test" } }),
      context(BG),
    );

    expect(patched.status).toBe(403);
    expect(deleted.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("aynı Origin'i GEÇİRİYOR ve alan adlarını backend sözleşmesine çeviriyor", async () => {
    const sent = captureBackend(200, { id: BG, tier: "full", is_active: false });
    const { PATCH } = await import("./backgrounds/[id]/route");

    const response = await PATCH(json(url, "PATCH", { tier: "full", isActive: false }), context(BG));

    expect(response.status).toBe(200);
    expect(sent[0].method).toBe("PATCH");
    expect(sent[0].body).toEqual({ tier: "full", is_active: false });
  });

  it("gövdeyi yeniden kuruyor: bilinmeyen alan backend'e gitmiyor", async () => {
    const sent = captureBackend(200, { id: BG, tier: "basic", is_active: true });
    const { PATCH } = await import("./backgrounds/[id]/route");

    await PATCH(json(url, "PATCH", { isActive: true, r2_key: "backgrounds/baska.jpg" }), context(BG));

    expect(sent[0].body).toEqual({ is_active: true });
  });

  it("boş gövdeyi ve geçersiz değerleri backend'e gitmeden reddediyor", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { PATCH } = await import("./backgrounds/[id]/route");

    expect((await PATCH(json(url, "PATCH", {}), context(BG))).status).toBe(400);
    expect((await PATCH(json(url, "PATCH", { tier: "premium" }), context(BG))).status).toBe(400);
    expect((await PATCH(json(url, "PATCH", { isActive: "evet" }), context(BG))).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("UUID olmayan kimliği backend'e gitmeden 404 yapıyor", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { DELETE } = await import("./backgrounds/[id]/route");

    const response = await DELETE(
      new Request("http://localhost/api/admin/backgrounds/..%2Fusers", {
        method: "DELETE",
        headers: { Origin: "http://localhost" },
      }),
      context("../users"),
    );

    expect(response.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("silmeyi backend'e iletiyor", async () => {
    const sent = captureBackend(200, { id: BG });
    const { DELETE } = await import("./backgrounds/[id]/route");

    const response = await DELETE(
      new Request(url, { method: "DELETE", headers: { Origin: "http://localhost" } }),
      context(BG),
    );

    expect(response.status).toBe(200);
    expect(sent[0].method).toBe("DELETE");
    expect(sent[0].url).toContain(`/api/admin/backgrounds/${BG}`);
  });
});
