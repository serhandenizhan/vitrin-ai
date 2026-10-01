import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LEGAL_DOCUMENT_VERSION } from "@/lib/legal-version";

// Yasal metinler (KVKK, gizlilik, kullanım koşulları) sayfa kaynağında durur ve
// "Yürürlük" tarihi üç dosyada ELLE yazılıdır; sürüm artırılıp tarih unutulursa
// kullanıcıya eski tarih gösterilip yeni sürüm kaydedilirdi (30.09.2026'da
// "Vitrin AI" → "Vitrin" değişikliğinde görüldü).
const SAYFALAR = ["kvkk", "gizlilik", "kullanim-kosullari"] as const;
const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function kaynak(sayfa: string): string {
  return readFileSync(path.resolve(__dirname, "..", "app", sayfa, "page.tsx"), "utf8");
}

describe("yasal metinler", () => {
  it("sürüm YYYY-AA-GG biçimindedir", () => {
    expect(LEGAL_DOCUMENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  for (const sayfa of SAYFALAR) {
    it(`${sayfa}: yürürlük tarihi sürümle aynı gündür`, () => {
      const [yil, ay, gun] = LEGAL_DOCUMENT_VERSION.split("-").map(Number);
      const beklenen = `Yürürlük ${gun} ${AYLAR[ay - 1]} ${yil}`;
      expect(kaynak(sayfa)).toContain(beklenen);
    });

    it(`${sayfa}: uygulama adı "Vitrin" (eski "Vitrin AI" adı kalmamış)`, () => {
      expect(kaynak(sayfa)).not.toContain("Vitrin AI");
    });
  }
});
