import { expect, test, type Page } from "@playwright/test";

// Katalog: galeriden çalışma alanına geçince sayfa editörün BAŞINDA açılır
// (Kaan'ın telefon bildirimi, 03.10.2026: "Örnek ile başlayın'a basınca sayfa
// en alttan başlıyor"). Eski kodda telefonda (375×800) editörün üstü ekranın
// 271 px yukarısında kalıyordu (ölçüldü). Masaüstü + telefon.

async function editorUstu(page: Page) {
  return page.evaluate(() => {
    const kok = document.querySelector(".catalog-sticky-bar")?.parentElement;
    return kok ? kok.getBoundingClientRect().top : null;
  });
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("örnek ile başlayınca editörün başı ekranda görünür", async ({ page }) => {
  await page.goto("/katalog");
  await page.getByRole("button", { name: "Örnek ile başlayın" }).click();
  await expect(page.getByRole("button", { name: "Şablonu değiştir" })).toBeAttached();

  await expect.poll(() => editorUstu(page)).toBeGreaterThanOrEqual(0);
  const ust = await editorUstu(page);
  const ekran = await page.evaluate(() => innerHeight);
  expect(ust).not.toBeNull();
  expect(ust!).toBeLessThan(ekran / 3);
});

test("şablonu değiştir ile galeriye dönünce galerinin başı ekranda görünür", async ({ page }) => {
  await page.goto("/katalog");
  await page.getByRole("button", { name: "Örnek ile başlayın" }).click();
  await page.getByRole("button", { name: "Şablonu değiştir" }).click();
  const ilkSablon = page.getByRole("button", { name: /Şablonu seç/ }).first();
  await expect(ilkSablon).toBeInViewport();
});
