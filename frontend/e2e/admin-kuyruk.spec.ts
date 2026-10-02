import { expect, test, type Page } from "@playwright/test";

import { json, sahteOturumAc, vekilleriTaklitEt } from "./oturum";

// Yonetim paneli > Genel bakis > "Kesim kuyrugu" karti (Faz 7 kapanisi,
// 02.10.2026). Sahte yonetici oturumu + taklit vekiller (bkz. oturum.ts):
// arayuzun yoneticiye gosterdigi durumlari sinar; yetki backend'de.

const ISTATISTIK = {
  days: 30,
  usage: { today: 3, last_7_days: 10, last_30_days: 40, all_time: 120 },
  reservations: { consumed: 38, released: 2, pending: 0 },
  subscriptions_by_status: [{ status: "active", count: 2 }],
  active_periods_by_plan: [],
  revenue: [],
  credit_grants: { granted: 0, used: 0, outstanding: 0 },
  daily_usage: [{ day: "2026-09-18", count: 3 }],
  daily_signups: [{ day: "2026-09-18", count: 1 }],
  operations: { open_alerts: 0, open_actions: 0, open_storage_jobs: 0 },
};

const SAGLIKLI = {
  status: "ok",
  workers: 2,
  queued: 3,
  processing: 1,
  oldest_waiting_seconds: 12,
  max_queued: 50,
  stall_threshold_seconds: 120,
};

async function panelAc(page: Page, kuyruk: unknown, kuyrukDurumu = 200) {
  await page.route("**/api/admin/me", (r) => r.fulfill(json({ is_admin: true })));
  await page.route("**/api/admin/stats**", (r) => r.fulfill(json(ISTATISTIK)));
  await page.route("**/api/admin/cutout-queue", (r) => r.fulfill(json(kuyruk, kuyrukDurumu)));
  await page.goto("/admin");
}

test.beforeEach(async ({ page, context }) => {
  // Giris animasyonu (soft-enter/reveal) opacity 0'dan baslar; Playwright bunu
  // "gorunur" sayar ve ekran goruntusu soluk/bos cikar. "Hareketi azalt"
  // animasyonu kapatir (arayuzun kendi kurali), olcum deterministik olur.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await sahteOturumAc(context);
  await vekilleriTaklitEt(page);
});

test("kuyruk sağlıklıyken sayıları gösterir ve alarm vermez", async ({ page }) => {
  await panelAc(page, SAGLIKLI);

  const kart = page.getByRole("region", { name: "Kesim kuyruğu" });
  await expect(kart.getByText("Kesim işçisi çalışıyor")).toBeVisible();
  await expect(kart.getByText("3 iş sırada bekliyor.")).toBeVisible();
  await expect(kart.getByText("3 / 50")).toBeVisible();
  await expect(kart.getByRole("alert")).toHaveCount(0);
  await page.screenshot({ path: process.env.E2E_EKRAN_DIZINI ? `${process.env.E2E_EKRAN_DIZINI}/kuyruk-saglikli-${test.info().project.name}.png` : undefined });
});

test("işçi yokken kırmızı uyarı gösterir", async ({ page }) => {
  await panelAc(page, { ...SAGLIKLI, status: "no_worker", workers: 0, queued: 0, processing: 0, oldest_waiting_seconds: null });

  const kart = page.getByRole("region", { name: "Kesim kuyruğu" });
  await expect(kart.getByRole("alert")).toContainText("Kesim işçisi çalışmıyor");
  await expect(kart.getByRole("alert")).toContainText("sırada bekliyor");
  await page.screenshot({ path: process.env.E2E_EKRAN_DIZINI ? `${process.env.E2E_EKRAN_DIZINI}/kuyruk-iscisiz-${test.info().project.name}.png` : undefined });
});

test("kuyruk tıkalıyken bekleme süresini gösterir", async ({ page }) => {
  await panelAc(page, { ...SAGLIKLI, status: "stalled", oldest_waiting_seconds: 185 });

  const kart = page.getByRole("region", { name: "Kesim kuyruğu" });
  await expect(kart.getByRole("alert")).toContainText("3 dk 5 sn");
  await page.screenshot({ path: process.env.E2E_EKRAN_DIZINI ? `${process.env.E2E_EKRAN_DIZINI}/kuyruk-tikali-${test.info().project.name}.png` : undefined });
});

test("kart hata verirse genel bakışın geri kalanı çalışmaya devam eder", async ({ page }) => {
  await panelAc(page, { error: "Kesim kuyruğu durumu yüklenemedi." }, 502);

  const kart = page.getByRole("region", { name: "Kesim kuyruğu" });
  await expect(kart.getByRole("alert")).toContainText("Kesim kuyruğu durumu yüklenemedi.");
  // İstatistikler bağımsız yüklenir.
  await expect(page.getByText("Toplam kesim")).toBeVisible();
});
