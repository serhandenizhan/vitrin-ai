// @vitest-environment jsdom
import { createElement } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: { id: "a" }, isAuthLoaded: true, openSignIn: vi.fn() }));
vi.mock("@/components/workspace-provider", () => ({ useWorkspace: () => state }));
import { BillingPlans } from "./billing-plans";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("hesap değişiminde fatura formu ve kabul durumunu kaldırır", async () => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => Response.json(path.includes("documents") ? [
    { document_type: "distance_sales", document_version: "v1", document_hash: "hash", text: "Satış" },
    { document_type: "pre_information", document_version: "v1", document_hash: "hash", text: "Bilgi" },
  ] : [{ id: "atolye", name: "Atölye", plan_version_id: "version", price_minor_units: 9900, monthly_quota: 100, background_tier: "full", trial_period_days: 7 }])));
  const view = render(createElement(BillingPlans));
  fireEvent.click(await screen.findByRole("button", { name: "Paketi seç" }));
  await screen.findByText("Satış");
  fireEvent.change(screen.getByLabelText("T.C. kimlik numarası"), { target: { value: "11111111111" } });
  fireEvent.click(screen.getByRole("checkbox"));
  state.user = { id: "b" }; view.rerender(createElement(BillingPlans));
  expect(screen.queryByDisplayValue("11111111111")).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.click(await screen.findByRole("button", { name: "Paketi seç" }));
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
});
