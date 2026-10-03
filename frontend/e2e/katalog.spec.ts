import fs from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { json } from "./oturum";

// Katalog editörü (Faz 7 kapanışı, açık takip 12 madde 3; 03.10.2026, Kaan).
// Katalog tamamen tarayıcıda çalışır; sunucuya yalnız CMYK dönüşümü için
// gider (`/api/cmyk`, Next'in kendi ucu — hata gövdesi `{ error }`,
// `lib/print-download.ts`). Telefonda ayarlar sekmeli olduğu için bu dosya
// masaüstünde koşar; sekmeler `sayfalar.spec.ts`'in taşma taramasında.

/** JPEG'in genişlik/yüksekliğini SOF işaretinden okur (dosya imzası yetmez). */
function jpegOlcusu(bayt: Buffer): { width: number; height: number } {
  expect(bayt.subarray(0, 3).toString("hex")).toBe("ffd8ff");
  let i = 2;
  while (i < bayt.length) {
    if (bayt[i] !== 0xff) throw new Error("JPEG işareti bozuk");
    const isaret = bayt[i + 1];
    const uzunluk = bayt.readUInt16BE(i + 2);
    // SOF0..SOF15 (DHT=C4, JPG=C8, DAC=CC hariç)
    if (isaret >= 0xc0 && isaret <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(isaret)) {
      return { height: bayt.readUInt16BE(i + 5), width: bayt.readUInt16BE(i + 7) };
    }
    i += 2 + uzunluk;
  }
  throw new Error("SOF bulunamadı");
}

async function ornekleBasla(page: Page) {
  await page.goto("/katalog");
  await page.getByRole("button", { name: "Örnek ile başlayın" }).click();
  await expect(page.getByRole("button", { name: "Şablonu değiştir" })).toBeVisible();
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "masaustu", "katalog ayarları telefonda sekmeli");
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("boş şablonda indirme kapalıdır ve görsel istenir", async ({ page }) => {
  await page.goto("/katalog");
  // Galerideki ilk şablon.
  await page.getByRole("button", { name: /Şablonu seç/ }).first().click();
  await expect(page.getByRole("button", { name: "JPEG indir" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Baskıya uygun TIFF" })).toBeDisabled();
  await expect(page.getByText("En az bir görsel ekleyin.")).toBeVisible();
});

test("örnekle başlanır, başlık düzenlenir ve sayfa A4 ölçüsünde JPEG olarak iner", async ({ page }) => {
  await ornekleBasla(page);
  const baslik = page.getByLabel("Başlık");
  await expect(baslik).toHaveValue("Pırlanta Koleksiyonu");
  await baslik.fill("Sonbahar Seçkisi");
  await expect(page.locator(".catalog-sticky").getByText("Sonbahar Seçkisi")).toBeVisible();

  const indirme = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: "JPEG indir" }).click();
  const dosya = await indirme;
  expect(dosya.suggestedFilename()).toMatch(/^katalog-.+\.jpg$/);
  const bayt = fs.readFileSync(await dosya.path());
  expect(bayt.length).toBeGreaterThan(20_000);
  expect(jpegOlcusu(bayt)).toEqual({ width: 1240, height: 1754 });
});

test("baskıya uygun CMYK: sunucuya PNG gider, dosya iner; hata mesajı gösterilir", async ({ page }) => {
  let istek = 0;
  let pngGitti = false;
  await page.route("**/api/cmyk", (r) => {
    istek += 1;
    // Çok parçalı gövdede çizilen sayfa PNG olarak ve istenen biçimle gider.
    const govde = r.request().postDataBuffer() ?? Buffer.alloc(0);
    pngGitti = govde.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47])) && govde.includes(Buffer.from('name="format"'));
    if (istek === 1) {
      // Profil ayarlı değilken route'un kendi 503'ü (app/api/cmyk/route.ts).
      return r.fulfill(json({ error: "Baskı profili yapılandırılmamış. Sunucuda CMYK_ICC_PATH ayarlanmalı." }, 503));
    }
    return r.fulfill({ status: 200, contentType: "image/tiff", body: Buffer.from("II*\0sahte-cmyk") });
  });
  await ornekleBasla(page);

  await page.getByRole("button", { name: "Baskıya uygun TIFF" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Baskı profili yapılandırılmamış." })).toBeVisible();

  const indirme = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: "Baskıya uygun TIFF" }).click();
  const dosya = await indirme;
  expect(dosya.suggestedFilename()).toMatch(/^katalog-.+-cmyk\.tif$/);
  await expect(page.getByRole("status").filter({ hasText: "İndirildi." })).toBeVisible();
  expect(pngGitti).toBe(true);
});
