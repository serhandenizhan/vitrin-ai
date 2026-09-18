import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/access-token", () => ({
  getAccessToken: async () => "gecerli-token",
}));

const ID = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";
const USER_ID = "8f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6d";

function request(): Request {
  return new Request("http://localhost", {
    method: "DELETE",
    headers: { "X-Expected-User-Id": USER_ID },
  });
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DELETE /api/projects/[id]", () => {
  it("UUID olmayan kimligi backend'e HIC gondermiyor", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { DELETE } = await import("./route");

    const response = await DELETE(request(), context("../admin"));

    expect(response.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("gecerli kimligi token ile backend'e iletiyor", async () => {
    let url = "";
    let method = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      url = String(input);
      method = init?.method ?? "";
      return new Response(null, { status: 204 });
    });
    const { DELETE } = await import("./route");

    const response = await DELETE(request(), context(ID));

    expect(response.status).toBe(204);
    expect(url).toMatch(new RegExp(`/api/projects/${ID}$`));
    expect(method).toBe("DELETE");
    expect(new Headers((vi.mocked(fetch).mock.calls[0]?.[1])?.headers).get("X-Expected-User-Id")).toBe(USER_ID);
  });

  it("baskasinin kaydinda backend'in 404'unu aktariyor", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ detail: "Proje bulunamadı." }, { status: 404 }),
    );
    const { DELETE } = await import("./route");

    const response = await DELETE(request(), context(ID));

    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/projects/[id] — yeniden adlandırma (18.09.2026)", () => {
  function patch(fields: Record<string, string>): Request {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    return new Request("http://localhost", {
      method: "PATCH",
      body: form,
      headers: { "X-Expected-User-Id": USER_ID },
    });
  }

  const backendProject = {
    id: ID,
    file_name: "Altın yüzük",
    created_at: "2026-09-18T10:00:00Z",
    is_mocked: false,
    duration_seconds: null,
    workflow_status: "completed",
    downloaded_at: "2026-09-18T10:05:00Z",
    editor_state: null,
    result_url: "https://signed.example/r",
    thumbnail_url: "https://signed.example/t",
    expires_in: 3600,
  };

  it("yalnız adı iletiyor; durumu göndermiyor", async () => {
    let sent: FormData | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      sent = init?.body as FormData;
      return Response.json(backendProject);
    });
    const { PATCH } = await import("./route");

    const response = await PATCH(patch({ fileName: "Altın yüzük" }), context(ID));

    expect(response.status).toBe(200);
    expect(sent!.get("file_name")).toBe("Altın yüzük");
    // Ad degistirmek calismayi "Yarım kalan"a dusurmemeli.
    expect(sent!.has("workflow_status")).toBe(false);
  });

  it("değiştirilecek alan yoksa backend'e gitmiyor", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { PATCH } = await import("./route");

    const response = await PATCH(patch({}), context(ID));

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
