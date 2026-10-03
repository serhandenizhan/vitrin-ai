import { expect, test, type Page } from "@playwright/test";

import { json, sahteOturumAc, vekilleriTaklitEt } from "./oturum";

// Hesap silme (Faz 7 kapanışı, açık takip 12 madde 3; 03.10.2026, Kaan).
//
// TAKLİT BİÇİMİ (ders 22): backend silmeyi EŞZAMANSIZ yapar ve
// `202 { action_id, status }` döner (`routes/account.py`); vekil 202 gövdesini
// aynen geçirir (`app/api/account/route.ts`). Backend'in hata `detail`i düz
// metin; vekil onu `{ error }` yapar (`lib/backend-proxy.ts`).
// Hesap sayfasının yüklediği `/api/subscriptions/me` burada açıkça
// `routes/billing.py` `subscription_me` biçimiyle verilir (dönemli abonelik).

const EPOSTA = "e2e@example.com"; // oturum.ts sahte kullanıcısı

const ABONELIK = {
  subscription: { status: "active", access_until: null, deletion_requested_at: null },
  period: { quota_snapshot: 100, used_this_period: 3, ends_at: "2026-10-30T00:00:00+00:00", plan_id: "atolye" },
  bonus_credits: null,
  admin_exempt: false,
  billing_issue: null,
};

async function hesapAc(page: Page) {
  await page.route("**/api/subscriptions/me", (r) => r.fulfill(json(ABONELIK)));
  await page.route("**/api/billing/history**", (r) => r.fulfill(json({ items: [], next_cursor: null })));
  await page.goto("/hesap");
  await page.getByRole("button", { name: "Hesabımı silmek istiyorum" }).click();
}

const onayAlani = (page: Page) => page.getByLabel(`Onaylamak için e-posta adresinizi yazın: ${EPOSTA}`);
const silDugmesi = (page: Page) => page.getByRole("button", { name: "Hesabımı kalıcı olarak sil" });

test.beforeEach(async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await sahteOturumAc(context);
  await vekilleriTaklitEt(page);
});

test("e-posta doğru yazılmadan silinemez; doğru yazılınca talep gider ve kabul mesajı çıkar", async ({ page }) => {
  let govde: unknown = null;
  await page.route("**/api/account", (r) => {
    govde = r.request().postDataJSON();
    return r.fulfill(json({ action_id: "66666666-6666-4666-8666-666666666666", status: "pending" }, 202));
  });
  await hesapAc(page);

  await onayAlani(page).fill("baska@example.com");
  await expect(silDugmesi(page)).toBeDisabled();
  // Büyük/küçük harf ve kenar boşlukları affedilir (dikkat, zorluk değil).
  await onayAlani(page).fill(`  ${EPOSTA.toUpperCase()} `);
  await expect(silDugmesi(page)).toBeEnabled();
  await silDugmesi(page).click();

  await expect(page.getByText("Silme talebiniz alındı. Abonelik iptali tamamlandıktan sonra hesabınız ve görselleriniz silinecek.")).toBeVisible();
  expect(govde).toEqual({ email: EPOSTA.toUpperCase() });
  // Silme eşzamansız: kullanıcı sayfada kalır, anında çıkış yapılmaz.
  await expect(page).toHaveURL(/\/hesap$/);
});

test("son yönetici kendini silemez; backend'in gerekçesi gösterilir", async ({ page }) => {
  await page.route("**/api/account", (r) =>
    r.fulfill(json({ error: "Son yönetici hesabı silinemez; önce başka bir yönetici ekleyin." }, 409)),
  );
  await hesapAc(page);
  await onayAlani(page).fill(EPOSTA);
  await silDugmesi(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "Son yönetici hesabı silinemez" })).toBeVisible();
});

test("vazgeçince onay alanı kapanır ve yazılan temizlenir", async ({ page }) => {
  let istek = 0;
  await page.route("**/api/account", (r) => {
    istek += 1;
    return r.fulfill(json({}, 500));
  });
  await hesapAc(page);
  await onayAlani(page).fill(EPOSTA);
  await page.getByRole("button", { name: "Vazgeç" }).click();
  await expect(onayAlani(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Hesabımı silmek istiyorum" }).click();
  await expect(onayAlani(page)).toHaveValue("");
  await expect(silDugmesi(page)).toBeDisabled();
  expect(istek).toBe(0);
});
