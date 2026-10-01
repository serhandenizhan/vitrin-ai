import fs from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { json, ornekCalisma, sahteOturumAc, vekilleriTaklitEt } from "./oturum";

// Stüdyonun aşama içi araçları. Aşamalı akış yalnız MASAÜSTÜNDE (CLAUDE.md,
// "Araç yüzeyi"); telefon düzeni alt bar olduğu için bu dosya telefonda atlanır.
const ORNEK_KESIM = fs.readFileSync(path.resolve(__dirname, "..", "public", "mock", "sample-cutout.png"));

async function studyoyuAc(page: Page) {
  await page.route("**/api/remove-background", (r) =>
    r.fulfill({ status: 200, contentType: "image/png", body: ORNEK_KESIM, headers: { "X-Mock-Response": "false" } }),
  );
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({ name: "e2e-yuzuk.png", mimeType: "image/png", buffer: ORNEK_KESIM });
  // Sonuc sunucuya kaydedilince stüdyo çalışma kimliğini alır; ondan ÖNCE yapılan
  // bir düzenleme otomatik kaydedilmez (yük altında yarış: ilk sürümde kararsızdı).
  const kayitBitti = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/projects" && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Arka planı kaldır" }).click();
  await page.getByRole("button", { name: "Arka plan ekle" }).click({ timeout: 30_000 });
  await kayitBitti;
  await expect(page.locator("canvas").first()).toBeVisible();
}

// Konva her katman icin ayri <canvas> uretir (CLAUDE.md ders 26): ilkine degil
// HEPSINE bakilir. Kirlenmis tuval bos string dondurur; o durum ayrica yakalanir.
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

test("aşama 1: biçim seçimi işaretlenir, Pazaryeri düz beyaz zemine geçer", async ({ page }) => {
  await studyoyuAc(page);
  const pazaryeri = page.getByRole("button", { name: "Pazaryeri", exact: true });
  await expect(pazaryeri).toHaveAttribute("aria-pressed", "false");
  await pazaryeri.click();
  await expect(pazaryeri).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Düz beyaz", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("aşama 1: zemin seçmek seçimi taşır ve tuvali değiştirir", async ({ page }) => {
  await studyoyuAc(page);
  await page.waitForTimeout(1200); // ilk çizim + çapraz geçiş bitsin
  const once = await tuvalIzi(page);
  expect(once).not.toContain("kirli");
  await page.getByRole("button", { name: "Sıcak gri", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sıcak gri", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Kadife siyah", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => tuvalIzi(page), { timeout: 5000 }).not.toBe(once);
});

test("aşama 2: 90° döndürmek tuvali değiştirir; boyut kaydıracı var", async ({ page }) => {
  await studyoyuAc(page);
  await page.getByRole("button", { name: /Sahneyi onayla/ }).click();
  await expect(page.getByRole("slider", { name: "Ürün boyutu" })).toBeVisible();
  await page.waitForTimeout(1200);
  const once = await tuvalIzi(page);
  await page.getByRole("button", { name: "90°", exact: true }).click();
  await expect.poll(() => tuvalIzi(page), { timeout: 5000 }).not.toBe(once);
});

test("aşamalar arasında ileri ve geri gidilir", async ({ page }) => {
  await studyoyuAc(page);
  await page.getByRole("button", { name: /Sahneyi onayla/ }).click();
  await page.getByRole("button", { name: /Düzenlemeyi bitir/ }).click();
  await expect(page.getByRole("button", { name: "PNG", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Düzenle", exact: true }).click();
  await expect(page.getByRole("slider", { name: "Ürün boyutu" })).toBeVisible();
  await page.getByRole("button", { name: "Sahne", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pazaryeri", exact: true })).toBeVisible();
});

test("aşama 3: PNG indirilir ve gerçekten bir PNG'dir (boş değil)", async ({ page }) => {
  await studyoyuAc(page);
  await page.getByRole("button", { name: /Sahneyi onayla/ }).click();
  await page.getByRole("button", { name: /Düzenlemeyi bitir/ }).click();
  const indirme = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: "PNG", exact: true }).click();
  const dosya = await indirme;
  expect(dosya.suggestedFilename()).toMatch(/\.png$/i);
  const yol = await dosya.path();
  const bayt = fs.readFileSync(yol);
  // Konva kirlenmis tuvalde hata firlatmaz, bos doner (CLAUDE.md): boyut ve imza bakilir.
  expect(bayt.length).toBeGreaterThan(5_000);
  expect(bayt.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
});

test("aşama 3: JPEG indirilir ve gerçekten bir JPEG'dir", async ({ page }) => {
  await studyoyuAc(page);
  await page.getByRole("button", { name: /Sahneyi onayla/ }).click();
  await page.getByRole("button", { name: /Düzenlemeyi bitir/ }).click();
  const indirme = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: "JPEG", exact: true }).click();
  const dosya = await indirme;
  expect(dosya.suggestedFilename()).toMatch(/\.jpe?g$/i);
  const bayt = fs.readFileSync(await dosya.path());
  expect(bayt.length).toBeGreaterThan(5_000);
  expect(bayt.subarray(0, 3).toString("hex")).toBe("ffd8ff");
});

test("düzenleme değişince taslak sunucuya otomatik kaydedilir", async ({ page }) => {
  await studyoyuAc(page);
  const kayit = page.waitForRequest(
    (r) => /\/api\/projects\/[^/]+$/.test(new URL(r.url()).pathname) && ["PATCH", "PUT"].includes(r.method()),
    { timeout: 15_000 },
  );
  await page.getByRole("button", { name: "Pazaryeri", exact: true }).click();
  await kayit; // 1,5 sn gecikmeli otomatik kayit
});

test("çalışma kimliği gelmeden yapılan düzenleme de sonradan taslağa kaydedilir", async ({ page }) => {
  // Sonuç kaydı (POST) yavaş: stüdyo açılır ama çalışma kimliği geç gelir.
  await page.route("**/api/projects", async (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    await new Promise((bitti) => setTimeout(bitti, 4000));
    return r.fulfill(json(ornekCalisma()));
  });
  await page.route("**/api/remove-background", (r) =>
    r.fulfill({ status: 200, contentType: "image/png", body: ORNEK_KESIM, headers: { "X-Mock-Response": "false" } }),
  );
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({ name: "e2e-yuzuk.png", mimeType: "image/png", buffer: ORNEK_KESIM });
  await page.getByRole("button", { name: "Arka planı kaldır" }).click();
  await page.getByRole("button", { name: "Arka plan ekle" }).click({ timeout: 30_000 });
  await expect(page.locator("canvas").first()).toBeVisible();
  // Kimlik gelmeden (POST 4 sn bekletiliyor) biçimi değiştir.
  await page.getByRole("button", { name: "Pazaryeri", exact: true }).click();
  const yama = await page.waitForRequest(
    (r) => /\/api\/projects\/[^/]+$/.test(new URL(r.url()).pathname) && r.method() === "PATCH",
    { timeout: 20_000 },
  );
  const govde = yama.postData() ?? "";
  expect(govde).toContain("\"formatName\":\"marketplace\""); // düzenlenmiş biçim taslağa girdi
});
