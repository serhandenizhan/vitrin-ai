import { defineConfig, devices } from "@playwright/test";

// Adres repo yapisina/ortama bagli degil, env ile verilir (CLAUDE.md ders 11).
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

// Gercek Supabase hesabi/secret GEREKMEZ ve production Supabase'e istek atilmaz:
// girissiz akislar oldugu gibi, oturumlu akislar sahte oturum cerezi + taklit
// vekillerle (e2e/oturum.ts) sinanir. Giris formu hicbir testte gonderilmez.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  // Dev sunucusu (Next + WebGL taklidi) 8 paralel tarayicida yavasliyor: stüdyo
  // testleri üç ayrı koşuda yalnız yük altında `toBeVisible` zaman aşımına düştü
  // (tek başına ve 3 işçiyle hep geçti). Sınır gevşetildi, işçi sayısı kısıldı.
  expect: { timeout: 10_000 },
  workers: process.env.CI ? 2 : 4,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "masaustu", use: { ...devices["Desktop Chrome"] } },
    // 375 px: mobil tarama (CLAUDE.md "Mobil kontrol") sinirini korur.
    { name: "telefon", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 800 } } },
  ],
  // Sunucu zaten aciksa (execute.sh / VS Code gorevi) onu kullanir.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // CI'da (yavas ve bir kez calisan) URETIM derlemesi; yerelde gelistirme sunucusu.
        // CI, `npm run build`i ayri bir adimda yapar.
        command: process.env.CI ? "npm run start" : "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
