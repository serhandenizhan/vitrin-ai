// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

describe("Yönetici yetkisi verme/kaldırma", () => {
  const baseDetail = {
    account: { id: USER_ID, email: "musteri@vitrin.example", created_at: null, last_sign_in_at: null, email_confirmed_at: null },
    billing: {
      status: "active", access_until: null, deletion_requested_at: null, used_this_period: 1,
      quota_snapshot: 10, period_ends_at: null, plan_id: "free", background_tier: "basic",
      bonus_available: 0, project_count: 0, last_usage_at: null, is_admin: false,
    },
    periods: [], credit_grants: [], transactions: [], consents: [], recent_usage: [], open_actions: [],
  };

  it("e-posta birebir yazılana kadar 'Yönetici yap' kapalı, doğru yazınca POST gidiyor", async () => {
    const calls = mockFetch((url) =>
      url.endsWith("/admin") ? Response.json({ is_admin: true }, { status: 201 }) : Response.json(baseDetail),
    );
    render(createElement(AdminUserDetail, { userId: USER_ID, onBack: () => {} }));
    await screen.findByText("musteri@vitrin.example");

    fireEvent.click(screen.getByRole("button", { name: "Yönetici yap" }));
    const button = () => screen.getByRole("button", { name: "Yönetici yap" }) as HTMLButtonElement;
    expect(button().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Yönetici yapmak için kullanıcının e-posta adresi"), {
      target: { value: "musteri@vitrin.example" },
    });
    expect(button().disabled).toBe(false);
    fireEvent.click(button());

    await waitFor(() => expect(calls.some((call) => call.init?.method === "POST" && call.url.endsWith("/admin"))).toBe(true));
  });

  it("yöneticide 'Yöneticiliği kaldır' gösteriliyor ve DELETE gidiyor", async () => {
    const calls = mockFetch((url) =>
      url.endsWith("/admin")
        ? Response.json({ is_admin: false })
        : Response.json({ ...baseDetail, billing: { ...baseDetail.billing, is_admin: true } }),
    );
    render(createElement(AdminUserDetail, { userId: USER_ID, onBack: () => {} }));
    await screen.findByText("musteri@vitrin.example");

    fireEvent.click(screen.getByRole("button", { name: "Yöneticiliği kaldır" }));
    fireEvent.change(screen.getByLabelText("Yetkiyi kaldırmak için kullanıcının e-posta adresi"), {
      target: { value: "musteri@vitrin.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kaldır" }));

    await waitFor(() => expect(calls.some((call) => call.init?.method === "DELETE" && call.url.endsWith("/admin"))).toBe(true));
  });

  it("backend reddederse (ör. son yönetici) hata gösteriliyor, form açık kalıyor", async () => {
    mockFetch((url) =>
      url.endsWith("/admin")
        ? Response.json({ error: "Son yönetici yetkisi kaldırılamaz; önce başka bir yönetici ekleyin." }, { status: 409 })
        : Response.json({ ...baseDetail, billing: { ...baseDetail.billing, is_admin: true } }),
    );
    render(createElement(AdminUserDetail, { userId: USER_ID, onBack: () => {} }));
    await screen.findByText("musteri@vitrin.example");

    fireEvent.click(screen.getByRole("button", { name: "Yöneticiliği kaldır" }));
    fireEvent.change(screen.getByLabelText("Yetkiyi kaldırmak için kullanıcının e-posta adresi"), {
      target: { value: "musteri@vitrin.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kaldır" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Son yönetici yetkisi kaldırılamaz; önce başka bir yönetici ekleyin.",
    );
  });
});

describe("Zeminler sekmesi (Faz 6, Kaan)", () => {
  const background = (over: Record<string, unknown> = {}) => ({
    id: "1f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6c",
    tier: "basic",
    is_active: true,
    created_at: "2026-09-18T10:00:00Z",
    url: "https://signed.example/bg.jpg",
    thumbnail_url: "https://signed.example/thumb.jpg",
    expires_in: 900,
    ...over,
  });

  /** Panele yonetici olarak girip Zeminler sekmesini acar. */
  async function openTab(handler: Handler) {
    const calls = mockFetch((url, init) =>
      url === "/api/admin/me"
        ? Response.json({ is_admin: true })
        : url.startsWith("/api/admin/stats")
          ? Response.json(stats)
          : handler(url, init),
    );
    render(createElement(AdminPanel));
    fireEvent.click(await screen.findByRole("tab", { name: /Zeminler/ }));
    return calls;
  }

  it("pasif zemini de listeliyor ve sayıyor (panelin kullanıcı listesinden farkı)", async () => {
    await openTab(() => Response.json([background(), background({ id: "2f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6c", is_active: false, tier: "full" })]));

    expect(await screen.findByText("1 yayında · 2 toplam")).toBeTruthy();
    expect(screen.getByText("Pasif")).toBeTruthy();
    // Her kartta paket secici var; "full" olan zeminde o dugme basili olmali.
    const cards = within(screen.getByRole("list")).getAllByRole("button", { name: "Tüm paketler" });
    expect(cards.map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  });

  it("liste alınamazsa hatayı gösteriyor, boş kütüphane gibi davranmıyor", async () => {
    await openTab(() => Response.json({ error: "Zeminler yüklenemedi." }, { status: 503 }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Zeminler yüklenemedi.");
    expect(screen.queryByText("Henüz zemin yok.")).toBeNull();
  });

  it("yükleme sonrası listeyi yeniliyor", async () => {
    let listed = 0;
    const calls = await openTab((url, init) => {
      if (init?.method === "POST") return Response.json({ id: "yeni" }, { status: 201 });
      listed += 1;
      return Response.json(listed === 1 ? [] : [background()]);
    });
    expect(await screen.findByText("Henüz zemin yok.")).toBeTruthy();

    const input = screen.getByLabelText("Zemin görseli") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "zemin.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    fireEvent.click(screen.getByRole("button", { name: "Yükle" }));

    expect(await screen.findByRole("status")).toHaveProperty("textContent", "zemin.png yüklendi.");
    await waitFor(() => expect(listed).toBe(2));
    expect(calls.some((call) => call.init?.method === "POST")).toBe(true);
  });

  it("desteklenmeyen dosya türünü sunucuya hiç göndermiyor", async () => {
    const calls = await openTab(() => Response.json([]));
    await screen.findByText("Henüz zemin yok.");

    const input = screen.getByLabelText("Zemin görseli") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [new File(["x"], "not.txt", { type: "text/plain" })],
    });
    fireEvent.change(input);
    fireEvent.click(screen.getByRole("button", { name: "Yükle" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Desteklenmeyen dosya türü. JPEG, PNG, WebP veya HEIC bir fotoğraf seçin.",
    );
    expect(calls.some((call) => call.init?.method === "POST")).toBe(false);
  });
});

describe("Günlük sekmesi (19.09.2026)", () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    id: 1,
    actor_id: "a1",
    actor_email: "admin@vitrin.example",
    action: "credit_grant",
    subject_type: "credit_grant",
    subject_id: "g1",
    detail: { amount: 3, reason: "telafi", user_id: "u1" },
    created_at: "2026-09-19T10:00:00Z",
    ...over,
  });

  async function openTab(handler: Handler) {
    const calls = mockFetch((url, init) =>
      url === "/api/admin/me"
        ? Response.json({ is_admin: true })
        : url.startsWith("/api/admin/stats")
          ? Response.json(stats)
          : handler(url, init),
    );
    render(createElement(AdminPanel));
    fireEvent.click(await screen.findByRole("tab", { name: /Günlük/ }));
    return calls;
  }

  it("kaydı okunur bir cümle olarak gösteriyor (kim · ne · neye · not)", async () => {
    await openTab(() =>
      Response.json({
        items: [
          entry(),
          entry({
            id: 2,
            action: "background_update",
            subject_type: "background",
            subject_id: "cd65c3ac-1250-4c31-a383-471a3acb82e1",
            detail: { before: { is_active: true }, after: { is_active: false } },
          }),
          entry({ id: 3, actor_email: null, action: "admin_add", detail: { email: "yeni@vitrin.example" } }),
        ],
        page: 1,
        per_page: 50,
        has_more: false,
      }),
    );
    const list = await screen.findByRole("list", { name: "Günlük kayıtları" });
    const rows = within(list).getAllByRole("listitem").map((row) => row.textContent);
    expect(rows[0]).toContain("admin@vitrin.example bonus kredi verdi · 3 kredi");
    expect(rows[0]).toContain("Kimlik: a1");
    expect(rows[0]).toContain("telafi");
    expect(rows[1]).toContain("zemini güncelledi · Kömür");
    expect(rows[1]).toContain("Yayından kaldırıldı");
    expect(rows[2]).toContain("Silinmiş ya da okunamayan hesap yönetici yaptı · yeni@vitrin.example");
  });

  it("süzgeç eylemi isteğe ekliyor ve sayfayı başa alıyor", async () => {
    const calls = await openTab(() => Response.json({ items: [entry()], page: 1, per_page: 50, has_more: true }));
    await screen.findByRole("list", { name: "Günlük kayıtları" });
    fireEvent.click(screen.getByRole("button", { name: "Sonraki" }));
    await waitFor(() => expect(calls.some((call) => call.url.includes("page=2"))).toBe(true));

    fireEvent.click(within(screen.getByRole("group", { name: "Eylem türü" })).getByRole("button", { name: "Zemin silme" }));
    await waitFor(() =>
      expect(calls.at(-1)?.url).toBe("/api/admin/audit?page=1&action=background_delete"),
    );
  });

  it("Admin anahtarı: taraflarda AD yazar (e-posta değil), seçili taraf süzer, tekrar basınca kalkar", async () => {
    const SERHAN = "11111111-1111-4111-8111-111111111111";
    const KAAN = "22222222-2222-4222-8222-222222222222";
    const calls = await openTab(() =>
      Response.json({
        admins: [
          { id: SERHAN, name: "Serhan" },
          { id: KAAN, name: "Kaan" },
        ],
        items: [entry({ actor_email: "kaan@vitrin.example", actor_name: "Kaan" })],
        page: 1,
        per_page: 50,
        has_more: false,
      }),
    );
    const group = within(await screen.findByRole("group", { name: "Yöneticiye göre süz" }));
    expect(group.getAllByRole("button").map((button) => button.textContent)).toEqual(["Serhan· 11111111", "Kaan· 22222222"]);
    expect(group.queryByText(/@/)).toBeNull();

    fireEvent.click(group.getByRole("button", { name: /Kaan/ }));
    await waitFor(() => expect(calls.at(-1)?.url).toBe(`/api/admin/audit?page=1&actor=${KAAN}`));
    expect(group.getByRole("button", { name: /Kaan/ }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(group.getByRole("button", { name: /Kaan/ }));
    await waitFor(() => expect(calls.at(-1)?.url).toBe("/api/admin/audit?page=1"));
  });

  it("iki yönetici aynı adı kullansa bile kayıtların kalıcı kimlikleri görünür", async () => {
    const firstId = "11111111-1111-4111-8111-111111111111";
    const secondId = "22222222-2222-4222-8222-222222222222";
    await openTab(() => Response.json({
      admins: [{ id: firstId, name: "Kaan" }, { id: secondId, name: "Kaan" }],
      items: [
        entry({ id: 1, actor_id: firstId, actor_name: "Kaan" }),
        entry({ id: 2, actor_id: secondId, actor_name: "Kaan" }),
      ],
      page: 1,
      per_page: 50,
      has_more: false,
    }));
    const rows = within(await screen.findByRole("list", { name: "Günlük kayıtları" })).getAllByRole("listitem");
    expect(rows[0].textContent).toContain(`Kimlik: ${firstId}`);
    expect(rows[1].textContent).toContain(`Kimlik: ${secondId}`);
    const buttons = within(screen.getByRole("group", { name: "Yöneticiye göre süz" })).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["Kaan· 11111111", "Kaan· 22222222"]);
  });

  it("günlük alınamazsa hatayı gösteriyor, boş günlük gibi davranmıyor", async () => {
    await openTab(() => Response.json({ error: "Günlük yüklenemedi." }, { status: 503 }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Günlük yüklenemedi.");
    expect(screen.queryByText("Henüz kayıt yok.")).toBeNull();
  });
});

describe("Zeminler — kategori ve yayın süzgeçleri (19.09.2026)", () => {
  // Katalogdaki gercek kimlikler: "Kömür" (sade) ve "Yosun Dokusu" (doku).
  const SADE = "cd65c3ac-1250-4c31-a383-471a3acb82e1";
  const DOKU = "358d1dc7-6aeb-473f-99c4-fea332972aad";
  const row = (id: string, isActive: boolean) => ({
    id,
    tier: "basic",
    is_active: isActive,
    created_at: "2026-09-18T10:00:00Z",
    url: "https://signed.example/bg.jpg",
    thumbnail_url: "https://signed.example/thumb.jpg",
    expires_in: 900,
  });

  async function openTab() {
    mockFetch((url) =>
      url === "/api/admin/me"
        ? Response.json({ is_admin: true })
        : url.startsWith("/api/admin/stats")
          ? Response.json(stats)
          : Response.json([row(SADE, true), row(DOKU, false)]),
    );
    render(createElement(AdminPanel));
    fireEvent.click(await screen.findByRole("tab", { name: /Zeminler/ }));
    await screen.findByRole("list");
  }

  const names = () => within(screen.getByRole("list")).getAllByRole("listitem").map((item) => item.querySelector("p")?.textContent);

  it("kartlarda stüdyodaki ad ve kategori yazıyor", async () => {
    await openTab();
    expect(names()).toEqual(["Kömür", "Yosun Dokusu"]);
    expect(within(screen.getByRole("list")).getByText("Desen")).toBeTruthy();
  });

  it("kategori süzgeci yalnız o kategoriyi gösteriyor, Tümü geri getiriyor", async () => {
    await openTab();
    const group = within(screen.getByRole("group", { name: "Kategori" }));
    fireEvent.click(group.getByRole("button", { name: /Desen/ }));
    expect(names()).toEqual(["Yosun Dokusu"]);
    fireEvent.click(group.getByRole("button", { name: /Tümü/ }));
    expect(names()).toEqual(["Kömür", "Yosun Dokusu"]);
  });

  it("yayın süzgeci: Yayında / Yayında değil ayrı ayrı doğru zemini gösteriyor", async () => {
    await openTab();
    const group = within(screen.getByRole("group", { name: "Yayın durumu" }));
    fireEvent.click(group.getByRole("button", { name: /Yayında değil/ }));
    expect(names()).toEqual(["Yosun Dokusu"]);
    fireEvent.click(group.getByRole("button", { name: /^Yayında\s*\d/ }));
    expect(names()).toEqual(["Kömür"]);
  });

  it("iki süzgeç birlikte boş kalırsa boş kütüphane değil süzgeç mesajı çıkıyor", async () => {
    await openTab();
    fireEvent.click(within(screen.getByRole("group", { name: "Kategori" })).getByRole("button", { name: /Desen/ }));
    fireEvent.click(within(screen.getByRole("group", { name: "Yayın durumu" })).getByRole("button", { name: /^Yayında\s*\d/ }));
    expect(screen.getByText("Bu süzgeçte zemin yok.")).toBeTruthy();
    expect(screen.queryByText("Henüz zemin yok.")).toBeNull();
  });
});

describe("Zeminler — paket, yayın durumu ve silme (19.09.2026)", () => {
  const BG = "1f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6c";
  const row = (over: Record<string, unknown> = {}) => ({
    id: BG,
    tier: "basic",
    is_active: true,
    created_at: "2026-09-18T10:00:00Z",
    url: "https://signed.example/bg.jpg",
    thumbnail_url: "https://signed.example/thumb.jpg",
    expires_in: 900,
    ...over,
  });

  async function openTab(handler: Handler) {
    const calls = mockFetch((url, init) =>
      url === "/api/admin/me"
        ? Response.json({ is_admin: true })
        : url.startsWith("/api/admin/stats")
          ? Response.json(stats)
          : handler(url, init),
    );
    render(createElement(AdminPanel));
    fireEvent.click(await screen.findByRole("tab", { name: /Zeminler/ }));
    return calls;
  }

  /** Kart icindeki dugmeler (yukleme formundakilerle ayni adi tasiyor). */
  function card() {
    return within(screen.getByRole("list"));
  }

  it("paketi değiştirince SUNUCUNUN döndürdüğü değeri gösteriyor", async () => {
    const calls = await openTab((url, init) =>
      init?.method === "PATCH"
        ? Response.json({ id: BG, tier: "full", is_active: true })
        : Response.json([row()]),
    );
    await screen.findByRole("list");

    fireEvent.click(card().getByRole("button", { name: "Tüm paketler" }));

    await waitFor(() =>
      expect(card().getByRole("button", { name: "Tüm paketler" }).getAttribute("aria-pressed")).toBe("true"),
    );
    const patch = calls.find((call) => call.init?.method === "PATCH");
    expect(JSON.parse(String(patch?.init?.body))).toEqual({ tier: "full" });
  });

  it("pasife alınca kart 'Yayına al' diyor — silme İSTEĞİ GİTMİYOR", async () => {
    const calls = await openTab((url, init) =>
      init?.method === "PATCH"
        ? Response.json({ id: BG, tier: "basic", is_active: false })
        : Response.json([row()]),
    );
    await screen.findByRole("list");

    fireEvent.click(card().getByRole("switch"));

    expect(await card().findByRole("switch", { name: "Yayına al" })).toBeTruthy();
    expect(calls.some((call) => call.init?.method === "DELETE")).toBe(false);
  });

  it("silme İKİ ADIMLI: ilk tıklama onay sorar, istek gitmez", async () => {
    const calls = await openTab(() => Response.json([row()]));
    await screen.findByRole("list");

    fireEvent.click(card().getByRole("button", { name: "Zemini sil" }));

    expect(card().getByRole("button", { name: "Sil" })).toBeTruthy();
    expect(calls.some((call) => call.init?.method === "DELETE")).toBe(false);
  });

  it("onaydan sonra siliyor ve kartı listeden çıkarıyor", async () => {
    await openTab((url, init) =>
      init?.method === "DELETE" ? Response.json({ id: BG }) : Response.json([row()]),
    );
    await screen.findByRole("list");

    fireEvent.click(card().getByRole("button", { name: "Zemini sil" }));
    fireEvent.click(card().getByRole("button", { name: "Sil" }));

    await waitFor(() => expect(screen.queryByRole("list")).toBeNull());
    expect(screen.getByText("Henüz zemin yok.")).toBeTruthy();
  });

  it("sunucu reddederse kart LİSTEDE KALIR ve hata görünür", async () => {
    await openTab((url, init) =>
      init?.method === "DELETE"
        ? Response.json({ error: "Zemin silinemedi." }, { status: 502 })
        : Response.json([row()]),
    );
    await screen.findByRole("list");

    fireEvent.click(card().getByRole("button", { name: "Zemini sil" }));
    fireEvent.click(card().getByRole("button", { name: "Sil" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Zemin silinemedi.");
    expect(screen.getByRole("list")).toBeTruthy();
  });

  it("mutasyondan önce başlayan periyodik GET, yeni durumu geri alamıyor", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let listCalls = 0;
      let resolveRefresh!: (response: Response) => void;
      await openTab((url, init) => {
        if (init?.method === "PATCH") {
          return Response.json({ id: BG, tier: "basic", is_active: false });
        }
        listCalls += 1;
        if (listCalls === 1) return Response.json([row({ expires_in: 60 })]);
        return new Promise<Response>((resolve) => {
          resolveRefresh = resolve;
        });
      });
      await screen.findByRole("list");

      await vi.advanceTimersByTimeAsync(30_000);
      await vi.waitFor(() => expect(listCalls).toBe(2));
      fireEvent.click(card().getByRole("switch"));
      await vi.waitFor(() => expect(card().getByRole("switch", { name: "Yayına al" })).toBeTruthy());

      resolveRefresh(Response.json([row()]));
      // adminFetch birden fazla mikro görev içeriyor (fetch + response.json());
      // tek bir Promise.resolve() bunları hepsini boşaltmadığı için eskiden bu
      // doğrulama, düzeltme olmadan da (yanlışlıkla) yeşil geçiyordu.
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
      expect(card().getByRole("switch", { name: "Yayına al" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
