// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useBackgroundSelection } from "@/components/composer/use-background-selection";
import type { Background } from "@/lib/backgrounds";
import { OUTPUT_FORMATS } from "@/lib/composition";

describe("useBackgroundSelection — varsayılan seçim (19.09.2026)", () => {
  it("sunucunun ilk zemini değil, listenin ilk zemini (düzden karmaşığa) seçili başlıyor", () => {
    const backgrounds: Background[] = [
      { type: "server", id: "sunucunun-ilki", name: "Sunucu", url: "https://r2.example/a", expiresInSeconds: 600, fetchedAt: 0 },
      { type: "placeholder", id: "placeholder-velvet", name: "Kadife siyah", gradient: [0, "#1d1d1f", 1, "#000000"] },
    ];
    const { result } = renderHook(() => useBackgroundSelection(backgrounds, OUTPUT_FORMATS.catalog));
    expect(result.current.selected.id).toBe("placeholder-velvet");
  });
});
