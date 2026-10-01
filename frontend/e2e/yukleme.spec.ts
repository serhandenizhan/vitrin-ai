import { expect, test } from "@playwright/test";

test("desteklenmeyen dosya türü reddedilir", async ({ page }) => {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "not.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("merhaba"),
  });
  await expect(page.getByRole("alert").filter({ hasText: "Desteklenmeyen dosya türü" })).toBeVisible();
});

test("20 MB üstü dosya reddedilir", async ({ page }) => {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "buyuk.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.alloc(21 * 1024 * 1024),
  });
  await expect(page.getByRole("alert").filter({ hasText: /20 MB|büyük/i })).toBeVisible();
});
