import { expect, it } from "vitest";

import { requestOrigin } from "./request-origin";

it("dinlenen adres yerine tarayicinin baglandigi adresi dondurur", () => {
  const request = new Request("http://0.0.0.0:3000/auth/callback", {
    headers: { Host: "192.168.1.181:3000" },
  });
  expect(requestOrigin(request)).toBe("http://192.168.1.181:3000");
});

it("X-Forwarded-Host / X-Forwarded-Proto'ya GUVENMEZ (guvenlik incelemesi, 18.09.2026)", () => {
  // Bu basliklar JS'ten `fetch()` ile yazilabiliyor (Host'un aksine yasakli
  // baslik listesinde degil). Guvenilseydi, `backend-proxy.ts::foreignOrigin`
  // bunu Origin kontrolunde kullandigi icin `Origin: https://evil.com` +
  // `X-Forwarded-Host: evil.com` beraber gonderilen bir istek "kendi
  // istegimiz" sanilip gecirilirdi. `Host` bilerek TEK guvenilir kaynak.
  const request = new Request("http://localhost:3000/api/billing/checkout", {
    headers: {
      Host: "localhost:3000",
      "X-Forwarded-Host": "evil.com",
      "X-Forwarded-Proto": "https",
    },
  });
  expect(requestOrigin(request)).toBe("http://localhost:3000");
});
