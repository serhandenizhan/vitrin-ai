import { expect, test, type Locator } from "@playwright/test";

// Ana sayfada seçili düğmenin altında kayan vurgu (`marketing/sliding-pill.tsx`;
// Kaan, 03.10.2026). İlk sürümde vurgu sayfa AÇILIŞINDA hiç ölçülmüyordu
// (düzen efektleri çocuktan ebeveyne çalışır, ebeveynin ref'i bağlı değildi);
// ilk tıklama kayma yerine sıçrıyordu. Bu test açılışta vurgunun seçili
// sekmenin altında olduğunu ve tıklayınca yeni sekmeye geçtiğini sınar.

async function vurguSekmeninAltinda(kap: Locator, sekme: Locator) {
  const [vurgu, hedef] = await Promise.all([
    kap.locator(":scope > span[aria-hidden]").boundingBox(),
    sekme.boundingBox(),
  ]);
  expect(vurgu).not.toBeNull();
  expect(hedef).not.toBeNull();
  expect(Math.abs(vurgu!.x - hedef!.x)).toBeLessThan(2);
  expect(Math.abs(vurgu!.y - hedef!.y)).toBeLessThan(2);
  expect(Math.abs(vurgu!.width - hedef!.width)).toBeLessThan(2);
}

test.beforeEach(async ({ page }) => {
  // Geçiş kapalı: konum anında oturur, ölçüm beklemeye bağlı kalmaz.
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("zemin sekmelerinde vurgu açılışta seçili sekmenin altında, tıklayınca yenisine geçer", async ({ page }) => {
  await page.goto("/");
  const sekmeler = page.getByRole("tablist", { name: "Zemin kategorileri" });
  await sekmeler.scrollIntoViewIfNeeded();

  await expect(sekmeler).toHaveAttribute("data-pill", "on");
  await vurguSekmeninAltinda(sekmeler, sekmeler.getByRole("tab", { selected: true }));

  const dogal = sekmeler.getByRole("tab", { name: "Doğal", exact: true });
  await dogal.click();
  await expect(dogal).toHaveAttribute("aria-selected", "true");
  await expect.poll(async () => {
    try {
      await vurguSekmeninAltinda(sekmeler, dogal);
      return true;
    } catch {
      return false;
    }
  }).toBe(true);
});
