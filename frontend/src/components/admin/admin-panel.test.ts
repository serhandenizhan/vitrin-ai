// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workspace = vi.hoisted(() => ({
  user: { id: "u-admin" } as { id: string } | null,
  openSignIn: vi.fn(),
}));
vi.mock("@/components/workspace-provider", () => ({ useWorkspace: () => workspace }));

import { AdminPanel } from "@/components/admin/admin-panel";
import { AdminUserDetail } from "@/components/admin/admin-user-detail";

const USER_ID = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function mockFetch(handler: Handler) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return handler(String(input), init);
    }),
  );
  return calls;
}

const stats = {
  days: 30,
  usage: { today: 3, last_7_days: 10, last_30_days: 40, all_time: 120 },
  reservations: { consumed: 38, released: 2, pending: 0 },
  subscriptions_by_status: [{ status: "active", count: 2 }],
  active_periods_by_plan: [],
  revenue: [],
  credit_grants: { granted: 0, used: 0, outstanding: 0 },
  daily_usage: [{ day: "2026-09-18", count: 3 }],
  daily_signups: [{ day: "2026-09-18", count: 1 }],
  operations: { open_alerts: 0, open_actions: 0, open_storage_jobs: 0 },
};

beforeEach(() => {
  workspace.user = { id: "u-admin" };
  workspace.openSignIn.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminPanel — yetki ekranları (yalnız gösterim; yetki backend'de)", () => {
  it("giriş yoksa giriş çağrısı gösteriyor ve hiçbir admin isteği atmıyor", () => {
    workspace.user = null;
    const calls = mockFetch(() => Response.json({}));
    render(createElement(AdminPanel));

    fireEvent.click(screen.getByRole("button", { name: "Giriş yap" }));
    expect(workspace.openSignIn).toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("yönetici değilse erişim yok diyor ve veri istemiyor", async () => {
    const calls = mockFetch(() => Response.json({ is_admin: false }));
    render(createElement(AdminPanel));

    expect(await screen.findByText("Bu sayfaya erişiminiz yok")).toBeTruthy();
    expect(calls.map((call) => call.url)).toEqual(["/api/admin/me"]);
  });

  it("yöneticiye genel bakışı açıyor", async () => {
    mockFetch((url) => (url === "/api/admin/me" ? Response.json({ is_admin: true }) : Response.json(stats)));
    render(createElement(AdminPanel));

    // Baslik hem gorunen `figcaption`da hem ekran okuyucu tablosunda; grafik
    // figure'in erisilebilir adiyla bulunuyor.
    expect(await screen.findByRole("figure", { name: /Günlük kesim/ })).toBeTruthy();
    expect(screen.getByText("Toplam kesim")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Kullanıcılar/ })).toBeTruthy();
  });

  it("kullanıcı aramasının etiketi 'E-posta ile ara' (ad araması yok)", async () => {
    mockFetch((url) =>
      url === "/api/admin/me"
        ? Response.json({ is_admin: true })
        : url.startsWith("/api/admin/stats")
          ? Response.json(stats)
          : Response.json({ users: [], page: 1, per_page: 25 }),
    );
    render(createElement(AdminPanel));
    fireEvent.click(await screen.findByRole("tab", { name: /Kullanıcılar/ }));

    expect(await screen.findByLabelText("E-posta ile ara")).toBeTruthy();
  });
});

describe("Bonus kredi formu — idempotency anahtarı İŞİ tanımlar", () => {
  const detail = {
    account: { id: USER_ID, email: "musteri@vitrin.example", created_at: null, last_sign_in_at: null, email_confirmed_at: null },
    billing: {
      status: "active", access_until: null, deletion_requested_at: null, used_this_period: 1,
      quota_snapshot: 10, period_ends_at: null, plan_id: "free", background_tier: "basic",
      bonus_available: 0, project_count: 0, last_usage_at: null, is_admin: false,
    },
    periods: [], credit_grants: [], transactions: [], consents: [], recent_usage: [], open_actions: [],
  };

  function fillAndSubmit() {
    fireEvent.change(screen.getByLabelText("Kredi"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Gerekçe"), { target: { value: "Kesinti telafisi" } });
    fireEvent.click(screen.getByRole("button", { name: "Kredi ver" }));
  }

  function sentKeys(calls: { url: string; init?: RequestInit }[]) {
    return calls
      .filter((call) => call.url.endsWith("/credits"))
      .map((call) => (JSON.parse(String(call.init?.body)) as { idempotencyKey: string }).idempotencyKey);
  }

  it("hata sonrası tekrar denemede AYNI anahtarı, başarı sonrası YENİ anahtarı gönderiyor", async () => {
    let creditAttempts = 0;
    const calls = mockFetch((url) => {
      if (url.endsWith("/credits")) {
        creditAttempts += 1;
        return creditAttempts === 1
          ? Response.json({ error: "Bağlantı koptu." }, { status: 503 })
          : Response.json({ id: `g${creditAttempts}` }, { status: 201 });
      }
      return Response.json(detail);
    });
    render(createElement(AdminUserDetail, { userId: USER_ID, onBack: () => {} }));
    await screen.findByText("musteri@vitrin.example");

    fillAndSubmit();
    expect(await screen.findByRole("alert")).toBeTruthy();
    // Ayni is tekrar deneniyor: form alanlari yerinde, anahtar AYNI.
    fireEvent.click(screen.getByRole("button", { name: "Kredi ver" }));
    await screen.findByText("5 bonus kredi verildi.");
    // Basari: yeni is icin YENI anahtar.
    fillAndSubmit();
    await waitFor(() => expect(sentKeys(calls)).toHaveLength(3));

    const [first, retry, next] = sentKeys(calls);
    expect(retry).toBe(first);
    expect(next).not.toBe(first);
  });

  it("geçersiz miktarı backend'e göndermiyor", async () => {
    const calls = mockFetch(() => Response.json(detail));
    render(createElement(AdminUserDetail, { userId: USER_ID, onBack: () => {} }));
    await screen.findByText("musteri@vitrin.example");

    fireEvent.change(screen.getByLabelText("Kredi"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Gerekçe"), { target: { value: "Kesinti telafisi" } });
    // Tarayicinin kendi dogrulamasi (`min=1`) dugmeyle gonderimi zaten
    // durduruyor; form DOGRUDAN gonderilerek ikinci katman (JS) sinaniyor.
    fireEvent.submit(screen.getByRole("button", { name: "Kredi ver" }).closest("form")!);

    expect(screen.getByRole("alert").textContent).toMatch(/1-10\.000/);
    expect(sentKeys(calls)).toHaveLength(0);
  });

  it("hesap silme düğmesi e-posta birebir yazılana kadar kapalı", async () => {
    mockFetch(() => Response.json(detail));
    render(createElement(AdminUserDetail, { userId: USER_ID, onBack: () => {} }));
    await screen.findByText("musteri@vitrin.example");
    const button = () => screen.getByRole("button", { name: "Hesabı sil" }) as HTMLButtonElement;

    expect(button().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Kullanıcının e-posta adresi"), { target: { value: "musteri@vitrin" } });
    expect(button().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Kullanıcının e-posta adresi"), { target: { value: "musteri@vitrin.example" } });
    expect(button().disabled).toBe(false);
  });

  it("yönetici hesabında silme formu hiç sunulmuyor", async () => {
    mockFetch(() => Response.json({ ...detail, billing: { ...detail.billing, is_admin: true } }));
    render(createElement(AdminUserDetail, { userId: USER_ID, onBack: () => {} }));
    await screen.findByText("musteri@vitrin.example");

    expect(screen.queryByRole("button", { name: "Hesabı sil" })).toBeNull();
    expect(screen.getByText(/Yönetici hesapları panelden silinemez/)).toBeTruthy();
  });
});
