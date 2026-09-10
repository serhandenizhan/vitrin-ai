// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BackgroundState } from "@/components/composer/use-zeminler";

let zeminDurumu: BackgroundState;

vi.mock("next/dynamic", async () => {
  const React = await import("react");
  return {
    default: () =>
      ({ zemin }: { zemin: { id: string; url?: string } }) =>
        React.createElement(
          "output",
          { "data-testid": "sahne-zemini" },
          `${zemin.id}|${zemin.url ?? ""}`,
        ),
  };
});

vi.mock("@/components/composer/use-zeminler", () => ({
  useBackgrounds: () => zeminDurumu,
}));

import { CompositionEditor } from "@/components/composer/composition-editor";

const ilkZeminler = [
  {
    type: "sunucu" as const,
    id: "r2-a",
    name: "R2 A",
    url: "https://r2.example/a-ilk",
    expiresInSeconds: 3600,
    fetchedAt: 1,
  },
  {
    type: "sunucu" as const,
    id: "r2-b",
    name: "R2 B",
    url: "https://r2.example/b-ilk",
    expiresInSeconds: 3600,
    fetchedAt: 1,
  },
];

describe("CompositionEditor", () => {
  beforeEach(() => {
    zeminDurumu = {
      backgrounds: ilkZeminler,
      hasServerBackground: true,
      isLoading: false,
    };
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("yenilenmiş URL listesinde kullanıcı seçimini id ile korur", () => {
    const view = render(
      createElement(CompositionEditor, {
        cutoutUrl: "blob:kesim",
        fileName: "urun.png",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "R2 B" }));
    expect(screen.getByRole("button", { name: "R2 B" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    zeminDurumu = {
      ...zeminDurumu,
      backgrounds: [
        ilkZeminler[0],
        {
          ...ilkZeminler[1],
          url: "https://r2.example/b-yenilenmis",
          fetchedAt: 2,
        },
      ],
    };
    view.rerender(
      createElement(CompositionEditor, {
        cutoutUrl: "blob:kesim",
        fileName: "urun.png",
      }),
    );

    expect(screen.getByRole("button", { name: "R2 B" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByTestId("sahne-zemini").textContent).toBe(
      "r2-b|https://r2.example/b-yenilenmis",
    );
  });
});
