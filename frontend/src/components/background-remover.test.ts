// @vitest-environment jsdom
import { createElement } from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const workspace = vi.hoisted(() => ({
  recordWork: vi.fn(),
  subscribeToOpenWork: vi.fn(() => () => {}),
  subscribeToReset: vi.fn(() => () => {}),
  user: { id: "kullanici" } as { id: string } | null,
  isAuthLoaded: true,
  openSignIn: vi.fn(),
}));
vi.mock("@/components/workspace-provider", () => ({ useWorkspace: () => workspace }));
// HEIC olmayan dosyalarda zaten cagrilmiyor; jsdom'da blob cozumu yok.
vi.mock("@/lib/heic-preview", () => ({ createPreviewUrl: async () => null }));

import { BackgroundRemover } from "./background-remover";

function selectPhoto(name = "yuzuk.png") {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

function sentKeys(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(
    (call) => (call[1] as RequestInit).headers as Record<string, string>,
  ).map((headers) => headers["Idempotency-Key"]);
}

beforeEach(() => {
  workspace.user = { id: "kullanici" };
  URL.createObjectURL = vi.fn(() => "blob:onizleme");
  URL.revokeObjectURL = vi.fn();
  if (!globalThis.crypto?.randomUUID) {
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID: () => Math.random().toString(36).slice(2) },
      configurable: true,
    });
  }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("belirsiz ağ hatasında aynı idempotency anahtarını korur", async () => {
  // Bağlantı koptuğunda işin sunucuda başarılı olup olmadığı BİLİNMİYOR.
  // Yeni bir anahtarla tekrar denemek, gerçekten başarılı olmuş bir işlemi
  // ikinci kez ücretlendirirdi; aynı anahtar sonucu geri getirir.
  const fetchMock = vi.fn(async () => {
    throw new TypeError("Failed to fetch");
  });
  vi.stubGlobal("fetch", fetchMock);
  render(createElement(BackgroundRemover));
  selectPhoto();
  fireEvent.click(await screen.findByRole("button", { name: /Arka planı kaldır/ }));
  await screen.findByRole("button", { name: /Arka planı kaldır/ });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: /Arka planı kaldır/ }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

  const keys = sentKeys(fetchMock);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
});

it("backend retry_safe dediğinde yeni anahtara geçer", async () => {
  // Kredi ya hiç harcanmadı ya iade edildi; bunu SUNUCU söylüyor.
  const fetchMock = vi.fn(async () =>
    Response.json(
      { error: "Kredi tükendi.", code: "quota_exceeded", retry_safe: true },
      { status: 402 },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(createElement(BackgroundRemover));
  selectPhoto();
  fireEvent.click(await screen.findByRole("button", { name: /Arka planı kaldır/ }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  fireEvent.click(await screen.findByRole("button", { name: /Arka planı kaldır/ }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

  const keys = sentKeys(fetchMock);
  expect(keys[1]).not.toBe(keys[0]);
});

it("retry_safe gelmeyen hiçbir hatada anahtarı değiştirmez", async () => {
  // Süren iş, sonucu artık saklanmayan iş ve kodsuz sunucu hatası: üçünde de
  // kredinin durumu BELİRSİZ. Yeni anahtar ikinci krediyi yakardı.
  const fetchMock = vi.fn(async () =>
    Response.json(
      { error: "Bu işlem hâlâ sürüyor.", code: "request_in_progress" },
      { status: 409 },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(createElement(BackgroundRemover));
  selectPhoto();
  fireEvent.click(await screen.findByRole("button", { name: /Arka planı kaldır/ }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  fireEvent.click(await screen.findByRole("button", { name: /Arka planı kaldır/ }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

  const keys = sentKeys(fetchMock);
  expect(keys[1]).toBe(keys[0]);
});

it("sonucu artık saklanmayan işte anahtarı korur", async () => {
  // `request_already_processed` bilinçli olarak retry_safe DEĞİL: kredi
  // harcanmış ve sonuç gitmiş; yeni işi kullanıcı bilerek başlatmalı.
  const fetchMock = vi.fn(async () =>
    Response.json(
      { error: "Sonuç artık saklanmıyor.", code: "request_already_processed" },
      { status: 409 },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(createElement(BackgroundRemover));
  selectPhoto();
  fireEvent.click(await screen.findByRole("button", { name: /Arka planı kaldır/ }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  fireEvent.click(await screen.findByRole("button", { name: /Arka planı kaldır/ }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

  const keys = sentKeys(fetchMock);
  expect(keys[1]).toBe(keys[0]);
});

it("başka bir fotoğrafa geçince yeni anahtar üretir", async () => {
  const fetchMock = vi.fn(async () =>
    Response.json({ error: "hata", retry_safe: true }, { status: 500 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(createElement(BackgroundRemover));
  selectPhoto("bir.png");
  fireEvent.click(await screen.findByRole("button", { name: /Arka planı kaldır/ }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  fireEvent.click(await screen.findByRole("button", { name: "Vazgeç" }));
  selectPhoto("iki.png");
  fireEvent.click(await screen.findByRole("button", { name: /Arka planı kaldır/ }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

  const keys = sentKeys(fetchMock);
  expect(keys[1]).not.toBe(keys[0]);
});
