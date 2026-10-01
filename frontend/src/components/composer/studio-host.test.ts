// @vitest-environment jsdom

/**
 * `StudioHost` — stüdyo kodu yalnızca stüdyo açılınca yüklenir (Faz 7).
 *
 * Stüdyo modülünün sahtesi, İÇE AKTARILDIĞI anda sayaç artırıyor; böylece
 * "kapalıyken hiç indirilmiyor" doğrudan ölçülüyor. Doğrudan (statik) içe
 * aktarmaya dönülünce ilk test kırmızı yandı.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  studio: null as { workId: string } | null,
  studioModuleLoads: 0,
}));

vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({ studio: state.studio }),
}));

vi.mock("@/components/composer/studio", () => {
  state.studioModuleLoads += 1;
  return { Studio: () => createElement("div", { "data-testid": "studio" }) };
});

import { StudioHost } from "@/components/composer/studio-host";

afterEach(cleanup);

describe("StudioHost", () => {
  it("stüdyo kapalıyken stüdyo kodunu hiç yüklemez ve bir şey çizmez", async () => {
    state.studio = null;
    const { container } = render(createElement(StudioHost));

    // Olası bir tembel yüklemenin tamamlanmasına fırsat ver.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.innerHTML).toBe("");
    expect(state.studioModuleLoads).toBe(0);
  });

  it("stüdyo açılınca stüdyoyu yükleyip çizer", async () => {
    state.studio = { workId: "w1" };
    render(createElement(StudioHost));

    expect(await screen.findByTestId("studio")).toBeTruthy();
    expect(state.studioModuleLoads).toBe(1);
  });
});
