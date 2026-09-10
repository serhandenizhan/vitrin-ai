import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest yapilandirmasi.
 *
 * Kapsam bilincli olarak SAF MANTIK ve SUNUCU KODU: yukleme kisitlari ve
 * arka plan kaldirma vekili. Bunlar hem projenin en cok kirilabilecek
 * yerleri (backend ile elle senkron tutulan sabitler, hata eslemesi) hem de
 * tarayici olmadan test edilebilen kisimlar.
 *
 * Bilesen testleri (React Testing Library) ve E2E (Playwright) bilincli
 * olarak ertelendi — yol haritasi ikisini de Faz 7'ye koyuyor ve simdi
 * eklemek, arayuz hala hizla degisirken bakim yuku uretirdi.
 *
 * `environment: node` — test edilen hicbir sey DOM'a dokunmuyor.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
