import { expect, test, type Page } from "@playwright/test";

// Giris formu GONDERILMEZ: production Supabase'e istek atilmaz.
async function pencereyiAc(page: Page) {
  await page.goto("/paketler");
  // Üst çubuktaki düğme: telefonda yalnız ikon ama `aria-label` adını veriyor.
  // Çekmecedeki "Giriş yap" kopyaları ekran dışında kalır, o yüzden header ile sınırlı.
  await page.locator("header").getByRole("button", { name: "Giriş yap" }).click();
  const pencere = page.getByRole("dialog");
  await expect(pencere).toBeVisible();
  return pencere;
}

test("giriş penceresi açılır, Esc ile kapanır", async ({ page }) => {
  const pencere = await pencereyiAc(page);
  await expect(pencere.getByRole("heading", { name: "Giriş yapın" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pencere).toBeHidden();
});

test("boş formda gönder düğmesi kapalı", async ({ page }) => {
  const pencere = await pencereyiAc(page);
  await expect(pencere.getByRole("button", { name: "Giriş yap" })).toBeDisabled();
  await pencere.getByLabel("E-posta").fill("deneme@example.com");
  await pencere.getByLabel("Parola").fill("x");
  await expect(pencere.getByRole("button", { name: "Giriş yap" })).toBeEnabled();
});

test("giriş, kayıt ve parola sıfırlama kipleri arasında gezilir", async ({ page }) => {
  const pencere = await pencereyiAc(page);
  await pencere.getByRole("button", { name: "Hesap oluşturun" }).click();
  await expect(pencere.getByRole("heading", { name: "Hesap oluşturun" })).toBeVisible();
  await pencere.getByRole("button", { name: "Giriş yapın" }).click();
  await pencere.getByRole("button", { name: "Parolamı unuttum" }).click();
  await expect(pencere.getByRole("heading", { name: "Parolanızı sıfırlayın" })).toBeVisible();
  await pencere.getByRole("button", { name: "Girişe dön" }).click();
  await expect(pencere.getByRole("heading", { name: "Giriş yapın" })).toBeVisible();
});
