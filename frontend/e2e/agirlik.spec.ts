import { expect, test } from "@playwright/test";

// Sayfa ağırlığı bütçesi (Faz 7: "görüntü sıkıştırma / tembel yükleme"). 30.09.2026
// ölçümü (üretim derlemesi, ana sayfa): 23 görsel, 293 KB. Bütçe bunun ~1,5 katı:
// ileride bir ekip üyesi ağır/sıkıştırılmamış bir görsel eklerse burada kırmızı yanar.
// JS/font bütçesi BURADA DEĞİL (geliştirme sunucusu açılmamış JS sunar); ölçüm
// `frontend/README.md` → "Sayfa ağırlığı".

const GORSEL_TOPLAM_KB = 450;
const TEK_GORSEL_KB = 160;

test("ana sayfa görselleri bütçede: toplam ve tek tek", async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  const istekler = new Map<string, { url: string; kb?: number }>();
  cdp.on("Network.responseReceived", (e) => {
    if (e.type === "Image") istekler.set(e.requestId, { url: decodeURIComponent(e.response.url) });
  });
  cdp.on("Network.loadingFinished", (e) => {
    const istek = istekler.get(e.requestId);
    if (istek) istek.kb = Math.round(e.encodedDataLength / 1024);
  });
  await page.goto("/", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  // Sayfanın sonuna kadar kaydır: tembel görseller de sayılsın.
  const yukseklik = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < yukseklik; y += 500) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(1500);

  const gorseller = [...istekler.values()].filter((i) => i.kb !== undefined) as { url: string; kb: number }[];
  const toplam = gorseller.reduce((s, g) => s + g.kb, 0);
  expect(toplam, `toplam ${toplam} KB`).toBeLessThan(GORSEL_TOPLAM_KB);
  for (const g of gorseller) {
    expect(g.kb, `${g.url.split("?")[0].split("/").pop()} ${g.kb} KB`).toBeLessThan(TEK_GORSEL_KB);
  }
});

test("ekranın çok altındaki görseller tembel yüklenir (ya da küçücüktür)", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });
  const ihlaller = await page.evaluate(() =>
    Array.from(document.images)
      .filter((img) => img.getBoundingClientRect().top + window.scrollY > window.innerHeight * 2)
      .filter((img) => img.loading !== "lazy" && img.naturalWidth > 200)
      .map((img) => img.currentSrc.split("?")[0].split("/").pop()),
  );
  expect(ihlaller, `eager/auto yüklenen büyük görseller: ${ihlaller.join(", ")}`).toEqual([]);
});
