// @vitest-environment jsdom
import { createElement } from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: { id: "a" } as { id: string } | null, openSignIn: vi.fn() }));
vi.mock("@/components/workspace-provider", () => ({ useWorkspace: () => ({ ...state, isAuthLoaded: true }) }));
import { BillingPanel } from "./billing-panel";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => { state.user = { id: "a" }; });
it("hesap değişince önceki hesabın ödeme bilgilerini temizler", async () => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => Response.json(path.includes("history") ? { items: [{ id: "a-payment", type: "charge", amount_minor_units: 9900, currency: "TRY", created_at: "2026-09-15T00:00:00Z", invoice_reference: "A-FATURA" }], next_cursor: null } : { subscription: { status: "active" }, period: { quota_snapshot: 10, used_this_period: 2, plan_id: "deneme", ends_at: "2026-10-15" } })));
  const view = render(createElement(BillingPanel));
  await screen.findByText("Fatura: A-FATURA");
  state.user = null; view.rerender(createElement(BillingPanel));
  expect(screen.queryByText("Fatura: A-FATURA")).toBeNull();
  expect(screen.getByRole("button", { name: /giriş yapın/ })).toBeTruthy();
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  state.user = { id: "b" }; view.rerender(createElement(BillingPanel));
  await waitFor(() => expect(screen.queryByText("Fatura: A-FATURA")).toBeNull());
});
