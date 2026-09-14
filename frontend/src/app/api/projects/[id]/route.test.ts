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
