/**
 * public/hero altindaki her dosyanin icerik ozetini (sha256, ilk 10 hane)
 * src/lib/hero-asset-versions.json'a yazar. Adresler `?v=<ozet>` ile verilir
 * (`heroAsset`): bir gorsel yeniden uretildiginde adresi de degisir, Next'in
 * gorsel onbellegi ve tarayici eskisini gostermez (bu oturumda iki kez oldu).
 *
 * Varlik ureten her betikten (Blender, prepare-hero-*) sonra calistirilir:
 *   npm run hero:versions
 * Unutulursa `hero-asset.test.ts` kirmizi yanar.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(frontend, "public", "hero");
const out = join(frontend, "src", "lib", "hero-asset-versions.json");

export function heroAssetVersions(dir = root) {
  const versions = {};
  const walk = (current) => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (!name.startsWith(".")) {
        versions[relative(dir, path).split("\\").join("/")] = createHash("sha256")
          .update(readFileSync(path))
          .digest("hex")
          .slice(0, 10);
      }
    }
  };
  walk(dir);
  return versions;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const versions = heroAssetVersions();
  writeFileSync(out, `${JSON.stringify(versions, null, 2)}\n`);
  console.log(`${Object.keys(versions).length} dosya -> ${relative(frontend, out)}`);
}
