import { expect, test } from "@playwright/test";

// Oturumsuz kullanici hesaba bagli ekranlarda veri degil giris istemi gorur.
for (const [yol, mesaj] of [
  ["/calismalar", /giriş yapın/i],
  ["/hesap", /Giriş yapmadınız/],
  ["/admin", /Yönetim paneli için giriş yapın/],
] as const) {
  test(`${yol} oturumsuzken giriş ister`, async ({ page }) => {
    await page.goto(yol);
    await expect(page.locator("main")).toContainText(mesaj);
  });
}

// Vekil uclar oturumsuz istegi gövdeye/backend'e bakmadan reddeder. Yetkilendirme
// asil backend'de (CLAUDE.md) ama vekilin de kapali olmasi beklenir.
for (const [yontem, yol] of [
  ["GET", "/api/projects"],
  ["GET", "/api/subscriptions/me"],
  ["GET", "/api/admin/me"],
  ["POST", "/api/remove-background"],
  ["POST", "/api/cmyk"],
] as const) {
  test(`${yontem} ${yol} oturumsuz 401 döner`, async ({ request }) => {
    const yanit = await request.fetch(yol, { method: yontem });
    expect(yanit.status()).toBe(401);
  });
}
