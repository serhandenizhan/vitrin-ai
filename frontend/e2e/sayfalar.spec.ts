import { expect, test } from "@playwright/test";

// Girissiz herkese acik sayfalar: acilir ve ana baslik gorunur.
const SAYFALAR: Array<[string, RegExp]> = [
  ["/", /Ürününüz kalsın/],
  ["/paketler", /İşinize göre bir plan/],
  ["/katalog", /Ürünleriniz için sayfa hazırlayın/],
  ["/cekim-rehberi", /Temiz bir kesim/],
  ["/bulten", /Vitrin Bülteni/],
  ["/destek", /Sorunları birlikte çözelim/],
  ["/kvkk", /KVKK aydınlatma metni/],
];

for (const [yol, baslik] of SAYFALAR) {
  test(`${yol} açılır ve başlığı görünür`, async ({ page }) => {
    const yanit = await page.goto(yol);
    expect(yanit?.status()).toBe(200);
    await expect(page.locator("h1").first()).toContainText(baslik);
  });
}

test("olmayan sayfa markalı 404 gösterir", async ({ page }) => {
  const yanit = await page.goto("/yok-boyle-bir-sayfa");
  expect(yanit?.status()).toBe(404);
  await expect(page.locator("h1")).toContainText("Bu sayfa vitrinde yok");
  await page.getByRole("link", { name: "Ana sayfaya dön" }).click();
  await expect(page).toHaveURL("/");
});

test("robots.txt ve site haritası yayında", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toMatch(/sitemap/i);
  const harita = await request.get("/sitemap.xml");
  expect(harita.status()).toBe(200);
  expect(await harita.text()).toContain("<urlset");
});

test("telefonda hiçbir sayfa yatay taşmıyor", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "telefon", "yalnız 375 px projesi");
  for (const [yol] of SAYFALAR) {
    await page.goto(yol);
    await page.waitForLoadState("networkidle");
    const tasma = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(tasma, `${yol} yatay taşıyor`).toBeLessThanOrEqual(0);
  }
});
