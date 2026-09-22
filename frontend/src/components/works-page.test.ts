// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  works: [
    {
      id: "w1",
      fileName: "yuzuk.jpg",
      status: "draft" as const,
      createdAt: Date.parse("2026-09-18T10:00:00Z"),
      thumbnailUrl: "blob:t",
      resultUrl: "blob:r",
      editorState: null,
    },
  ],
  isHistoryLoaded: true,
  user: { id: "u1" },
  openSignIn: vi.fn(),
  openStudio: vi.fn(),
  openWork: vi.fn(),
  removeWork: vi.fn(),
  renameWork: vi.fn(async () => true),
}));

vi.mock("@/components/workspace-provider", () => ({ useWorkspace: () => state }));

import { WorksPage } from "@/components/works-page";

describe("Çalışmalarım — ürün adını değiştirme (18.09.2026)", () => {
  beforeEach(() => {
    state.renameWork.mockReset();
    state.renameWork.mockResolvedValue(true);
  });
  afterEach(() => cleanup());

  it("kalemle açılıyor, kırpılmış yeni adı kaydediyor", async () => {
    render(createElement(WorksPage));
    fireEvent.click(screen.getByRole("button", { name: "yuzuk.jpg adını değiştir" }));
    fireEvent.change(screen.getByLabelText("Çalışma adı"), { target: { value: "  Altın yüzük  " } });
    fireEvent.click(screen.getByRole("button", { name: "Adı kaydet" }));

    await waitFor(() => expect(state.renameWork).toHaveBeenCalledWith("w1", "Altın yüzük"));
    await waitFor(() => expect(screen.queryByLabelText("Çalışma adı")).toBeNull());
  });

  it("boş ad kaydedilmiyor, hata gösteriliyor", () => {
    render(createElement(WorksPage));
    fireEvent.click(screen.getByRole("button", { name: "yuzuk.jpg adını değiştir" }));
    fireEvent.change(screen.getByLabelText("Çalışma adı"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Adı kaydet" }));

    expect(state.renameWork).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/1-255/);
  });

  it("sunucu reddederse düzenleme açık kalıyor ve hata görünüyor", async () => {
    state.renameWork.mockResolvedValue(false);
    render(createElement(WorksPage));
    fireEvent.click(screen.getByRole("button", { name: "yuzuk.jpg adını değiştir" }));
    fireEvent.change(screen.getByLabelText("Çalışma adı"), { target: { value: "Yeni ad" } });
    fireEvent.click(screen.getByRole("button", { name: "Adı kaydet" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByLabelText("Çalışma adı")).toBeTruthy();
  });

  it("Escape vazgeçiyor", () => {
    render(createElement(WorksPage));
    fireEvent.click(screen.getByRole("button", { name: "yuzuk.jpg adını değiştir" }));
    fireEvent.keyDown(screen.getByLabelText("Çalışma adı"), { key: "Escape" });

    expect(screen.queryByLabelText("Çalışma adı")).toBeNull();
    expect(state.renameWork).not.toHaveBeenCalled();
  });
});

describe("Çalışmalarım — silme onayı (19.09.2026)", () => {
  beforeEach(() => state.removeWork.mockReset());
  afterEach(() => cleanup());

  it("çöp kutusu hemen silmiyor, önce soruyor; Vazgeç silmeden kapatıyor", () => {
    render(createElement(WorksPage));
    fireEvent.click(screen.getByRole("button", { name: "yuzuk.jpg çalışmasını sil" }));

    expect(state.removeWork).not.toHaveBeenCalled();
    expect(screen.getByText("Bu çalışma silinsin mi?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(state.removeWork).not.toHaveBeenCalled();
    expect(screen.queryByText("Bu çalışma silinsin mi?")).toBeNull();
    expect(screen.getByRole("button", { name: "yuzuk.jpg çalışmasını sil" })).toBeTruthy();
  });

  it("onaylanınca yalnızca o çalışma siliniyor", () => {
    render(createElement(WorksPage));
    fireEvent.click(screen.getByRole("button", { name: "yuzuk.jpg çalışmasını sil" }));
    fireEvent.click(screen.getByRole("button", { name: "Sil" }));

    expect(state.removeWork).toHaveBeenCalledTimes(1);
    expect(state.removeWork).toHaveBeenCalledWith("w1");
  });
});
