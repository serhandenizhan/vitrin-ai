import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { json, sahteOturumAc, vekilleriTaklitEt } from "./oturum";

// Kesim kuyruğunda uzun bekleme (Faz 7 kapanışı, açık takip 12 madde 3;
// 03.10.2026, Kaan). Karar (Serhan, 26.09.2026): sıra/yoğunluk müşteriye
// HİSSETTİRİLMEZ — sıra numarası yok, hata yok; ~30 sn sonra yalnız nötr bir
// cümle (`processing-state.tsx`, `lib/cutout-job.ts`).
//
// TAKLİT BİÇİMİ (ders 22): vekil kuyruğa giren işi `202 { job_id, status }`
// (`app/api/remove-background/route.ts`), süren işi `202 { status }`, biten
// işi `200 image/png` olarak döndürür (`.../jobs/[id]/route.ts`).

const ORNEK_KESIM = fs.readFileSync(path.resolve(__dirname, "..", "public", "mock", "sample-cutout.png"));
const NOTR_CUMLE = "Yüksek çözünürlüklü fotoğraflar biraz daha uzun sürebilir.";

test.beforeEach(async ({ page, context }) => {
  await sahteOturumAc(context);
  await vekilleriTaklitEt(page);
});

test("kuyrukta 30 sn'yi aşan bekleme: nötr cümle çıkar, hata ve sıra bilgisi çıkmaz, iş bitince sonuç gelir", async ({ page }) => {
  await page.clock.install();
  let hazir = false;
  let yoklama = 0;
  await page.route("**/api/remove-background", (r) =>
    r.fulfill(json({ job_id: "55555555-5555-4555-8555-555555555555", status: "queued" }, 202)),
  );
  await page.route("**/api/remove-background/jobs/*", (r) => {
    yoklama += 1;
    return hazir
      ? r.fulfill({ status: 200, contentType: "image/png", body: ORNEK_KESIM, headers: { "X-Mock-Response": "false" } })
      : r.fulfill(json({ status: "queued" }, 202));
  });

  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({ name: "e2e-yuzuk.png", mimeType: "image/png", buffer: ORNEK_KESIM });
  await page.getByRole("button", { name: "Arka planı kaldır" }).click();

  const bekleme = page.getByText("Sayfayı kapatmayın; sonuç hazır olduğunda burada açılacak.");
  await expect(bekleme).toBeVisible();

  // 30 sn'nin hemen altında nötr cümle henüz yok.
  await page.clock.fastForward(28_000);
  await expect(page.getByText(/28 saniye|29 saniye/)).toBeVisible();
  await expect(page.getByText(NOTR_CUMLE)).toHaveCount(0);

  await page.clock.fastForward(3_000);
  await expect(page.getByText(NOTR_CUMLE)).toBeVisible();
  // Müşteriye hissettirilmez: hata yok, sıra numarası yok.
  // Next'in sayfa duyurucusu (`next-route-announcer`) her sayfada BOŞ bir
  // role="alert" taşır; yalnız içi dolu uyarılar sayılır.
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
  await expect(page.getByText(/sırada|sıranız|kuyruk/)).toHaveCount(0);
  expect(yoklama).toBeGreaterThan(0);

  // İş biter: yoklama PNG'yi alır, inceleme ekranı açılır.
  hazir = true;
  await expect(async () => {
    await page.clock.runFor(1_600);
    await expect(page.getByRole("button", { name: "Arka plan ekle" })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 15_000 });
});
