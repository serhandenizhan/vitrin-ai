import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("production yayinini eksik yasal kimlikle durdurur", async () => {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_DATA_CONTROLLER_NAME", "");
  vi.stubEnv("NEXT_PUBLIC_LEGAL_CONTACT_EMAIL", "");
  vi.stubEnv("NEXT_PUBLIC_LEGAL_ADDRESS", "");
  vi.stubEnv("NEXT_PUBLIC_LEGAL_PHONE", "");
  vi.stubEnv("NEXT_PUBLIC_LEGAL_REGISTRY_NUMBER", "");

  await expect(import("@/lib/legal-config")).rejects.toThrow(
    "NEXT_PUBLIC_DATA_CONTROLLER_NAME",
  );
});

it("gosterilen ve kaydedilen yasal surum ayni kaynaktan gelir", async () => {
  const [{ LEGAL_DOCUMENT_VERSION }, { TERMS_VERSION }] = await Promise.all([
    import("@/lib/legal-config"),
    import("@/lib/profile"),
  ]);

  expect(TERMS_VERSION).toBe(LEGAL_DOCUMENT_VERSION);
});
