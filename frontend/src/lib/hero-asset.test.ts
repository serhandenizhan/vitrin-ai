import { describe, expect, it } from "vitest";

import versions from "@/lib/hero-asset-versions.json";
import { HERO_BACKDROPS, backdropSrc, backdropSwatchSrc } from "@/lib/hero-backdrops";
import { closeSrc, cutoutSrc, handSrc, HERO_SCENES, pageHandSrc } from "@/lib/hero-scenes";

import { heroAssetVersions } from "../../scripts/hash-hero-assets.mjs";

describe("hero-asset", () => {
  it("surum dosyasi public/hero ile guncel (degisince: npm run hero:versions)", () => {
    expect(versions).toEqual(heroAssetVersions());
  });

  it("vitrinin kullandigi her varlik var ve surumlu", () => {
    const urls = [
      ...HERO_SCENES.flatMap((scene) => [
        scene.model,
        cutoutSrc(scene),
        handSrc(scene),
        pageHandSrc(scene),
        closeSrc(scene).before,
        closeSrc(scene).after,
      ]),
      ...HERO_BACKDROPS.flatMap((backdrop) => [backdropSrc(backdrop), backdropSwatchSrc(backdrop)]),
    ];
    for (const url of urls) expect(url).toMatch(/^\/hero\/.+\?v=[0-9a-f]{10}$/);
  });
});
