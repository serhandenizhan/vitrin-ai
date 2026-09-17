import { expect, it } from "vitest";

import { requestOrigin } from "./request-origin";

it("dinlenen adres yerine tarayicinin baglandigi adresi dondurur", () => {
  const request = new Request("http://0.0.0.0:3000/auth/callback", {
    headers: { Host: "192.168.1.181:3000" },
  });
  expect(requestOrigin(request)).toBe("http://192.168.1.181:3000");
});

it("ters vekil basliklarini onceliyor", () => {
  const request = new Request("http://0.0.0.0:3000/x", {
    headers: { Host: "0.0.0.0:3000", "X-Forwarded-Host": "vitrin.example", "X-Forwarded-Proto": "https" },
  });
  expect(requestOrigin(request)).toBe("https://vitrin.example");
});
