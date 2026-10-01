import fs from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { sahteOturumAc, vekilleriTaklitEt } from "./oturum";

// Stüdyonun 3. aşaması: CMYK, WhatsApp, birden fazla boyut, logo ve etiket.
// Aşamalı akış yalnız MASAÜSTÜNDE; telefon düzeni farklı (atlanır).
const KESIM = fs.readFileSync(path.resolve(__dirname, "..", "public", "mock", "sample-cutout.png"));

// Marka (logo + etiket) 2. aşamada, "Yerleşim · Görünüm · Marka" sekmelerinde.
async function markaSekmesi(page: Page) {
  await page.route("**/api/remove-background", (r) =>
    r.fulfill({ status: 200, contentType: "image/png", body: KESIM, headers: { "X-Mock-Response": "false" } }),
  );
  await page.goto("/");
  await page.locator("input[type=file]").first().setInputFiles({ name: "e2e-yuzuk.png", mimeType: "image/png", buffer: KESIM });
  await page.getByRole("button", { name: "Arka planı kaldır" }).click();
  await page.getByRole("button", { name: "Arka plan ekle" }).click({ timeout: 30_000 });
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.getByRole("button", { name: /Sahneyi onayla/ }).click();
  await page.getByRole("tab", { name: "Marka", exact: true }).click();
}

async function tamamlaAsamasi(page: Page) {
  await page.route("**/api/remove-background", (r) =>
    r.fulfill({ status: 200, contentType: "image/png", body: KESIM, headers: { "X-Mock-Response": "false" } }),
  );
  await page.goto("/");
  await page.locator("input[type=file]").first().setInputFiles({ name: "e2e-yuzuk.png", mimeType: "image/png", buffer: KESIM });
  await page.getByRole("button", { name: "Arka planı kaldır" }).click();
  await page.getByRole("button", { name: "Arka plan ekle" }).click({ timeout: 30_000 });
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.getByRole("button", { name: /Sahneyi onayla/ }).click();
  await page.getByRole("button", { name: /Düzenlemeyi bitir/ }).click();
  await expect(page.getByRole("button", { name: "PNG", exact: true })).toBeVisible();
}

async function tuvalIzi(page: Page): Promise<string> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("canvas"))
      .map((c) => {
        try {
          const veri = c.toDataURL();
          let h = 0;
          for (let i = 0; i < veri.length; i += 97) h = (h * 31 + veri.charCodeAt(i)) | 0;
          return `${c.width}x${c.height}:${h}`;
        } catch {
          return "kirli";
        }
      })
      .join("|"),
  );
}

test.beforeEach(async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "masaustu", "aşamalı stüdyo yalnız masaüstünde");
  await sahteOturumAc(context);
  await vekilleriTaklitEt(page);
});

test("CMYK TIFF: sunucuya tiff istenir, -cmyk.tif olarak iner", async ({ page }) => {
  let govde = "";
  await page.route("**/api/cmyk", (r) => {
    govde = r.request().postData() ?? "";
    return r.fulfill({ status: 200, contentType: "image/tiff", body: Buffer.from("49492a00080000000000", "hex") });
  });
  await tamamlaAsamasi(page);
  const indirme = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: "CMYK TIFF" }).click();
  const dosya = await indirme;
  expect(dosya.suggestedFilename()).toMatch(/-cmyk\.tif$/);
  expect(govde).toContain('name="format"');
  expect(govde).toContain("tiff");
});

test("CMYK: sunucu hata verirse kullanıcı mesajı görür, dosya inmez", async ({ page }) => {
  await page.route("**/api/cmyk", (r) =>
    r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Baskı profili ayarlı değil (e2e)." }) }),
  );
  await tamamlaAsamasi(page);
  let indi = false;
  page.on("download", () => (indi = true));
  await page.getByRole("button", { name: "CMYK JPEG" }).click();
  await expect(page.getByText("Baskı profili ayarlı değil (e2e).")).toBeVisible({ timeout: 10_000 });
  expect(indi).toBe(false);
});

test("WhatsApp: paylaşım menüsü varsa JPEG dosyası paylaşılır", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __paylasilan?: { ad: string; tip: string } };
    navigator.canShare = () => true;
    navigator.share = async (veri?: ShareData) => {
      const dosya = veri?.files?.[0];
      if (dosya) w.__paylasilan = { ad: dosya.name, tip: dosya.type };
    };
  });
  await tamamlaAsamasi(page);
  await page.getByRole("button", { name: "WhatsApp" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __paylasilan?: { ad: string; tip: string } }).__paylasilan))
    .toMatchObject({ tip: "image/jpeg" });
});

test("WhatsApp: menü yoksa JPEG iner ve WhatsApp Web açılır, kullanıcıya ne yapacağı söylenir", async ({ page, context }) => {
  await page.addInitScript(() => {
    (navigator as unknown as { canShare?: unknown }).canShare = undefined;
  });
  await context.route("https://web.whatsapp.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>wa</title>" }));
  await tamamlaAsamasi(page);
  const indirme = page.waitForEvent("download", { timeout: 30_000 });
  const pencere = context.waitForEvent("page", { timeout: 10_000 });
  await page.getByRole("button", { name: "WhatsApp" }).click();
  expect((await indirme).suggestedFilename()).toMatch(/\.jpg$/);
  expect((await pencere).url()).toContain("web.whatsapp.com");
  await expect(page.getByText(/Görsel indirildi\. Açılan WhatsApp/)).toBeVisible();
});

test("birden fazla boyut: seçilen her boyut ayrı dosya olarak iner", async ({ page }) => {
  await tamamlaAsamasi(page);
  await page.getByRole("button", { name: "Birden fazla boyut" }).click();
  const grup = page.getByRole("group", { name: "Birden fazla boyutta indir" });
  await expect(grup).toBeVisible();
  const boyutlar = grup.locator("button[aria-pressed]").filter({ hasNotText: /^(JPEG|PNG)$/ });
  await boyutlar.nth(0).click();
  await boyutlar.nth(1).click();
  const inenler: string[] = [];
  page.on("download", (d) => inenler.push(d.suggestedFilename()));
  await grup.getByRole("button", { name: /boyutu indir/ }).click();
  await expect.poll(() => inenler.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  expect(new Set(inenler).size).toBe(inenler.length); // aynı adla ezilmez
});

test("logo: yüklenir, tuvali değiştirir, kaldırılır", async ({ page }) => {
  await markaSekmesi(page);
  await page.waitForTimeout(1200);
  const once = await tuvalIzi(page);
  await page.getByLabel("Logo dosyası seç").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: KESIM });
  await expect(page.getByRole("button", { name: "Logoyu kaldır" })).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => tuvalIzi(page), { timeout: 5000 }).not.toBe(once);
  await page.getByRole("button", { name: "Logoyu kaldır" }).click();
  await expect(page.getByRole("button", { name: "Logo yükle" })).toBeVisible();
});

test("etiket: ürün kodu ve gram tuvale yazılır, geçersiz gram işaretlenir", async ({ page }) => {
  await markaSekmesi(page);
  await page.waitForTimeout(1200);
  const once = await tuvalIzi(page);
  // Etiket alanları "Ürün etiketi" anahtarı açılınca görünür (Toggle: role=switch).
  await page.getByRole("switch", { name: "Ürün etiketi" }).click();
  await page.getByPlaceholder("A-102").fill("E2E-7");
  await page.getByPlaceholder("3,45").fill("4,2");
  await expect.poll(() => tuvalIzi(page), { timeout: 5000 }).not.toBe(once);
  await page.getByPlaceholder("3,45").fill("abc");
  await expect(page.getByPlaceholder("3,45")).toHaveAttribute("aria-invalid", "true");
});
