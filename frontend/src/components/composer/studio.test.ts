// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  studio: { cutoutUrl: "blob:cutout", fileName: "urun.png" } as {
    cutoutUrl: string;
    fileName: string;
    workId?: string;
  },
  works: [] as { id: string; status: "draft" | "completed" }[],
  closeStudio: vi.fn(),
  returnToStart: vi.fn(),
  updateWorkStatus: vi.fn(async () => true),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/workspace-provider", () => ({ useWorkspace: () => state }));
vi.mock("@/components/composer/composition-editor", () => ({
  CompositionEditor: ({
    onStatusChange,
    onSave,
    onDownloaded,
  }: {
    onStatusChange?: (status: unknown) => void;
    onSave?: (draft: unknown) => Promise<boolean>;
    onDownloaded?: () => void;
  }) => {
    useEffect(() => {
      onStatusChange?.({
        step: 2,
        totalSteps: 3,
        stepLabel: "Ürün",
        toolLabel: "Görünüm",
      });
    }, [onStatusChange]);
    return createElement(
      "div",
      null,
      createElement("button", { type: "button", onClick: () => void onSave?.({ step: 2 }) }, "Taslağı kaydet"),
      createElement("button", { type: "button", onClick: () => onDownloaded?.() }, "İndir"),
      createElement("button", { type: "button" }, "Son denetim"),
    );
  },
}));

import { Studio } from "@/components/composer/studio";

describe("Studio modal odağı", () => {
  beforeEach(() => {
    state.studio = { cutoutUrl: "blob:cutout", fileName: "urun.png" };
    state.closeStudio.mockReset();
  });

  afterEach(() => cleanup());

  it("açılınca ilk denetime odaklanır ve kapanınca odağı geri verir", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const view = render(createElement(Studio));

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Geri" })));
    expect(opener.hasAttribute("inert")).toBe(true);

    view.unmount();
    expect(document.activeElement).toBe(opener);
    expect(opener.hasAttribute("inert")).toBe(false);
    opener.remove();
  });

  it("Tab ve Shift+Tab odağını stüdyo içinde döndürür", async () => {
    render(createElement(Studio));
    const first = screen.getByRole("button", { name: "Geri" });
    const last = screen.getByRole("button", { name: "Son denetim" });
    await waitFor(() => expect(document.activeElement).toBe(first));

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("aktif çalışma özetini gösterir ve kısayol penceresini Escape ile kapatır", async () => {
    render(createElement(Studio));

    expect(await screen.findByLabelText("2. adım: Ürün, Görünüm")).toBeTruthy();
    const shortcuts = screen.getByRole("button", { name: "Kısayollar" });
    fireEvent.click(shortcuts);
    expect(screen.getByRole("dialog", { name: "Klavye kısayolları" })).toBeTruthy();

    fireEvent.keyDown(shortcuts, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Klavye kısayolları" })).toBeNull();
    expect(state.closeStudio).not.toHaveBeenCalled();
  });
});

// Tamamlanmis (indirilmis) bir calisma stüdyoda yeniden acilip kaydedildiginde
// "Yarım kalan" sekmesine geri dusuyordu: kaydetme her zaman "draft"
// gonderiyor, backend de "draft"ta indirme zamanini siliyordu (PR #22 incelemesi).
describe("Studio taslak kaydı çalışmanın durumunu korur", () => {
  beforeEach(() => {
    state.studio = { cutoutUrl: "blob:cutout", fileName: "urun.png", workId: "w1" };
    state.works = [];
    state.updateWorkStatus.mockClear();
  });

  afterEach(() => cleanup());

  it("yarım kalan çalışmayı taslak olarak kaydeder", async () => {
    state.works = [{ id: "w1", status: "draft" }];
    render(createElement(Studio));
    fireEvent.click(screen.getByRole("button", { name: "Taslağı kaydet" }));
    await waitFor(() => expect(state.updateWorkStatus).toHaveBeenCalledWith("w1", "draft", { step: 2 }));
  });

  it("tamamlanmış çalışmayı kaydetmek onu yarım kalana düşürmez", async () => {
    state.works = [{ id: "w1", status: "completed" }];
    render(createElement(Studio));
    fireEvent.click(screen.getByRole("button", { name: "Taslağı kaydet" }));
    await waitFor(() => expect(state.updateWorkStatus).toHaveBeenCalledWith("w1", "completed", { step: 2 }));
  });

  it("aynı oturumda indirildikten sonra yapılan kayıt da tamamlanmış kalır", async () => {
    // Liste henuz guncellenmemis olsa (ya da calisma yuklu sayfada olmasa)
    // bile indirme bu oturumda gerceklesti.
    state.works = [];
    render(createElement(Studio));
    fireEvent.click(screen.getByRole("button", { name: "İndir" }));
    fireEvent.click(screen.getByRole("button", { name: "Taslağı kaydet" }));
    await waitFor(() => expect(state.updateWorkStatus).toHaveBeenLastCalledWith("w1", "completed", { step: 2 }));
  });

  it("uçuşta olan taslağı bitirmeden indirme durumunu göndermez", async () => {
    state.works = [{ id: "w1", status: "draft" }];
    let finishDraft!: (saved: boolean) => void;
    state.updateWorkStatus.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => { finishDraft = resolve; }),
    );
    render(createElement(Studio));
    fireEvent.click(screen.getByRole("button", { name: "Taslağı kaydet" }));
    await waitFor(() => expect(state.updateWorkStatus).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "İndir" }));
    fireEvent.click(screen.getByRole("button", { name: "Taslağı kaydet" }));
    expect(state.updateWorkStatus).toHaveBeenCalledTimes(1);

    finishDraft(true);
    await waitFor(() => expect(state.updateWorkStatus).toHaveBeenCalledTimes(3));
    expect(state.updateWorkStatus.mock.calls.map((call) => (call as unknown[])[1])).toEqual([
      "draft", "completed", "completed",
    ]);
  });
});
