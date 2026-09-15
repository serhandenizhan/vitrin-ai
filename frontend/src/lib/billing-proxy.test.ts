import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ callBackend: vi.fn() }));
// `foreignOrigin`/`jsonError` GERÇEK olanlar: kaynak kontrolü paylaşılan bir
// yardımcıya taşındı, testin doğruladığı şey de o yardımcının kendisi.
vi.mock("@/lib/backend-proxy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/backend-proxy")>()),
  callBackend: mocks.callBackend,
}));
import { billingProxy } from "./billing-proxy";
afterEach(() => vi.clearAllMocks());
it("başka origin'den ödeme mutasyonunu backend'e göndermez", async () => {
  const response = await billingProxy("/api/subscriptions/checkout", new Request("https://vitrin.test/api/subscriptions/checkout", { method: "POST", headers: { Origin: "https://other.test" }, body: "{}" }));
  expect(response.status).toBe(403); expect(mocks.callBackend).not.toHaveBeenCalled();
});
it("iptal bekleme durumunu ve no-store başlığını korur", async () => {
  mocks.callBackend.mockResolvedValue({ ok: true, response: Response.json({ status: "pending" }, { status: 202 }) });
  const response = await billingProxy("/api/subscriptions/cancel", new Request("https://vitrin.test/api/subscriptions/cancel", { method: "POST", body: JSON.stringify({ idempotency_key: "key" }) }));
  expect(response.status).toBe(202); expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ status: "pending" });
});
