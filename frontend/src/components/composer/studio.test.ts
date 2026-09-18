// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  studio: { cutoutUrl: "blob:cutout", fileName: "urun.png" },
  closeStudio: vi.fn(),
  returnToStart: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/workspace-provider", () => ({ useWorkspace: () => state }));
vi.mock("@/components/composer/composition-editor", () => ({
  CompositionEditor: ({ onStatusChange }: { onStatusChange?: (status: unknown) => void }) => {
    useEffect(() => {
      onStatusChange?.({
        step: 2,
        totalSteps: 3,
        stepLabel: "Ürün",
        toolLabel: "Görünüm",
      });
    }, [onStatusChange]);
    return createElement("button", { type: "button" }, "Son denetim");
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
