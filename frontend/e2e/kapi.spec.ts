import { expect, test } from "@playwright/test";

// Deneme bolumu ACIK ve gecis sahnesiz (Kaan: "a" secenegi); yalniz kaydirmaya
// bagli yumusak oturma vardir. SSS akordeonu da burada sinanir.

test("deneme bölümü baştan açık: başlık ve yükleme alanı erişilebilir, kapak/logo sahnesi yok", async ({ page }) => {
  await page.goto("/");
  const bolum = page.locator("#dene");
  await expect(bolum.locator("[inert]")).toHaveCount(0);
  await expect(bolum.locator("[data-gate-logo]")).toHaveCount(0);
  await bolum.scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Kendi fotoğrafınızla deneyin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fotoğraf yükle" })).toBeVisible();
});

test("#dene bağlantısı bölüme götürür", async ({ page }) => {
  await page.goto("/");
  await page.locator('a[href="#dene"]').first().click();
  await expect(page.getByRole("heading", { name: "Kendi fotoğrafınızla deneyin" })).toBeInViewport();
});

test("sık sorulanlar akordeonu yumuşak açılıp kapanır", async ({ page }) => {
  await page.goto("/");
  const soru = page.getByRole("button", { name: "Ücretsiz deneyebilir miyim?" });
  await soru.scrollIntoViewIfNeeded();
  await expect(soru).toHaveAttribute("aria-expanded", "false");
  const panel = page.locator(`#${await soru.getAttribute("aria-controls")}`);
  await expect(panel).toHaveAttribute("inert", "");
  await soru.click();
  await expect(soru).toHaveAttribute("aria-expanded", "true");
  await expect(panel).not.toHaveAttribute("inert", "");
  const gecis = await panel.evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(gecis).not.toBe("0s");
  await soru.click();
  await expect(soru).toHaveAttribute("aria-expanded", "false");
});
