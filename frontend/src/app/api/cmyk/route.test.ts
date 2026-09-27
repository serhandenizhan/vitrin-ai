import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ callBackend: vi.fn() }));
// `foreignOrigin`/`authRequired`/`jsonError` GERÇEK; yalnız backend çağrısı taklit.
vi.mock("@/lib/backend-proxy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/backend-proxy")>()),
  callBackend: mocks.callBackend,
}));

import { POST } from "@/app/api/cmyk/route";
import { authRequired, jsonError } from "@/lib/backend-proxy";
import {
  MAX_FILE_BYTES,
  MAX_INPUT_PIXELS,
  exceedsInputPixelLimit,
} from "@/lib/cmyk-limits";

function permitted() {
  mocks.callBackend.mockResolvedValue({ ok: true, response: new Response(null, { status: 204 }) });
}

beforeEach(permitted);
afterEach(() => vi.clearAllMocks());

/** Gövdesi okunursa bunu kaydeden bir istek. */
function trackedRequest(init: RequestInit = {}) {
  const state = { bodyRead: false };
  // highWaterMark 0: akış kendiliğinden veri çekmez, `pull` yalnız biri
  // gövdeyi OKUDUĞUNDA çağrılır (varsayılan 1, oluşturulur oluşturulmaz çeker).
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        state.bodyRead = true;
        controller.enqueue(new Uint8Array(16));
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request("http://localhost/api/cmyk", {
    method: "POST",
    body,
    duplex: "half",
    ...init,
  } as RequestInit);
  return { request, state };
}

describe("POST /api/cmyk — oturum ve hız sınırı (/cso incelemesi)", () => {
  it("oturumsuz isteği gövdeyi OKUMADAN 401 ile reddeder", async () => {
    mocks.callBackend.mockResolvedValue({ ok: false, response: authRequired() });
    const { request, state } = trackedRequest();

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("auth_required");
    expect(state.bodyRead).toBe(false);
    expect(mocks.callBackend).toHaveBeenCalledWith(
      "/api/cmyk/permit",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sınırı aşan kullanıcıya 429 ve Retry-After'ı aynen iletir, gövdeyi okumaz", async () => {
    const limited = jsonError("Çok fazla baskı dosyası isteği. Biraz bekleyin.", 429, "rate_limited");
    limited.headers.set("Retry-After", "120");
    mocks.callBackend.mockResolvedValue({ ok: false, response: limited });
    const { request, state } = trackedRequest();

    const response = await POST(request);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(state.bodyRead).toBe(false);
  });

  it("başka bir siteden gelen isteği backend'e hiç sormadan 403 ile reddeder", async () => {
    const { request, state } = trackedRequest({ headers: { Origin: "https://baska-site.test" } });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mocks.callBackend).not.toHaveBeenCalled();
    expect(state.bodyRead).toBe(false);
  });

  it("izin verilince dönüşüm akışına devam eder (kabul yolu)", async () => {
    const response = await POST(new Request("http://localhost/api/cmyk", { method: "POST" }));
    // Profil ayarlı değil: izin alındı, sıradaki kontrol çalıştı.
    expect(response.status).toBe(503);
    expect(mocks.callBackend).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/cmyk — biçim kontrolü", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("prototip anahtarlarını (\"constructor\") biçim olarak kabul etmez", async () => {
    // Profil yolu yalnız "dosya okunabiliyor mu" diye denetleniyor; biçim
    // kontrolüne ulaşmak için okunabilir herhangi bir dosya yeterli.
    vi.stubEnv("CMYK_ICC_PATH", `${process.cwd()}/package.json`);
    vi.resetModules();
    const { POST: freshPost } = await import("@/app/api/cmyk/route");
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const form = new FormData();
    form.append("file", new File([png], "sahne.png", { type: "image/png" }));
    form.append("format", "constructor");

    const response = await freshPost(
      new Request("http://localhost/api/cmyk", { method: "POST", body: form }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Desteklenmeyen biçim.");
  });
});

describe("POST /api/cmyk", () => {
  it("rejects an oversized request before parsing multipart data", async () => {
    const response = await POST(
      new Request("http://localhost/api/cmyk", {
        method: "POST",
        headers: { "content-length": String(MAX_FILE_BYTES + 1) },
      }),
    );

    expect(response.status).toBe(413);
  });

  it("returns 503 when no print profile is configured", async () => {
    const response = await POST(
      new Request("http://localhost/api/cmyk", { method: "POST" }),
    );

    expect(response.status).toBe(503);
  });

  it("rejects an oversized chunked request before parsing multipart data", async () => {
    const chunk = new Uint8Array(MAX_FILE_BYTES + 1);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const response = await POST(
      new Request("http://localhost/api/cmyk", {
        method: "POST",
        body,
        duplex: "half",
      } as RequestInit),
    );

    expect(response.status).toBe(413);
  });

  it("rejects images whose dimensions exceed the main upload pixel limit", () => {
    expect(exceedsInputPixelLimit(8_000, 5_001)).toBe(true);
    expect(exceedsInputPixelLimit(8_000, 5_000)).toBe(false);
    expect(exceedsInputPixelLimit(MAX_INPUT_PIXELS, 1)).toBe(false);
  });
});
