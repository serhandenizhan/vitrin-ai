import { describe, expect, it } from "vitest";

import {
  CIKTI_OLCUSU,
  DISA_AKTARMA_ORANI,
  SAHNE_OLCUSU,
  SIGDIRMA_PAYI,
  aciyiNormalize,
  sigdirmaDonusumu,
} from "@/lib/composition";

describe("sigdirmaDonusumu", () => {
  it("ürünü sahnenin merkezine koyar", () => {
    const d = sigdirmaDonusumu(800, 600);

    expect(d.x).toBe(SAHNE_OLCUSU / 2);
    expect(d.y).toBe(SAHNE_OLCUSU / 2);
    expect(d.aci).toBe(0);
  });

  it("geniş görselde GENİŞLİĞE göre ölçekler", () => {
    const d = sigdirmaDonusumu(2000, 1000);

    expect(d.olcek).toBeCloseTo((SAHNE_OLCUSU * SIGDIRMA_PAYI) / 2000);
  });

  it("uzun görselde YÜKSEKLİĞE göre ölçekler", () => {
    const d = sigdirmaDonusumu(1000, 2000);

    expect(d.olcek).toBeCloseTo((SAHNE_OLCUSU * SIGDIRMA_PAYI) / 2000);
  });

  it("her iki kenar da sahneye TAMAMEN sığar", () => {
    // `Math.max` kullanılsaydı uzun kenar taşardı ve kullanıcı ürünün
    // kırpıldığını sanırdı. Her iki boyut da sahnenin içinde kalmalı.
    for (const [g, y] of [
      [2400, 800],
      [800, 2400],
      [1000, 1000],
      [37, 1900],
    ]) {
      const d = sigdirmaDonusumu(g, y);

      expect(g * d.olcek).toBeLessThanOrEqual(SAHNE_OLCUSU);
      expect(y * d.olcek).toBeLessThanOrEqual(SAHNE_OLCUSU);
    }
  });

  it("kenarlarda pay bırakır — ürün kenara yapışmaz", () => {
    const d = sigdirmaDonusumu(1000, 1000);

    expect(1000 * d.olcek).toBeCloseTo(SAHNE_OLCUSU * SIGDIRMA_PAYI);
    expect(1000 * d.olcek).toBeLessThan(SAHNE_OLCUSU);
  });
});

describe("aciyiNormalize", () => {
  it("0-359 aralığına indirger", () => {
    expect(aciyiNormalize(0)).toBe(0);
    expect(aciyiNormalize(15)).toBe(15);
    expect(aciyiNormalize(360)).toBe(0);
    expect(aciyiNormalize(375)).toBe(15);
    // "15° döndür"e 72 kez basmak: 1080 derece.
    expect(aciyiNormalize(1080)).toBe(0);
  });

  it("negatif açıyı da pozitife çevirir", () => {
    // JavaScript'in `%` operatörü negatif sayıda negatif döner
    // (`-15 % 360 === -15`); tek bir mod yeterli olmuyor.
    expect(aciyiNormalize(-15)).toBe(345);
    expect(aciyiNormalize(-360)).toBe(0);
    expect(aciyiNormalize(-370)).toBe(350);
  });
});

describe("DISA_AKTARMA_ORANI", () => {
  it("tam sayı — kesirli oran çıktıyı 1999 px yapıyordu", () => {
    // Bu sabitin varlık sebebi bir off-by-one hatası: oran ekran genişliğine
    // (434 px gibi yuvarlak olmayan bir sayıya) dayandığında Konva 2000 yerine
    // 1999 px'lik tuval üretiyordu.
    expect(Number.isInteger(DISA_AKTARMA_ORANI)).toBe(true);
    expect(SAHNE_OLCUSU * DISA_AKTARMA_ORANI).toBe(CIKTI_OLCUSU);
  });
});
