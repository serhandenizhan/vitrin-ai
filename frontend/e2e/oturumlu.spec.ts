import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { json, sahteOturumAc, vekilleriTaklitEt } from "./oturum";

// Sahte oturum + taklit vekiller (bkz. oturum.ts): arayuzun OTURUMLU davranisi.
const ORNEK_KESIM = fs.readFileSync(path.resolve(__dirname, "..", "public", "mock", "sample-cutout.png"));

test.beforeEach(async ({ page, context }) => {
  await sahteOturumAc(context);
  await vekilleriTaklitEt(page);
});

test("oturum açıkken üst çubukta hesap menüsü var, giriş düğmesi yok", async ({ page }) => {
  await page.goto("/paketler");
  await expect(page.getByRole("button", { name: /Hesap menüsü/ })).toBeVisible();
  await expect(page.locator("header").getByRole("button", { name: "Giriş yap" })).toHaveCount(0);
});

test("oturumluyken /hesap giriş istemez", async ({ page }) => {
  await page.goto("/hesap");
  await expect(page.locator("main")).not.toContainText("Giriş yapmadınız");
});

test("çıkış yapınca giriş düğmesi geri gelir", async ({ page }) => {
  await page.goto("/paketler");
  await page.getByRole("button", { name: /Hesap menüsü/ }).click();
  await page.getByRole("menuitem", { name: /Çıkış yap/ }).click();
  await expect(page.locator("header").getByRole("button", { name: "Giriş yap" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Hesap menüsü/ })).toHaveCount(0);
});

test("çalışmalar sayfası sunucudaki taslağı listeler", async ({ page }) => {
  await page.route("**/api/projects**", (r) =>
    r.fulfill(
      // Tarayicinin gordugu sekil (vekilin camelCase ciktisi), backend'inki degil.
      json({
        items: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            fileName: "e2e-yuzuk.png",
            createdAt: Date.now(),
            isMocked: false,
            durationSeconds: 12,
            status: "draft",
            downloadedAt: null,
            editorState: null,
            resultUrl: "/mock/sample-cutout.png",
            thumbnailUrl: "/mock/sample-cutout.png",
            expiresAt: Date.now() + 3_600_000,
          },
        ],
        nextCursor: null,
      }),
    ),
  );
  await page.goto("/calismalar");
  await expect(page.locator("main")).toContainText("e2e-yuzuk");
  await expect(page.locator("main")).not.toContainText("Yarım kalan çalışma yok");
});

test("çalışma listesi alınamazsa 'çalışma yok' DEĞİL hata gösterilir", async ({ page }) => {
  await page.route("**/api/projects**", (r) => r.fulfill(json({ error: "x" }, 500)));
  await page.goto("/calismalar");
  await expect(page.locator("main")).not.toContainText("Yarım kalan çalışma yok");
});

test.describe("kesim → stüdyo", () => {
  async function fotografYukle(page: import("@playwright/test").Page) {
    await page.goto("/");
    await page.locator("input[type=file]").setInputFiles({
      name: "e2e-yuzuk.png",
      mimeType: "image/png",
      buffer: ORNEK_KESIM,
    });
    await page.getByRole("button", { name: "Arka planı kaldır" }).click();
  }

  test("kesim tamamlanınca stüdyo üç aşamayla açılır ve tuval çizilir", async ({ page }, testInfo) => {
    await page.route("**/api/remove-background", (r) =>
      r.fulfill({ status: 200, contentType: "image/png", body: ORNEK_KESIM, headers: { "X-Mock-Response": "false" } }),
    );
    await fotografYukle(page);
    await page.getByRole("button", { name: "Arka plan ekle" }).click({ timeout: 30_000 });
    // Aşamalı akış yalnız masaüstünde; telefon düzeni alt bar (CLAUDE.md, stüdyo düzeni).
    if (testInfo.project.name === "masaustu") {
      for (const asama of ["Sahne", "Düzenle", "Tamamla"]) {
        await expect(page.getByRole("button", { name: new RegExp(asama) }).first()).toBeVisible();
      }
    }
    await expect(page.locator("canvas").first()).toBeVisible();
    // Geri dönünce stüdyo kapanır ve araç yeniden görünür.
    await page.getByRole("button", { name: "Geri", exact: true }).click();
    await expect(page.getByRole("button", { name: "Arka plan ekle" })).toBeVisible();
  });

  test("kesim hatası kullanıcıya gösterilir, stüdyo açılmaz", async ({ page }) => {
    await page.route("**/api/remove-background", (r) =>
      r.fulfill(json({ error: "x", code: "unknown" }, 500)),
    );
    await fotografYukle(page);
    await expect(page.getByRole("alert").filter({ hasText: /\S/ }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Arka plan ekle" })).toHaveCount(0);
  });
});
