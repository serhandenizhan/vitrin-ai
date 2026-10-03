import { expect, test, type Page } from "@playwright/test";

import { json, sahteOturumAc, vekilleriTaklitEt } from "./oturum";

// Yönetim paneli: yetki ekranı, kullanıcı listesi → ayrıntı → bonus kredi
// (Faz 7 kapanışı, açık takip 12 madde 3; 03.10.2026, Kaan). Kuyruk kartı
// ayrıca `admin-kuyruk.spec.ts`'te.
//
// TAKLİT BİÇİMİ (ders 22): admin vekilleri başarılı yanıtı `relayJson` ile
// backend gövdesinden AYNEN geçirir; gövdeler `routes/admin.py`'deki
// `list_users`, `get_user` (ENRICHMENT_SQL sütunları), `grant_credits`
// (RETURNING) dönüşlerinden alındı. Hatalar vekilde `{ error, code }` olur.
//
// SINIR: yetki burada DEĞİL backend'de (`require_admin`) sınanır; bu dosya
// arayüzün yöneticiye ve yönetici olmayana ne gösterdiğini sınar.

const KULLANICI = "22222222-2222-4222-8222-222222222222";
const DIGER = "33333333-3333-4333-8333-333333333333";

/** ENRICHMENT_SQL satırı. */
function fatura(ustune: Record<string, unknown> = {}) {
  return {
    user_id: KULLANICI,
    status: "active",
    access_until: null,
    deletion_requested_at: null,
    used_this_period: 3,
    quota_snapshot: 100,
    period_ends_at: "2026-10-30T00:00:00+00:00",
    plan_id: "atolye",
    background_tier: "full",
    bonus_available: 0,
    project_count: 4,
    last_usage_at: "2026-10-02T10:00:00+00:00",
    is_admin: false,
    ...ustune,
  };
}

const LISTE = {
  users: [
    { id: KULLANICI, email: "kuyumcu@example.com", created_at: "2026-09-20T08:00:00+00:00", last_sign_in_at: "2026-10-02T09:00:00+00:00", email_confirmed_at: "2026-09-20T08:05:00+00:00", billing: fatura() },
    { id: DIGER, email: "yonetici@example.com", created_at: "2026-09-01T08:00:00+00:00", last_sign_in_at: null, email_confirmed_at: "2026-09-01T08:05:00+00:00", billing: fatura({ user_id: DIGER, is_admin: true }) },
  ],
  page: 1,
  per_page: 25,
};

function ayrinti(bonus = 0) {
  return {
    account: { id: KULLANICI, email: "kuyumcu@example.com", created_at: "2026-09-20T08:00:00+00:00", last_sign_in_at: "2026-10-02T09:00:00+00:00", email_confirmed_at: "2026-09-20T08:05:00+00:00" },
    billing: fatura({ bonus_available: bonus }),
    periods: [],
    credit_grants: [],
    transactions: [],
    consents: [],
    recent_usage: [],
    open_actions: [],
  };
}

async function panelAc(page: Page) {
  await page.route("**/api/admin/me", (r) => r.fulfill(json({ is_admin: true })));
  // Genel bakış açılışta yüklenir; bu dosya onu sınamıyor, boş ama geçerli yanıt.
  await page.route("**/api/admin/stats**", (r) => r.fulfill(json({}, 503)));
  await page.route("**/api/admin/cutout-queue", (r) => r.fulfill(json({ status: "unavailable", stall_threshold_seconds: 120 })));
  await page.goto("/admin");
}

test.beforeEach(async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await sahteOturumAc(context);
  await vekilleriTaklitEt(page);
});

test("yönetici olmayan hesap paneli değil erişim uyarısını görür", async ({ page }) => {
  const adminIstekleri: string[] = [];
  page.on("request", (istek) => {
    const yol = new URL(istek.url()).pathname;
    if (yol.startsWith("/api/admin/") && yol !== "/api/admin/me") adminIstekleri.push(yol);
  });
  await page.route("**/api/admin/me", (r) => r.fulfill(json({ is_admin: false })));
  await page.goto("/admin");

  await expect(page.getByRole("heading", { name: "Bu sayfaya erişiminiz yok" })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Yönetim bölümleri" })).toHaveCount(0);
  // Panel verisi hiç istenmez (gösterim kontrolü; asıl ret backend'de).
  expect(adminIstekleri).toEqual([]);
});

test("kullanıcılar listelenir, e-postayla aranır ve ayrıntı açılır", async ({ page }) => {
  const sorgular: (string | null)[] = [];
  await page.route("**/api/admin/users?**", (r) => {
    sorgular.push(new URL(r.request().url()).searchParams.get("query"));
    return r.fulfill(json(LISTE));
  });
  await page.route(`**/api/admin/users/${KULLANICI}`, (r) => r.fulfill(json(ayrinti())));
  await panelAc(page);

  await page.getByRole("tab", { name: "Kullanıcılar" }).click();
  await expect(page.getByRole("button", { name: /kuyumcu@example\.com/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /yonetici@example\.com/ }).getByLabel("Yönetici")).toBeVisible();
  await expect(page.getByText("Kalan 97").first()).toBeVisible();

  await page.getByLabel("E-posta ile ara").fill("kuyumcu");
  await page.getByRole("button", { name: "Ara" }).click();
  await expect.poll(() => sorgular.at(-1)).toBe("kuyumcu");

  await page.getByRole("button", { name: /kuyumcu@example\.com/ }).click();
  await expect(page.getByRole("heading", { name: "Bonus kredi ver" })).toBeVisible();
  await expect(page.getByText("kuyumcu@example.com").first()).toBeVisible();
});

test("bonus kredi verilir; hata sonrası tekrar basışta AYNI işlem anahtarı gider (ikinci kredi açılmaz)", async ({ page }) => {
  await page.route("**/api/admin/users?**", (r) => r.fulfill(json(LISTE)));
  let bonus = 0;
  await page.route(`**/api/admin/users/${KULLANICI}`, (r) => r.fulfill(json(ayrinti(bonus))));
  const govdeler: Record<string, unknown>[] = [];
  await page.route(`**/api/admin/users/${KULLANICI}/credits`, (r) => {
    const govde = r.request().postDataJSON() as Record<string, unknown>;
    govdeler.push(govde);
    if (govdeler.length === 1) {
      // `limit_admin` fail-closed (limits.py); vekil `{ error, code }` yapar.
      return r.fulfill(json({ error: "Şu anda bu işlem yapılamıyor; birazdan tekrar deneyin.", code: "rate_limit_unavailable" }, 503));
    }
    bonus = 5;
    // `grant_credits` RETURNING (inserted alanı çıkarılmış).
    return r.fulfill(json({ id: "44444444-4444-4444-8444-444444444444", user_id: KULLANICI, amount: 5, used: 0, reason: govde.reason, expires_at: null, revoked_at: null, created_at: new Date().toISOString() }, 201));
  });
  await panelAc(page);
  await page.getByRole("tab", { name: "Kullanıcılar" }).click();
  await page.getByRole("button", { name: /kuyumcu@example\.com/ }).click();

  await page.getByLabel("Kredi", { exact: true }).fill("5");
  await page.getByLabel("Gerekçe").fill("Kesinti telafisi");
  await page.getByRole("button", { name: "Kredi ver" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Şu anda bu işlem yapılamıyor" })).toBeVisible();

  await page.getByRole("button", { name: "Kredi ver" }).click();
  await expect(page.getByRole("status").filter({ hasText: "5 bonus kredi verildi." })).toBeVisible();

  expect(govdeler).toHaveLength(2);
  expect(govdeler[0]).toMatchObject({ amount: 5, reason: "Kesinti telafisi" });
  expect(typeof govdeler[0].idempotencyKey).toBe("string");
  // Anahtar İŞİ tanımlar (CLAUDE.md erişim kuralı 4): hatadan sonra korunur.
  expect(govdeler[1].idempotencyKey).toBe(govdeler[0].idempotencyKey);
});
