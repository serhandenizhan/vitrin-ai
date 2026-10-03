import { expect, test, type Page } from "@playwright/test";

// Açılış vitrini 3D yakınlaşmasının yedek dalları (Faz 7 kapanışı, açık takip 12
// madde 3; 03.10.2026, Kaan). Beklenen davranış Serhan'ın tasarımı; kaynak
// `docs/frontend-kararlar.md` "Açılış vitrini" madde 3 ("Hareketi azalt" ve
// WebGL yokluğunda animasyon yerine yumuşak geçiş/statik kesim) ve
// `components/marketing/hero-zoom.tsx` — ikisi uyuşuyor:
//  - WebGL yok: tuval HİÇ kurulmaz, kesim görseli statik durur, panel hemen
//    açıktır, "Sürükleyerek çevirin" yazmaz, kapanış animasyonsuzdur.
//  - Hareketi azalt: tuval kurulur ama yakınlaşma animasyonu atlanır (panel
//    hemen açık), kapanış animasyonsuzdur.

const SAHNE = "Tek taş yüzük"; // vitrinin ilk sahnesi (lib/hero-scenes.ts)
const KESIM_ALT = "Arka planı kaldırılmış tek taş yüzük";

const panel = (page: Page) => page.getByRole("complementary", { name: `${SAHNE}: zemin ve kesim` });
const vitrineDon = (page: Page) => page.getByRole("button", { name: "Vitrine dön" });

async function yakinlas(page: Page) {
  await page.goto("/");
  const ac = page.getByRole("button", { name: "Yakından inceleyin", exact: true });
  await ac.click();
  await expect(panel(page)).toBeAttached();
  return ac;
}

test("WebGL yokken tuval kurulmaz, statik kesim ve açık panel gösterilir; kapanış anında", async ({ page }) => {
  // WebGL'i kapat: yalnız webgl bağlamları null döner, 2B tuval etkilenmez.
  await page.addInitScript(() => {
    const ozgun = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, tur: string, ...args: unknown[]) {
      if (/webgl/i.test(tur)) return null;
      return (ozgun as (...a: unknown[]) => unknown).call(this, tur, ...args);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const ac = await yakinlas(page);

  await expect(page.locator("canvas")).toHaveCount(0);
  // Statik kesim panelin DIŞINDA (paneldeki önce/sonra da aynı alt metni taşır).
  await expect
    .poll(() =>
      page.evaluate(
        (alt) => Array.from(document.querySelectorAll(`img[alt="${alt}"]`)).some((img) => !img.closest("aside") && (img as HTMLImageElement).complete),
        KESIM_ALT,
      ),
    )
    .toBe(true);
  // Panel animasyon beklemeden açılır (görünürlük sınıfla değil hesaplanan değerle; ders 26).
  await expect.poll(() => vitrineDon(page).evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  await expect(page.getByText("Sürükleyerek çevirin")).toHaveCount(0);

  // Zemin seçimi çalışır.
  const zeminler = panel(page).locator("fieldset button");
  await zeminler.nth(1).click();
  await expect(zeminler.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(panel(page).locator("legend")).toHaveText(/^Zemin: /);

  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0, { timeout: 1_000 });
  // Odak yakınlaşmayı açan düğmeye döner.
  await expect(ac).toBeFocused();
});

test("hareketi azalt açıkken yakınlaşma animasyonu atlanır: panel hemen açık, kapanış anında", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const webglVar = await page.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl")));
  test.skip(!webglVar, "bu tarayıcıda WebGL yok; o dal yukarıdaki testte");
  await yakinlas(page);

  // Tuval kurulur (WebGL dalı) ve panel ilk karede açıktır: animasyon beklenmez.
  await expect(page.locator("canvas")).toHaveCount(1);
  // 300 ms: animasyonlu yolda panel modeller yüklendikten SONRA, animasyonun 1.0. saniyesinde açılır (lib/hero-zoom-timeline.ts).
  await expect(vitrineDon(page)).toHaveClass(/opacity-100/, { timeout: 300 });
  await expect(vitrineDon(page)).toBeEnabled();

  await vitrineDon(page).click();
  await expect(panel(page)).toHaveCount(0, { timeout: 1_000 });
});
