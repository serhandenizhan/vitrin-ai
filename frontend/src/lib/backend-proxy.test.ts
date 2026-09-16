import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/access-token", () => ({
  getAccessToken: async () => "gecerli-token",
}));

import { callBackend, foreignOrigin } from "./backend-proxy";

afterEach(() => vi.unstubAllGlobals());

function upstreamError(checkoutUrl: string): Response {
  return Response.json(
    {
      detail: {
        code: "checkout_pending",
        message: "Devam eden satın alma işlemi var.",
        checkout_url: checkoutUrl,
      },
    },
    { status: 409 },
  );
}

it("devam eden satın almanın adresini arayüze geçirir", async () => {
  // Hata metni tek başına kullanıcıyı devam eden işleme götüremez; adres gerekir.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => upstreamError("/odeme/11111111-1111-1111-1111-111111111111")),
  );
  const call = await callBackend("/api/subscriptions/checkout", {
    fallbackError: "olmadi",
  });
  expect(call.ok).toBe(false);
  expect(await call.response.json()).toMatchObject({
    code: "checkout_pending",
    checkout_url: "/odeme/11111111-1111-1111-1111-111111111111",
  });
});

it("yabancı bir adresi geçirmez (açık yönlendirme koruması)", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => upstreamError("https://kotu.test/phishing")));
  const call = await callBackend("/api/subscriptions/checkout", {
    fallbackError: "olmadi",
  });
  expect(await call.response.json()).not.toHaveProperty("checkout_url");
});

it("aynı origin'i geçirir, yabancı origin'i reddeder", () => {
  const same = new Request("https://vitrin.test/api/account", {
    method: "DELETE",
    headers: { Origin: "https://vitrin.test" },
  });
  const foreign = new Request("https://vitrin.test/api/account", {
    method: "DELETE",
    headers: { Origin: "https://kotu.test" },
  });
  const none = new Request("https://vitrin.test/api/account", { method: "DELETE" });
  expect(foreignOrigin(same)).toBeNull();
  expect(foreignOrigin(none)).toBeNull();
  expect(foreignOrigin(foreign)?.status).toBe(403);
});

it("retry_safe bayrağını arayüze geçirir, uydurmaz", async () => {
  // İstemci idempotency anahtarını yalnız bu bayrakla yeniliyor; bayrağın
  // kaynağı backend olmalı, vekilin yorumu değil.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { detail: { code: "quota_exceeded", message: "Kredi tükendi.", retry_safe: true } },
        { status: 402 },
      ),
    ),
  );
  const safe = await callBackend("/api/remove-background", { fallbackError: "olmadi" });
  expect(await safe.response.json()).toMatchObject({ retry_safe: true });

  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { detail: { code: "request_in_progress", message: "Sürüyor." } },
        { status: 409 },
      ),
    ),
  );
  const unsafe = await callBackend("/api/remove-background", { fallbackError: "olmadi" });
  expect(await unsafe.response.json()).not.toHaveProperty("retry_safe");
});
