// @vitest-environment jsdom
import { createElement } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/components/workspace-provider", () => ({ useWorkspace: () => ({ user: { id: "user" }, isAuthLoaded: true }) }));
import { CheckoutPage } from "./checkout-page";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("provider formunu uygulama çerezlerine erişemeyen iframe'e yerleştirir", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "pending", expires_at: "2099-01-01", checkout_form_content: "<script>window.providerForm = true;</script>" })));
  render(createElement(CheckoutPage, { id: "session" }));
  const frame = await screen.findByTitle("iyzico güvenli ödeme formu");
  expect(frame.getAttribute("sandbox")).toContain("allow-scripts");
  expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
  expect(frame.getAttribute("srcdoc")).toContain("window.providerForm");
});
it("doğrulanmış ödeme sonrası formu kaldırır", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "completed", expires_at: "2099-01-01", checkout_form_content: null })));
  render(createElement(CheckoutPage, { id: "session" }));
  await screen.findByText("Aboneliğiniz doğrulandı ve kullanıma açıldı.");
  expect(screen.queryByTitle("iyzico güvenli ödeme formu")).toBeNull();
});
