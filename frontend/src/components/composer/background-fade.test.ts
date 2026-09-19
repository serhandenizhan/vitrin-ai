import { describe, expect, it, vi } from "vitest";
import type Konva from "konva";

import {
  BACKGROUND_FADE_CURRENT,
  BACKGROUND_FADE_GHOST,
  finishBackgroundFade,
} from "@/components/composer/background-fade";

describe("finishBackgroundFade — dışa aktarmada iki zemin karışmasın (18.09.2026)", () => {
  it("eski zemini siliyor, yenisini tam görünür yapıyor", () => {
    const ghost = { destroy: vi.fn() };
    const current = { opacity: vi.fn() };
    const stage = {
      find: vi.fn((selector: string) =>
        selector === "." + BACKGROUND_FADE_GHOST
          ? [ghost]
          : selector === "." + BACKGROUND_FADE_CURRENT
            ? [current]
            : [],
      ),
    } as unknown as Konva.Stage;

    finishBackgroundFade(stage);

    expect(ghost.destroy).toHaveBeenCalledOnce();
    expect(current.opacity).toHaveBeenCalledWith(1);
  });
});
