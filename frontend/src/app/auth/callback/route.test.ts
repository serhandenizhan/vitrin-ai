import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { RECOVERY_COOKIE } from "@/lib/password-recovery";

/**
 * E-posta baglantisi donusu. Supabase istemcisi taklit ediliyor; burada
 * yonlendirme adresi ve sifirlama cerezi sinaniyor.
 */
const supabase = vi.hoisted(() => ({ error: null as { message: string } | null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: async () => ({ error: supabase.error }),
      verifyOtp: async () => ({ error: supabase.error }),
    },
  }),
}));

async function callback(query: string) {
  const { GET } = await import("./route");
  return GET(new NextRequest(`http://localhost:3000/auth/callback?${query}`));
}

beforeEach(() => {
  supabase.error = null;
});

describe("GET /auth/callback", () => {
  it("sifirlama baglantisi basariliysa yeni parola sayfasina httpOnly cerezle gider", async () => {
    const response = await callback("code=abc&next=%2Fauth%2Fyeni-parola");

    expect(response.headers.get("location")).toBe("http://localhost:3000/auth/yeni-parola");
    const cookie = response.cookies.get(RECOVERY_COOKIE);
    expect(cookie?.value).toBe("1");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.maxAge).toBeGreaterThan(0);
  });

  it("kayit dogrulamasinda sifirlama cerezi yazilmaz", async () => {
    const response = await callback("code=abc&next=%2F%3Fhosgeldiniz");

    expect(response.headers.get("location")).toBe("http://localhost:3000/?hosgeldiniz");
    expect(response.cookies.get(RECOVERY_COOKIE)).toBeUndefined();
  });

  it("gecersiz baglantida cerez yazilmaz ve hata sayfasina gider", async () => {
    supabase.error = { message: "expired" };

    const response = await callback("code=abc&next=%2Fauth%2Fyeni-parola");

    expect(response.headers.get("location")).toBe("http://localhost:3000/auth/hata");
    expect(response.cookies.get(RECOVERY_COOKIE)).toBeUndefined();
  });

  it("baska siteye yonlendirmez", async () => {
    const response = await callback("code=abc&next=%2F%2Fsahte-site.com");

    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });
});
