import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Her form `method="post"` taşımalı (OWASP ZAP taraması, 27.09.2026).
 *
 * Formlar JavaScript'le gönderiliyor (`onSubmit` + `preventDefault`), ama sayfa
 * henüz hidrate olmadan ya da JS yüklenemediğinde tarayıcı formu KENDİSİ
 * gönderir ve varsayılan yöntem GET'tir: `name`'i olan her alan adres çubuğuna,
 * tarayıcı geçmişine ve sunucu/CDN kayıtlarına düşer. ZAP bunu destek formunda
 * e-posta ve mesajla yakaladı; satın alma formunda aynı yol T.C. kimlik
 * numarasını, telefonu ve adresi adrese yazardı.
 */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") && !path.includes(".test.") ? [path] : [];
  });
}

describe("formlar", () => {
  it("hiçbir form varsayılan GET ile gönderilemez", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(join(process.cwd(), "src"))) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/<form\b([^>]*)>/g)) {
        if (!/method="post"/.test(match[1])) offenders.push(file.replace(process.cwd(), ""));
      }
    }
    // Taramanın boş kümeye bakıp yeşil geçmediğinin kanıtı.
    expect(tsxFiles(join(process.cwd(), "src")).some((f) => f.endsWith("support-center.tsx"))).toBe(true);
    expect(offenders).toEqual([]);
  });
});
