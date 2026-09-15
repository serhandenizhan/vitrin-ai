// @vitest-environment jsdom
import { createElement } from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/components/workspace-provider", () => ({ useWorkspace: () => ({ user: { id: "user" }, isAuthLoaded: true }) }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { CheckoutPage } from "./checkout-page";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
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
it("bekleyen ödemeyi iptal edip paketlere döndürür", async () => {
  // Aynı anda tek bekleyen satın alma var; kullanıcı 30 dakika boyunca başka
  // plan deneyemiyordu ve arayüz bunu açıklamıyordu.
  const fetchMock = vi.fn(async (_path: string, init?: RequestInit) =>
    init?.method === "POST"
      ? Response.json({ status: "failed" })
      : Response.json({ status: "pending", expires_at: "2099-01-01", checkout_form_content: "<div></div>" }),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(createElement(CheckoutPage, { id: "session" }));
  const button = await screen.findByRole("button", { name: /Bu işlemi iptal et/ });
  fireEvent.click(button);
  await waitFor(() => expect(router.push).toHaveBeenCalledWith("/paketler"));
});
it("sağlayıcı doğrulanamadığında oturumu kapatmaz, hatayı gösterir", async () => {
  // Fail-closed: uzakta gerçekten açılmış bir aboneliğin üstünü örtmek,
  // kullanıcının iki abonelik ödemesi demek olurdu.
  vi.stubGlobal("fetch", vi.fn(async (_path: string, init?: RequestInit) =>
    init?.method === "POST"
      ? Response.json({ error: "Ödeme sağlayıcısı şu anda doğrulanamıyor." }, { status: 503 })
      : Response.json({ status: "pending", expires_at: "2099-01-01", checkout_form_content: "<div></div>" }),
  ));
  render(createElement(CheckoutPage, { id: "session" }));
  fireEvent.click(await screen.findByRole("button", { name: /Bu işlemi iptal et/ }));
  await screen.findByText("Ödeme sağlayıcısı şu anda doğrulanamıyor.");
  expect(router.push).not.toHaveBeenCalled();
});
it("iptal hatasını 5 saniyelik durum yoklaması silmez", async () => {
  // Tarayıcıda yakalandı: iptal hatası ile yükleme hatası aynı state'i
  // paylaşıyordu ve yoklamanın başarı dalı `setError("")` çağırdığı için mesaj
  // yazılır yazılmaz siliniyordu — kullanıcı hiçbir şey görmüyordu.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init?: RequestInit) =>
      init?.method === "POST"
        ? Response.json({ error: "Ödeme sağlayıcısı şu anda doğrulanamıyor." }, { status: 503 })
        : Response.json({ status: "pending", expires_at: "2099-01-01", checkout_form_content: "<div></div>" }),
    ));
    render(createElement(CheckoutPage, { id: "session" }));
    fireEvent.click(await screen.findByRole("button", { name: /Bu işlemi iptal et/ }));
    await screen.findByText("Ödeme sağlayıcısı şu anda doğrulanamıyor.");

    await vi.advanceTimersByTimeAsync(6000);

    expect(screen.queryByText("Ödeme sağlayıcısı şu anda doğrulanamıyor.")).not.toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
