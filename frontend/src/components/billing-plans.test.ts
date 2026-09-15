// @vitest-environment jsdom
import { createElement } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: { id: "a" }, isAuthLoaded: true, openSignIn: vi.fn() }));
vi.mock("@/components/workspace-provider", () => ({ useWorkspace: () => state }));
import { BillingPlans, type PlanPresentation } from "./billing-plans";
// Sunum verisi sayfadan geliyor (fiyat/kota backend'den); testler de aynı
// sözleşmeyi kullanıyor.
const CATALOG: PlanPresentation[] = [
  { id: "deneme", ad: "Deneme", ozet: "Ücretsiz", maddeler: ["Arka plan kaldırma"], vurgulu: false },
  { id: "atolye", ad: "Atölye", ozet: "Kuyumcu için", maddeler: ["Aylık yüksek işlem hakkı"], vurgulu: true },
];
const render_ = () => render(createElement(BillingPlans, { catalog: CATALOG }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("hesap değişiminde fatura formu ve kabul durumunu kaldırır", async () => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => Response.json(path.includes("documents") ? [
    { document_type: "distance_sales", document_version: "v1", document_hash: "hash", text: "Satış" },
    { document_type: "pre_information", document_version: "v1", document_hash: "hash", text: "Bilgi" },
  ] : [{ id: "atolye", name: "Atölye", plan_version_id: "version", price_minor_units: 9900, monthly_quota: 100, background_tier: "full", trial_period_days: 7 }])));
  const view = render_();
  fireEvent.click(await screen.findByRole("button", { name: "Paketi seç" }));
  await screen.findByText("Satış");
  fireEvent.change(screen.getByLabelText("T.C. kimlik numarası"), { target: { value: "11111111111" } });
  fireEvent.click(screen.getByRole("checkbox"));
  state.user = { id: "b" }; view.rerender(createElement(BillingPlans, { catalog: CATALOG }));
  expect(screen.queryByDisplayValue("11111111111")).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.click(await screen.findByRole("button", { name: "Paketi seç" }));
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
});
it("devam eden satın alma varsa kullanıcıyı o ödemeye yönlendirir", async () => {
  // `checkout_pending`/`idempotency_conflict` hatası artık devam eden işlemin
  // adresini taşıyor; arayüz bunu bir bağlantı olarak gösteriyor.
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return Response.json(
        { error: "Devam eden satın alma işlemi var.", code: "checkout_pending", checkout_url: "/odeme/11111111-1111-1111-1111-111111111111" },
        { status: 409 },
      );
    }
    return Response.json(path.includes("documents") ? [
      { document_type: "distance_sales", document_version: "v1", document_hash: "hash", text: "Satış" },
      { document_type: "pre_information", document_version: "v1", document_hash: "hash", text: "Bilgi" },
    ] : [{ id: "atolye", name: "Atölye", plan_version_id: "version", price_minor_units: 9900, monthly_quota: 100, background_tier: "full", trial_period_days: 7 }]);
  }));
  render_();
  fireEvent.click(await screen.findByRole("button", { name: "Paketi seç" }));
  await screen.findByText("Satış");
  for (const [label, value] of [["Ad", "Test"], ["Soyad", "Kullanıcı"], ["Telefon (+905xxxxxxxxx)", "+905551234567"], ["T.C. kimlik numarası", "11111111111"], ["Şehir", "İstanbul"], ["Fatura adresi", "Test adresi 1"]] as const) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Güvenli ödemeye geç" }));
  const link = await screen.findByRole("link", { name: "Devam eden ödemeye git" });
  expect(link.getAttribute("href")).toBe("/odeme/11111111-1111-1111-1111-111111111111");
});

it("yayımlanmamış planı 'Yakında' gösterir, çalışır gibi bir düğme koymaz", async () => {
  // Backend yalnızca ücretsiz planı yayımlamış durumda. Atölye kartı sayfada
  // durmalı ama satın alınabilir görünmemeli — depoda uydurma fiyat yok.
  vi.stubGlobal("fetch", vi.fn(async () => Response.json([
    { id: "deneme", name: "Deneme", plan_version_id: "v1", price_minor_units: 0, currency: "TRY", monthly_quota: 10, background_tier: "basic", trial_period_days: 0 },
  ])));
  render_();
  await screen.findByText("Yakında");
  expect(screen.getByText("Fiyat belirleniyor")).toBeTruthy();
  expect(screen.getByText("Yakında açılacak")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Paketi seç" })).toBeNull();
  // Ücretsiz planın gerçek kotası backend'den geliyor, sayfaya yazılmıyor.
  expect(screen.getByText(/ayda 10 fotoğraf/)).toBeTruthy();
});

it("yayımlanan ücretli planın fiyatını backend'den alır", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json([
    { id: "atolye", name: "Atölye", plan_version_id: "v2", price_minor_units: 49900, currency: "TRY", monthly_quota: 150, background_tier: "full", trial_period_days: 7 },
  ])));
  render_();
  await screen.findByRole("button", { name: "Paketi seç" });
  expect(screen.getByText(/499,00/)).toBeTruthy();
  expect(screen.getByText("Aylık · 150 fotoğraf")).toBeTruthy();
  expect(screen.getByText(/7 gün deneme/)).toBeTruthy();
});
